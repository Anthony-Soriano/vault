# Task 2 Report: Migration 6 and Evidence-link normalization

## Status

Completed and committed as `6859991` (`feat: normalize evidence links and add history schema`).

## Files

- `packages/vault-types/src/index.ts`
- `packages/vault-core/src/index.ts`
- `packages/vault-storage/src/index.ts`
- `tests/phase2-knowledge.test.ts`

## RED evidence

Added `migration preserves canonical evidence and creates one honest baseline` before implementation. The focused test initially failed because the existing runtime returned the legacy `knowledgeObjectId` on `EvidenceSource`; the expected canonical Evidence Source has no ownership field.

## Migration design

Migration 6 runs through the existing `BEGIN IMMEDIATE` transaction wrapper via a minimal custom migration callback. It adds `knowledge_objects.superseded_by_id`, rebuilds canonical `evidence_sources`, copies every legacy owner into `knowledge_evidence_links`, and creates append-only `knowledge_object_history`.

Each legacy Evidence Source retains its ID and provenance. Each copied link has a generated link ID plus deterministic nonblank `migration6-link-<evidence-id>` operation ID. Every existing Knowledge Object receives one `baseline_migrated` history row with a version-1 aggregate snapshot, sorted incoming/outgoing relationships, `system` actor, null before snapshot, and the immutable-tracking reason. Dropping the legacy table happens after copies; any error rolls back the enclosing transaction.

Runtime attachment writes the canonical Evidence Source and its link in one transaction with one shared operation ID. Listing, snapshot visibility, and Atlas document parenting resolve ownership through links.

## GREEN commands/output

- `node --experimental-strip-types --test --test-name-pattern "migration preserves canonical evidence" tests/phase2-knowledge.test.ts` — 1/1 passing.
- `pnpm typecheck` — passing.
- `pnpm test` — 19/19 passing.
- `git diff --check` — clean.

## Self-review

Confirmed v1–v5 SQL remains unchanged; v6 runs within the same transaction wrapper; link and baseline operation IDs are nonblank and deterministic; migration order copies Evidence and links before dropping the legacy table; reopening does not duplicate rows; and the commit contains only the four scoped implementation/test files.

## Concerns

None. Node reports its existing experimental SQLite warning during tests.

## Fix round 1: migration-test coverage

Replaced the synthetic v5 fixture with schema-equivalent v1–v5 DDL: actual foreign keys, CHECK constraints, UNIQUE constraints, and indexes are installed one migration version at a time. The fixture now includes a populated project, folder, and document; three deliberately out-of-order Knowledge Objects; three Evidence Sources across two owners; and six deliberately out-of-order inbound/outbound relationships.

The strengthened assertions verify complete canonical Evidence rows, three generated link rows with nonblank generated metadata, three complete baseline rows, full Knowledge Object snapshots for all three objects, link metadata in the target aggregate snapshot, and timestamp-sorted incoming/outgoing relationship IDs. Reopen checks confirm the three links and three baselines are not duplicated.

Exact verification commands and output:

- `node --experimental-strip-types --test --test-name-pattern "migration preserves canonical evidence" tests/phase2-knowledge.test.ts` — exit 0; `tests 1`, `pass 1`, `fail 0`.
- `pnpm typecheck` — exit 0; ran `tsc -p apps/vault-desktop/electron/tsconfig.json --noEmit` and `tsc -b --pretty false`.
- `pnpm test` — exit 0; `tests 19`, `pass 19`, `fail 0`.
- `git diff --check` — exit 0.
