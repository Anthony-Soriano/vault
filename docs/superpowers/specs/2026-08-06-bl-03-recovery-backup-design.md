# BL-03 — Recovery & Backup

Status: **Approved design** (2026-08-06). Base: branched from `main` at tag `v0.2.0` baseline. Scope: backlog item **BL-03** promoted to the active phase by owner approval. This document is design only — no implementation code is written until the implementation plan (see [Plan](#plan-handoff)) is complete and consistent with Project Truth.

## Goal

Give a Vault durable, inspectable **point-in-time snapshots** that a user can create on demand and restore from, so project state (both the database and the managed files it indexes) can be recovered after loss, corruption, or mistake.

This is a **recovery** capability, not an automation capability. Snapshots are created only by an explicit user action. No scheduled, timed, or event-driven snapshots exist in BL-03.

A snapshot captures the **whole Vault state as a single consistent instant**: the SQLite database *and* the managed project files, captured under one exclusive write barrier so the two can never disagree.

## Non-goals (deferred, tracked in `.orbit/BACKLOG.md`, not silent gaps)

- **Automatic pre-operation snapshots** (before merge/supersede/archive, and later before applying AI proposals). Deferred to the Phase 3 proposal-hook work — that is where an automatic-writer safety net belongs.
- **Restore-in-place / replace the current Vault.** BL-03 restores only into a new, empty target directory. Destructive in-place restore is a separate, higher-risk capability.
- **Corrupted-snapshot salvage / "restore anyway".** On integrity failure BL-03 refuses to restore, full stop. Partial-recovery of a damaged snapshot is later work.
- **Zip / portable single-file export.** Snapshots are plain directories in BL-03; optional archive export is deferred.
- **Retention automation.** No auto-deletion; the user deletes snapshots manually.
- Any cloud, sync, or network behavior.

## Product principles honored

- **Local-first.** Snapshots live under the Vault directory (`backups/`); no network.
- **Ordinary files remain content truth.** Managed files are copied verbatim; the snapshot never becomes the sole home of content.
- **The renderer never touches Node/SQLite/fs.** All snapshot, restore, and filesystem work runs in the main process behind typed IPC.
- **Determinism where possible.** Integrity validation is checksum-based and reproducible.
- **No silent mutation of live state.** Snapshot creation is read-only with respect to the live Vault; a failed snapshot can never corrupt working state.

## Architecture

Same strict boundary as the rest of Orbit Vault:

```
Renderer (window.vault.backup.*)
  → typed IPC ("vault:backup:*")
  → VaultService (packages/vault-core)
  → SqliteVaultRepository (packages/vault-storage) → SQLite + backups/ + projects/
```

New surface is additive. No existing channel, table, or invariant changes.

### `packages/vault-types` — contracts

Adds the backup types and IPC contract entries:

- `SnapshotManifest` — the on-disk manifest shape (below).
- `SnapshotSummary` — list-view metadata (id, createdAt, sizeBytes, projectCount, schemaVersion, vaultVersion).
- `SnapshotInspection` — a manifest plus computed integrity status.
- `RestoreResult` — target path + opened-Vault handle info.
- IPC contract entries: `backup.create`, `backup.list`, `backup.inspect`, `backup.delete`, `backup.restoreToNewVault`.

### `packages/vault-core` — service orchestration

`VaultService` gains backup use-cases that validate inputs (`assertIdentifier` on snapshot ids, path validation on targets) and delegate to the repository. No snapshot logic lives in the renderer; the renderer supplies only ids and user-chosen target paths.

### `packages/vault-storage` — snapshot & restore engine

`SqliteVaultRepository` gains the snapshot/restore implementation: the write barrier, `VACUUM INTO`, managed-file copy, manifest + checksum generation, listing, inspection, deletion, and restore-to-new-Vault.

### Electron main + preload

Adds `vault:backup:*` channels via the existing `handle(channel, op, mutates=false)` helper. `create`, `delete`, and `restoreToNewVault` are mutating/side-effectful and own their native dialogs (choosing a restore target directory) in the main process. `list` and `inspect` are read-only. Preload exposes them, frozen, under `window.vault.backup`.

### Renderer

A **Backups** panel (peer of the existing Files / Knowledge / Atlas surfaces):

- **Create snapshot** button.
- A list of snapshots: timestamp, size, project count, schema/version.
- Per-snapshot **Inspect** (shows manifest + integrity status) and **Delete**.
- **Restore to new folder…** (opens a directory picker; restores into an empty target).
- A **total disk usage** readout for `backups/`.

The renderer never reads or writes snapshot files directly; it calls `window.vault.backup.*`.

## The exclusive write barrier (revision 1)

`VACUUM INTO` gives a transactionally consistent copy of the **database**, but the database and the managed **files** are two separate stores. Without coordination, a file could change between the database capture and the file copy, producing a snapshot whose database references file state that the snapshot did not actually capture.

BL-03 therefore takes an **exclusive Vault write barrier that spans the entire capture** — both the database `VACUUM INTO` and the managed-file copy happen inside it:

1. **Acquire** the write barrier. While held:
   - all mutating IPC operations are rejected or queued (no new writes enter the live Vault), and
   - filesystem-watcher-driven reconciliation is suspended (an external file change during capture does not mutate the DB mid-snapshot).
2. Perform `VACUUM INTO` (database capture).
3. Copy the managed `projects/` tree (file capture).
4. **Release** the barrier.

Because the main process serializes IPC, the barrier is a single main-process guard (a held flag/lock plus a paused watcher), not cross-process locking. The barrier guarantees the database image and the file image describe the **same instant**. The barrier is held only for the duration of capture and is always released (including on error) so the live Vault is never left blocked.

> Implementation detail for the plan: define the exact barrier mechanism (in-repository mutation guard + watcher pause/resume) and prove via test that a write attempted during capture does not land inside the snapshot and is not lost from the live Vault.

## Snapshot creation flow

Triggered only by explicit **Create snapshot**. All steps run in the main process:

1. Create a temporary staging directory `backups/.tmp-<id>/` (a partial write can never masquerade as a real snapshot).
2. **Acquire the write barrier** (see above).
3. `VACUUM INTO 'backups/.tmp-<id>/vault.db'` — a consistent single-file database with **no `-wal`/`-shm` sidecars**.
4. Recursively copy `projects/` → `backups/.tmp-<id>/projects/` (managed + in-place reconciled project files; both live under `<vault>/projects/`).
5. **Release the write barrier.**
6. Compute SHA-256 for `vault.db` and every copied managed file; write `manifest.json`.
7. **Atomically rename** `backups/.tmp-<id>/` → `backups/<timestamp>_<id>/`. The snapshot only "exists" after this rename succeeds.

## On-disk layout

```
backups/
  2026-08-06_14-32-11_<id>/
    manifest.json      # describes the snapshot (not SQLite internals)
    vault.db           # consistent single-file copy (VACUUM INTO) — no -wal/-shm
    projects/          # verbatim copy of managed + in-place project files
```

### `manifest.json`

The manifest describes the **snapshot**, never SQLite internals (no `journal_mode`, page counts, or WAL state):

```json
{
  "snapshotVersion": 1,
  "vaultVersion": "0.2.0",
  "createdAt": "2026-08-06T18:32:11Z",
  "vaultId": "<derived-stable-id>",
  "schemaVersion": 7,
  "projectCount": 3,
  "checksums": {
    "vault.db": "sha256:…",
    "projects/<id>/files/notes.md": "sha256:…"
  }
}
```

- `snapshotVersion` — format version of the snapshot/manifest itself (enables future format evolution).
- `vaultVersion` — product version that wrote it (from `package.json`).
- `schemaVersion` — max applied `schema_migrations.version` at capture time (guards restore against incompatible schemas).
- `vaultId` — a stable identifier for the source Vault. **Open sub-decision for the plan:** the code today identifies a Vault only by directory basename/path; there is no persisted Vault identity. The plan must choose one of: (a) derive a deterministic id (e.g. hash of the canonical Vault root path), or (b) persist a one-time Vault id in the database. Option (a) adds no new persistent state and is the tentative default; the plan confirms.
- `checksums` — SHA-256 of `vault.db` and each managed file, used for integrity validation on restore.

## Restore (new Vault only)

Restore is a **pure, non-destructive copy**; it never touches the live Vault.

1. User selects a snapshot and an **empty target directory**.
2. Validate the manifest and **recompute checksums** for `vault.db` and every managed file.
3. **On any mismatch or missing file: refuse the restore** (revision 3 — no override, no salvage in BL-03). Report which files failed.
4. On success: copy `vault.db` and `projects/` into the target directory, then open the target as a normal Vault through the existing open path.

Schema-version awareness: if `manifest.schemaVersion` is newer than the running build supports, restore refuses with a clear message (a newer snapshot must not be opened by an older build).

## Integrity validation & failure handling

- **Validation is checksum-based and deterministic.** Restore refuses on any checksum mismatch or missing file. There is no "restore anyway" path in BL-03; salvage of a damaged snapshot is deferred.
- **Snapshot creation is read-only w.r.t. the live Vault.** `VACUUM INTO` reads; the file copy reads. A failed or interrupted snapshot leaves the live Vault untouched.
- **No half-snapshots.** The temp-dir + atomic-rename pattern means an interrupted capture leaves only a `.tmp-<id>` directory, never a listable snapshot. On failure the temp directory is removed and the barrier released.
- **Errors are typed and surfaced** (disk-full, permission denied, target-not-empty, checksum-mismatch, schema-too-new) without corrupting live state.

## Testing & acceptance (revision 2)

New suite `tests/backup.test.ts` on Node's built-in runner. **Round-trip equivalence is defined as logical-state equivalence plus managed-file hash equality — not byte-identical database files** (`VACUUM INTO` legitimately reorders pages, so the restored `vault.db` is not byte-identical to the source):

1. **Round-trip (logical + file hashes):** create a Vault with projects/documents/knowledge/relationships/evidence → snapshot → restore to a new directory → the restored Vault's **logical state is equivalent** (same projects, folders, documents, knowledge objects, relationships, evidence, history) **and** every managed file's SHA-256 matches the source.
2. **Write-barrier consistency:** attempt a mutation during capture → assert it is not partially captured in the snapshot **and** is not lost from the live Vault; the snapshot's database and file images describe the same instant.
3. **Integrity refusal:** corrupt a snapshot file (or its checksum) → restore is refused; no partial target is left behind.
4. **No half-snapshot:** simulate an interrupted capture → only a temp directory exists; no listable snapshot; live Vault unchanged.
5. **Live-Vault safety:** snapshot creation never mutates live Vault state (verified before/after).
6. **Schema guard:** a manifest with a newer `schemaVersion` is refused by restore.

Standing verification gate (unchanged): `pnpm typecheck`, `pnpm test`, `pnpm build`, and `node scripts/phase2-lifecycle-ui-regression.mjs` — all green before completion.

## Acceptance criteria

A user can, with AI disconnected:

- Create a snapshot on demand; it appears in the Backups panel with correct metadata.
- Inspect a snapshot's manifest and integrity status.
- Delete a snapshot manually; nothing is ever auto-deleted.
- Restore a snapshot into a new, empty directory and open it as a fully working Vault whose logical state and managed files match the moment of capture.
- Never lose or corrupt live Vault data as a result of any snapshot or (refused) restore.

## Plan handoff

This design is the input to the implementation plan (`docs/superpowers/plans/2026-08-06-bl-03-recovery-backup.md`), produced via the writing-plans skill. The plan must resolve the two flagged sub-decisions (`vaultId` sourcing; exact write-barrier mechanism) and sequence the work test-first, staying narrowly scoped to recovery/backup — no Phase 3, no other P1 items, no unrelated polish.
