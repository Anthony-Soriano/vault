This is the operational center. Do not implement work that is absent from this file (Rule 3, root `AGENTS.md`). Update it after completed work (Rule 9); run the full closeout when completing a phase (Rule 11).

**State: PHASE 3 ACTIVE — slice `v0.3.1` (Project Context & Repository Analysis) is ACTIVE (owner-approved 2026-08-06).** `v0.3.0` (AI Foundation) is COMPLETE and locked at tag `v0.3.0`. `v0.3.2`–`v0.3.5` remain **planned and inactive** — they are not approved implementation scope and must not be implemented until this file is updated with owner approval. Phase 2 is complete and locked at tag `v0.2.0`; BL-03 (Recovery & Backup) is complete (owner acceptance 2026-08-06).

This slice is **analysis and context packaging only**. It must not drift into `v0.3.2` (Project Truth Bootstrap / draft generation) or `v0.3.3` (proposal review & approval). Nothing in this slice generates Project Truth, creates proposals, invokes a live model, or writes canonical state.

## Current objective

Give Vault a **deterministic, local-first** mechanism to (a) discover the relevant evidence that exists in a project, (b) classify that evidence and detect the readiness state of the project's Project Truth stack, and (c) assemble a transparent, inspectable **context package** (reusing the `v0.3.0` `AiContextPackage` contracts) from targeted evidence — without generating Project Truth, without calling a model to produce content, and without promoting anything to canonical state.

This delivers the roadmap foundations for **PC-01** (Project Truth readiness scan) and **PC-04** (context package for AI), scoped to internal capability + a read-only inspection boundary — mirroring the "internal plumbing" discipline of `v0.3.0`.

## Approved scope (v0.3.1)

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

Planned as small slices (Rule 7), test-first, gate green after each.

- ✅ **v0.3.1 design doc** — `docs/superpowers/specs/2026-08-06-v0.3.1-project-context-repository-analysis-design.md` (approved design; module placement, data shapes, acceptance→test mapping, grounded in the existing reconciler ignore-lists/cap and the `v0.3.0` `AiContextPackage` contract).
- ⬜ **Execution plan** — decompose the design into small TDD tasks under `docs/superpowers/plans/2026-08-06-v0.3.1-project-context-repository-analysis-execution.md`.
- ⬜ **Implementation (TDD, per boundary):** (1) types → (2) storage discovery + shared cap/ignore extraction → (3) `classifyEvidence` → (4) `detectProjectTruthReadiness` → (5) `buildProjectContextPackage` → (6) `VaultService.analyzeProjectContext` → (7) read-only `vault:context:analyze` IPC + preload + regression assertion → (8) minimal renderer inspection view.

UI-surface sub-decision **resolved (owner, 2026-08-06):** v0.3.1 ships a **read-only inspection surface** — a read-only `vault:*` IPC channel + minimal renderer inspection view over the analysis/readiness/context-package results (no Truth-generation UI, no write path). Recorded in `.orbit/DECISIONS.md`.

## Blockers

- **Model-provider selection remains deferred.** `v0.3.1` does not require a live provider (it builds context, it does not send it to generate content). Provider neutrality is preserved; no vendor decision is made here.

## Deferred ideas

Tracked in `.orbit/BACKLOG.md`. PC-01/PC-04 foundations are consumed by this slice; PC-02 (bootstrap) → `v0.3.2`, PC-03 (change proposals) → `v0.3.5`, PC-05 (context-efficiency measurement) remains deferred unless this slice specifically needs it. Do not pull any backlog item into active work without owner approval and an entry in this file.

## Previously completed (prior context)

- **`v0.3.0` — AI Foundation** (COMPLETE, tag `v0.3.0`): provider-neutral, proposal-only AI layer in `packages/vault-core` (`AiService`, `AiModelProvider`, `StubAiProvider`, `AiProviderError`, `createAiContextPackage`) with AI contracts in `packages/vault-types`; 15 trust-invariant tests; internal plumbing only (not wired to `VaultService`/IPC/renderer). Full record in `.orbit/ARCHITECTURE.md` (AI layer), `.orbit/DECISIONS.md` (Phase 3), `.orbit/ROADMAP.md` (v0.3.0).
- **BL-03 — Recovery & Backup** (pre-Phase-3 P1): manual, integrity-checked snapshot & restore; `vault:backup:*` IPC + Backups panel; owner acceptance 2026-08-06. Full record in `.orbit/ARCHITECTURE.md`, `.orbit/DECISIONS.md`, `.orbit/BACKLOG.md`, git history (PR #1).

## Last verified commit

Baseline for `v0.3.1`: `main` at `36ee83a` (release: v0.3.0 — Phase 3 AI Foundation), verified in sync with `origin/main`. The `v0.3.0` standing gate was green at that commit (85/85 tests). `v0.3.1` implementation builds on this baseline; this file records the activation of `v0.3.1` scope — no `v0.3.1` code has been written yet.
