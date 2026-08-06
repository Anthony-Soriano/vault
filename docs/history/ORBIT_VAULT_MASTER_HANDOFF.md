# Orbit Vault — Master Project Handoff

Last updated: 2026-08-04

Current application version: `0.1.3`

Repository: `AnthonySoriano999/vault`

Branch/tag checkpoint: `main`, `v0.1.3` at commit `fc2905e`

This is the primary orientation document for any new agent working on Orbit Vault. Read this file, `README.md`, and `docs/architecture.md` before changing code. The working tree contains substantial post-`v0.1.3` development work that is not represented by the release tag.

## 1. Product identity

Orbit Vault is a local-first AI knowledge system that transforms files, conversations, and decisions into an editable, transparent memory layer for projects.

It is not intended to be merely a notes app, a graph database UI, or a temporary Orbit prototype. Treat Vault as a standalone desktop product with stable interfaces that the wider Orbit platform can later consume.

The defining product rule is:

> Documents are source material. Knowledge objects are interpretations. Evidence connects the two. Users remain in control.

Models may eventually propose changes, but they must never silently mutate canonical knowledge. Confidence is metadata, not truth.

## 2. Canonical product model

The long-term system is built around five entities:

1. **Project** — the top-level workspace and default context boundary.
2. **Document/File** — local source material, including Markdown and general files.
3. **Knowledge Object** — a fact, decision, goal, question, idea, or preference.
4. **Relationship** — a typed directed connection between canonical entities.
5. **Evidence Source** — provenance connecting an interpretation to supporting material.

Important invariants:

- Vault owns persistent state.
- Project context is isolated by default.
- The renderer never directly accesses Node.js, SQLite, or the filesystem.
- Electron main owns native operations and exposes a typed preload IPC bridge.
- AI returns proposals; explicit user approval changes canonical memory.
- Every future model-generated knowledge object must have provenance.
- Project DNA is derived and regenerable, never a duplicated manual source of truth.
- Atlas visualizes canonical data; it never defines or privately duplicates it.
- The future Orbit assistant must use a stable Vault API, not read `vault.db` directly.

## 3. Current architecture

```text
Electron main process
  -> secure typed IPC
Preload bridge (`window.vault` / desktop bridge)
  ->
React + Vite renderer
  ->
VaultService (`packages/vault-core`)
  -> repository interfaces
SqliteVaultRepository (`packages/vault-storage`)
  -> SQLite metadata + ordinary local project files
```

Primary locations:

- `apps/vault-desktop/electron/main/main.ts` — Electron lifecycle, native menus/dialogs, Vault activation, IPC registration, filesystem watcher.
- `apps/vault-desktop/electron/preload/preload.cts` — secure renderer API exposure.
- `apps/vault-desktop/renderer/src/App.tsx` — main Files UI and application orchestration.
- `apps/vault-desktop/renderer/src/KnowledgeView.tsx` — manual Knowledge UI.
- `apps/vault-desktop/renderer/src/GraphViewV2.tsx` — interactive Atlas rendering and live force simulation.
- `apps/vault-desktop/renderer/src/hierarchyGraph.ts` — deterministic derived Atlas model and baked clustered layout.
- `packages/vault-types/src/index.ts` — canonical shared types and IPC contract.
- `packages/vault-core/src/index.ts` — validation, use cases, and repository interfaces.
- `packages/vault-storage/src/index.ts` — SQLite migrations, local-file operations, search, reconciliation, knowledge/evidence/relationship persistence.
- `tests/` — storage, knowledge, reconciliation, and Atlas regression coverage.

Vault disk shape:

```text
<chosen Vault directory>/
  vault.db
  vault.db-wal / vault.db-shm (while SQLite is active)
  projects/
    <managed project id>/files/...
    <human-readable in-place project folder>/...
  backups/
```

Yes, a Vault normally adds `vault.db` to the chosen directory. It is application metadata. An empty selected folder is initialized directly. A non-empty folder without `vault.db` requires confirmation before Orbit adds its Vault infrastructure; existing contents must not be modified or automatically imported.

## 4. Implemented capabilities on the current working tree

### Desktop and Vault foundation

- Native Electron desktop shell with Vite hot reload and production packaging configuration.
- Secure context-isolated preload bridge; renderer has no direct Node API access.
- Create, open, remember, switch, and reopen real Vault directories.
- SQLite metadata persistence with versioned repeatable migrations.
- Multiple Vaults remain isolated.
- Native menus and file/folder dialogs.
- Windows NSIS packaging configuration; release artifact name is `Orbit-Vault-0.1.3-Setup.exe` when packaging succeeds.

### Projects, folders, and files

- Project, folder, and Markdown document CRUD.
- Markdown content stored as ordinary local files and autosaved.
- Navigation/Vault-switch protection for pending edits.
- Archive, Trash, Restore, and project hierarchy preservation.
- Import general files into managed Vault storage.
- Open files natively and reveal them in File Explorer.
- Lexical search for Markdown and supported text-like files; binary files remain discoverable by metadata.
- Missing files remain canonical records and surface as unavailable rather than silently losing evidence/relationships.

