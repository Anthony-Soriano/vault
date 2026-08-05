# Phase 2.4 Slice 1 Immutable Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable Knowledge history, canonical Evidence links, explicit restore/supersede operations, and deterministic transactional merge with Inspector controls.

**Architecture:** SQLite migration 6 normalizes Evidence ownership into links, adds supersession metadata, and introduces append-only aggregate history. The storage repository performs lifecycle mutations and merge planning atomically; the core service validates input; typed IPC exposes the operations; the renderer presents history and confirmation-based merge/supersede workflows.

**Tech Stack:** TypeScript 5.9, Node.js 24 `node:sqlite`, Electron 39, React 19, Vite 8, Node test runner, pnpm 11.9.

## Global Constraints

- Knowledge history is append-only through normal application code.
- Knowledge Object IDs remain stable and no permanent Knowledge deletion API is added.
- Evidence Source IDs remain stable; only Knowledge-to-Evidence links move.
- Merge never combines title or body text.
- Every merge runs in one `BEGIN IMMEDIATE` SQLite transaction and uses one shared `operation_id`.
- Relationship redirection preserves type, author, and creation time, rejects self-links, and collapses exact duplicates deterministically.
- Superseded objects are excluded from active lists/search but remain inspectable through History.
- Renderer input may use actor type `user` only; `system` is internal and `ai` remains reserved.
- Do not change Atlas layout, camera, search-focus, or physics behavior.
- Commit steps require explicit user authorization. Without it, stop after each verification checkpoint and leave changes unstaged.

## File structure

- Modify `packages/vault-types/src/index.ts`: shared lifecycle, history, Evidence-link, merge-preview, and IPC contracts.
- Modify `packages/vault-core/src/index.ts`: repository interfaces and validated lifecycle service methods.
- Modify `packages/vault-storage/src/index.ts`: migration 6, history capture, Evidence links, supersede/restore, merge preview, and transactional merge.
- Modify `apps/vault-desktop/electron/main/main.ts`: lifecycle/history IPC handlers.
- Modify `apps/vault-desktop/electron/preload/preload.cts`: sandbox bridge methods.
- Modify `apps/vault-desktop/renderer/src/KnowledgeView.tsx`: History, Supersede, Merge preview, and confirmations.
- Modify `apps/vault-desktop/renderer/src/styles.css`: lifecycle panel and modal styling.
- Modify `tests/phase2-knowledge.test.ts`: migration, history, supersede, merge, rollback, and restart regressions.
- Create `scripts/phase2-lifecycle-ui-regression.mjs`: static UI contract check matching the repository's existing UI regression style.

---

### Task 1: Shared immutable-lifecycle contracts

**Files:**
- Modify: `packages/vault-types/src/index.ts`
- Test: `tests/phase2-knowledge.test.ts`

**Interfaces:**
- Produces: `KnowledgeEvidenceLink`, `KnowledgeAggregateSnapshot`, `KnowledgeHistoryRecord`, `SupersedeKnowledgeInput`, `MergeKnowledgeInput`, `MergeKnowledgePreview`, `MergeKnowledgeResult`.
- Defines the types later consumed by renderer methods `knowledge.restore`, `knowledge.supersede`, `knowledge.previewMerge`, `knowledge.merge`, and `knowledge.history`.

- [ ] **Step 1: Add a compile-time failing contract test**

Append type imports and a small runtime fixture that constructs the desired public shapes:

```ts
import type { MergeKnowledgeInput, KnowledgeHistoryRecord } from "@orbit/vault-types";

test("lifecycle contracts expose grouped immutable history", () => {
  const input: MergeKnowledgeInput = { projectId: "project_123", targetId: "target_123", sourceIds: ["source_123"], reason: "Duplicate" };
  const record = {} as KnowledgeHistoryRecord;
  assert.equal(input.sourceIds.length, 1);
  assert.equal(record.operationId, undefined);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm typecheck`

Expected: TypeScript reports that `MergeKnowledgeInput` and `KnowledgeHistoryRecord` are not exported.

- [ ] **Step 3: Add exact public types**

Add these contracts, using the existing camelCase public naming convention:

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

