# BL-03 — Recovery & Backup

Status: **Approved design** (2026-08-06). Base: branched from `main` at tag `v0.2.0` baseline. Scope: backlog item **BL-03** promoted to the active phase by owner approval. This document is design only — no implementation code is written until the implementation plan (see [Plan](#plan-handoff)) is complete and consistent with Project Truth.

## Goal

Give a Vault durable, inspectable **point-in-time snapshots** that a user can create on demand and restore from, so project state (both the database and the managed files it indexes) can be recovered after loss, corruption, or mistake.

This is a **recovery** capability, not an automation capability. Snapshots are created only by an explicit user action. No scheduled, timed, or event-driven snapshots exist in BL-03.

A snapshot captures **one stable Vault state captured while no accepted mutation occurred**: the SQLite database *and* the managed project files, captured under one exclusive write barrier so the two can never disagree. Because the write barrier can stop *accepted* (in-app) mutations but not writes from external programs, the capture also **fingerprints the managed files before and after copying and aborts if anything changed** (see [External-change detection](#external-change-detection-revision-1)).

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

1. **Flush pending in-app writes first (revision 4).** *Before* acquiring the barrier: flush any debounced Markdown autosave so pending edits are persisted to disk and DB, and drain/complete any in-flight watcher reconciliation. This ensures the barrier is acquired over a settled state, not one with buffered writes about to land.
2. **Acquire** the write barrier. While held:
   - all mutating IPC operations are rejected or queued (no new *accepted* writes enter the live Vault), and
   - filesystem-watcher-driven reconciliation is suspended (a watcher event during capture does not mutate the DB mid-snapshot).
3. Perform `VACUUM INTO` (database capture).
4. Copy the managed `projects/` tree (file capture), with before/after fingerprinting (below).
5. **Release** the barrier.

Because the main process serializes IPC, the barrier is a single main-process guard (a held flag/lock plus a paused watcher), not cross-process locking. The barrier guarantees the database image and the managed-file image reflect **one stable Vault state in which no accepted mutation occurred** during capture. The barrier is held only for the duration of capture and is always released (including on error) so the live Vault is never left blocked.

> Implementation detail for the plan: define the exact barrier mechanism (autosave flush + in-repository mutation guard + watcher pause/resume) and prove via test that an accepted write attempted during capture does not land inside the snapshot and is not lost from the live Vault.

### External-change detection (revision 1)

The write barrier stops *accepted* (in-app) mutations, but it **cannot** stop an external program (an editor, a sync client, a script) from modifying files under `projects/` during the file copy. A snapshot must never contain a torn mix of pre- and post-change file state.

BL-03 therefore **fingerprints the managed files before and after the copy**:

1. Before copying, record a fingerprint of every managed file (path + size + mtime, and — for the authoritative check — the SHA-256 that will be written to the manifest).
2. Copy the tree.
3. After copying, re-fingerprint the source `projects/` tree.
4. **If any source file changed, was added, or was removed between the two fingerprints, abort the snapshot**: discard the temporary staging directory and report a "Vault changed during capture" error. Nothing is written to `backups/` as a listable snapshot.

This makes external interference **fail safe** (abort + retry) rather than silently producing an inconsistent snapshot. The internal barrier and the external fingerprint check are complementary: the barrier prevents *accepted* mid-capture writes; the fingerprint check *detects* *unaccepted* (external) ones.

> Implementation detail for the plan: choose the fingerprint (the manifest SHA-256 set is the strongest and is already being computed; the plan confirms whether a cheaper size+mtime prepass is used to short-circuit before hashing).

## Snapshot creation flow

Triggered only by explicit **Create snapshot**. All steps run in the main process:

1. **Flush pending autosaves and drain watcher reconciliation** (revision 4), so capture runs over a settled state.
2. Create a temporary staging directory `backups/.tmp-<id>/` (a partial write can never masquerade as a real snapshot).
3. **Acquire the write barrier** (see above).
4. **Fingerprint** the source `projects/` tree (before-image).
5. `VACUUM INTO 'backups/.tmp-<id>/vault.db'` — a consistent single-file database with **no `-wal`/`-shm` sidecars**.
6. Recursively copy `projects/` → `backups/.tmp-<id>/projects/` (managed + in-place reconciled project files; both live under `<vault>/projects/`), computing each copied file's SHA-256.
7. **Re-fingerprint** the source `projects/` tree (after-image). **If it differs from the before-image, abort:** delete the staging directory, release the barrier, and report "Vault changed during capture." No snapshot is created (revision 1).
8. **Release the write barrier.**
9. Write `manifest.json` (including the `vault.db` and per-file SHA-256 checksums).
10. **Atomically rename** `backups/.tmp-<id>/` → `backups/<timestamp>_<id>/`. The snapshot only "exists" after this rename succeeds.

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
- `vaultId` — the **persisted, location-independent UUID** of the source Vault (revision 2). See [Vault identity & lineage](#vault-identity--lineage-revision-2). It is **not** derived from the Vault's path, so moving or renaming the Vault directory does not change its identity.
- `checksums` — SHA-256 of `vault.db` and each managed file, used for integrity validation on restore.

## Vault identity & lineage (revision 2)

Today a Vault is identified only by its directory basename/path. BL-03 introduces a **persisted, location-independent Vault UUID** so that identity survives moves/renames and so that snapshots and restores can be reasoned about unambiguously.

- **Persisted identity.** Each Vault stores a `vault_id` UUID in the database (a small `vault_meta` key/value table, created by a new repeatable migration; generated once on first open of a Vault that lacks one). This UUID is what the manifest's `vaultId` records. Adding this table is the one deliberate schema addition BL-03 makes, and it is required by the manifest — not scope creep.
- **Restored-Vault identity is explicit, not accidental.** A restore produces a *new* Vault. It must **not** silently carry the source's `vault_id` (that would create two live Vaults claiming the same identity). On restore, the restored Vault is assigned a **new** `vault_id`, and records its **lineage**:
  - `restored_from_vault_id` — the source Vault's UUID (from the manifest), and
  - `restored_from_snapshot_id` — the snapshot it was restored from, and
  - `restored_at` — timestamp.

  Lineage is stored in the restored Vault's `vault_meta` so the relationship is inspectable and auditable, while the two Vaults remain distinct identities. (Whether lineage is surfaced in the UI is out of scope for BL-03; it is persisted regardless.)

## Restore (new Vault only)

Restore is a **pure, non-destructive copy**; it never touches the live Vault. It uses **staging + atomic finalization** so a failed or interrupted restore never leaves a target directory that *looks* like a valid Vault (revision 3 — staging).

1. User selects a snapshot and a target location. The final target directory must be **empty or non-existent**.
2. Validate the manifest and **recompute checksums** for `vault.db` and every managed file in the snapshot.
3. **On any checksum mismatch, missing file, or schema-too-new: refuse the restore** — before writing anything to the target (no override, no salvage in BL-03). Report which files failed.
4. Copy `vault.db` and `projects/` into a **staging directory** adjacent to the final target (e.g. `<target>.restoring-<id>/`, on the same filesystem so finalization is an atomic rename).
5. In staging, assign the restored Vault a **new `vault_id`** and write **lineage** (`restored_from_vault_id`, `restored_from_snapshot_id`, `restored_at`).
6. **Atomically rename** the staging directory into the final target path. The target only *exists as a Vault* after this rename — an interrupted restore leaves only a `*.restoring-*` directory, never a half-populated target.
7. Open the finalized target as a normal Vault through the existing open path.

If any step before finalization fails, delete the staging directory and report the error; the target path is never created. Schema-version awareness (step 3): if `manifest.schemaVersion` is newer than the running build supports, restore refuses with a clear message (a newer snapshot must not be opened by an older build).

## Integrity validation & failure handling

- **Validation is checksum-based and deterministic.** Restore refuses on any checksum mismatch or missing file, before writing to the target. There is no "restore anyway" path in BL-03; salvage of a damaged snapshot is deferred.
- **Snapshot creation is read-only w.r.t. the live Vault.** `VACUUM INTO` reads; the file copy reads. A failed, aborted, or interrupted snapshot leaves the live Vault untouched.
- **External change during capture aborts safely.** If before/after fingerprints of `projects/` differ, the snapshot is discarded (no listable snapshot); the user can retry.
- **No half-snapshots.** The temp-dir + atomic-rename pattern means an interrupted capture leaves only a `.tmp-<id>` directory, never a listable snapshot. On failure the temp directory is removed and the barrier released.
- **No half-restores.** The staging + atomic-finalize pattern means an interrupted restore leaves only a `*.restoring-*` directory, never a target that appears to be a valid Vault.
- **Errors are typed and surfaced** (disk-full, permission denied, target-not-empty, vault-changed-during-capture, checksum-mismatch, schema-too-new) without corrupting live state.

## Testing & acceptance (revision 2)

New suite `tests/backup.test.ts` on Node's built-in runner. **Round-trip equivalence is defined as logical-state equivalence plus managed-file hash equality — not byte-identical database files** (`VACUUM INTO` legitimately reorders pages, so the restored `vault.db` is not byte-identical to the source):

1. **Round-trip (logical + file hashes):** create a Vault with projects/documents/knowledge/relationships/evidence → snapshot → restore to a new directory → the restored Vault's **logical state is equivalent** (same projects, folders, documents, knowledge objects, relationships, evidence, history) **and** every managed file's SHA-256 matches the source.
2. **Write-barrier consistency (accepted writes):** attempt an in-app mutation during capture → assert it is not partially captured in the snapshot **and** is not lost from the live Vault; the snapshot's database and file images reflect one stable state with no accepted mutation.
3. **External-change abort (revision 1):** modify a source file under `projects/` between the before/after fingerprints → the snapshot is aborted and discarded; no listable snapshot exists; the live Vault is unchanged.
4. **Pre-barrier flush (revision 4):** a pending (debounced) autosave is flushed before capture, so its content is present in the snapshot.
5. **Vault identity & lineage (revision 2):** a Vault has a persisted UUID; a restored Vault gets a **new** UUID (distinct from the source) and records `restored_from_vault_id` / `restored_from_snapshot_id`.
6. **Integrity refusal:** corrupt a snapshot file (or its checksum) → restore is refused **before** any target is written.
7. **No half-snapshot:** simulate an interrupted capture → only a temp directory exists; no listable snapshot; live Vault unchanged.
8. **No half-restore (revision 3):** simulate an interrupted restore → only a `*.restoring-*` staging directory exists; the final target path is absent (never a valid-looking partial Vault).
9. **Live-Vault safety:** snapshot creation never mutates live Vault state (verified before/after).
10. **Schema guard:** a manifest with a newer `schemaVersion` is refused by restore.

Standing verification gate (unchanged): `pnpm typecheck`, `pnpm test`, `pnpm build`, and `node scripts/phase2-lifecycle-ui-regression.mjs` — all green before completion.

## Acceptance criteria

A user can, with AI disconnected:

- Create a snapshot on demand; it appears in the Backups panel with correct metadata.
- Inspect a snapshot's manifest and integrity status.
- Delete a snapshot manually; nothing is ever auto-deleted.
- Restore a snapshot into a new, empty directory and open it as a fully working Vault whose logical state and managed files match the moment of capture.
- Never lose or corrupt live Vault data as a result of any snapshot or (refused) restore.

## Plan handoff

This design is the input to the implementation plan (`docs/superpowers/plans/2026-08-06-bl-03-recovery-backup.md`), produced via the writing-plans skill. `vaultId` sourcing is now decided (persisted UUID + explicit restored-Vault lineage, revision 2). The plan must still specify the exact **write-barrier mechanism** (autosave flush + mutation guard + watcher pause/resume) and the **fingerprint mechanism** (before/after external-change detection), and sequence the work test-first, staying narrowly scoped to recovery/backup — no Phase 3, no other P1 items, no unrelated polish.

## Revision history

- **2026-08-06 (r1, approved):** initial approved design (manual snapshots; VACUUM INTO + managed-file copy under a write barrier; plain-directory snapshots + manifest/checksums; restore-to-new-Vault; refuse-on-mismatch; logical + file-hash round-trip acceptance).
- **2026-08-06 (r2, approved-in-direction, pre-plan):** (1) external-change detection via before/after fingerprint with abort; (2) persisted location-independent Vault UUID + explicit restored-Vault identity/lineage; (3) restore staging + atomic finalization; (4) explicit pre-barrier autosave/watcher flush. Language: "single consistent instant" → "one stable Vault state captured while no accepted mutation occurred."
