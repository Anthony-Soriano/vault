This is the operational center. Do not implement work that is absent from this file (Rule 3, root `AGENTS.md`). Update it after completed work (Rule 9); run the full closeout when completing a phase (Rule 11).

**State: PHASE 3 ACTIVE — slice `v0.3.1` (Project Context & Repository Analysis) is COMPLETE and verified. Between slices: `v0.3.2` is NOT activated; awaiting owner approval to advance.** `v0.3.0` (AI Foundation) is complete and locked at tag `v0.3.0`; `v0.3.1` is complete and tagged `v0.3.1`. `v0.3.2`–`v0.3.5` remain **planned and inactive** — not approved implementation scope until this file is updated with owner approval. Phase 2 is complete and locked at tag `v0.2.0`; BL-03 (Recovery & Backup) is complete (owner acceptance 2026-08-06).

## Current objective

None active. `v0.3.1` (Project Context & Repository Analysis) is delivered and verified (see "Just completed"). Awaiting an owner decision to approve advancement to `v0.3.2` (Project Truth Bootstrap). No `v0.3.2` work is authorized.

## Just completed — v0.3.1 Project Context & Repository Analysis

A deterministic, local-first, **read-only** analysis capability. It discovers a project's evidence, detects Project Truth readiness, and builds a targeted, source-traceable context package — with no Project Truth generation, no model invocation, no proposals, and no canonical mutation. All `v0.3.0` trust invariants hold unchanged.

- **`packages/vault-types`** — additive contracts: `ProjectEvidenceCategory`, `RawEvidenceFile`, `ProjectEvidenceItem`, `ProjectEvidenceInventory`, `ProjectTruthReadinessState`, `ProjectTruthReadiness`, `ProjectContextAnalysis`; read-only `context.analyze` on `VaultRendererApi`. The `v0.3.0` `AiContextPackage`/`AiContextItem` contracts are reused verbatim.
- **`packages/vault-core`** — pure analyzers (no fs/SQLite): `classifyEvidence`, `detectProjectTruthReadiness`, `selectContextEvidence`, `buildProjectContextPackage`; `PROJECT_CONTEXT_RULE_VERSION`, `PROJECT_CONTEXT_LIMITS`; `VaultService.context.analyze` (validates the id, delegates). Classification/readiness are byte-deterministic (no clock); packaging takes an injected clock.
- **`packages/vault-storage`** — `SqliteVaultRepository.analyzeProjectContext(projectId)`: read-only walk of `projects/<id>/` reusing the reconciler `IGNORED_DIRECTORIES`/`IGNORED_FILES`, `safeLinkedKind`, and the shared `MAX_VISITED_ENTRIES` (25,000) cap (degrades to `truncated` instead of throwing); bounded, path-safe content reads; composes the pure analyzers. No writes.
- **`apps/vault-desktop`** — read-only `vault:context:analyze` IPC (no `mutates`) + `window.vault.context.analyze` + a minimal, read-only `ProjectContextView` (readiness verdict, evidence inventory by category, context-package items). No edit/approve/generate controls.
- **Tests** — `tests/phase3-project-context.test.ts` (15): classification, all readiness states, byte-identical determinism, targeted/bounded packaging, storage discovery, ignore/boundary/isolation, and no-mutation.
- **Settled implementation details (within approved scope):** `todo_marker` is filename-based (not a content scan); context packages are bounded by `PROJECT_CONTEXT_LIMITS` (≤40 items, ≤4000 chars/item) to stay targeted; discovery degrades gracefully at the cap.
- **Deliberately NOT done** (later slices / owner approval required): no Project Truth generation (`v0.3.2`); no proposal review UI (`v0.3.3`); no knowledge proposal engine (`v0.3.4`); no maintenance proposals (`v0.3.5`); no live model call; no canonical mutation.

## Verification (`v0.3.1`) — Rule 11

Full standing gate re-run **green on 2026-08-06** on the integrated tree, via `corepack pnpm` (Windows):

- `corepack pnpm typecheck` — electron 0, renderer 0.
- `corepack pnpm test` — **100/100** (85 prior + 15 new `tests/phase3-project-context.test.ts`).
- `corepack pnpm build` — electron main + preload + renderer all build.
- `node scripts/phase2-lifecycle-ui-regression.mjs` — passed; now also asserts the read-only `vault:context:analyze` contract (present, no `mutates`, preload + type + UI wiring).

## Design & approved scope (v0.3.1) — for the record

Derived from `.orbit/ROADMAP.md` (v0.3.1) and `.orbit/PRODUCT_SPEC.md` (Project Truth Bootstrap evidence boundaries; PC-01/PC-04). In scope:

