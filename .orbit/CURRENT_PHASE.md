This is the operational center. Do not implement work that is absent from this file (Rule 3, root `AGENTS.md`). Update it after completed work (Rule 9); run the full closeout when completing a phase (Rule 11).

**State: PHASE 3 — BETWEEN SLICES. Slice `v0.3.2` (Project Truth Bootstrap) is COMPLETE and verified (gate green 116/116) on branch `feat/v0.3.2-project-truth-bootstrap`, pending owner merge to `main` + tag `v0.3.2`.** `v0.3.3` is **NOT activated** — no `v0.3.3` work is authorized until this file is updated with owner approval (Rule 3). `v0.3.0`/`v0.3.1` are complete and locked at tags `v0.3.0`/`v0.3.1`. `v0.3.4`/`v0.3.5` remain planned and inactive. Phase 2 is complete and locked at tag `v0.2.0`; BL-03 (Recovery & Backup) is complete (owner acceptance 2026-08-06).

## Current objective

None active. `v0.3.2` (Project Truth Bootstrap) is delivered and verified (see "Just completed" and "Verification"). Awaiting owner decisions: (a) merge `feat/v0.3.2-project-truth-bootstrap` into `main` and tag `v0.3.2`; (b) whether to activate `v0.3.3` (AI Proposal Review & Approval). No `v0.3.3` work is authorized.

## Just completed — v0.3.2 Project Truth Bootstrap

Drafts **missing** Project Truth from repository evidence as **evidence-backed, non-canonical, ephemeral, proposal-only** drafts, reusing the `v0.3.1` context analysis and the `v0.3.0` proposal pipeline. It writes nothing: no proposal store, no canonical file, no approve/edit/merge/replace execution.

- **`packages/vault-core`** — additive contracts consumed from `packages/vault-types` (`ProjectTruthDocState`, `ProjectTruthDisposition`, `ProjectTruthDraft`, `ProjectTruthBootstrapResult`); pure `planProjectTruthBootstrap` (sole scope authority: missing→`create`, present→`keep_existing`, deterministic) and pure `mapBootstrapDrafts` (iterates plan targets, identity-by-`targetDoc`, decision-3 citation validation, duplicates collapse, `drafts.length === plan.targets.length`); repository-free `ProjectTruthBootstrapService` (one `AiService.propose` call per create-target — decision D1; first-failure abort); `VaultService` optional AI dependency + `projectTruth.bootstrap` facade (validates id, `AI_NOT_CONFIGURED` when no AI, read-only `analyzeProjectContext` with a throw caught into a typed `AI_VALIDATION_ERROR`).
- **`packages/vault-types`** — the four additive contracts above + `projectTruth: { bootstrap }` on `VaultRendererApi`.
- **`apps/vault-desktop`** — non-mutating `vault:project-truth:bootstrap` IPC via a **direct `ipcMain.handle` async return** (the sync `handle()` helper is only for synchronous ops), composed through a single `buildVault` helper at every Vault-activation site (default `StubAiProvider`, provider-neutral); `window.vault.projectTruth.bootstrap` preload bridge; read-only, **explicitly user-triggered** `ProjectTruthBootstrapView` (no auto-run on mount; cited facts vs owner-input gaps; no approve/edit/save/merge/replace controls).
- **Tests** — `tests/phase3-project-truth-bootstrap.test.ts` (16): planner three-states/determinism/sole-authority, mapper decision-3/planner-authority/duplicate-collapse, service per-target-all-drafted/isolation/complete-stack/provider-failure/repository-free, VaultService AI_NOT_CONFIGURED/no-mutation/invalid-id, and facade hardening (analyzeProjectContext throw → typed error).
- **Final whole-branch review** (opus) confirmed all trust invariants hold and caught one **Critical** IPC bug (async channel through the synchronous `handle()` helper → `DataCloneError`); owner-approved fix applied (direct `ipcMain.handle` async return + facade hardening + regression recurrence guard + a hardening test) and re-verified.
- **Deliberately NOT done** (later slices / owner approval required): no proposal persistence/store, no review/approval UI or Create·Merge·Replace·Skip *execution*, no history/audit of proposals (`v0.3.3`); no Knowledge Proposal Engine (`v0.3.4`); no staleness/change/maintenance over an existing stack (`v0.3.5`); no live vendor provider; no canonical mutation.

## Verification (`v0.3.2`) — Rule 11

Full standing gate re-run **green on 2026-08-07** on the integrated branch `feat/v0.3.2-project-truth-bootstrap`, via `corepack pnpm` (Windows):

