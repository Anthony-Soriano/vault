# BL-03 Recovery & Backup — Execution Plan (concise)

> **Authoritative execution checklist.** Behavior + contracts + tests, not pre-written implementation. The implementer MUST read the current code before editing each file. Deeper reference (with sample code): `2026-08-06-bl-03-recovery-backup.md`. Design of record: `../specs/2026-08-06-bl-03-recovery-backup-design.md`.
>
> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Manual, integrity-checked point-in-time snapshots (database + managed files, captured as one stable state) restorable into a new Vault.

## Global constraints (verbatim)

- Node ≥ 22.13, pnpm 11.9.0. Renderer imports only `@orbit/vault-types` + `window.vault`; never Node/SQLite/fs. All native ops in main.
- Manual snapshots only. DB captured via `VACUUM INTO` (single `vault.db`, no `-wal`/`-shm`), **outside any transaction**.
- Capture = flush autosave (UI) → defensive watcher pause (guaranteed release) → `VACUUM INTO` → copy `projects/` → before/after fingerprint, **abort on any change**.
- Persisted location-independent Vault UUID; restored Vault gets a **new** UUID + lineage (`restored_from_vault_id`, `restored_from_snapshot_id`, `restored_at`).
- Restore into a **non-existent** target (parent + new folder name) via staging + atomic finalize; validate structure+checksums+schema **before** any target write; refuse on any mismatch (no "restore anyway").
- Round-trip acceptance = logical-state equivalence + managed-file hash equality (NOT byte-identical DB).
- Standing gate: `pnpm typecheck`, `pnpm test`, `pnpm build`, `node scripts/phase2-lifecycle-ui-regression.mjs` — all green.
- Scope: recovery/backup only. No auto-triggers, no in-place restore, no salvage/zip/retention.

## Verified repository facts (audit)

