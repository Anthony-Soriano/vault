# Task 4 report: deterministic merge preview and transactional execution

## Status

Complete. Phase 2.4 Slice 1 Task 4 is implemented and committed as `d3e4f01` (`feat: add transactional deterministic knowledge merge`). The implementation is confined to the three scoped production/test files; this report is stored in the requested SDD report location.

## Files

- `packages/vault-core/src/index.ts`
  - Added repository contracts for merge preview and execution.
  - Exposed `service.knowledge.previewMerge(input)` and `service.knowledge.merge(input)`.
  - Validates project, target, and every source ID with `assertIdentifier`.
  - Normalizes and enforces the existing 500-character reason limit for both operations.
- `packages/vault-storage/src/index.ts`
  - Added one shared internal `buildMergePlan(input)` used by preview and execution.
  - Added deterministic relationship and Evidence-link planning.
  - Added transactional merge execution, grouped immutable history, and rollback behavior.
- `tests/phase2-knowledge.test.ts`
  - Added four real SQLite integration tests covering preview, execution/history/restart, invalid/stale plans, and trigger-forced rollback.

## TDD evidence

### Cycle 1: deterministic preview

RED command:

`node --experimental-strip-types --test --test-name-pattern="merge preview is deterministic" tests/phase2-knowledge.test.ts`

RED result: 0 passed, 1 failed. The test failed at the desired API boundary with `TypeError: service.knowledge.previewMerge is not a function`.

GREEN command:

`node --experimental-strip-types --test --test-name-pattern="merge preview is deterministic" tests/phase2-knowledge.test.ts`

GREEN result: 1 passed, 0 failed.

Phase 2 regression command after planner implementation:

`node --experimental-strip-types --test tests/phase2-knowledge.test.ts`

GREEN result at that checkpoint: 12 passed, 0 failed.

### Cycle 2: execution, validation, and rollback

RED command:

`node --experimental-strip-types --test --test-name-pattern="merge preserves|merge rejects|merge rolls back" tests/phase2-knowledge.test.ts`

RED result: 0 passed, 3 failed. Execution failed because `service.knowledge.merge` did not exist; the rollback assertion consequently failed before the forced trigger could be reached. This established RED for execution, stale/lifecycle refusal, and rollback behavior before production implementation.

GREEN command:

`node --experimental-strip-types --test --test-name-pattern="merge preserves|merge rejects|merge rolls back" tests/phase2-knowledge.test.ts`

GREEN result: 3 passed, 0 failed. The rollback test raises `ABORT` on the second ID-sorted source status update and confirms exact pre/post equality for Knowledge rows and timestamps, Evidence Sources and links, relationships, and history.

Phase 2 regression command after execution implementation:

`node --experimental-strip-types --test tests/phase2-knowledge.test.ts`

GREEN result: 15 passed, 0 failed.

### Review regression: preview excludes Evidence duplicates that will be deleted

Independent review identified that a losing duplicate source link was initially included in the public preview even though execution deleted it. The issue was verified against the requirement that preview list Evidence links that will transfer.

RED command:

`node --experimental-strip-types --test --test-name-pattern="merge preview is deterministic" tests/phase2-knowledge.test.ts`

RED result: 0 passed, 1 failed. Actual preview contained `evidence_link_zulu_001`; the expected transfer list excluded it because the equal-timestamp target link won by lower link ID.

GREEN result after deriving public preview links from shared `transfer` actions: 1 passed, 0 failed. The full Phase 2 file then passed 15/15. Follow-up independent review found no remaining Critical or Important issues.

## Planner decisions

- Structural validation happens before planning mutations: project existence, nonempty sources, unique sources, target exclusion, target/source existence, and same-project membership.
- Sources are sorted using an explicit ASCII-stable comparator before lookup, blocking-error construction, capture, mutation, and result assembly.
- Lifecycle conflicts are returned by preview rather than thrown; target is reported first, followed by source conflicts in source-ID order. Execution rebuilds the plan inside `BEGIN IMMEDIATE` and throws before writes if any blocking error exists.
- Every relationship touching a source is rewritten in the plan by replacing Knowledge source/target endpoints with the canonical target ID. Previewed redirects and conflicts are sorted by relationship ID.
- Rewritten self-links are deleted. Remaining rewritten relationships are grouped with existing target relationships by the complete uniqueness tuple. The winner is lowest `createdAt`, then lowest ID; losers are deleted before retained source relationships are updated, avoiding uniqueness violations.
- Retained redirected relationships are updated in place, preserving relationship ID, project, endpoint types, relationship type, author, and creation time.
- Source Evidence links are grouped with existing target links by Evidence Source ID. The oldest link wins, with lowest link ID as the tie-break. Losing duplicate links are deleted; a retained source link is updated only in `knowledge_object_id`. Canonical Evidence Source rows are never written.
- Public preview Evidence links are derived from the shared transfer actions, so preview and `transferredEvidenceCount` describe the same surviving source links.
- Execution captures target and all source aggregates before any write, performs all link/relationship/object changes in one existing repository transaction, captures complete after aggregates, and appends one `merged` row per object with a shared nonblank operation ID and normalized reason.
- Target identity/text/type/confidence/folder/status/author/creation time are preserved; only `updated_at` changes. Sources preserve their content/identity and become inspectable `superseded` rows pointing to the target.

## Final verification

- `pnpm run typecheck`
  - Exit 0.
  - Electron TypeScript no-emit check passed.
  - Renderer `tsc -b --pretty false` passed.
- `pnpm test`
  - Exit 0.
  - 26 tests, 26 passed, 0 failed.
  - Includes the original 22 tests plus the 4 merge integration tests.
- `git diff --check`
  - Exit 0.
  - No whitespace errors; Git emitted only existing LF-to-CRLF working-copy notices.
- Scoped staged-file audit before commit
  - Exactly `packages/vault-core/src/index.ts`, `packages/vault-storage/src/index.ts`, and `tests/phase2-knowledge.test.ts`.

## Self-review

- Stale preview protection: execution accepts input, not a preview, and invokes the same planner after `BEGIN IMMEDIATE`.
- Determinism: source IDs and public arrays have explicit stable ordering; relationship and Evidence tie-breaks use oldest creation time then lowest ID.
- Metadata preservation: Evidence link identity, original owner, operation ID, and creation time survive retained transfers; redirected relationship IDs and metadata survive in-place endpoint updates; Evidence Sources remain byte-identical.
- Aggregate history: before snapshots are captured before any changes, after snapshots after all changes, and target/sources share one operation ID with user actor and normalized reason. Restart checks prove canonical rows and parsed history remain identical.
- Rollback: trigger-forced failure on the second source update restores all object states/timestamps, Evidence links, relationships, and history exactly.
- Visibility: superseded sources disappear from default list, Knowledge search, global search, snapshot Knowledge Objects, and Atlas nodes, while explicit superseded listing and direct history remain available.
- Scope: no Knowledge deletion, text combination, IPC, renderer UI, Atlas layout, schema migration, or documentation changes were introduced.

## Commit

`d3e4f01 feat: add transactional deterministic knowledge merge`

## Concerns

No open product or correctness concerns. In the restricted Codex sandbox, full typecheck/test processes needed permission to follow pnpm junction targets; with that filesystem access both commands completed cleanly. The repository also reports LF-to-CRLF working-copy notices, but `git diff --check` reports no errors.
