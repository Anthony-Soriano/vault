ARCHITECTURE.md
Only verified technical reality:

(Reflects code at `main`: the `v0.2.0` baseline, the completed BL-03 recovery/backup work, and the Phase 3 `v0.3.0` AI Foundation layer. State only what exists — Rule 5.)

## Packages

pnpm monorepo (`pnpm-workspace.yaml`), Node ≥ 22.13, pnpm 11.9.0.

- `packages/vault-types` — shared types + the `VaultRendererApi` IPC contract (single wire source of truth). Also holds the Phase 3 `v0.3.0` AI contracts (proposal/provenance/context/request-response, provider config, `AiResult`/`AiError`) and the `v0.3.1` Project Context contracts (`RawEvidenceFile`, `ProjectEvidenceItem`/`Inventory`, `ProjectTruthReadiness`, `ProjectContextAnalysis`).
- `packages/vault-core` — validation, use-case service (`VaultService`), repository interfaces, pure analyzers (incl. `analyzeKnowledgeIntegrity` and the `v0.3.1` `classifyEvidence`/`detectProjectTruthReadiness`/`selectContextEvidence`/`buildProjectContextPackage`), and the Phase 3 `v0.3.0` AI Foundation layer (`AiService`, `AiModelProvider`, `StubAiProvider`, `AiProviderError`, `createAiContextPackage`).
- `packages/vault-storage` — `SqliteVaultRepository`: SQLite migrations, local-file operations, search, reconciliation, knowledge/evidence/relationship/history/merge persistence, integrity assembly, snapshot/restore (backup) with fingerprint/checksum/manifest helpers, and read-only `v0.3.1` project-evidence discovery (`analyzeProjectContext`).
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

Registered in `electron/main/main.ts` via a `handle(channel, op, mutates=false)` helper; mutating channels notify the renderer with `vault:changed`. The renderer side (`preload.cts`) wraps each channel with `call<T>(channel, …args)`. Channels are namespaced `vault:*` (lifecycle, filesystem, projects, folders, documents, knowledge, evidence, relationships, integrity, context, backup, search, development) plus `desktop:*` / `dialog:*`. `window.vault.integrity.analyze`, the read-only `window.vault.context.analyze` (`vault:context:analyze`, `v0.3.1`), and the read-only backup channels (`list`, `inspect`, `disk-usage`) carry no `mutates` flag; `backup:create` (which runs inside a defensive write barrier that pauses the projects watcher and restarts it in `finally`) and `backup:delete` do; `backup:restore` does not touch the current Vault. Every request that carries an id is validated (`assertIdentifier`) in `VaultService`.

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

## AI layer (Phase 3 — v0.3.0 AI Foundation)

A provider-neutral, proposal-only AI layer exists in `packages/vault-core`, with its typed contracts in `packages/vault-types`. It is pure (no Node/SQLite/fs, no vendor SDK) and dependency-injected.

- **`AiModelProvider`** — the provider-neutral backend interface (`id`, `model`, `generate(AiProviderRequest) → Promise<AiProviderRawResponse>`). Swapping providers requires no change to the contracts or the service. `StubAiProvider` is a deterministic in-process implementation used by tests and the verification gate; no vendor is baked in.
- **`AiService`** — the project-scoped service boundary. `propose(AiProposalRequest)` validates the request, sends an explicitly constructed `AiContextPackage` to the injected provider, and returns structured, non-canonical `AiProposal`s wrapped in `AiResult`. It holds **no repository reference**, so it structurally cannot read or write `vault.db`.
- **Trust invariants enforced in code:** every returned proposal has `status: "proposed"` (never canonical); each proposal must carry provenance — cited `evidence` or an explicit `inferred` flag, else the response is rejected `AI_RESPONSE_INVALID`; each proposal's `projectId` is stamped from the request, and context from another project is rejected `AI_PROJECT_ISOLATION`; provider failures are returned as typed `AI_PROVIDER_ERROR` / `AI_TRANSPORT_ERROR` and never mutate state or throw to the caller. Ids are deterministic for a fixed clock.
- **Not yet present (later Phase 3 slices):** no wiring of the *proposal* pipeline into `VaultService`/IPC/renderer; no Project Truth generation (`v0.3.2`); no review/approval UI (`v0.3.3`); no knowledge proposal engine (`v0.3.4`); no maintenance proposals (`v0.3.5`); no live vendor provider. The `AiService`/proposal path remains internal plumbing only.