- `MIGRATIONS` ends at v6 → new migration is **v7**. `packages/vault-storage/src/index.ts`.
- **No package subpath export** (`"exports": "./src/index.ts"`) → helpers in `src/backup.ts`, re-exported from `src/index.ts`.
- Storage already imports `randomUUID`, `VaultDomainError`, `now`, `notFound`, most `node:fs`. **Add `cpSync`.**
- Reuse `assertIdentifier` (`/^[a-zA-Z0-9_-]{6,80}$/`) for snapshot ids — it blocks `/`, `\`, `.`.
- Accepted-write consistency = synchronous single-threaded capture reading committed state; watcher pause is defensive only. No mutation-guard flag.
- Renderer top-level `view = "files"|"knowledge"|"atlas"` with `.view-switch`; autosave flush seam = `saveNow(content)` in `App.tsx`.
- Static regression script asserts exact main/preload/types/renderer/style contracts per channel.

## Not "additive"

BL-03 is backward-compatible but changes persistent state and expands the architecture: a DB migration, persisted Vault identity, restore lineage, new repository/service contracts, new IPC channels, new UI. `ARCHITECTURE.md` + `DECISIONS.md` are updated at closeout.

---

## Task 1 — Backup contract types
**Objective:** Define the wire/contract types.
**Files:** `packages/vault-types/src/index.ts` (add types + `backup` member on `VaultRendererApi`, line ~216, mirroring the `integrity` member); `tests/backup.test.ts` (new).
**Contracts:** `SnapshotManifest {snapshotVersion:1; vaultVersion; createdAt; vaultId; schemaVersion; projectCount; checksums:Record<string,string>}`, `SnapshotSummary {id;createdAt;sizeBytes;projectCount;schemaVersion;vaultVersion}`, `SnapshotInspection {manifest;integrityOk;problems:string[]}`, `CreateSnapshotOptions {appVersion}`, `RestoreSnapshotInput {snapshotId; parentPath; folderName}`, `RestoreResult {vaultId; targetPath}`.
**Tests (fail→pass):** none as "smoke". Types are exercised by later runtime tests + `pnpm typecheck`. Do **not** commit a type-only test as coverage.
**Edge cases:** `RestoreSnapshotInput` uses parent+name (non-existent target), not a single `targetPath`.
**Checkpoint:** `pnpm typecheck` clean → `git commit -m "feat(bl-03): add backup contract types"`.

## Task 2 — Persisted Vault UUID (`vault_meta`, migration v7)
**Objective:** Give every Vault a stable, path-independent UUID.
**Files:** `packages/vault-storage/src/index.ts` (append migration v7; add accessors).
**Behavior:** Migration v7 `run`: `CREATE TABLE IF NOT EXISTS vault_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`; insert `vault_id = randomUUID()` if absent. Add `getVaultMeta(key)`, `setVaultMeta(key,value)` (upsert via `ON CONFLICT`), `getVaultId()`.
**Tests (fail→pass):**
- `getVaultId()` returns a UUID; **stable across `close()`+reopen**.
- **Stable across folder move:** rename the vault root dir on disk, reopen at the new path, assert identical `vault_id`.
- Existing-Vault path: a repo initialized before v7 (simulate by running migrations up to 6 is unnecessary — just assert a freshly-initialized repo has exactly one `vault_id` row and re-init is idempotent).
**Edge cases:** migration runs once (recorded in `schema_migrations`); re-`initialize()` must not create a second id.
**Checkpoint:** `git commit -m "feat(bl-03): persist a location-independent Vault UUID in vault_meta"`.

## Task 3 — Backup helpers
**Objective:** Deterministic fingerprint/checksum/manifest utilities.
**Files:** create `packages/vault-storage/src/backup.ts`; **re-export from `src/index.ts`**.
**Contracts:** `hashFile(abs):"sha256:hex"`, `hashTree(root):Record<relPosix,sha>` (sorted, deterministic), `fingerprintTree(root):Record<relPosix,"size:mtimeMs">`, `treesEqual(a,b)`, `sqliteLiteralPath(abs)` (forward-slash + double single-quotes), `directorySizeBytes(root)`, `isSafeRelPosixPath(p)` (no leading `/`, no `..`, no `\`, no drive), `validateManifestShape(m):string[]` (returns problems per audit policy H).
**Tests (fail→pass):**
- `hashTree` deterministic; detects a content change.
- `sqliteLiteralPath("C:\\v\\a'b\\vault.db") === "C:/v/a''b/vault.db"`.
- `isSafeRelPosixPath` rejects `../x`, `/x`, `C:/x`, `a\\b`; accepts `vault.db`, `projects/p/f.md`.
- `validateManifestShape` flags bad `snapshotVersion`, non-UUID `vaultId`, bad `createdAt`, unsafe checksum key.
**Edge cases:** all paths normalized to POSIX; empty tree → `{}`.
**Checkpoint:** `git commit -m "feat(bl-03): add backup fingerprint/checksum/manifest helpers"`.

## Task 4 — `createSnapshot` capture engine
**Objective:** Write a consistent, listable snapshot; abort on external change.
**Files:** `packages/vault-storage/src/index.ts` (add `cpSync` to fs import; add method).
**Contract:** `createSnapshot(options: CreateSnapshotOptions, internalHooks?: { onAfterManagedCopy?: () => void }): SnapshotSummary`. The interface/service pass only `options`.
**Behavior:** stage `backups/.tmp-<uuid>/`; `before = fingerprintTree(projects)`; `VACUUM INTO` staged `vault.db` (**not** in a transaction); `cpSync(projects → staged/projects)`; run `internalHooks?.onAfterManagedCopy?.()`; `after = fingerprintTree(projects)`; if `!treesEqual(before,after)` throw `VALIDATION_ERROR` and delete staging; compute checksums (`vault.db` + each `projects/…`); write `manifest.json`; **atomic rename** staging → `backups/<isoDashed>_<uuid>/`. `finally`/`catch`: remove staging on failure. Never wrap in `this.transaction()`.
**Tests (fail→pass):**
- Snapshot exists: `manifest.json` + `vault.db` present, **no `vault.db-wal`**, `projectCount` correct, no leftover `.tmp-*`.
- **External-change abort (deterministic):** `internalHooks.onAfterManagedCopy` writes into `projects/`; assert throws and no non-temp snapshot created and **live Vault unchanged**.
- **No half-snapshot:** force a failure mid-capture (e.g. hook throws); assert only a temp dir can exist transiently and none remains after; live Vault unchanged.
**Edge cases:** empty `projects/`; a file with an apostrophe in its path (checks `sqliteLiteralPath`).
**Checkpoint:** `git commit -m "feat(bl-03): implement createSnapshot capture engine with external-change abort"`.

## Task 5 — list / inspect / delete / disk usage
**Objective:** Enumerate and verify snapshots.
**Files:** `packages/vault-storage/src/index.ts`.
**Contracts:** `listSnapshots():SnapshotSummary[]` (newest first; **ignore `.tmp-*` and `*.restoring-*` and any dir without `manifest.json`**); `inspectSnapshot(id):SnapshotInspection`; `deleteSnapshot(id):{id}`; `backupsDiskUsage():{totalBytes;count}`. Guard `id` with `assertIdentifier` before joining under `backups/`.
**Integrity policy (audit H):** `inspect` runs `validateManifestShape` + **exact file bijection** (present files under snapshot dir minus `manifest.json` === checksum keys; no missing, no unexpected extra) + per-file SHA-256 match. `problems` enumerates every violation; `integrityOk = problems.length===0`.
**Tests (fail→pass):**
- list/inspect/delete round-trip; `integrityOk===true` for a fresh snapshot; disk usage > 0.
- corrupted `vault.db` → `integrityOk===false` with a mismatch problem.
- **unexpected extra file** added into snapshot dir → flagged; **missing file** removed → flagged.
- listing **ignores** a hand-created `.tmp-x` and `foo.restoring-x` dir.
- path traversal id (`../../etc`) → `inspect`/`delete` throw.
**Checkpoint:** `git commit -m "feat(bl-03): list/inspect/delete snapshots + disk usage + id guard"`.

## Task 6 — `restoreSnapshotToNewVault`
**Objective:** Non-destructive restore into a new Vault with new identity + lineage.
**Files:** `packages/vault-storage/src/index.ts`.
**Contract:** `restoreSnapshotToNewVault(input: RestoreSnapshotInput): RestoreResult`. `target = join(parentPath, folderName)`.
**Order (audit I):** (1) `assertIdentifier(snapshotId)`, validate `parentPath` exists + `folderName` safe, **target must not exist**; (2) `inspectSnapshot` — refuse if `!integrityOk`; (3) refuse if `manifest.schemaVersion > max(MIGRATIONS.version)`; (4) stage at `join(parentPath, ".orbit-restoring-<uuid>")`, copy `vault.db` + `projects/`; (5) open staged DB, run `PRAGMA integrity_check` + `PRAGMA foreign_key_check`, refuse on failure; (6) upsert new `vault_id` + `restored_from_vault_id`/`restored_from_snapshot_id`/`restored_at`; (7) **close the staged DB handle**; (8) `renameSync(staging → target)` (atomic; target non-existent → works on Windows); (9) on any failure delete staging and ensure `target` was never created.
**Tests (fail→pass):**
- **Round-trip:** build a Vault with projects/folders/documents(+content)/knowledge/evidence/relationships/history → snapshot → restore → `deepEqual(logicalDump(source), logicalDump(restored))` **and** `hashTree(restored/projects) === hashTree(source/projects)`. `logicalDump` covers all Phase 2 entities **and knowledge history**.
- **New identity + lineage:** restored `vault_id !== source`; lineage keys recorded.
- **Refuse corrupted** snapshot → throws, `target` does **not** exist, and **no `.orbit-restoring-*` remains in `parentPath`** (scan the dir).
- **Schema-too-new:** set `manifest.schemaVersion` beyond max → refused specifically by the schema guard.
- **Live Vault unchanged** after both successful and failed restore.
**Edge cases:** target exists → refuse; `folderName` with separators → refuse; parent missing → refuse.
**Checkpoint:** `git commit -m "feat(bl-03): restore snapshot to new vault with staging, atomic finalize, lineage"`.

## Task 7 — Repository interface + `VaultService.backup` facade
**Objective:** Surface backup through core.
**Files:** `packages/vault-core/src/index.ts` (extend `VaultRepository` at line ~86; add facade on `VaultService`).
**Contracts:** interface gains `createSnapshot(options)` (single-arg signature — the internal hook is not part of the interface), `listSnapshots`, `inspectSnapshot`, `deleteSnapshot`, `restoreSnapshotToNewVault`, `backupsDiskUsage`. Facade `service.backup = { create, list, inspect, delete, restoreToNewVault, diskUsage }`, validating ids with `assertIdentifier` (mirror the `integrity`/`evidence` facade style).
**Tests (fail→pass):** `service.backup.create({appVersion}).id` then `service.backup.list()[0].id` matches; `inspect().integrityOk === true`.
**Checkpoint:** `git commit -m "feat(bl-03): add backup facade to VaultService and repository interface"`.

## Task 8 — IPC + write barrier (main)
**Objective:** Expose channels; guarantee barrier release.
**Files:** `apps/vault-desktop/electron/main/main.ts`.
**Behavior:** add `withWriteBarrier(op)` = `stopProjectsWatcher(); try { return op() } finally { startProjectsWatcher() }`. Register: `handle("vault:backup:create", () => withWriteBarrier(() => vault.backup.create({ appVersion: app.getVersion() })), true)`; `handle("vault:backup:list", …)`; `handle("vault:backup:inspect", id => …)`; `handle("vault:backup:delete", id => …, true)`; `handle("vault:backup:disk-usage", …)`; restore via `ipcMain.handle("vault:backup:restore", (_e,input) => asyncSafe(async () => { const parent = await chooseVaultDirectory("Choose where to create the restored Vault"); if(!parent) throw VALIDATION_ERROR("Restore cancelled."); return vault.backup.restoreToNewVault({ snapshotId: input.snapshotId, parentPath: parent, folderName: input.folderName }); }))` (restore does not mutate the current Vault → no `mutates`).
**Tests:** `pnpm typecheck`. Behavioral IPC is covered by storage/service tests; barrier release is asserted in Task 4's failure test (watcher restart) at the storage level.
**Edge cases:** create/delete carry `mutates=true` for `vault:changed`; restore does not.
**Checkpoint:** `git commit -m "feat(bl-03): register vault:backup IPC and write barrier in main"`.

## Task 9 — Preload surface
**Objective:** Bridge `window.vault.backup`.
**Files:** `apps/vault-desktop/electron/preload/preload.cts`; `apps/vault-desktop/renderer/src/electron.d.ts`.
**Behavior:** add frozen `backup: { create:()=>call("vault:backup:create"), list:()=>call("vault:backup:list"), inspect:(id)=>call("vault:backup:inspect",id), delete:(id)=>call("vault:backup:delete",id), restoreToNewVault:(input)=>call("vault:backup:restore",input), diskUsage:()=>call("vault:backup:disk-usage") }`. Type the renderer surface with the `@orbit/vault-types` types.
**Tests:** `pnpm typecheck`.
**Checkpoint:** `git commit -m "feat(bl-03): expose window.vault.backup via preload"`.

## Task 10 — Backups panel (renderer)
**Objective:** Manual UI for snapshots.
**Files:** create `apps/vault-desktop/renderer/src/BackupsView.tsx`; modify `App.tsx` (add `"backups"` to `view`, a `.view-switch` button, render the panel following the Knowledge-overlay pattern; add the pre-snapshot autosave flush).
**Behavior:** Create button → **await `saveNow(content)` when `dirty`** (flush) → `window.vault.backup.create()` → refresh list. List (newest first) with created/size/projectCount/version. Per row: Inspect (manifest + integrity/problems) and Delete (in-app confirm, not `window.confirm`). Restore → prompt for a new folder name, call `restoreToNewVault({ snapshotId, folderName })` (main picks the parent dir). Total disk-usage line. Renderer never touches fs.
**Tests:** `pnpm typecheck`, `pnpm build`; manual smoke (create → list → inspect → restore into a new folder → opens as a working Vault). UI is verified manually per ARCHITECTURE.
**Checkpoint:** `git commit -m "feat(bl-03): add Backups panel with create/list/inspect/delete/restore"`.

## Task 11 — Static regression + verification gate + Project Truth closeout
**Objective:** Lock the contract; verify; close out (Rule 11).
**Files:** `scripts/phase2-lifecycle-ui-regression.mjs`; `.orbit/CURRENT_PHASE.md`, `.orbit/ARCHITECTURE.md`, `.orbit/DECISIONS.md`, `.orbit/ROADMAP.md`, `.orbit/BACKLOG.md`, `README.md`.
**Behavior:** extend the script (read `BackupsView.tsx`) to assert the five `vault:backup:*` channels in main + preload, the `backup` type member, and key `BackupsView` labels/API calls — without weakening existing checks. Then run the full gate. Then complete the Rule 11 closeout: record exact verification results + final commit in `CURRENT_PHASE.md`; update `ARCHITECTURE.md` (implemented backup reality: `backups/` snapshots, `vault_meta` UUID + lineage, `VACUUM INTO`, `vault:backup:*`); add binding decisions to `DECISIONS.md` (persisted Vault identity; restore = new-Vault + lineage; integrity = corruption-not-forgery); mark BL-03 done in `ROADMAP.md`/`BACKLOG.md` (keep history); update `README.md` test count; return `CURRENT_PHASE.md` to BETWEEN PHASES; write the completion summary.
**Gate (all green):** `pnpm typecheck` · `pnpm test` (incl. `tests/backup.test.ts`) · `pnpm build` · `node scripts/phase2-lifecycle-ui-regression.mjs`.
**Checkpoint:** `git commit -m "test(bl-03): extend static regression; verify gate; record implemented reality"`.

---

## Test helpers (define once in `tests/backup.test.ts`)

- `repoFixture()` — `mkdtempSync` root + `SqliteVaultRepository` + `initialize()` (mirror `tests/phase2-knowledge.test.ts`).
- `logicalDump(repo)` — ordered snapshot of projects, folders, documents (+ content hash), knowledge objects, evidence, relationships, and knowledge history, for `deepEqual`.
- `listDir(path)` — `readdirSync` for staging/temp-artifact scans.

## Dependency order

1 → 2 → 3 → 4 → 5 → 6 → 7 → (8, 9) → 10 → 11. Tasks 4–6 depend on 2+3; 7 depends on 4–6; 8/9 depend on 7; 10 depends on 9; 11 last.

## Closeout (Rule 11)

Task 11 performs the Project Truth closeout. The phase is complete only when the gate is green, Project Truth reflects verified reality, `CURRENT_PHASE.md` is returned to BETWEEN PHASES with the exact next decision recorded, and a fresh agent could orient from the repository alone.