- `corepack pnpm typecheck` — electron 0, renderer 0.
- `corepack pnpm test` — **116/116** (100 prior + 16 new `tests/phase3-project-truth-bootstrap.test.ts`).
- `corepack pnpm build` — electron main + preload + renderer all build.
- `node scripts/phase2-lifecycle-ui-regression.mjs` — passed; now also asserts the non-mutating async `vault:project-truth:bootstrap` contract (present, direct `ipcMain.handle`, no `mutates`, preload + type + UI wiring, read-only user-triggered view) plus a guard that this async channel must not use the synchronous `handle()` helper.

Final code commit on the branch: `1cb4c9a` (fix) atop `a8bce05`→`704ea3b` (T1–T7), built on the `main` docs-activation checkpoint `bbb4130`.

---

_The sections below are the retained v0.3.2 record (decisions, scope, exclusions, acceptance, verification requirements) — all now satisfied by the completed slice. Kept verbatim for history; not active scope._

## Owner-approved decisions (2026-08-07) — binding for this slice (satisfied)

These decisions are locked (also recorded in `.orbit/DECISIONS.md`):

1. **Existing Project Truth boundary.** `v0.3.2` handles bootstrap and **structural gap-fill only**. For an existing/complete stack, existing documents remain authoritative by default. Deep semantic staleness detection, ongoing change detection, and maintenance/update proposals belong to **`v0.3.5`** — do **not** pull the maintenance engine into `v0.3.2`.
2. **Draft persistence.** Project Truth drafts are **ephemeral**. No proposal database/store, no canonical writes, no approve/edit/save/merge/replace execution. Persistence, review, approval, lifecycle, and audit belong to **`v0.3.3`**.
3. **Evidence validation.** A model citation is not trusted merely because it appears in the AI response. Evidence references used to support a **technical fact** must resolve to evidence actually present in the Project Context inventory/package supplied to the model. Unverifiable references must **never** be presented as an evidence-backed technical fact (they are downgraded to owner-input-needed / inferred).
4. **Existing-state disposition.** Existing authoritative Project Truth defaults to `keep_existing`. Do not generate replacement/change recommendations that would effectively introduce `v0.3.5` behavior.
5. **Planner authority over bootstrap scope (binding invariant).** The planner (`planProjectTruthBootstrap`) is the sole authority over which documents exist, which are targeted, their state, and the generation scope. The AI fills planner-selected slots only — it may **never** invent additional Project Truth documents nor silently skip a planner-selected target. Enforced structurally: draft mapping iterates the plan's targets (never the provider's proposals); unmatched proposals are discarded, unmatched targets still emit a `proposal: null` draft; `drafts.length === plan.targets.length` always.
6. **Per-target generation (owner decision D1, 2026-08-07 — approved architecture).** The bootstrap service issues **one `AiService.propose` call per planner-selected create-target**, using that target's `purpose`/`instructions`. Each call's proposals are attributed to that target by the target's own document identity — **proposal identity comes from the planner-selected target being processed, never from provider response order.** There is no single merged call and no positional proposal-to-document pairing. This prioritizes correctness, attribution, and trust over minimizing model calls. Future hardening (documented, not implemented in v0.3.2): model-call batching as an optimization that must not change these semantics (must never reintroduce positional pairing); and evolving `PROJECT_TRUTH_BOOTSTRAP_RULE_VERSION` into an explicit semantic/versioned identifier.

## Scope (v0.3.2) — approved design intent

Derived from `.orbit/ROADMAP.md` (v0.3.2), `.orbit/PRODUCT_SPEC.md` (Project Truth Bootstrap; PC-02), and the owner decisions above. In scope:

1. **Bootstrap orchestration.** Given a project boundary, run the existing read-only `v0.3.1` context analysis, decide which required `.orbit/` documents are missing/partial/present, and — for **each** planner-selected create-target — drive the `v0.3.0` `AiService` with that target's `purpose`/`instructions` in its own call (per-target generation, decision D1) to produce structured `project_truth` proposals attributed to that target.
2. **Three project states.** Handle **none** (draft all required docs), **partial** (draft only the missing docs; present docs untouched, `keep_existing`), and **existing/complete** (default `keep_existing`; no change/replacement recommendations — decision 1 & 4).
3. **Fact/intent separation.** Each draft separates **cited technical facts** (evidence resolvable against the supplied context inventory — decision 3) from **owner-intent gaps** (surfaced as explicit "needs owner input", never invented). Repository evidence supports technical facts only; owner intent is requested, not fabricated.
4. **Ephemeral, non-canonical output.** The result is returned to the caller for read-only inspection. **No proposal is persisted, no canonical file is written, and no write/approve path exists** (decision 2).
5. **AI wiring at the service boundary.** `AiService` is composed into `VaultService` (optional dependency) for the first time. The AI layer still holds **no repository** and never touches `vault.db`; `VaultService` reads (read-only `analyzeProjectContext`), builds context, and hands **only context** to `AiService`.
6. **Read-only inspection surface.** A read-only renderer view + a **non-mutating** `vault:*` IPC channel (no `mutates`, no `vault:changed`) that triggers bootstrap and displays drafts, provenance, cited evidence, and owner-input gaps. No approve/edit/save/merge/replace controls.
7. **Provider neutrality preserved.** Generation goes through the provider-neutral `AiModelProvider`; the `StubAiProvider` drives the verification gate; no vendor is baked in and no live-provider decision is made here.
8. **Tests + standing gate green** for every new boundary.

