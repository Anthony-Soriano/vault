# Task 1 report: Shared immutable-lifecycle contracts

## Status

DONE_WITH_CONCERNS

## Files changed

- `packages/vault-types/src/index.ts`

No test file was changed. The RED check used a temporary, uncommitted TypeScript import harness so the existing runtime test suite was not weakened or repurposed for type-only contracts.

## RED evidence

Created a temporary Electron TypeScript file that imported all ten new public lifecycle contracts, then ran `pnpm typecheck`.

The command failed with the expected missing-export diagnostics (`TS2305` / `TS2724`) for `KnowledgeActorType`, `KnowledgeHistoryEvent`, `KnowledgeEvidenceLink`, `KnowledgeAggregateSnapshot`, `KnowledgeHistoryRecord`, `SupersedeKnowledgeInput`, `MergeKnowledgeInput`, `MergeRelationshipConflict`, `MergeKnowledgePreview`, and `MergeKnowledgeResult`. The temporary harness was removed before implementation was committed.

## GREEN verification

- `pnpm typecheck` (elevated dependency read access): passed. Electron and renderer TypeScript checks both exited 0.
- `pnpm test` (elevated dependency read access): passed, 18 tests passed, 0 failed.

The unprivileged test command could not resolve the installed `d3-force` package through the worktree junction; the elevated rerun confirms this was sandbox filesystem access rather than a test failure.

## Commit

`fe0c875 feat: define immutable knowledge lifecycle contracts`

## Self-review

- Confirmed the commit contains only `packages/vault-types/src/index.ts`.
- Added the requested actor/history, evidence-link, aggregate-snapshot, supersede, merge-preview, merge-result, and conflict contracts.
- Kept `KnowledgeEvidenceLink` and history query-only: `VaultSnapshot` and `VaultRendererApi` were not changed.
- Kept `CreateEvidenceSourceInput.knowledgeObjectId` explicitly required.
- Ran `git diff --check` before committing; no whitespace errors.

## Concerns / approved transitional boundary

Two transitional compatibility fields were deliberately retained so this contract-only task remains typecheck-green without changing storage implementation:

- `KnowledgeObject.supersededById` is temporarily optional (`string | null | undefined`), rather than required.
- `EvidenceSource.knowledgeObjectId` remains required but carries a `@deprecated` comment identifying Migration 6 and `KnowledgeEvidenceLink` as its replacement.

Task 2 must atomically adapt migration/storage mapping and queries, then make `supersededById` required and remove the deprecated canonical evidence ownership field.