Add `supersededById: string | null` to `KnowledgeObject`. Remove `knowledgeObjectId` from canonical `EvidenceSource`; make `CreateEvidenceSourceInput` explicitly include `knowledgeObjectId`. Keep history and Evidence links query-only rather than adding them to `VaultSnapshot`; merge preview and history APIs return the required link data directly.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm typecheck`

Expected: PASS with the new lifecycle types exported. `VaultRendererApi` is extended atomically with its implementation in Task 5 so no throwing bridge stubs are introduced.

- [ ] **Step 5: Commit if authorized**

```powershell
git add -- packages/vault-types/src/index.ts tests/phase2-knowledge.test.ts
git commit -m "feat: define immutable knowledge lifecycle contracts"
```

### Task 2: Migration 6 and Evidence-link normalization

**Files:**
- Modify: `packages/vault-storage/src/index.ts`
- Test: `tests/phase2-knowledge.test.ts`

**Interfaces:**
- Consumes: Task 1 lifecycle and Evidence-link types.
- Produces: schema version 6, `listEvidenceLinks(knowledgeObjectId)`, and baseline history for pre-existing objects.

- [ ] **Step 1: Write a migration regression using a version-5 Vault**

Create a Vault with current APIs, attach evidence, close it, reopen after migration, then assert:

```ts
const document = service.documents.createMarkdown({ projectId: project.id, parentFolderId: null, title: "source" });
const evidenceBefore = service.evidence.attach({
  projectId: project.id, knowledgeObjectId: knowledge.id,
  sourceType: "document", sourceId: document.id,
  sourcePath: document.relativePath, excerpt: "Original evidence",
  locator: "Source", confidence: "verified",
});
service.close();
service.initialize();
const evidenceAfter = service.evidence.list(knowledge.id)[0];
assert.equal(evidenceAfter.id, evidenceBefore.id);
const history = service.knowledge.history(knowledge.id);
assert.equal(history[0].eventType, "baseline_migrated");
assert.equal(history[0].afterSnapshot?.evidenceLinks[0].originalKnowledgeObjectId, knowledge.id);
```

Also reopen a second time and assert exactly one baseline row and one Evidence link.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test --test-name-pattern="migration preserves canonical evidence" tests/phase2-knowledge.test.ts`

Expected: FAIL because lifecycle history and Evidence links do not exist.

- [ ] **Step 3: Implement migration 6**

Inside a single migration callback:

1. add `superseded_by_id` to `knowledge_objects`;
2. rename old `evidence_sources`;
3. create canonical `evidence_sources` without `knowledge_object_id`;
4. copy rows preserving IDs and metadata;
5. create `knowledge_evidence_links` and copy ownership with new link/operation IDs;
6. create `knowledge_object_history` plus indexes on object, operation, and creation time;
7. insert one `baseline_migrated` aggregate after-snapshot per existing Knowledge Object;
8. drop the old Evidence table only after successful copies.

Use `randomUUID()` for history/link/operation IDs and the existing `now()` timestamp. Serialize JSON with a single helper:

```ts
const serializeSnapshot = (snapshot: KnowledgeAggregateSnapshot | null) => snapshot === null ? null : JSON.stringify(snapshot);
```

- [ ] **Step 4: Adapt Evidence persistence**

`attachEvidence` inserts one canonical Evidence Source and one Evidence link in one transaction. `listEvidence` joins through `knowledge_evidence_links`; `listEvidenceLinks` returns link metadata. Update snapshot/Atlas evidence lookup to use links rather than direct ownership.

- [ ] **Step 5: Verify migration and baseline GREEN**

Run: `node --experimental-strip-types --test --test-name-pattern="migration preserves canonical evidence" tests/phase2-knowledge.test.ts`

Expected: PASS.

Run: `pnpm test`

Expected: existing 18 tests plus the new migration test pass.

- [ ] **Step 6: Commit if authorized**

```powershell
git add -- packages/vault-storage/src/index.ts tests/phase2-knowledge.test.ts
git commit -m "feat: normalize evidence links and add history schema"
```

### Task 3: Immutable history and explicit single-object lifecycle

**Files:**
- Modify: `packages/vault-core/src/index.ts`
- Modify: `packages/vault-storage/src/index.ts`
- Test: `tests/phase2-knowledge.test.ts`

**Interfaces:**
- Produces repository methods `restoreKnowledgeObject`, `supersedeKnowledgeObject`, and `listKnowledgeHistory`.
- Produces aggregate helper `captureKnowledgeAggregate(id): KnowledgeAggregateSnapshot`.