1. **Repository evidence discovery.** Given a project boundary, produce a deterministic inventory of relevant files. Same input → identical output (stable, normalized ordering).
2. **Ignore rules & filesystem boundaries.** Discovery honors ignore semantics consistent with the existing reconciler (`.git`, `node_modules`, `dist`, caches, etc.), stays inside the project boundary, constrains symlink traversal, and respects a visited-entry cap (reuse the reconciler's 25,000-entry defensive cap semantics). It never reads outside the project.
3. **Structure & technical-evidence identification.** Classify discovered evidence into meaningful, **technical-fact** categories only (e.g., package/manifest files, config, schema/migrations, tests, docs, source layout, explicit TODO markers). No inference of owner intent (per the PRODUCT_SPEC evidence boundary rule).
4. **Project Truth readiness detection (PC-01).** From the inventory, deterministically classify the project's Project Truth stack as `complete` / `partial` / `missing` / `duplicated` / `potentially-stale`. Any staleness signal is a clearly-labeled deterministic heuristic, never a semantic claim presented as truth.
5. **Context package construction (PC-04 foundation).** Assemble a transparent, inspectable `AiContextPackage` from **targeted** evidence — never blindly the whole repository. Every context item is traceable to its source. This produces the package a later slice *could* send to a provider; `v0.3.1` itself does not send it to generate anything.
6. **Purity / boundary placement.** Logic that does not need the filesystem is a **pure analyzer in `packages/vault-core`** (byte-identical output for identical input — invariant 7). Filesystem-touching discovery lives behind the main/`packages/vault-storage`/`VaultService` boundary; the renderer never touches Node/SQLite/fs (invariant 2).
7. **Project isolation.** Analysis is project-scoped; no cross-project evidence leakage (invariant 5).
8. **Read-only inspection surface (owner-confirmed 2026-08-06).** Analysis/readiness/context-package results are exposed through a **read-only** `VaultService` method, a **read-only** `vault:*` IPC channel (no `mutates` flag), preload wiring, and a **minimal inspection view** so the packaged evidence, readiness state, and context package are actually observable by the user. No write path, no canonical promotion, no Truth-generation UI. `scripts/phase2-lifecycle-ui-regression.mjs` must assert the new read-only channel's contract.
9. **Tests + standing gate green** for every new boundary (see Verification).

## Exclusions (out of scope — do NOT build in this slice)

- **No Project Truth Bootstrap / draft generation** (`v0.3.2`): no drafting of PROJECT/PRODUCT_SPEC/ARCHITECTURE/etc. content, no none/partial/existing draft outcomes, no Create·Merge·Replace·Skip actions.
- **No AI proposal review/approval UI or flow** (`v0.3.3`).
- **No Knowledge Proposal Engine** (`v0.3.4`) and **no Project Truth maintenance / change proposals** (`v0.3.5`).
- **No live model invocation to generate content.** `v0.3.1` builds context packages; it does not send them to a provider to produce Project Truth or knowledge. No live vendor provider is introduced.
- **No promotion to canonical state**, no proposal objects persisted, no mutation of knowledge, documents, or Project Truth files.
- **No autonomous/background scanning.** Analysis is explicit/triggered, not a watcher-driven or scheduled crawl.
- **No new AI trust invariants weakened.** All `v0.3.0` invariants continue to hold unchanged.

## Acceptance criteria (v0.3.1)

The slice is done when, verifiably:

1. Given a project directory, discovery returns a **deterministic** inventory (identical input → identical, stably-ordered output), proven by test.
2. Discovery **respects ignore rules and the project boundary**: ignored paths are excluded, traversal does not escape the project, symlink/cap limits hold — proven by test with fixtures.
3. Discovered evidence is **classified into technical-fact categories**; no category asserts owner intent.
4. Readiness detection deterministically returns one of `complete`/`partial`/`missing`/`duplicated`/`potentially-stale` for representative fixtures, with staleness clearly marked heuristic.
5. A **targeted** `AiContextPackage` is assembled (reusing `v0.3.0` contracts), each item source-traceable, and it is **not** the whole repository dumped verbatim.
6. **No canonical promotion and no model generation** occurs anywhere in the slice (structurally, not just by convention) — verified by code inspection + tests.
7. Boundary invariants hold: pure core analyzers are byte-deterministic; fs access stays in main/storage; renderer stays free of Node/SQLite/fs; analysis is project-isolated.
8. If any IPC channel is added, it is **read-only** (no `mutates`) and asserted by the static UI/IPC regression script.
9. The full standing gate is green (see Verification), with new tests covering discovery determinism, ignore/boundary rules, readiness classification, and context packaging.

## Verification requirements (Rule 8 / Rule 11)

All must pass on the integrated tree, via `corepack pnpm` on Windows:

- `corepack pnpm typecheck` — electron 0, renderer 0.
- `corepack pnpm test` — existing 85 tests plus the new `v0.3.1` suite, all green.
- `corepack pnpm build` — electron main + preload + renderer build.
- `node scripts/phase2-lifecycle-ui-regression.mjs` — passes; asserts any newly added read-only `vault:*` channel.

Record exact commands, results (test counts), and the final commit hash in this file on completion (Rule 11 step 3).

## Risks

- **Scope creep into `v0.3.2` (bootstrap)** — the primary risk. Stop at analysis + packaging; producing any Project Truth *content* is out of scope.
- **Cross-platform determinism** — path ordering, case-sensitivity, and symlink handling can make output non-byte-identical across filesystems/OSes. Normalize aggressively so invariant 7 holds.
- **Boundary leakage** — filesystem access must stay in main/storage; the renderer must remain fs-free. Keep pure classification in `vault-core`.
- **Heuristic staleness mistaken for truth** — readiness/staleness is deterministic heuristic, not semantic judgment; it must be labeled as such and never presented as canonical.
- **Large repositories** — discovery must honor the visited-entry cap and not freeze (ties to deferred BL-06 large-Vault stress; do not solve BL-06 here, just stay within its cap).
- **Context selection quality** — "targeted, not whole-repo" is a correctness requirement; over-inclusion silently defeats the context-efficiency purpose.

## Active tasks

None. All `v0.3.1` tasks are complete (design doc, execution plan, and the 8 TDD implementation tasks). Documents: [design](../docs/superpowers/specs/2026-08-06-v0.3.1-project-context-repository-analysis-design.md), [execution plan](../docs/superpowers/plans/2026-08-06-v0.3.1-project-context-repository-analysis-execution.md).

## Known limitations (preserved, not dropped)

- **`todo_marker` detection is filename-based**, not a content scan — deliberate, to keep discovery targeted and cheap. Content-level TODO/FIXME extraction is a possible later enhancement, not in `v0.3.1`.
- **Staleness is a single deterministic heuristic** (present-but-empty required doc). Richer, still-deterministic staleness signals — and any *semantic* staleness — are later work (semantic belongs to AI-powered slices, never the deterministic layer).
- **Large-Vault performance is bounded, not stress-proven** — discovery honors the shared 25,000-entry cap (degrading to `truncated`) but is not load-tested; that remains deferred **BL-06**.

## Blockers

- **Model-provider selection remains deferred.** `v0.3.1` does not require a live provider (it builds context, it does not send it to generate content). Provider neutrality is preserved; no vendor decision is made here.

## Deferred ideas

Tracked in `.orbit/BACKLOG.md`. PC-01/PC-04 foundations are consumed by this slice; PC-02 (bootstrap) → `v0.3.2`, PC-03 (change proposals) → `v0.3.5`, PC-05 (context-efficiency measurement) remains deferred unless this slice specifically needs it. Do not pull any backlog item into active work without owner approval and an entry in this file.

## Previously completed (prior context)

- **`v0.3.0` — AI Foundation** (COMPLETE, tag `v0.3.0`): provider-neutral, proposal-only AI layer in `packages/vault-core` (`AiService`, `AiModelProvider`, `StubAiProvider`, `AiProviderError`, `createAiContextPackage`) with AI contracts in `packages/vault-types`; 15 trust-invariant tests; internal plumbing only (not wired to `VaultService`/IPC/renderer). Full record in `.orbit/ARCHITECTURE.md` (AI layer), `.orbit/DECISIONS.md` (Phase 3), `.orbit/ROADMAP.md` (v0.3.0).
- **BL-03 — Recovery & Backup** (pre-Phase-3 P1): manual, integrity-checked snapshot & restore; `vault:backup:*` IPC + Backups panel; owner acceptance 2026-08-06. Full record in `.orbit/ARCHITECTURE.md`, `.orbit/DECISIONS.md`, `.orbit/BACKLOG.md`, git history (PR #1).

## Last verified commit

`v0.3.1` — `main`, tagged `v0.3.1` (Phase 3 Project Context & Repository Analysis). Built on the `v0.3.0` baseline (tag `v0.3.0`, `36ee83a`) plus the docs activation checkpoint (`bff5c3e`). The release commit adds the `v0.3.1` analysis code (`packages/vault-types` contracts, `packages/vault-core` pure analyzers + service facade, `packages/vault-storage` discovery, `apps/vault-desktop` read-only IPC/preload/renderer), `tests/phase3-project-context.test.ts`, the regression-script assertions, and the `.orbit/` + `README.md` Project Truth updates. Full standing gate re-verified green on the integrated tree (see "Verification"): typecheck 0/0, **100/100** tests, build OK, regression OK.
