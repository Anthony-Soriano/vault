This is the operational center. Do not implement work that is absent from this file (Rule 3, root `AGENTS.md`). Update it after completed work (Rule 9, root `AGENTS.md`).

**State: ACTIVE — BL-03 (Recovery & Backup), planning stage.** Phase 2 remains complete and locked at tag `v0.2.0`. Phase 3 (AI proposals) is still **not** planned. By owner approval (2026-08-06), backlog item **BL-03** has been promoted from `.orbit/BACKLOG.md` into the active phase as a standalone, pre-Phase-3 release-readiness item. Design is approved; the implementation plan is being written. **No implementation code may be written until the plan is complete and consistent with Project Truth.**

## Current objective

Deliver **manual point-in-time snapshot & restore** for a Vault: on-demand snapshots that capture the SQLite database and the managed project files as one consistent instant, are integrity-checked, and can be restored into a new Vault directory. Recovery, not automation.

Design of record: [`docs/superpowers/specs/2026-08-06-bl-03-recovery-backup-design.md`](../docs/superpowers/specs/2026-08-06-bl-03-recovery-backup-design.md).

## Approved scope

- Manual **Create snapshot** (no scheduled/automatic triggers).
- Snapshot = consistent `vault.db` (`VACUUM INTO`, no `-wal`/`-shm`) **+** verbatim copy of the managed `projects/` tree **+** `manifest.json` with SHA-256 checksums — all captured under one **exclusive Vault write barrier** spanning both the database capture and the file copy.
- **List / inspect / delete** snapshots; **total disk usage** readout. No auto-deletion (keep all until the user deletes).
- **Restore into a new, empty directory** only, with checksum + schema-version validation before any copy.
- New `vault:backup:*` IPC behind the existing `handle(...)` pattern; `window.vault.backup` in preload; a **Backups** renderer panel. Renderer never touches fs/SQLite.
- Tests per the design: round-trip **logical-state equivalence + managed-file hash equality** (not byte-identical DB), write-barrier consistency, integrity refusal, no half-snapshot, live-Vault safety, schema guard.

## Explicit exclusions (stay narrowly scoped)

- **Automatic pre-operation snapshots** (before merge/supersede/archive; later before AI proposals) — deferred to Phase 3 hook work.
- **Restore-in-place / replace-current-Vault** — deferred.
- **Corrupted-snapshot salvage / "restore anyway"** — restore refuses on any integrity failure; salvage is later work.
- **Zip / portable export**, **retention automation**, and any **cloud/sync**.
- No Phase 3, no other P1 backlog items (BL-05/06/08), no unrelated polish pulled into this phase.

## Active tasks

1. **Write the implementation plan** (writing-plans skill) → `docs/superpowers/plans/2026-08-06-bl-03-recovery-backup.md`. Must resolve the two flagged sub-decisions: `vaultId` sourcing and the exact write-barrier mechanism.
2. (Blocked on plan completion + owner sign-off) Implement test-first per the plan.

No implementation task is authorized to start until task 1 is complete and approved.

## Acceptance tests

Feature acceptance is defined in the design's *Acceptance criteria* and *Testing* sections. Standing verification gate for completion: `pnpm typecheck`, `pnpm test` (incl. new `tests/backup.test.ts`), `pnpm build`, and `node scripts/phase2-lifecycle-ui-regression.mjs` — all green.

## Risks

- **Cross-store consistency** is the core technical risk: the database and managed files are separate stores. Mitigated by the exclusive write barrier spanning both captures; must be proven by the write-barrier consistency test.
- **`VACUUM INTO` output is not byte-identical** to the source DB — acceptance is deliberately defined as logical + file-hash equivalence to avoid a false failure signal.
- Remaining P1 release gaps stay deferred (BL-05 accessibility, BL-06 large-Vault stress, BL-08 installed-build regression) and are **not** in this phase.
- Phase 3 remains the primary future product risk (first non-user writer); unchanged and out of scope here.

## Blockers

- Implementation is blocked until the BL-03 plan is written and owner-approved.
- Two sub-decisions to close in the plan: `vaultId` sourcing (derive vs. persist) and the write-barrier mechanism (mutation guard + watcher pause/resume).

## Deferred ideas

Tracked in `.orbit/BACKLOG.md` (BL-01…BL-08, of which BL-03 is now promoted here; plus Project Truth Engine PC-01…PC-05). Do not pull any into active work without owner approval and an entry in this file. The Project Truth bootstrap / context-efficiency capability (PC-01…PC-05) is still reserved for the future Phase 3 brainstorm/spec; it is not active scope and creates no tasks here.

## Last verified commit

`32c9026` — `main` (Phase 2 baseline, tag `v0.2.0`). Full suite last verified green at the `v0.2.0` baseline: `pnpm typecheck`, 49/49 `pnpm test`, static UI regression, `pnpm build`. BL-03 is planning-stage only; **no product code has changed** — this update is documentation (Project Truth) recording the approved active phase.
