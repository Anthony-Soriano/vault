# Task 3: Immutable history and explicit single-object lifecycle

Worktree: `C:\Users\Bando\Documents\VAULT\.worktrees\phase-2-4-slice-1`

## Context

Task 2 completed migration 6 at `e19194a`. The database now has canonical Evidence links, required `supersededById`, and baseline history for migrated objects. This task implements history for new lifecycle activity and explicit restore/supersede operations. Do not implement merge, IPC, or UI yet.

## Files

- Modify `packages/vault-core/src/index.ts`.
- Modify `packages/vault-storage/src/index.ts`.
- Modify `tests/phase2-knowledge.test.ts`.

## Repository interfaces

Add exact methods:

```ts
restoreKnowledgeObject(id: string, reason: string | null): KnowledgeObject;
supersedeKnowledgeObject(input: SupersedeKnowledgeInput): KnowledgeObject;
listKnowledgeHistory(knowledgeObjectId: string): KnowledgeHistoryRecord[];
```

Keep existing create/update/status methods only where useful internally. Do not expose arbitrary status changes through the service.

## Aggregate history

Implement one storage helper `captureKnowledgeAggregate(id): KnowledgeAggregateSnapshot` using:

- full mapped Knowledge Object;
- current Evidence links sorted by `createdAt`, then ID;
- incoming relationships sorted by `createdAt`, then ID;
- outgoing relationships sorted by `createdAt`, then ID.

Implement one append helper that inserts into `knowledge_object_history`. There must be no update/delete history helper or public API. Parse history JSON at the storage boundary and return newest-first, using `created_at DESC, rowid DESC` so operations within the same millisecond remain stable.

Every event gets a unique nonblank operation ID. Actor is `user`, actor ID null. Trim optional reason and cap it at 500 characters in the core service.

## Events

- Create: `created`, null before snapshot, full after snapshot.
- Meaningful edit: `edited`, full before and after.
- Approve: `approved`, full before and after.
- Archive: `archived`, full before and after.
- Restore: `restored`, full before and after.
- Supersede: `superseded`, full before and after.

Do not add an event for a normalized no-op edit. No-op edit must not change `updatedAt`.

## Lifecycle validation

- Approve only a `draft` with at least one Evidence link.
- Archive only `draft` or `approved` objects.
- Restore only `archived` objects. Restore to the status in the archive event's before snapshot (`draft` or `approved`), not always draft. If no valid archive history exists, fail with a clear validation error rather than guessing.
- Supersede only `draft` or `approved` source objects.
- Optional replacement must exist, be distinct, be `draft` or `approved`, and belong to the same project.
- Supersede sets status to `superseded` and `supersededById` to the optional replacement or null.
- Supersede preserves Evidence links and all incoming/outgoing relationships in place.
- Each lifecycle operation executes in a repository transaction so object mutation and history insertion cannot diverge.

## Service API

Expose:

```ts
knowledge.restore(id: string, reason?: string | null): KnowledgeObject;
knowledge.supersede(input: SupersedeKnowledgeInput): KnowledgeObject;
knowledge.history(id: string): KnowledgeHistoryRecord[];
```

Continue existing `knowledge.approve` and `knowledge.archive`, but route them through history-aware storage behavior. Validate IDs with `assertIdentifier`. Add a focused helper for optional reasons: trim, convert blank to null, reject more than 500 characters.

## Visibility

- Normal Knowledge lists with no explicit status exclude `superseded` and `archived` objects.
- Explicit status filters may retrieve archived or superseded objects for internal/history workflows.
- Normal Knowledge search and global search exclude superseded and archived objects.
- `getKnowledgeObject` and `listKnowledgeHistory` can retrieve superseded objects directly.
- Snapshot/Atlas must continue excluding archived and superseded Knowledge.

## RED tests

Add focused tests covering:

1. `immutable lifecycle history records create edit approve archive restore and supersede`
   - create draft and assert `created` with null before/full after;
   - attach Evidence, edit once, repeat the identical edit, approve, archive, restore, then supersede with a same-project replacement;
   - assert exact newest-first events: `superseded`, `restored`, `archived`, `approved`, `edited`, `created`;
   - assert only one edit event and unchanged timestamp for no-op;
   - assert full snapshots, unique operation IDs, actor/reason fields;
   - assert restore returns prior approved status;
   - assert supersede preserves Evidence links and relationships;
   - assert normal list/search/snapshot exclude source while explicit superseded filter and direct history retrieve it.
2. `single-object lifecycle rejects invalid transitions and project crossings`
   - approve without Evidence;
   - approve an already approved object;
   - restore a non-archived object;
   - archive a superseded object;
   - supersede with self, archived replacement, or cross-project replacement;
   - reason over 500 characters.
3. Restart persistence: close/reinitialize and assert status, `supersededById`, and history remain identical.

Use real service/storage behavior and existing fixture helpers; no mocks.

## TDD and verification

1. Write tests and run focused patterns to establish RED for missing history/lifecycle methods.
2. Implement minimal storage and core behavior.
3. Run focused lifecycle tests.
4. Run `pnpm typecheck` and `pnpm test`.
5. Run `git diff --check`; self-review transitions, transaction boundaries, ordering, visibility, and no-op behavior.
6. Commit scoped files with message `feat: record immutable knowledge lifecycle history`.

## Global constraints

- History is append-only and Knowledge is never permanently deleted.
- Stable Knowledge/Evidence IDs and canonical Evidence links must remain intact.
- No merge, relationship redirection, IPC, renderer, or documentation work.
- Preserve all 19 existing tests.

## Report

Write full report to sibling `task-3-report.md`: status, files, RED evidence, exact lifecycle semantics, GREEN commands/output, commit hash, self-review, concerns. Return only status, commit hash, one-line test summary, concerns.
