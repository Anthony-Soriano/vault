# Task 2: Migration 6 and Evidence-link normalization

Worktree: `C:\Users\Bando\Documents\VAULT\.worktrees\phase-2-4-slice-1`

## Context

Task 1 added lifecycle contracts in commit `fe0c875`. Two fields are deliberately transitional and this task must finish the transition atomically:

- make `KnowledgeObject.supersededById` required as `string | null`;
- remove deprecated `EvidenceSource.knowledgeObjectId` from the canonical type;
- keep `CreateEvidenceSourceInput.knowledgeObjectId` required because attachment chooses the Knowledge target.

## Files

- Modify `packages/vault-types/src/index.ts`.
- Modify `packages/vault-core/src/index.ts` only for the repository Evidence-link listing interface needed by storage/tests; do not add lifecycle service UI methods yet.
- Modify `packages/vault-storage/src/index.ts`.
- Modify `tests/phase2-knowledge.test.ts`.

## Schema version 6

Within the existing per-migration `BEGIN IMMEDIATE` transaction:

1. Add nullable `superseded_by_id` to `knowledge_objects` and an index. It references a Knowledge Object logically; validation belongs to lifecycle code. Do not introduce cascade deletion.
2. Rebuild `evidence_sources` without `knowledge_object_id`, preserving every existing Evidence ID and all metadata.
3. Create `knowledge_evidence_links` with:
   - `link_id TEXT PRIMARY KEY`
   - `knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id)`
   - `evidence_source_id TEXT NOT NULL REFERENCES evidence_sources(id)`
   - `original_knowledge_object_id TEXT NOT NULL`
   - `operation_id TEXT NOT NULL`
   - `created_at TEXT NOT NULL`
   - `UNIQUE(knowledge_object_id, evidence_source_id)`
   - indexes for Knowledge ID and Evidence ID.
4. Copy each legacy ownership into exactly one link. Preserve the prior owner in both `knowledge_object_id` and `original_knowledge_object_id`. Use generated IDs and one deterministic migration operation ID per migrated object or per link, but never blank values.
5. Create append-only `knowledge_object_history` with:
   - `history_id TEXT PRIMARY KEY`
   - `knowledge_object_id TEXT NOT NULL`
   - `operation_id TEXT NOT NULL`
   - `event_type TEXT NOT NULL`
   - nullable `before_snapshot` and `after_snapshot`
   - `actor_type TEXT NOT NULL CHECK(actor_type IN ('user','system','ai'))`
   - nullable `actor_id` and `reason`
   - `created_at TEXT NOT NULL`
   - indexes for Knowledge ID, operation ID, and created time.
6. Insert exactly one `baseline_migrated` row for every pre-existing Knowledge Object. `before_snapshot` is null. `after_snapshot` is versioned JSON for the complete aggregate: full object, current Evidence links, sorted incoming relationships, and sorted outgoing relationships. Actor is `system`; reason clearly says immutable tracking began at migration and earlier edits cannot be reconstructed.
7. Drop the legacy Evidence table only after rows and links are copied successfully.
8. Migration must be repeatable: reopening writes no duplicate links or baseline rows.

The current migration runner only executes static SQL. Extend its internal migration representation minimally to support a custom migration callback while preserving versions 1–5 unchanged and ensuring version 6 runs inside the same transaction wrapper.

## Runtime Evidence behavior

- `attachEvidence` inserts the canonical Evidence Source and one link in one transaction using one shared operation ID.
- `listEvidence(knowledgeObjectId)` joins through `knowledge_evidence_links` and returns existing `EvidenceSource` shapes without ownership.
- Add repository method `listEvidenceLinks(knowledgeObjectId): KnowledgeEvidenceLink[]` for aggregate/history code.
- Update `snapshot()`, Atlas parent derivation, and any Evidence availability mapping to find ownership through links.
- Existing Evidence behavior and all 18 baseline tests must remain green.

## RED test

Add `test("migration preserves canonical evidence and creates one honest baseline", ...)`.

Create a genuine version-5 Vault database before initializing current code. Use `DatabaseSync` directly in the test to create `schema_migrations` versions 1–5 plus the relevant legacy `projects`, `knowledge_objects`, `evidence_sources`, and `relationships` rows. Use fixed valid IDs. Then initialize `VaultService`/`SqliteVaultRepository` against that directory.

After migration, inspect through public Evidence APIs and a read-only `DatabaseSync` query after closing the service. Assert:

- Evidence ID and all provenance fields are unchanged;
- `evidence_sources` no longer has `knowledge_object_id` via `PRAGMA table_info`;
- exactly one link exists with current and original owner equal to the legacy Knowledge ID;
- exactly one baseline row exists;
- event, actor, reason, and null before snapshot are correct;
- parsed after snapshot has `schemaVersion:1`, `supersededById:null`, the link, and sorted incoming/outgoing relationships;
- reopening current code creates no additional link or baseline row.

## TDD and verification

1. Write the migration test and run it to establish RED for missing migration 6.
2. Implement the minimal migration/runtime changes.
3. Run the focused migration test.
4. Run `pnpm typecheck` and `pnpm test`.
5. Run `git diff --check` and self-review migration order, rollback, IDs, and scope.
6. Commit only task files with message `feat: normalize evidence links and add history schema`.

## Global constraints

- No permanent Knowledge deletion or history mutation APIs.
- Evidence Source IDs and provenance must remain unchanged.
- History rows are append-only; do not add update/delete methods.
- No lifecycle operations, merge implementation, IPC, or UI in this task.
- Migration failure must roll back completely.

## Report

Write the full report to sibling `task-2-report.md`: status, files, RED evidence, migration design, GREEN commands/output, commit hash, self-review, and concerns. Return only status, commit hash, one-line test summary, and concerns.
