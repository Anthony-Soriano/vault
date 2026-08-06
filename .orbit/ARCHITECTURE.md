Only verified technical reality:

(Reflects code at `main` / tag `v0.2.0`. State only what exists — Rule 5.)

## Packages

pnpm monorepo (`pnpm-workspace.yaml`), Node ≥ 22.13, pnpm 11.9.0.

- `packages/vault-types` — shared types + the `VaultRendererApi` IPC contract (single wire source of truth).
- `packages/vault-core` — validation, use-case service (`VaultService`), repository interfaces, and pure analyzers (incl. `analyzeKnowledgeIntegrity`).
- `packages/vault-storage` — `SqliteVaultRepository`: SQLite migrations, local-file operations, search, reconciliation, knowledge/evidence/relationship/history/merge persistence, integrity assembly.
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

## IPC

Registered in `electron/main/main.ts` via a `handle(channel, op, mutates=false)` helper; mutating channels notify the renderer with `vault:changed`. The renderer side (`preload.cts`) wraps each channel with `call<T>(channel, …args)`. Channels are namespaced `vault:*` (lifecycle, filesystem, projects, folders, documents, knowledge, evidence, relationships, integrity, search, development) plus `desktop:*` / `dialog:*`. `window.vault.integrity.analyze` is read-only (no `mutates` flag). Every request that carries an id is validated (`assertIdentifier`) in `VaultService`.

## Database

`node:sqlite` (`DatabaseSync`) — Node 22 built-in, no native dependency. Schema is applied through versioned, repeatable migrations in `SqliteVaultRepository`. Tables include projects, folders, documents, knowledge_objects, evidence_sources, knowledge_evidence_links, relationships, and knowledge_object_history. Merge and lifecycle operations run inside a single transaction so a failure changes nothing.

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

Node's built-in runner: `node --experimental-strip-types --test tests/*.test.ts`. Suites: `phase1-storage`, `phase2-knowledge`, `phase2-integrity`, `graph-v2` — **49 tests** at v0.2.0. Static UI/IPC contract check: `node scripts/phase2-lifecycle-ui-regression.mjs`. Type + build gates: `pnpm typecheck`, `pnpm build`. UI interaction is verified manually (the Electron window is not auto-driven).

## Architectural invariants

1. Vault owns all persistent state.
2. The renderer never touches Node/SQLite/filesystem directly.
3. Models return proposals, never silent mutations; every model-generated object carries provenance.
4. Confidence is metadata, not truth.
5. Project context is isolated by default.
6. Atlas/Graph is a derived projection, never a second database.
7. Deterministic checks are pure and reproducible; identical Vault state yields byte-identical integrity reports.
8. Integrations use the stable Vault API, not direct database access.
