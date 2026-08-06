This is the operational center. Do not implement work that is absent from this file (Rule 3, root `AGENTS.md`). Update it after completed work (Rule 9); run the full closeout when completing a phase (Rule 11).

**State: BETWEEN PHASES.** Phase 2 is complete and locked at tag `v0.2.0`. The pre-Phase-3 release-readiness item **BL-03 (Recovery & Backup) is complete** (owner manual acceptance passed 2026-08-06; automated gate green). There is **no active implementation scope**. Phase 3 (AI proposals) is still **not** planned and must not be started or planned without explicit owner approval.

## Current objective

None active. Awaiting an owner decision on the next item: either another P1 release-readiness item (BL-05 accessibility, BL-06 large-Vault stress, BL-08 installed-build regression) or the owner-approved Phase 3 (AI proposals) brainstorm → spec → plan. New ideas go to `.orbit/BACKLOG.md` (Rule 10).

## Approved scope

None. (Nothing is approved for implementation.)

## Active tasks

None.

## Just completed — BL-03 Recovery & Backup

Manual, integrity-checked snapshot & restore. Implemented and verified:
- Manual **Create snapshot** = `VACUUM INTO` single-file `vault.db` (no WAL sidecars) + verbatim `projects/` copy, staged then atomically renamed, under a defensive write barrier, with **before/after fingerprint abort** on external change.
- Persisted **location-independent Vault UUID** (`vault_meta`, migration 7); restored Vaults get a **new** UUID + lineage.
- **List / inspect / delete** + total disk usage; **no auto-deletion**.
- **Restore into a new, non-existent directory only**, via staging → `PRAGMA integrity_check`/`foreign_key_check` → atomic finalize; validates structure/checksums/schema before writing; **refuses on any integrity failure**; never touches the live Vault.
- `vault:backup:*` IPC + `window.vault.backup` + a **Backups** renderer panel.

Design: `docs/superpowers/specs/2026-08-06-bl-03-recovery-backup-design.md`. Execution plan: `docs/superpowers/plans/2026-08-06-bl-03-recovery-backup-execution.md`.

## Verification (Rule 11)

**Automated gate — all green** (re-run after the closeout documentation changes):
- `corepack pnpm typecheck` → electron 0, renderer 0
- `corepack pnpm test` → **70/70** (49 baseline + 21 BL-03 `tests/backup.test.ts`)
- `corepack pnpm build` → electron + renderer built
- `node scripts/phase2-lifecycle-ui-regression.mjs` → passed (now asserts the `vault:backup:*` contract)

**Manual acceptance — passed (owner, 2026-08-06):** created a snapshot; changed and deleted project data; restored into a newly selected Vault folder; opened the restored Vault; confirmed data returned to the snapshot state and loaded normally; the original live Vault was not replaced.

## Known limitations / observations

- **Deferred exclusions (unchanged, not in scope):** automatic/pre-operation snapshots (reserved for Phase 3 hooks), restore-in-place / replace-current-Vault, corrupted-snapshot salvage / "restore anyway", ZIP/portable export, retention automation, cloud/sync.
- Snapshot integrity is **corruption/accidental-modification detection, not cryptographic authenticity** (no signatures).
- The write barrier is **defensive**; accepted-write consistency rests on synchronous single-threaded capture of committed state, and the external-change fingerprint abort.
- **Non-blocking dev observation (not a product defect):** on first `corepack pnpm dev` launch, controls were briefly unresponsive; a full app relaunch resolved it and it did not reproduce during acceptance. Recorded as a possible dev hot-reload / stale-process artifact to watch, not a confirmed defect.
- Remaining P1 release gaps stay deferred: BL-05 accessibility, BL-06 large-Vault stress, BL-08 installed-build regression.

## Blockers

None. The next item requires an owner decision (see Current objective).

## Deferred ideas

Tracked in `.orbit/BACKLOG.md` (BL-01…BL-08 — BL-03 now **done**; plus Project Truth Engine PC-01…PC-05). Do not pull any into active work without owner approval and an entry in this file. The Project Truth bootstrap / context-efficiency capability (PC-01…PC-05) remains reserved for the future Phase 3 brainstorm/spec; not active scope.

## Last verified commit

BL-03 completed on `main`-track branch `docs/bl-03-recovery-backup-plan`. Final code/tooling commit before closeout: `fdc47e9` (corepack tooling fix). The standing gate was re-run green after the closeout documentation changes (docs-only since `fdc47e9`; no product code changed during closeout). Baseline: Phase 2 at tag `v0.2.0`.