### Filesystem reconciliation

- A top-level ordinary folder placed beneath `<vault>/projects/` can become an in-place canonical Project.
- Nested folders and files are registered without copying or rewriting them.
- Reconciliation runs on Vault open and via **Refresh from Disk**.
- Current Electron main also starts a debounced recursive `fs.watch` watcher (750 ms) for the projects directory and reconciles after changes.
- Generated/dependency directories such as `.git`, `node_modules`, `dist`, `build`, caches, virtual environments, and similar trees are ignored.
- Symlink traversal is constrained and scans are capped at 25,000 visited entries per project.
- External rename identity is not safely inferred: a new path may register while the previous record remains missing. Do not guess identity silently.

The watcher is newer than some roadmap prose. Treat it as implemented but not fully production-proven. Large-project drag/drop and watcher/reconciliation performance need stress testing because earlier iterations caused UI freezes and stale displays.

### Manual knowledge system (Phase 2 development)

- Create and edit user-authored Knowledge Objects.
- Types: fact, decision, goal, question, idea, preference.
- Status/confidence metadata and explicit approval flow.
- Assign Knowledge Objects to project folders without changing identity.
- Attach Evidence Sources to documents/files.
- Create and remove typed, project-scoped Relationships.
- Incoming/outgoing links and backlinks.
- Independent knowledge search.
- Optional Knowledge and relationship overlays in Atlas.
- Cross-project relationships are rejected.

Not yet complete: merge/history, supersede/delete UX completeness, deterministic integrity warnings, and the rest of the full manual Phase 2 completion contract.

No AI provider or automatic model mutation path should be added until the manual canonical system is complete and stable.

## 5. Atlas / Graph philosophy and current state

The graph exists to visualize the Vault. It does not define the Vault. Layout is derived from canonical entities and interactions must not become the primary organization mechanism.

The current layout is a deterministic clustered force-directed design using `d3-force`, not the former rigid radial/wedge layout:

- Each top-level project receives a cluster center.
- Project descendants receive a weak pull toward their own cluster.
- `forceLink` gives parent-child edges spring behavior.
- `forceManyBody` creates breathing room.
- `forceCollide` prevents node-circle overlaps.
- Same input is sorted/seeded, simulated for a fixed tick count, and rounded so reloads are deterministic.
- The Vault root is a real but visually de-emphasized physics participant, not a fixed origin.
- Live motion is enabled for large graphs; it must not silently disable at an arbitrary node count.

Interactive behaviors to preserve:

- Zoom, pan, fit, center, and reset.
- Drag-to-nudge with elastic settling; manual offsets are session-only.
- Collapse hides all descendants recursively.
- Search includes collapsed nodes and expands all ancestors before focus.
- Root/root-folder and hovered/selected/searched labels remain visible; other thresholds depend on graph zoom scale.
- Live motion toggle.
- Node size, node spacing, and hierarchy pull sliders mapped to real simulation parameters.
- Knowledge and typed relationship overlays are optional derived layers and do not move or mutate canonical data.

Current tuning status: the graph is substantially improved but intentionally **not considered finished**. Dense folders can still create starburst/shared-endpoint edge clutter. Physics can spread nodes but cannot remove the real fact that many children share one parent. Future visual options include edge fading, curved routing, hover emphasis, or bundling. Do not replace the single `d3-force` architecture with competing animation loops or return to rigid wedge math.

Graph-specific historical notes are in `CODEX_HANDOFF_graph_layout.md` and `CODEX_HANDOFF_graph_style_pivot.md`; this document supersedes them where they conflict with current code.

## 6. Phase history and roadmap

### Phase 0 — desktop foundation (complete)

Electron main/preload/renderer separation, native shell, development/build pipeline, package boundaries, and standalone-product architecture.

### Phase 1 / 1.1 — local Vault foundation (complete in development)

Real Vault directories, multi-Vault lifecycle, project/folder/document CRUD, autosave protection, archive/trash/restore, search, Atlas projection, and restart persistence.

### Phase 1.2 / 1.3 — partially absorbed, not formally closed

General source import, native open/reveal, external filesystem reconciliation, and an initial watcher exist. Broad diagnostics, accessibility, recovery tooling, large-Vault validation, export, release polish, and installed-build regression still need formal closure.

### Phase 2 / 2.1 / 2.2 / 2.3 — in active development

Manual knowledge objects, evidence, typed relationships/backlinks, folder organization, Atlas overlays, managed source files, and filesystem reconciliation exist. Phase 2 is not fully complete until merge/history, complete lifecycle UX, deterministic integrity checks, and comprehensive regression coverage are finished.

### Next recommended milestone

Freeze features briefly and stabilize the current foundation:

