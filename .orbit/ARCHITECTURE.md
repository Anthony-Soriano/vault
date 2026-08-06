ARCHITECTURE.md
Only verified technical reality:

(Reflects code at `main`: the `v0.2.0` baseline plus the completed BL-03 recovery/backup work. State only what exists — Rule 5.)

## Packages

pnpm monorepo (`pnpm-workspace.yaml`), Node ≥ 22.13, pnpm 11.9.0.

- `packages/vault-types` — shared types + the `VaultRendererApi` IPC contract (single wire source of truth).
- `packages/vault-core` — validation, use-case service (`VaultService`), repository interfaces, and pure analyzers (incl. `analyzeKnowledgeIntegrity`).
- `packages/vault-storage` — `SqliteVaultRepository`: SQLite migrations, local-file operations, search, reconciliation, knowledge/evidence/relationship/history/merge persistence, integrity assembly, and snapshot/restore (backup) with fingerprint/checksum/manifest helpers.
- `apps/vault-desktop` — Electron shell (`electron/main`, `electron/preload`) + React/Vite renderer (`renderer/`).

## Boundaries

One-directional dependency and control flow:

```
Electron main (electron/main/main.ts)
  → typed IPC (ipcMain.handle "vault:*")
Preload bridge (electron/preload/preload.cts)  → exposes window.vault (+ window.orbit.desktop)
  →
React renderer (renderer/src/*.tsx)
  →
VaultService (packages/vault-core)
  →
SqliteVaultRepository (packages/vault-storage)  → SQLite + ordinary local files
```

The renderer imports only from `@orbit/vault-types` and calls `window.vault`; it never imports Node/SQLite/fs.

## Data ownership

- The **filesystem** owns document/file **content** (ordinary files under `projects/<id>/…`).
- The **database** owns **identity, structure, metadata, knowledge, relationships, evidence links, and history**.
- Atlas/Graph owns **nothing** — it is a derived projection.

## Storage model

Vault directory shape:

```
<vault>/
  vault.db  (+ vault.db-wal / vault.db-shm while active)
  projects/
    <managed project id>/files/…      # UUID-managed projects
    <human-readable in-place folder>/… # reconciled in-place projects
  backups/                            # directory created; backup-writing not yet implemented (BACKLOG BL-03)
```

Markdown content is stored as ordinary `.md` files and autosaved. Imported files are copied into managed storage atomically (temp file → rename).

## Backup & recovery (BL-03)

Manual, on-demand snapshots live under `backups/<iso-dashed>_<uuid>/` as `manifest.json` + a single consistent `vault.db` (via `VACUUM INTO`, no `-wal`/`-shm`) + a verbatim copy of the `projects/` tree. Capture is staged under `backups/.tmp-<uuid>/` and atomically renamed on success; the managed files are fingerprinted before and after the copy and the snapshot is **aborted** if anything changed during capture (defends against external writers the in-process barrier cannot stop). `manifest.json` records `snapshotVersion`, `vaultVersion`, `createdAt`, `vaultId`, `schemaVersion`, `projectCount`, and per-file SHA-256 checksums; integrity validation is structural + exact file bijection (corruption/accidental modification, **not** cryptographic authenticity). Restore is non-destructive: it validates (structure → checksums → supported schema) before writing, stages into a sibling `*.orbit-restoring-<uuid>`, runs `PRAGMA integrity_check`/`foreign_key_check`, assigns a **new** Vault UUID with lineage, and atomically finalizes into a **new, non-existent** target directory (Windows-safe); it never touches the live Vault. Snapshots are never auto-deleted.

Vault identity: each Vault persists a location-independent UUID in a `vault_meta` table (migration 7), stable across moves/renames. A restored Vault receives a new UUID plus lineage keys (`restored_from_vault_id`, `restored_from_snapshot_id`, `restored_at`).

## IPC

Registered in `electron/main/main.ts` via a `handle(channel, op, mutates=false)` helper; mutating channels notify the renderer with `vault:changed`. The renderer side (`preload.cts`) wraps each channel with `call<T>(channel, …args)`. Channels are namespaced `vault:*` (lifecycle, filesystem, projects, folders, documents, knowledge, evidence, relationships, integrity, backup, search, development) plus `desktop:*` / `dialog:*`. `window.vault.integrity.analyze` and the read-only backup channels (`list`, `inspect`, `disk-usage`) carry no `mutates` flag; `backup:create` (which runs inside a defensive write barrier that pauses the projects watcher and restarts it in `finally`) and `backup:delete` do; `backup:restore` does not touch the current Vault. Every request that carries an id is validated (`assertIdentifier`) in `VaultService`.

## Database

`node:sqlite` (`DatabaseSync`) — Node 22 built-in, no native dependency. Schema is applied through versioned, repeatable migrations in `SqliteVaultRepository`. Tables include projects, folders, documents, knowledge_objects, evidence_sources, knowledge_evidence_links, relationships, knowledge_object_history, and vault_meta (a key/value table holding the persisted Vault UUID and restore lineage; migration 7). Merge and lifecycle operations run inside a single transaction so a failure changes nothing. `VACUUM INTO` (snapshot capture) runs outside any transaction, in autocommit.

## Filesystem

- Import copies external files into `projects/<id>/…` (originals untouched).
- Reconciliation registers in-place folders/files without copying, on Vault open and on demand (`vault:filesystem:reconcile`).
- A recursive, debounced (`750 ms`) `fs.watch` watcher on `projects/` reconciles after external changes. Ignore-lists cover `.git`, `node_modules`, `dist`, caches, etc.; symlink traversal is constrained; a scan is capped at 25,000 visited entries per project. (Watcher is implemented but not stress-proven at scale — BACKLOG BL-06/BL-07.)

## Security

- Context-isolated preload; the renderer has no Node/SQLite/fs access and only sees the frozen `window.vault` / `window.orbit` surfaces.
- All native operations (dialogs, open/reveal, file writes, DB) run in the main process.
- Project isolation is enforced: cross-project relationships and evidence are rejected.
- The future Orbit assistant must use the Vault service API, never `vault.db` directly.

## Testing

Node's built-in runner: `node --experimental-strip-types --test tests/*.test.ts`. Suites: `phase1-storage`, `phase2-knowledge`, `phase2-integrity`, `graph-v2`, `backup` — **70 tests** (49 at v0.2.0 + 21 for BL-03 backup/restore). Static UI/IPC contract check: `node scripts/phase2-lifecycle-ui-regression.mjs` (now also asserts the `vault:backup:*` contract). Scripts run via `corepack pnpm <script>` (no global pnpm required). Type + build gates: `pnpm typecheck`, `pnpm build`. UI interaction is verified manually (the Electron window is not auto-driven).

## Architectural invariants

1. Vault owns all persistent state.
2. The renderer never touches Node/SQLite/filesystem directly.
3. Models return proposals, never silent mutations; every model-generated object carries provenance.
4. Confidence is metadata, not truth.
5. Project context is isolated by default.
6. Atlas/Graph is a derived projection, never a second database.
7. Deterministic checks are pure and reproducible; identical Vault state yields byte-identical integrity reports.
8. Integrations use the stable Vault API, not direct database access.