- [ ] **Step 1: Write failing lifecycle-history tests**

Cover create, edit, no-op edit, approve, archive, restore, and supersede. Assert event ordering, full snapshots, actor type, optional reason, and preserved Evidence/relationships. Key assertions:

```ts
assert.deepEqual(service.knowledge.history(item.id).map(row => row.eventType), ["superseded", "restored", "archived", "approved", "edited", "created"]);
assert.equal(service.knowledge.update(item.id, { title: item.title }).updatedAt, item.updatedAt);
assert.equal(service.knowledge.history(item.id).filter(row => row.eventType === "edited").length, 1);
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test --test-name-pattern="immutable lifecycle history" tests/phase2-knowledge.test.ts`

Expected: FAIL because history and explicit restore/supersede operations are absent.

- [ ] **Step 3: Implement aggregate capture and append-only history**

Add private helpers that load the full object, current Evidence links, and sorted incoming/outgoing relationships. Parse/serialize snapshots at the storage boundary. Never add update/delete history methods.

For every mutation:

```ts
const operationId = entityId();
const before = this.captureKnowledgeAggregate(id);
// perform validated mutation
const after = this.captureKnowledgeAggregate(id);
this.appendKnowledgeHistory({ knowledgeObjectId:id, operationId, eventType:"edited", beforeSnapshot:before, afterSnapshot:after, actorType:"user", actorId:null, reason:null });
```

Creation records `beforeSnapshot:null`. Skip edits when normalized fields equal current fields.

- [ ] **Step 4: Add explicit lifecycle validation**

- Approve: draft only and at least one Evidence link.
- Archive: draft or approved only.
- Restore: archived only, restoring to draft unless the history immediately before archive shows approved; preserve the previous active status in the archive history snapshot and restore to it.
- Supersede: source must be draft/approved; optional replacement must be active, distinct, and in the same project; Evidence and relationships remain attached to the source.

Expose validated methods through `VaultService.knowledge` using `assertIdentifier` and trimmed optional reasons capped at 500 characters.

- [ ] **Step 5: Verify GREEN and restart persistence**

Run the focused test, then `pnpm test` and `pnpm typecheck`.

Expected: all pass; history survives close/reinitialize; active list/search excludes superseded objects.

- [ ] **Step 6: Commit if authorized**

```powershell
git add -- packages/vault-core/src/index.ts packages/vault-storage/src/index.ts tests/phase2-knowledge.test.ts
git commit -m "feat: record immutable knowledge lifecycle history"
```

### Task 4: Deterministic merge preview and transactional execution

**Files:**
- Modify: `packages/vault-core/src/index.ts`
- Modify: `packages/vault-storage/src/index.ts`
- Test: `tests/phase2-knowledge.test.ts`

**Interfaces:**
- Produces repository/service methods `previewKnowledgeMerge(input)` and `mergeKnowledgeObjects(input)`.
- Preview and execution consume the same internal `buildMergePlan(input)` result.

- [ ] **Step 1: Write failing merge-plan tests**

Construct a target, two sources, canonical Evidence, incoming/outgoing links, a redirect that becomes a self-link, and redirects that become exact duplicates. Assert preview counts and deterministic conflict ordering.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test --test-name-pattern="merge preview" tests/phase2-knowledge.test.ts`

Expected: FAIL because preview does not exist.

- [ ] **Step 3: Implement pure deterministic merge planning**

Validate non-empty unique source IDs, distinct target, common project, and active statuses. Sort sources and relationships by ID before planning. For each relationship, replace any source Knowledge endpoint with the target ID. Classify rewritten source=target pairs as `self_link_removed`; classify identical endpoint/type tuples as `duplicate_collapsed`, retaining the oldest `createdAt`, then lowest ID.

- [ ] **Step 4: Verify preview GREEN**

Run the focused preview test.

Expected: PASS with byte-stable preview regardless of source input order.

- [ ] **Step 5: Write failing merge execution tests**

Assert target identity/text unchanged, Evidence IDs retained, original ownership retained, source status/supersededById, relationship metadata, shared operation ID, grouped before/after history, active filtering, and restart persistence.

- [ ] **Step 6: Add an atomic rollback test**

After fixture setup, open `vault.db` with `DatabaseSync` and install a temporary trigger that aborts when a source is marked superseded:

```ts
db.exec(`CREATE TRIGGER fail_merge BEFORE UPDATE OF status ON knowledge_objects
  WHEN NEW.id='${source.id}' AND NEW.status='superseded'
  BEGIN SELECT RAISE(ABORT, 'injected merge failure'); END;`);