## Exclusions (out of scope — do NOT build in this slice)

- **No proposal persistence / proposal store / new DB table.** Drafts are ephemeral (decision 2).
- **No approve/edit/save/merge/replace execution, no review/approval UI, no history/audit of proposals** — that is `v0.3.3`.
- **No Knowledge Proposal Engine** (`v0.3.4`).
- **No Project Truth maintenance / staleness / change proposals over an evolving project** (`v0.3.5`) — including any replacement/change recommendation for an existing authoritative stack (decisions 1 & 4).
- **No canonical mutation** of knowledge, documents, or `.orbit/` files. No file-write IPC.
- **No live vendor provider** baked in; no provider decision.
- **No autonomous/background generation.** Bootstrap is explicit/triggered only.
- **No weakening of any `v0.3.0`/`v0.3.1` trust invariant.**

## Acceptance criteria (v0.3.2)

The slice is done when, verifiably:

1. `projectTruth.bootstrap(projectId)` returns a result whose every draft is an `AiProposal` with `status: "proposed"` — proven by test.
2. Every draft carries provenance: cited `evidence[]` **or** `inferred: true`; a proposal with neither is rejected `AI_RESPONSE_INVALID` — proven by test.
3. **No canonical-write path exists** in the slice: no repository write, no mutating IPC, no persisted proposal — proven by code inspection + the regression script.
4. The three states are handled — `missing` → draft all required docs (per-target generation gives **every** create-target its own proposal); `partial` → target only missing docs; `complete`/existing → `keep_existing` default with no change recommendations — proven by fixtures.
4b. Planner authority: proposals for a document the planner did not select produce no draft; `drafts.length === plan.targets.length`; duplicate/extra proposals for one target never create additional drafts; proposal identity comes from the target being processed, not response order — proven by test.
11b. The renderer view is **explicitly user-triggered** (no auto-run on mount) — reviewed + backstopped by the regression script.
5. Technical facts are separated from owner-intent, and every fact's citation **resolves to a path present in the supplied context inventory**; unresolvable citations are downgraded (never presented as evidence-backed) — proven by test (decision 3).
6. Project isolation holds: context from another project → `AI_PROJECT_ISOLATION`; each draft's `projectId` is stamped from the request — proven by test.
7. AI-failure and not-configured paths return typed errors (`AI_PROVIDER_ERROR`/`AI_TRANSPORT_ERROR`/`AI_NOT_CONFIGURED`) and mutate nothing — proven by test.
8. The new IPC channel carries no `mutates` flag, emits no `vault:changed`, and is asserted by `scripts/phase2-lifecycle-ui-regression.mjs`.
9. The bootstrap orchestrator and `AiService` hold no repository (structural, asserted by construction/inspection).
10. `v0.3.1` analyzers remain byte-deterministic; the bootstrap **planner** is a pure function tested without a provider.
11. The renderer view is read-only: no approve/edit/save/merge/replace controls present.
12. The full standing gate is green (see Verification requirements).

## Verification requirements (Rule 8 / Rule 11)

All must pass on the integrated tree, via `corepack pnpm` on Windows:

- `corepack pnpm typecheck` — electron 0, renderer 0.
- `corepack pnpm test` — existing 100 tests plus the new `v0.3.2` suite, all green (gate runs against the deterministic `StubAiProvider` + injected clock).
- `corepack pnpm build` — electron main + preload + renderer build.
- `node scripts/phase2-lifecycle-ui-regression.mjs` — passes; asserts the new non-mutating bootstrap channel (present, no `mutates`, preload + type + UI wiring).

Record exact commands, results (test counts), and the final commit hash in this file on completion (Rule 11 step 3).

## Risks

- **Scope creep into `v0.3.3` (persistence/approval) and `v0.3.5` (maintenance)** — the primary risk. Keep drafts ephemeral (no store), execute no owner action, and emit no change/replacement recommendations for an existing stack. The structural guards (no write path, ephemeral drafts, no audit engine) mean drift requires *new* code that review must catch.
- **AI layer gaining implied persistence via `VaultService` composition** — keep `AiService`/the bootstrap orchestrator repository-free; `VaultService` passes only context. Assert by construction.
- **Fabricated citations presented as facts** — validate every returned `evidence.ref` against the supplied inventory paths; downgrade unresolved refs to owner-input-needed/inferred (decision 3).
- **Fact/intent blurring in the UI** — render cited evidence distinctly from "needs owner input"; never show an inferred guess as a technical fact.
- **Non-determinism breaking the gate** — the gate runs against `StubAiProvider` with an injected clock; tests assert shape/invariants/mapping, never model prose.
- **Provider decision pressure** — ship against the provider-neutral interface + stub; a live provider is a later config/ops concern, not a contract change.
- **Large repositories** — reuse the capped, read-only `analyzeProjectContext`; do not solve BL-06 here.

