This is the operational center. Do not implement work that is absent from this file (Rule 3, root `AGENTS.md`). Update it after completed work (Rule 9); run the full closeout when completing a phase (Rule 11).

**State: PHASE 3 ACTIVE — slice `v0.3.0` (AI Foundation) COMPLETE, locked at tag `v0.3.0`; between slices, awaiting owner approval to advance to `v0.3.1`.** Phase 2 is complete and locked at tag `v0.2.0`; the pre-Phase-3 release-readiness item **BL-03 (Recovery & Backup) is complete** (owner acceptance 2026-08-06). The owner approved Phase 3 planning on 2026-08-06 and its incremental delivery as `v0.3.0` → `v0.3.5` (see `.orbit/ROADMAP.md`, `.orbit/DECISIONS.md`). `v0.3.0` is delivered and verified. `v0.3.1`–`v0.3.5` remain planned and are **not** active scope; do not implement them until this file is updated with owner approval. `v0.3.1` is NOT activated.

## Current objective

None active. `v0.3.0` (AI Foundation) is complete. Awaiting an owner decision to approve advancement to `v0.3.1` (Project Context & Repository Analysis). No `v0.3.1` work is authorized yet.

## Approved scope

None currently open. (`v0.3.0` scope is delivered — see "Just completed" below. New ideas go to `.orbit/BACKLOG.md` — Rule 10.)

## Active tasks

None. All `v0.3.0` tasks are complete.

## Just completed — v0.3.0 AI Foundation

A provider-neutral, **proposal-only** AI layer — pure (no Node/SQLite/fs, no vendor SDK), dependency-injected, inline with the existing single-`index.ts`-per-package convention. It holds no repository reference, so it structurally cannot touch `vault.db`. Not wired to `VaultService`/IPC/renderer (no UI or IPC contract change).

- **`packages/vault-types`** — AI contracts: `AiProposalKind`, `AiProvenanceKind`, `AiEvidenceRef`, `AiProvenance`, `AiContextItemKind`, `AiContextItem`, `AiContextPackage`, `AiProposalStatus`, `AiProposal`, `AiProposalRequest`, `AiProposalResponse`, `AiProviderConfig`, `AiErrorCode`, `AiError`, `AiResult<T>`, `AiProviderRequest`, `AiRawProposal`, `AiProviderRawResponse`.
- **`packages/vault-core`** — `AI_FOUNDATION_VERSION`; `AiModelProvider` (provider-neutral backend interface); `AiProviderError` (transport vs provider failure); `StubAiProvider` (deterministic in-process provider for tests/gate, no vendor); `createAiContextPackage` (context builder); `AiService.propose()` (project-scoped boundary: validate → send context → provider → normalize → enforce trust invariants).
- **Trust invariants enforced in code:** every proposal is `status:"proposed"` (non-canonical); provenance required (cited evidence **or** an explicit `inferred` flag, else `AI_RESPONSE_INVALID`); `projectId` stamped from the request and foreign context rejected `AI_PROJECT_ISOLATION`; provider/transport/validation failures return typed errors and never throw or mutate.
- **`tests/phase3-ai-foundation.test.ts`** — 15 tests covering the happy path plus each trust invariant.
- **Deliberately NOT done** (later slices): no `VaultService`/IPC/renderer wiring; no repository discovery/analysis (`v0.3.1`); no Project Truth generation (`v0.3.2`); no review UI (`v0.3.3`); no live vendor provider.

## Verification (`v0.3.0`)

Full standing gate re-run green on 2026-08-06, on the **integrated** tree (v0.3.0 AI Foundation on top of the completed BL-03 work), via `corepack pnpm` (Windows):

- `corepack pnpm typecheck` — electron 0, renderer 0 (AI code typechecked via the electron main import graph).
- `corepack pnpm test` — **85/85** (49 baseline + 21 BL-03 `tests/backup.test.ts` + 15 new `tests/phase3-ai-foundation.test.ts`).
- `corepack pnpm build` — electron main + preload + renderer all build.
- `node scripts/phase2-lifecycle-ui-regression.mjs` — passed (no IPC/UI contract change; still asserts the `vault:backup:*` contract).

## Previously completed (prior context)

- **BL-03 Recovery & Backup** (pre-Phase-3 P1) — manual, integrity-checked snapshot & restore; `vault:backup:*` IPC + `window.vault.backup` + Backups panel; owner acceptance 2026-08-06. Full record in `.orbit/ARCHITECTURE.md` (Backup & recovery), `.orbit/DECISIONS.md` (BL-03 decisions), `.orbit/BACKLOG.md` (BL-03 done), and git history (PR #1).

## Risks

- **Scope creep** is the primary product risk in Phase 3. Keep future work to the single active slice; resist pulling `v0.3.1`+ capabilities (repository analysis, bootstrap, review UI) forward without approval.
- **Provider neutrality vs. concreteness:** the abstraction is exercised without a live vendor via the deterministic `StubAiProvider`; a real provider is a later, owner-approved decision.
- Remaining P1 release gaps stay deferred: BL-05 accessibility, BL-06 large-Vault stress, BL-08 installed-build regression.

## Blockers

- **Model-provider selection is intentionally deferred.** No vendor is chosen; `v0.3.0` stayed provider-neutral. A genuine decision that would materially constrain future providers or violate an existing invariant must be reported to the owner, not guessed.

## Deferred ideas

Tracked in `.orbit/BACKLOG.md` (BL-01…BL-08 — BL-03 now **done**; plus Project Truth Engine PC-01…PC-05). The Project Truth Engine items PC-01…PC-04 are now referenced by the Phase 3 roadmap slices (`v0.3.1`–`v0.3.5`); PC-05 (context-efficiency measurement) remains deferred unless an active slice specifically needs it. Do not pull any backlog item into active work without owner approval and an entry in this file.

## Last verified commit

`v0.3.0` — `main`, tagged `v0.3.0` (Phase 3 AI Foundation slice). Built on the completed BL-03 work (`fdc47e9` + PR #1 merge `3e79a72`); Phase 2 baseline at tag `v0.2.0`. The release commit bumps the manifest to `0.3.0` and adds the AI Foundation code (`packages/vault-types`, `packages/vault-core`, `tests/phase3-ai-foundation.test.ts`) plus the `.orbit/` + `README.md` Phase 3 doc updates. Full gate re-verified green on the integrated tree (see "Verification").
