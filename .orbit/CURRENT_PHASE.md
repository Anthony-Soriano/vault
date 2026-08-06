CURRENT_PHASE.md
Only Phase 3 once planning begins:

This is the operational center. Do not implement work that is absent from this file (Rule 3, root `AGENTS.md`). Update it after completed work (Rule 9, root `AGENTS.md`).

**State: BETWEEN PHASES.** Phase 2 is complete and locked at tag `v0.2.0`. Phase 3 planning has **not** begun, so there is no approved implementation scope. Until this file is populated with owner-approved Phase 3 content, no feature work should be started.

## Current objective

None active. Phase 2 (manual knowledge system) is complete. Awaiting owner-approved Phase 3 (AI proposals) planning: brainstorm → spec → plan before any implementation.

## Approved scope

None. (Nothing is approved for implementation. New ideas go to `.orbit/BACKLOG.md`, not here — Rule 10, root `AGENTS.md`.)

## Active tasks

None.

## Acceptance tests

Not applicable while no phase is active. The standing verification gate for any future work: `pnpm typecheck`, `pnpm test`, `pnpm build`, and `node scripts/phase2-lifecycle-ui-regression.mjs` — all green.

## Risks

- Release-readiness gaps remain deferred (P1 backlog): recovery/backup (BL-03), accessibility (BL-05), large-Vault stress testing (BL-06), installed-build regression (BL-08).
- Phase 3 introduces the first non-user writer of knowledge; scope creep here is the primary product risk. Keep AI to proposals only.

## Blockers

- Phase 3 is unplanned: needs owner-approved objective, scope, and a written plan.
- Model-provider decision pending (e.g., local Ollama model tier vs. hosted). No provider code exists yet.

## Deferred ideas

Tracked in `.orbit/BACKLOG.md` (BL-01 … BL-08). Do not pull them into active work without owner approval and an entry in this file.

## Last verified commit

`99ff365` — `main` (Phase 2 baseline, tag `v0.2.0` at `a1fd7b1`). Full suite re-verified green after the doc reorganization and the 0.2.0 version bump, on a clean `pnpm install --frozen-lockfile`: `pnpm typecheck`, 49/49 `pnpm test`, static UI regression, `pnpm build`. Only documentation and version metadata have changed since the baseline; no product code changed.