## Active tasks

None. All `v0.3.2` implementation tasks (T1–T8 in the execution plan) are complete and verified; the final whole-branch review is clean after the owner-approved Critical-bug fix. Artifacts:

- **Design/spec:** [`docs/superpowers/specs/2026-08-07-v0.3.2-project-truth-bootstrap-design.md`](../docs/superpowers/specs/2026-08-07-v0.3.2-project-truth-bootstrap-design.md).
- **Execution plan:** [`docs/superpowers/plans/2026-08-07-v0.3.2-project-truth-bootstrap-execution.md`](../docs/superpowers/plans/2026-08-07-v0.3.2-project-truth-bootstrap-execution.md).

Owner's next decisions: merge `feat/v0.3.2-project-truth-bootstrap` → `main` and tag `v0.3.2`; then whether to activate `v0.3.3`. **Do not activate `v0.3.3` without explicit owner approval and an entry in this file (Rule 3).**

## Known limitations (design-time, to preserve)

- **No live model provider is selected.** The slice is verified against `StubAiProvider`; producing real drafts from a live model is a later config/ops step, not a contract change. Provider neutrality is preserved.
- **Drafts are ephemeral** — a generated draft not inspected before the result is discarded is simply regenerated on the next trigger. Persistence is `v0.3.3`.
- **Evidence validation is path-resolution against the supplied inventory**, not semantic verification that the cited content actually supports the claim (semantic judgment stays clearly AI-labeled and is not a deterministic guarantee).

## Blockers

- **Model-provider selection remains deferred.** `v0.3.2` does not require a live provider for its verification gate (it runs against `StubAiProvider`). No vendor decision is made here.

## Deferred ideas

Tracked in `.orbit/BACKLOG.md`. PC-02 (bootstrap) is consumed by this slice; PC-03 (change proposals) → `v0.3.5`; PC-05 (context-efficiency measurement) remains deferred. Do not pull any backlog item into active work without owner approval and an entry in this file.

## Previously completed (prior context)

- **`v0.3.1` — Project Context & Repository Analysis** (COMPLETE, tag `v0.3.1`): deterministic, local-first, read-only evidence discovery, Project Truth readiness detection, and transparent context packaging, plus a read-only Context view. `classifyEvidence`/`detectProjectTruthReadiness`/`selectContextEvidence`/`buildProjectContextPackage` in `vault-core`; `analyzeProjectContext` discovery in `vault-storage`; read-only `vault:context:analyze` IPC + `ProjectContextView`; 15 tests. Full record in `.orbit/ARCHITECTURE.md` (Project Context & Repository Analysis) and `.orbit/DECISIONS.md`.
- **`v0.3.0` — AI Foundation** (COMPLETE, tag `v0.3.0`): provider-neutral, proposal-only AI layer in `packages/vault-core` (`AiService`, `AiModelProvider`, `StubAiProvider`, `AiProviderError`, `createAiContextPackage`) with AI contracts in `packages/vault-types`; 15 trust-invariant tests; internal plumbing only (not wired to `VaultService`/IPC/renderer). Full record in `.orbit/ARCHITECTURE.md` (AI layer), `.orbit/DECISIONS.md` (Phase 3), `.orbit/ROADMAP.md` (v0.3.0).
- **BL-03 — Recovery & Backup** (pre-Phase-3 P1): manual, integrity-checked snapshot & restore; `vault:backup:*` IPC + Backups panel; owner acceptance 2026-08-06. Full record in `.orbit/ARCHITECTURE.md`, `.orbit/DECISIONS.md`, `.orbit/BACKLOG.md`, git history (PR #1).

## Last verified commit

`v0.3.2` — branch `feat/v0.3.2-project-truth-bootstrap`, final code commit `1cb4c9a` (Project Truth Bootstrap; T1–T7 `a8bce05`→`704ea3b` + final-review fix `1cb4c9a`), built on the `main` docs-activation checkpoint `bbb4130` (itself atop tag `v0.3.1`). Full standing gate green on the integrated branch: typecheck 0/0, **116/116** tests, build OK, regression OK. The slice is complete and verified but **not yet merged to `main` or tagged** — that is the owner's next action. `v0.3.3` is not activated.