The `v0.3.0` proposal path adds no IPC channel and no path promoting a proposal to canonical state. (The separate, read-only `v0.3.1` analysis capability below does add one read-only IPC channel; it likewise never mutates canonical state.)

## Project Context & Repository Analysis (Phase 3 — v0.3.1)

A deterministic, local-first, **read-only** capability that analyzes what evidence exists in a project and builds a targeted context package. It generates no Project Truth, invokes no model, creates no proposal, and mutates no canonical state.

- **Pure analyzers (`packages/vault-core`, no fs/SQLite):** `classifyEvidence` maps a discovered file list to a stably-ordered, categorized `ProjectEvidenceInventory` (technical-fact categories only: manifest, config, schema_migration, test, documentation, project_truth, source, todo_marker, other; `todo_marker` is filename-based, not a content scan). `detectProjectTruthReadiness` classifies the `.orbit/` stack as `complete`/`partial`/`missing`/`duplicated`/`potentially_stale`, where staleness is a labeled deterministic heuristic (e.g. a present-but-empty required doc), never semantic judgment. `selectContextEvidence` deterministically picks a bounded, prioritized subset of paths. `buildProjectContextPackage` assembles an `AiContextPackage` (the `v0.3.0` contract, reused verbatim) whose every item is source-traceable via `sourceRef`. `classifyEvidence`/`detectProjectTruthReadiness` carry no clock and are byte-identical for identical input (invariant 7); packaging takes an injected clock like `createAiContextPackage`. Bounds are shared via `PROJECT_CONTEXT_LIMITS`; results are stamped with `PROJECT_CONTEXT_RULE_VERSION`.
- **Filesystem discovery (`packages/vault-storage`):** `SqliteVaultRepository.analyzeProjectContext(projectId)` walks `projects/<id>/` read-only, reusing the reconciler's `IGNORED_DIRECTORIES`/`IGNORED_FILES`, `safeLinkedKind` symlink safety, and the shared `MAX_VISITED_ENTRIES` (25,000) cap — but degrades to `truncated: true` instead of throwing. It reads only the selected files' content, path-safely (`safeResolve`) and bounded, then composes the pure analyzers. It performs no writes.
- **Service + IPC:** `VaultService.context.analyze(projectId)` validates the id (`assertIdentifier`) and delegates. `vault:context:analyze` is registered read-only (no `mutates` flag, no `vault:changed`) and exposed as `window.vault.context.analyze`. The renderer `ProjectContextView` is a read-only inspection panel (readiness verdict, evidence inventory by category, context-package items) with no edit/approve/generate controls.

This preserves the existing invariants: filesystem/SQLite access stays in main/storage, the renderer stays fs-free, analysis is project-isolated, and no path promotes anything to canonical state.

## Project Truth Bootstrap (Phase 3 — v0.3.2)

Drafts **missing** Project Truth from repository evidence as **evidence-backed, non-canonical, ephemeral** proposals. It reuses the `v0.3.1` context analysis and the `v0.3.0` proposal pipeline, generates one proposal per planner-selected document, and writes nothing: no proposal store, no canonical file, no write path.

