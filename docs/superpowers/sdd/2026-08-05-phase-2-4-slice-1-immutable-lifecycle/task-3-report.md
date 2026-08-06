# Task 3 report: immutable history and single-object lifecycle

## Status

Implemented and verified. Commit: `706b3111b2cabbe4eeb1e549d4bbdf38208cd331` (`feat: record immutable knowledge lifecycle history`).

## Changed files

- `packages/vault-core/src/index.ts`
- `packages/vault-storage/src/index.ts`
- `tests/phase2-knowledge.test.ts`

## RED evidence

Added three real-service integration tests before production changes:

1. `immutable lifecycle history records create edit approve archive restore and supersede`
2. `single-object lifecycle rejects invalid transitions and project crossings`
3. `knowledge lifecycle history persists across restart`

The initial focused run failed as expected: `knowledge.history` and `knowledge.supersede` were absent, and approving an already-approved object did not reject. The sandboxed package-script invocation also could not read the worktree's `d3-force` dependency; a direct phase-2 test invocation established the requested lifecycle RED failures independently.

## Lifecycle semantics

- Create records `created` with a null before snapshot and a full aggregate after snapshot.
- Meaningful updates capture full before/after aggregate snapshots as `edited`; normalized no-op updates return unchanged and create neither event nor timestamp change.
- Approve requires a draft with at least one Evidence link and records `approved`.
- Archive permits only draft or approved objects and records `archived`.
- Restore permits only archived objects, finds the newest archive event using `(created_at DESC, rowid DESC)`, and restores the status from that archive event's before snapshot. Invalid/missing history produces a validation error.
- Supersede permits draft or approved sources, validates an optional distinct same-project draft/approved replacement, preserves Evidence links and relationships, and records `superseded` with `supersededById` (or null).
- Every mutation plus history append executes within one repository transaction. History uses append-only inserts, user/null actor data, distinct random operation IDs, and JSON parsing at the storage boundary.
- Optional restore/supersede reasons are trimmed, blank values become null, and values over 500 characters are rejected by the service.
- Default knowledge lists, knowledge search, global search, Snapshot, and Atlas exclude archived and superseded objects. Explicit status filters and direct history remain available.

## GREEN verification

```
node --experimental-strip-types --test --test-name-pattern="immutable lifecycle|single-object lifecycle|knowledge lifecycle history persists" tests/phase2-knowledge.test.ts
# 3 passed, 0 failed

pnpm typecheck
# exit 0

pnpm test
# 22 passed, 0 failed

git diff --check
# exit 0
```

The full typecheck/test commands required the approved outside-sandbox execution path because the sandbox could not open the worktree's installed package files; both completed successfully there.

## Self-review

Reviewed repository transaction boundaries, restore source-status recovery, replacement/project validation, newest-first history ordering, aggregate sort order, immutable append-only behavior, no-op update behavior, and all visibility paths. `git diff --check` returned clean before the scoped commit.

## Independent review and concerns

An independent review of commit `706b3111b2cabbe4eeb1e549d4bbdf38208cd331` found no defects in scope and confirmed the focused lifecycle tests pass. No concerns identified.