```

Call merge, assert it throws, drop the trigger, then verify objects, Evidence links, relationships, and history exactly match their pre-merge snapshots.

- [ ] **Step 7: Implement merge in one repository transaction**

Rebuild the plan inside `transaction()`, capture all before aggregates, update Evidence links, rewrite/delete relationships per plan, supersede sources, touch target timestamp, capture after aggregates, append one `merged` row per affected object using the shared operation ID, and return counts/conflicts.

- [ ] **Step 8: Verify GREEN**

Run focused merge tests, then `pnpm test` and `pnpm typecheck`.

Expected: all tests pass, including injected rollback.

- [ ] **Step 9: Commit if authorized**

```powershell
git add -- packages/vault-core/src/index.ts packages/vault-storage/src/index.ts tests/phase2-knowledge.test.ts
git commit -m "feat: add transactional deterministic knowledge merge"
```

### Task 5: Typed IPC and preload lifecycle bridge

**Files:**
- Modify: `packages/vault-types/src/index.ts`
- Modify: `apps/vault-desktop/electron/main/main.ts`
- Modify: `apps/vault-desktop/electron/preload/preload.cts`
- Test: `scripts/phase2-lifecycle-ui-regression.mjs`

**Interfaces:**
- Consumes Task 1 `VaultRendererApi` and Task 3/4 service methods.
- Produces channels `vault:knowledge:restore`, `:supersede`, `:merge-preview`, `:merge`, and `:history`.

- [ ] **Step 1: Create a failing static IPC contract regression**

Read main/preload source and assert each exact channel appears once on both sides and mutation flags are enabled for restore, supersede, and merge but not preview/history.

- [ ] **Step 2: Verify RED**

Run: `node scripts/phase2-lifecycle-ui-regression.mjs`

Expected: FAIL listing missing lifecycle channels.

- [ ] **Step 3: Extend the renderer API contract**

Add the following exact methods to `VaultRendererApi.knowledge`:

```ts
restore(id: string, reason?: string | null): Promise<ApiResult<KnowledgeObject>>;
supersede(input: SupersedeKnowledgeInput): Promise<ApiResult<KnowledgeObject>>;
previewMerge(input: MergeKnowledgeInput): Promise<ApiResult<MergeKnowledgePreview>>;
merge(input: MergeKnowledgeInput): Promise<ApiResult<MergeKnowledgeResult>>;
history(knowledgeObjectId: string): Promise<ApiResult<KnowledgeHistoryRecord[]>>;
```

- [ ] **Step 4: Register handlers and bridge methods**

Use the existing `handle(channel, operation, mutates)` wrapper:

```ts
handle("vault:knowledge:restore", (id, reason) => vault.knowledge.restore(id, reason), true);
handle("vault:knowledge:supersede", input => vault.knowledge.supersede(input), true);
handle("vault:knowledge:merge-preview", input => vault.knowledge.previewMerge(input));
handle("vault:knowledge:merge", input => vault.knowledge.merge(input), true);
handle("vault:knowledge:history", id => vault.knowledge.history(id));
```

Mirror these exact methods in preload through `call(...)`.

- [ ] **Step 5: Verify GREEN**

Run static regression and `pnpm typecheck`.

Expected: both pass with no implicit-any errors.

- [ ] **Step 6: Commit if authorized**

```powershell
git add -- packages/vault-types/src/index.ts apps/vault-desktop/electron/main/main.ts apps/vault-desktop/electron/preload/preload.cts scripts/phase2-lifecycle-ui-regression.mjs
git commit -m "feat: expose knowledge lifecycle IPC"
```

### Task 6: Inspector History, Supersede, and Merge UI

**Files:**
- Modify: `apps/vault-desktop/renderer/src/KnowledgeView.tsx`
- Modify: `apps/vault-desktop/renderer/src/styles.css`
- Test: `scripts/phase2-lifecycle-ui-regression.mjs`

**Interfaces:**
- Consumes `window.vault.knowledge.history`, `.restore`, `.supersede`, `.previewMerge`, and `.merge`.
- Produces application-modal confirmation and preview flows.

- [ ] **Step 1: Extend the static UI regression to fail**

Assert the renderer contains visible labels `History`, `Restore`, `Supersede`, `Merge knowledge`, `Evidence transferred`, `Relationships redirected`, `Duplicate links collapsed`, and `Self-links removed`, plus calls to all five bridge methods.

- [ ] **Step 2: Verify RED**

Run: `node scripts/phase2-lifecycle-ui-regression.mjs`

Expected: FAIL with missing UI contracts.

- [ ] **Step 3: Add isolated UI state and loading**

Add `history`, `historyLoading`, `lifecyclePending`, and modal state. Load history whenever selected ID or updated timestamp changes. Keep superseded selections inspectable when navigated from a history entry even though they are absent from the normal list.

- [ ] **Step 4: Add explicit actions**

- Archived objects show Restore.
- Draft/approved objects show Supersede.
- Merge opens target/source selection, requiring at least one source distinct from target.
- Supersede and Merge never execute without the application modal's explicit confirmation button.

- [ ] **Step 5: Render merge preview**

Display target/source summaries, each Evidence transfer, each relationship redirect, conflicts grouped by resolution, and blocking errors. Disable confirmation when preview has blocking errors or while pending. On success refresh the snapshot, select the canonical target, close the modal, and reload history. On failure retain selections and use `onError`.

- [ ] **Step 6: Render immutable history**

Order newest-first, visually group identical operation IDs, show event, actor, reason, timestamp, and concise before/after summary. Do not render raw JSON by default; an expandable details region may show object status/title and transferred Evidence/relationship IDs.

- [ ] **Step 7: Add scoped styles**

Add `.knowledge-history`, `.history-operation`, `.lifecycle-modal`, `.merge-preview`, `.merge-conflicts`, and disabled/pending states. Reuse `.dialog-backdrop` and existing color variables. Keep the Inspector responsive at the existing 800px breakpoint.

- [ ] **Step 8: Verify GREEN**

Run: `node scripts/phase2-lifecycle-ui-regression.mjs`

Run: `pnpm typecheck`

Run: `pnpm build`

Expected: all pass.

- [ ] **Step 9: Commit if authorized**

```powershell
git add -- apps/vault-desktop/renderer/src/KnowledgeView.tsx apps/vault-desktop/renderer/src/styles.css scripts/phase2-lifecycle-ui-regression.mjs
git commit -m "feat: add knowledge lifecycle inspector workflows"
```

### Task 7: Full verification and documentation checkpoint

**Files:**
- Modify: `README.md`
- Modify: `ORBIT_VAULT_MASTER_HANDOFF.md`
- Modify: `docs/architecture.md`
- Test: all Slice 1 verification commands

**Interfaces:**
- Consumes all prior tasks.
- Produces an accurate Slice 1 implementation checkpoint without claiming Slice 2 integrity analysis is complete.

- [ ] **Step 1: Run fresh automated verification**

```powershell
pnpm typecheck
pnpm test
node scripts/phase2-lifecycle-ui-regression.mjs
pnpm build
```

Expected: every command exits 0; test count exceeds the previous 18-test baseline.

- [ ] **Step 2: Run development app and manual lifecycle smoke test**

Start `pnpm dev`, then verify in a disposable development Vault:

1. create and edit Knowledge;
2. attach Evidence and approve;
3. archive and restore;
4. supersede with a replacement;
5. preview and confirm a merge containing Evidence and relationships;
6. confirm source disappears from active list;
7. confirm source and grouped operation remain inspectable in History;
8. restart Electron and confirm state persists.

- [ ] **Step 3: Update status documentation**

Document Slice 1 as complete only if Step 1 and Step 2 pass. State explicitly that deterministic integrity findings and Integrity review UI remain Slice 2.

- [ ] **Step 4: Inspect the working tree**

Run: `git status --short` and `git diff --check`.

Confirm generated `dist`, runtime Vaults, and databases are untracked/ignored. Keep the pre-existing package setup fixes distinct in the final change summary.

- [ ] **Step 5: Commit if authorized**

```powershell
git add -- README.md ORBIT_VAULT_MASTER_HANDOFF.md docs/architecture.md
git commit -m "docs: record Phase 2.4 Slice 1 lifecycle checkpoint"
```
