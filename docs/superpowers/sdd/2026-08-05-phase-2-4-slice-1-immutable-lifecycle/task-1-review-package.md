# Task 1 review package
## Commits
```
fe0c875 feat: define immutable knowledge lifecycle contracts
```
## Stat
```
 packages/vault-types/src/index.ts | 41 ++++++++++++++++++++++++++++++++++++++-
 1 file changed, 40 insertions(+), 1 deletion(-)
```
## Diff
```diff
diff --git a/packages/vault-types/src/index.ts b/packages/vault-types/src/index.ts
index e279800..96d2aee 100644
--- a/packages/vault-types/src/index.ts
+++ b/packages/vault-types/src/index.ts
@@ -1,16 +1,18 @@
 export type EntityStatus = "active" | "archived" | "trashed";
 export type DocumentKind = "markdown" | "file";
 export type KnowledgeType = "fact" | "decision" | "goal" | "question" | "idea" | "preference";
 export type KnowledgeStatus = "draft" | "approved" | "superseded" | "archived";
 export type KnowledgeConfidence = "low" | "medium" | "high" | "verified";
 export type KnowledgeAuthor = "user" | "ai";
+export type KnowledgeActorType = "user" | "system" | "ai";
+export type KnowledgeHistoryEvent = "created" | "edited" | "approved" | "archived" | "restored" | "superseded" | "merged" | "baseline_migrated";
 export type EvidenceSourceType = "document" | "file" | "url" | "conversation" | "image" | "pdf" | "manual_note";
 export type RelationshipEndpointType = "project" | "folder" | "document" | "knowledge";
 export type RelationshipType = "supports" | "references" | "contradicts" | "answers" | "depends_on" | "blocks" | "implements" | "duplicates" | "derived_from" | "belongs_to";
 
 export interface Project {
   id: string;
   name: string;
   storagePath: string;
   description: string | null;
   icon: string | null;
@@ -48,27 +50,29 @@ export interface DocumentFile {
 export interface KnowledgeObject {
   id: string;
   projectId: string;
   parentFolderId: string | null;
   type: KnowledgeType;
   title: string;
   body: string;
   status: KnowledgeStatus;
   confidence: KnowledgeConfidence;
   author: KnowledgeAuthor;
+  supersededById?: string | null;
   createdAt: string;
   updatedAt: string;
 }
 
 export interface EvidenceSource {
   id: string;
   projectId: string;
+  /** @deprecated Migration 6 replaces ownership with KnowledgeEvidenceLink. */
   knowledgeObjectId: string;
   sourceType: EvidenceSourceType;
   sourceId: string | null;
   sourcePath: string | null;
   excerpt: string | null;
   locator: string | null;
   confidence: KnowledgeConfidence;
   availability: "available" | "missing";
   createdAt: string;
 }
@@ -78,31 +82,66 @@ export interface Relationship {
   projectId: string;
   sourceType: RelationshipEndpointType;
   sourceId: string;
   targetType: RelationshipEndpointType;
   targetId: string;
   relationshipType: RelationshipType;
   author: KnowledgeAuthor;
   createdAt: string;
 }
 
+export interface KnowledgeEvidenceLink {
+  id: string;
+  knowledgeObjectId: string;
+  evidenceSourceId: string;
+  originalKnowledgeObjectId: string;
+  operationId: string;
+  createdAt: string;
+}
+
+export interface KnowledgeAggregateSnapshot {
+  schemaVersion: 1;
+  object: KnowledgeObject;
+  evidenceLinks: KnowledgeEvidenceLink[];
+  incomingRelationships: Relationship[];
+  outgoingRelationships: Relationship[];
+}
+
+export interface KnowledgeHistoryRecord {
+  id: string;
+  knowledgeObjectId: string;
+  operationId: string;
+  eventType: KnowledgeHistoryEvent;
+  beforeSnapshot: KnowledgeAggregateSnapshot | null;
+  afterSnapshot: KnowledgeAggregateSnapshot | null;
+  actorType: KnowledgeActorType;
+  actorId: string | null;
+  reason: string | null;
+  createdAt: string;
+}
+
 export type CreateProjectInput = Pick<Project, "name"> & Partial<Pick<Project, "description" | "icon" | "color">>;
 export type UpdateProjectInput = Partial<Pick<Project, "name" | "description" | "icon" | "color">>;
 export type CreateFolderInput = { projectId: string; parentFolderId: string | null; name: string };
 export type CreateMarkdownInput = { projectId: string; parentFolderId: string | null; title: string; content?: string };
 export type ImportFilesInput = { projectId: string; parentFolderId: string | null; sourcePaths: string[] };
 export type CreateKnowledgeObjectInput = Pick<KnowledgeObject, "projectId" | "type" | "title" | "body" | "confidence"> & { parentFolderId?: string | null };
 export type UpdateKnowledgeObjectInput = Partial<Pick<KnowledgeObject, "parentFolderId" | "type" | "title" | "body" | "confidence">>;
 export type KnowledgeFilters = { projectId: string; status?: KnowledgeStatus; type?: KnowledgeType };
 export type KnowledgeSearchInput = { query: string; projectId?: string; status?: KnowledgeStatus; type?: KnowledgeType; limit?: number };
-export type CreateEvidenceSourceInput = Pick<EvidenceSource, "projectId" | "knowledgeObjectId" | "sourceType" | "sourceId" | "sourcePath" | "excerpt" | "locator" | "confidence">;
+export type CreateEvidenceSourceInput = Pick<EvidenceSource, "projectId" | "sourceType" | "sourceId" | "sourcePath" | "excerpt" | "locator" | "confidence"> & { knowledgeObjectId: string };
 export type CreateRelationshipInput = Pick<Relationship, "projectId" | "sourceType" | "sourceId" | "targetType" | "targetId" | "relationshipType">;
+export type SupersedeKnowledgeInput = { projectId: string; knowledgeObjectId: string; supersededById?: string | null; reason?: string | null };
+export type MergeKnowledgeInput = { projectId: string; targetId: string; sourceIds: string[]; reason?: string | null };
+export type MergeRelationshipConflict = { relationshipId: string; resolution: "self_link_removed" | "duplicate_collapsed"; retainedRelationshipId: string | null };
+export type MergeKnowledgePreview = { target: KnowledgeObject; sources: KnowledgeObject[]; evidenceLinks: KnowledgeEvidenceLink[]; redirectedRelationships: Relationship[]; conflicts: MergeRelationshipConflict[]; blockingErrors: string[] };
+export type MergeKnowledgeResult = { operationId: string; target: KnowledgeObject; supersededSources: KnowledgeObject[]; transferredEvidenceCount: number; redirectedRelationshipCount: number; conflicts: MergeRelationshipConflict[] };
 export type RelationshipFilters = { projectId: string; entityType?: RelationshipEndpointType; entityId?: string };
 export type ProjectFilters = { status?: EntityStatus };
 export type SearchInput = { query: string; projectId?: string; limit?: number };
 export type ReconciliationReport = { projectsAdded:number; projectsArchived:number; foldersAdded:number; documentsAdded:number; missingDocuments:number; ignoredEntries:number; scannedAt:string };
 export type SearchResult = {
   id: string;
   entityType: "project" | "folder" | "document" | "knowledge";
   projectId: string;
   projectName: string;
   title: string;
```
