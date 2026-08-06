# Task 4: Deterministic merge preview and transactional execution

Worktree: `C:\Users\Bando\Documents\VAULT\.worktrees\phase-2-4-slice-1`

## Context

Contracts, migration 6, Evidence links, aggregate history, and single-object lifecycle are complete through commit `706b311`. This task adds merge planning and execution only. Do not add IPC or renderer UI.

## Files

- Modify `packages/vault-core/src/index.ts`.
- Modify `packages/vault-storage/src/index.ts`.
- Modify `tests/phase2-knowledge.test.ts`.

## Interfaces

Add repository and service methods:

```ts
previewKnowledgeMerge(input: MergeKnowledgeInput): MergeKnowledgePreview;
mergeKnowledgeObjects(input: MergeKnowledgeInput): MergeKnowledgeResult;
```

Expose as `service.knowledge.previewMerge(input)` and `service.knowledge.merge(input)`. Validate all IDs with `assertIdentifier`; normalize optional reason using the existing 500-character reason helper.

## Shared deterministic planner

Preview and execution must use one internal `buildMergePlan(input)` implementation.

Structural validation throws `VaultDomainError`: invalid IDs, missing target/source, empty sources, duplicate source IDs, target included as a source, or cross-project IDs.

Lifecycle conflicts appear in `blockingErrors` in deterministic source-ID order: target/source not `draft` or `approved`. Preview returns them; execution refuses any plan containing them.

Sort source objects by ID regardless of caller order. Sort Evidence links and relationships by `createdAt`, then ID. The preview must be byte-stable for source IDs supplied in different orders.

## Relationship planning

For every relationship touching any source Knowledge Object:

1. Replace each source Knowledge endpoint with the canonical target ID.
2. Preserve project, relationship type, author, and `createdAt`.
3. If rewritten source and target endpoints become identical, plan `self_link_removed` with no retained ID.
4. Group the remaining full uniqueness tuple `(projectId, sourceType, sourceId, targetType, targetId, relationshipType)` across rewritten relationships and existing target relationships.
5. For an exact duplicate group, retain oldest `createdAt`; break ties by lowest relationship ID. Plan `duplicate_collapsed` for every removed relationship and include the retained ID.
6. Unique redirected relationships retain their original relationship IDs and metadata; execution updates endpoints in place.

Conflict arrays and redirected relationships must be deterministically sorted by relationship ID.

## Evidence planning

- Preview every source Evidence link that will transfer.
- Execution changes only each link's current `knowledge_object_id` to target.
- Preserve `link_id`, `evidence_source_id`, `original_knowledge_object_id`, `operation_id`, and `created_at`.
- Never recreate or update canonical Evidence Source rows.
- If an identical `(target, evidence_source_id)` link already exists, deterministically retain the oldest link then lowest link ID and remove only the duplicate link. Both before states remain preserved in aggregate history.

## Merge execution

Execute all work inside one existing repository `BEGIN IMMEDIATE` transaction:

1. Rebuild and revalidate the plan inside the transaction; never execute a stale preview.
2. Generate one shared nonblank operation ID.
3. Capture full before aggregates for target and every source.
4. Transfer/collapse Evidence links according to plan.
5. update unique redirected relationship endpoints in place; delete self-links and duplicate relationships according to plan.
6. Mark all sources `superseded`, set `superseded_by_id=target.id`, and update timestamps.
7. Leave target ID, title, body, type, confidence, folder, status, author, and creation time unchanged; update only `updated_at` normally.
8. Capture full after aggregates for target and every source.
9. Append one `merged` history row for target and each source with the same operation ID, user actor, normalized reason, and complete before/after aggregates.
10. Commit and return `MergeKnowledgeResult` counts/conflicts.

Any failure must roll back object states/timestamps, Evidence links, relationships, and history.

Normal active list/search/snapshot/Atlas visibility already excludes superseded sources and must remain correct after merge. Direct history retrieval must show source and target grouped by operation ID.

## Preview content

Return:

- exact target;
- ID-sorted sources;
- sorted source Evidence links to transfer;
- sorted relationships whose endpoints will redirect;
- all planned `self_link_removed` and `duplicate_collapsed` conflicts;
- deterministic `blockingErrors`.

Do not combine or suggest text edits.

## RED tests

Add real integration tests:

1. `merge preview is deterministic and reports transfers redirects and conflicts`
   - build target plus two sources;
   - attach multiple Evidence records;
   - create inbound/outbound relationships, a source-to-target relationship that becomes self-link, and redirects that collide with an existing target relationship;
   - use deliberately out-of-order creation times/IDs where possible;
   - compare preview from reversed source input order;
   - assert exact transfers, redirects, conflict resolution, retained IDs, and no text combination.
2. `merge preserves identity provenance metadata and grouped immutable history`
   - execute preview scenario;
   - assert target text/identity unchanged except timestamp;
   - assert Evidence/link IDs and original owner provenance preserved;
   - assert retained relationship metadata and deterministic duplicate winner;
   - assert sources supersededBy target and excluded from active visibility;
   - assert target and sources each have `merged` rows sharing one operation ID with before/after aggregate evidence of every rewrite;
   - close/reinitialize and assert identical canonical state/history.
3. `merge rejects invalid stale and cross-project plans`
   - empty/duplicate sources, target in sources, cross-project, archived/superseded target/source, and reason longer than 500;
   - preview lifecycle conflicts are blocking and execution refuses them.
4. `merge rolls back every record when a mid-merge write fails`
   - record exact pre-state of objects, links, relationships, and history;
   - open the same `vault.db` with `DatabaseSync` and create a temporary trigger that raises `ABORT` when a chosen source status updates to superseded;
   - invoke merge and assert failure;
   - drop trigger;
   - assert all post-state exactly equals pre-state, including target timestamp and history counts.

Use no mocks. If the existing `now()` makes timestamp tie setup difficult, test deterministic behavior through controlled SQL updates in the fixture rather than adding production clocks.

## TDD and verification

1. Write preview tests and establish RED.
2. Implement planner; make preview tests green.
3. Write execution and rollback tests; establish RED.
4. Implement transactional merge; make focused tests green.
5. Run `pnpm typecheck` and `pnpm test`.
6. Run `git diff --check`; self-review stale-preview protection, deterministic tie-breaks, metadata preservation, aggregate history, and rollback.
7. Commit scoped files with message `feat: add transactional deterministic knowledge merge`.

## Global constraints

- Never delete Knowledge or recreate Evidence Sources.
- Merge never combines text.
- Every merge is atomic and user-controlled.
- Stable target identity; sources remain inspectable as superseded.
- No IPC, UI, Atlas layout, or documentation changes.
- Preserve all 22 existing tests.

## Report

Write full report to sibling `task-4-report.md`: status, files, RED evidence for preview/execution/rollback, planner decisions, GREEN commands/output, commit hash, self-review, concerns. Return only status, commit hash, one-line tests, concerns.
