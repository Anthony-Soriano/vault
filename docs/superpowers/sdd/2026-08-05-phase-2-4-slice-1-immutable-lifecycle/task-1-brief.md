# Task 1: Shared immutable-lifecycle contracts

Worktree: `C:\Users\Bando\Documents\VAULT\.worktrees\phase-2-4-slice-1`

## Files

- Modify `packages/vault-types/src/index.ts`.
- Test `tests/phase2-knowledge.test.ts` only if a clean compile-time contract check can be added without weakening runtime tests.

## Requirements

Add and export these exact public contracts using existing camelCase conventions:

```ts
export type KnowledgeActorType = "user" | "system" | "ai";
export type KnowledgeHistoryEvent = "created" | "edited" | "approved" | "archived" | "restored" | "superseded" | "merged" | "baseline_migrated";

export interface KnowledgeEvidenceLink {
  id: string; knowledgeObjectId: string; evidenceSourceId: string;
  originalKnowledgeObjectId: string; operationId: string; createdAt: string;
}
export interface KnowledgeAggregateSnapshot {
  schemaVersion: 1; object: KnowledgeObject;
  evidenceLinks: KnowledgeEvidenceLink[];
  incomingRelationships: Relationship[];
  outgoingRelationships: Relationship[];
}
export interface KnowledgeHistoryRecord {
  id: string; knowledgeObjectId: string; operationId: string;
  eventType: KnowledgeHistoryEvent;
  beforeSnapshot: KnowledgeAggregateSnapshot | null;
  afterSnapshot: KnowledgeAggregateSnapshot | null;
  actorType: KnowledgeActorType; actorId: string | null;
  reason: string | null; createdAt: string;
}
export type SupersedeKnowledgeInput = { projectId: string; knowledgeObjectId: string; supersededById?: string | null; reason?: string | null };
export type MergeKnowledgeInput = { projectId: string; targetId: string; sourceIds: string[]; reason?: string | null };
export type MergeRelationshipConflict = { relationshipId: string; resolution: "self_link_removed" | "duplicate_collapsed"; retainedRelationshipId: string | null };
export type MergeKnowledgePreview = { target: KnowledgeObject; sources: KnowledgeObject[]; evidenceLinks: KnowledgeEvidenceLink[]; redirectedRelationships: Relationship[]; conflicts: MergeRelationshipConflict[]; blockingErrors: string[] };
export type MergeKnowledgeResult = { operationId: string; target: KnowledgeObject; supersededSources: KnowledgeObject[]; transferredEvidenceCount: number; redirectedRelationshipCount: number; conflicts: MergeRelationshipConflict[] };
```

Add `supersededById: string | null` to `KnowledgeObject`.

Remove `knowledgeObjectId` from canonical `EvidenceSource`. Redefine `CreateEvidenceSourceInput` so it explicitly includes `knowledgeObjectId` in addition to the canonical Evidence fields.

Do not add history or Evidence links to `VaultSnapshot`. They remain query-only in later tasks. Do not extend `VaultRendererApi` in this task; IPC types are added atomically in Task 5.

## TDD and verification

1. Establish the RED state with `pnpm typecheck` against missing contract imports or another honest compile-time check.
2. Implement only the contracts above.
3. Run `pnpm typecheck` and `pnpm test`.
4. Self-review the diff for scope and consistency.
5. Commit only the task files with message `feat: define immutable knowledge lifecycle contracts`.

## Global constraints

- Stable Knowledge IDs; no deletion API.
- Evidence Source IDs remain stable; only links will move later.
- No renderer API or runtime lifecycle implementation in this task.
- Preserve the existing 18-test baseline.

## Report

Write a full report to the sibling file `task-1-report.md` including status, files changed, RED evidence, GREEN commands/output summary, commit hash, self-review, and concerns. Return only status, commit hash, one-line test summary, and concerns.