- **Pure planner (`packages/vault-core`, no clock/fs/model):** `planProjectTruthBootstrap(analysis)` is the **sole authority over bootstrap scope**. From the read-only `ProjectContextAnalysis` readiness it produces one `BootstrapTarget` per required `.orbit/` doc (`REQUIRED_TRUTH_DOCS`): `missing` → `create` (with that doc's `purpose`/`instructions`), present → `keep_existing` (no generation). Byte-deterministic; stamped with `PROJECT_TRUTH_BOOTSTRAP_RULE_VERSION`.
- **Pure mapper (`packages/vault-core`):** `mapBootstrapDrafts({ plan, proposalsByDoc, inventory })` iterates `plan.targets` (never the provider's response). Each `create` target's proposal is looked up by the target's **document identity** (`Map<targetDoc, AiProposal[]>` key) — never response order. It enforces decision 3: a cited `ref` becomes `verifiedEvidence` only if it resolves to a path in the supplied inventory; unresolvable refs and inferred content are moved to `ownerInputNeeded`. Proposals keyed to a non-planner doc are discarded; duplicates collapse; `drafts.length === plan.targets.length`.
- **Orchestrator (`packages/vault-core`, repository-free):** `ProjectTruthBootstrapService` holds an `AiService` and **no repository**. `bootstrap(analysis)` issues **one `AiService.propose` call per create-target** (owner decision D1 — no merged call, no positional pairing), stores each call's proposals under the target's identity, aborts on the first typed provider error (nothing mutates), then maps and assembles an ephemeral `ProjectTruthBootstrapResult`.
- **Service + IPC:** `VaultService` gains an **optional** AI dependency (`new VaultService(repository, { ai })`; `new VaultService(repository)` still works AI-disconnected). `projectTruth.bootstrap(projectId)` validates the id, returns `AI_NOT_CONFIGURED` when no AI is wired, runs the read-only `analyzeProjectContext` (a throw there is caught into a typed `AI_VALIDATION_ERROR`), and delegates. The channel `vault:project-truth:bootstrap` is registered **non-mutating** via a direct `ipcMain.handle` async return (it returns a `Promise<AiResult>`; the sync `handle()` helper is only for synchronous ops) — no `mutates`, no `vault:changed`. Composition flows through a single `buildVault` helper at every Vault-activation site (default backend `StubAiProvider`; provider-neutral). The renderer `ProjectTruthBootstrapView` is **read-only and explicitly user-triggered** (a "Generate Project Truth drafts" button; no auto-run on mount), showing readiness, per-draft target/state/disposition, cited technical facts, and owner-input gaps — no approve/edit/save/merge/replace controls.

This preserves every invariant: the AI layer still holds no repository (`VaultService` passes only context), nothing becomes canonical, drafts are ephemeral (no store), and the channel is non-mutating. Bootstrap only drafts *missing* Project Truth (structural gap-fill); staleness/change/maintenance over an existing stack is deferred to `v0.3.5`.

## Testing

Node's built-in runner: `node --experimental-strip-types --test tests/*.test.ts`. Suites: `phase1-storage`, `phase2-knowledge`, `phase2-integrity`, `graph-v2`, `backup`, `phase3-ai-foundation`, `phase3-project-context`, `phase3-project-truth-bootstrap` — **116 tests** (49 at v0.2.0 + 21 for BL-03 backup/restore + 15 for the v0.3.0 AI layer + 15 for the v0.3.1 project-context analysis + 16 for the v0.3.2 Project Truth Bootstrap). Static UI/IPC contract check: `node scripts/phase2-lifecycle-ui-regression.mjs` (also asserts the read-only `vault:context:analyze` contract and the non-mutating async `vault:project-truth:bootstrap` contract, including a guard that this async channel must not use the synchronous `handle()` helper). Scripts run via `corepack pnpm <script>` (no global pnpm required). Type + build gates: `pnpm typecheck`, `pnpm build`. UI interaction is verified manually (the Electron window is not auto-driven).

## Architectural invariants

1. Vault owns all persistent state.
2. The renderer never touches Node/SQLite/filesystem directly.
3. Models return proposals, never silent mutations; every model-generated object carries provenance.
4. Confidence is metadata, not truth.
5. Project context is isolated by default.
6. Atlas/Graph is a derived projection, never a second database.
7. Deterministic checks are pure and reproducible; identical Vault state yields byte-identical integrity reports.
8. Integrations use the stable Vault API, not direct database access.