1. Validate filesystem watcher/reconciliation with small and very large external project drops.
2. Confirm no renderer freeze, reconciliation loop, duplicate registration, or data loss.
3. Finish Atlas performance/edge-legibility tuning without changing its canonical boundaries.
4. Complete manual Phase 2 lifecycle gaps: merge/history, supersede/delete paths, integrity warnings, and evidence inspection polish.
5. Run installed-build regression on a fresh Windows installer and verify create/edit/restart/search/Atlas/reconciliation.
6. Create a clean milestone commit/tag before Phase 3.

Later roadmap:

- **Phase 3:** AI proposals, project-scoped assistant, transparent context builder, cited answers. AI proposes; users approve.
- **Phase 4:** derived, evidence-backed Project DNA.
- **Phase 5:** semantic drift/conflict detection and knowledge maintenance.
- **Phase 6:** stable integration API for the wider Orbit platform.

## 7. Commands and verification

Requirements: Node.js `>=22.13.0`, pnpm `11.9.0`.

```powershell
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm package
pnpm package:dir
```

When adding a new Vite dependency, perform `pnpm install` and fully restart `pnpm dev`; hot reload alone may not update Vite dependency pre-bundling.

Current verified baseline on 2026-08-04:

- `pnpm test`: 18/18 tests passed.
- `pnpm build`: passed for Electron main, preload, and React renderer.
- Atlas suite: 6/6 passed, covering determinism, recursive collapse/ancestry, cluster separation, canonical knowledge ancestry, no node-circle overlaps, and unfixed Vault-root physics.
- Development Electron window launched successfully after a cold restart.

Manual checks an agent cannot fully replace:

1. Create/open/switch two real Vault directories.
2. Create project, nested folder, and Markdown note; edit and confirm autosave.
3. Close Electron fully, reopen, and confirm hierarchy/content persistence.
4. Archive, Trash, Restore, rename, and move entities.
5. Search documents and knowledge; verify result navigation.
6. Import a general source file; open/reveal it and attach it as evidence.
7. Drop an existing project folder into `<vault>/projects/`; verify it appears without freezing or duplicating.
8. Modify/add/rename/remove files externally; verify watcher and Refresh from Disk behavior.
9. Open Atlas on a large project; test zoom/pan/drag/collapse/search/sliders/live-motion and watch CPU/UI responsiveness.
10. Package/install on Windows, repeat persistence and Atlas tests, then uninstall/reinstall without losing user Vault data.

## 8. Git and workspace warning

The only committed public checkpoint is `fc2905e` / `v0.1.3`. The current working tree is intentionally dirty and contains many important post-release edits. Never reset, discard, or overwrite it.

Before committing:

- Inspect `git status --short` and `git diff` carefully.
- Do not commit generated output, installers, runtime databases, development Vaults, logs, package caches, or machine-specific files.
- The root also contains legacy web-prototype trees/configuration (`app/`, `public/`, `worker/`, `db/`, `drizzle/`, `next.config.ts`, root Vite/PostCSS/Drizzle files, and `package-lock.json`). They are not part of the active Electron/pnpm architecture unless deliberately audited and migrated. Do not add them accidentally.
- Generated directories such as `dist/`, `release/`, `outputs/`, `work/`, `build/`, `.runtime/`, `.pnpm-store/`, and `node_modules/` must remain uncommitted.
- Preserve user Vault directories and `vault.db` files. Never clean them as build artifacts.

The `.gitignore` should be reviewed before the next milestone because the status currently exposes legacy/untracked prototype material. Stop and report unexpected files before staging.

## 9. Known risks and non-goals

- Atlas visual tuning remains open; do not confuse line convergence with node collision failure.
- Recursive filesystem watching may be expensive on very large, cloud-synced, or dependency-heavy trees despite ignore rules.
- OneDrive/cloud hydration and filesystem locks can delay or destabilize reconciliation; report exact paths and errors rather than silently retrying destructive operations.
- External rename matching is intentionally conservative.
- Packaging previously encountered Windows `EPERM`/locking issues; use fresh output paths and inspect exact locked source/destination paths rather than changing app architecture.
- Do not implement hidden AI memory, automatic truth promotion, or cross-project context leakage.
- Do not make Atlas a second database or the primary file organization interface.
- Do not let renderer code bypass IPC for filesystem, SQLite, search, or future AI services.

## 10. Definition of a safe next-agent start

Before changing anything, a new agent should:

1. Read this file, `README.md`, and `docs/architecture.md`.
2. Run `git status --short` and preserve all existing work.
3. Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
4. Launch with a fresh `pnpm dev` process, not a stale Electron/Vite instance.
5. Reproduce the specific requested behavior in a disposable Vault.
6. Make narrowly scoped changes through the canonical service/repository/IPC boundaries.
7. Add or update regression tests for every persistence, reconciliation, or Atlas invariant affected.

If architecture documentation conflicts with executable behavior, verify the implementation and tests, then update the documentation explicitly. Never assume an older phase label is more accurate than the current working tree.
