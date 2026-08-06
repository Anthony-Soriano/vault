# Task 3 review package
## Commits
```
706b311 feat: record immutable knowledge lifecycle history
```
## Stat
```
 packages/vault-core/src/index.ts    | 11 ++++--
 packages/vault-storage/src/index.ts | 45 ++++++++++++++++++------
 tests/phase2-knowledge.test.ts      | 70 +++++++++++++++++++++++++++++++++++++
 3 files changed, 114 insertions(+), 12 deletions(-)
```
## Diff
```diff
diff --git a/packages/vault-core/src/index.ts b/packages/vault-core/src/index.ts
index ec0c546..93b2008 100644
--- a/packages/vault-core/src/index.ts
+++ b/packages/vault-core/src/index.ts
@@ -1,13 +1,13 @@
 import type {
   CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, ImportFilesInput,
-  EvidenceSource, Folder, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters,
+  EvidenceSource, Folder, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeHistoryRecord, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters, SupersedeKnowledgeInput,
   ReconciliationReport, Relationship, RelationshipFilters, SearchInput, SearchResult, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot,
 } from "@orbit/vault-types";
 
 export class VaultDomainError extends Error {
   readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE" | "INVALID_MOVE";
   readonly field?: string;
   constructor(code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE" | "INVALID_MOVE", message: string, field?: string) {
     super(message); this.code = code; this.field = field;
     this.name = "VaultDomainError";
   }
@@ -58,20 +58,23 @@ export interface DocumentRepository {
   updateMarkdownContent(id: string, content: string): DocumentFile;
   readMarkdownContent(id: string): string;
   setDocumentStatus(id: string, status: EntityStatus): DocumentFile;
 }
 export interface KnowledgeRepository {
   createKnowledgeObject(input: CreateKnowledgeObjectInput): KnowledgeObject;
   getKnowledgeObject(id: string): KnowledgeObject;
   listKnowledgeObjects(filters: KnowledgeFilters): KnowledgeObject[];
   updateKnowledgeObject(id: string, changes: UpdateKnowledgeObjectInput): KnowledgeObject;
   setKnowledgeStatus(id: string, status: KnowledgeStatus): KnowledgeObject;
+  restoreKnowledgeObject(id: string, reason: string | null): KnowledgeObject;
+  supersedeKnowledgeObject(input: SupersedeKnowledgeInput): KnowledgeObject;
+  listKnowledgeHistory(knowledgeObjectId: string): KnowledgeHistoryRecord[];
   searchKnowledge(input: KnowledgeSearchInput): KnowledgeObject[];
 }
 export interface EvidenceRepository {
   attachEvidence(input: CreateEvidenceSourceInput): EvidenceSource;
   listEvidence(knowledgeObjectId: string): EvidenceSource[];
   listEvidenceLinks(knowledgeObjectId: string): KnowledgeEvidenceLink[];
 }
 export interface RelationshipRepository {
   createRelationship(input: CreateRelationshipInput): Relationship;
   listRelationships(filters: RelationshipFilters): Relationship[];
@@ -120,22 +123,25 @@ export class VaultService {
     rename: (id: string, title: string) => this.repository.renameDocument(assertIdentifier(id), markdownTitle(title)),
     move: (id: string, parent: string | null) => this.repository.moveDocument(assertIdentifier(id), parent ? assertIdentifier(parent) : null),
     archive: (id: string) => this.repository.setDocumentStatus(assertIdentifier(id), "archived"),
     restore: (id: string) => this.repository.setDocumentStatus(assertIdentifier(id), "active"),
     trash: (id: string) => this.repository.setDocumentStatus(assertIdentifier(id), "trashed"),
   };
   knowledge = {
     list: (filters: KnowledgeFilters) => this.repository.listKnowledgeObjects({ ...filters, projectId: assertIdentifier(filters.projectId, "projectId") }),
     create: (input: CreateKnowledgeObjectInput) => this.repository.createKnowledgeObject({ ...input, projectId: assertIdentifier(input.projectId, "projectId"), parentFolderId: input.parentFolderId ? assertIdentifier(input.parentFolderId, "parentFolderId") : null, title: knowledgeText(input.title, "title", 160), body: knowledgeText(input.body, "body", 20000) }),
     update: (id: string, changes: UpdateKnowledgeObjectInput) => this.repository.updateKnowledgeObject(assertIdentifier(id), { ...changes, ...(changes.parentFolderId !== undefined ? { parentFolderId: changes.parentFolderId ? assertIdentifier(changes.parentFolderId,"parentFolderId") : null } : {}), ...(changes.title !== undefined ? { title: knowledgeText(changes.title, "title", 160) } : {}), ...(changes.body !== undefined ? { body: knowledgeText(changes.body, "body", 20000) } : {}) }),
-    approve: (id: string) => { const knowledgeId=assertIdentifier(id); if(this.repository.listEvidence(knowledgeId).length===0)throw new VaultDomainError("VALIDATION_ERROR","Attach at least one evidence source before approval.","evidence"); return this.repository.setKnowledgeStatus(knowledgeId, "approved"); },
+    approve: (id: string) => this.repository.setKnowledgeStatus(assertIdentifier(id), "approved"),
     archive: (id: string) => this.repository.setKnowledgeStatus(assertIdentifier(id), "archived"),
+    restore: (id: string, reason?: string | null) => this.repository.restoreKnowledgeObject(assertIdentifier(id), normalizeReason(reason)),
+    supersede: (input: SupersedeKnowledgeInput) => this.repository.supersedeKnowledgeObject({ ...input, projectId: assertIdentifier(input.projectId,"projectId"), knowledgeObjectId: assertIdentifier(input.knowledgeObjectId,"knowledgeObjectId"), ...(input.supersededById !== undefined ? { supersededById: input.supersededById ? assertIdentifier(input.supersededById,"supersededById") : null } : {}), reason: normalizeReason(input.reason) }),
+    history: (id: string) => this.repository.listKnowledgeHistory(assertIdentifier(id)),
     search: (input: KnowledgeSearchInput) => { const query=input.query.trim(); return query ? this.repository.searchKnowledge({ ...input, query, limit: clampLimit(input.limit) }) : []; },
   };
   evidence = {
     list: (knowledgeObjectId: string) => this.repository.listEvidence(assertIdentifier(knowledgeObjectId, "knowledgeObjectId")),
     attach: (input: CreateEvidenceSourceInput) => this.repository.attachEvidence({ ...input, projectId: assertIdentifier(input.projectId, "projectId"), knowledgeObjectId: assertIdentifier(input.knowledgeObjectId, "knowledgeObjectId"), sourceId: input.sourceId ? assertIdentifier(input.sourceId, "sourceId") : null, excerpt: input.excerpt?.trim() || null, locator: input.locator?.trim() || null, sourcePath: input.sourcePath?.trim() || null }),
   };
   relationships = {
     list: (filters: RelationshipFilters) => this.repository.listRelationships({ ...filters, projectId: assertIdentifier(filters.projectId,"projectId"), entityId: filters.entityId ? assertIdentifier(filters.entityId,"entityId") : undefined }),
     create: (input: CreateRelationshipInput) => this.repository.createRelationship({ ...input, projectId: assertIdentifier(input.projectId,"projectId"), sourceId: assertIdentifier(input.sourceId,"sourceId"), targetId: assertIdentifier(input.targetId,"targetId") }),
     remove: (id: string) => this.repository.removeRelationship(assertIdentifier(id)),
@@ -143,10 +149,11 @@ export class VaultService {
   filesystem = { reconcile: () => this.repository.reconcileFilesystem() };
   search(input: SearchInput) {
     const query = input.query.trim(); if (!query) return [];
     return this.repository.search({ ...input, query, limit: clampLimit(input.limit) });
   }
   development = { seed: () => this.repository.seedDevelopmentFixtures(), reset: () => this.repository.resetDevelopmentVault() };
 }
 
 const clampLimit = (limit?: number) => Math.min(100, Math.max(1, limit ?? 30));
 const knowledgeText = (value: string, field: string, maximum: number) => { const text=String(value).trim(); if (!text) throw new VaultDomainError("VALIDATION_ERROR", `Knowledge ${field} is required.`, field); if (text.length>maximum) throw new VaultDomainError("VALIDATION_ERROR", `Knowledge ${field} is too long.`, field); return text; };
+const normalizeReason = (value: string | null | undefined) => { const reason = value == null ? "" : String(value).trim(); if (reason.length > 500) throw new VaultDomainError("VALIDATION_ERROR", "Reason must be 500 characters or fewer.", "reason"); return reason || null; };
diff --git a/packages/vault-storage/src/index.ts b/packages/vault-storage/src/index.ts
index 2c3ceb3..763a8e1 100644
--- a/packages/vault-storage/src/index.ts
+++ b/packages/vault-storage/src/index.ts
@@ -1,15 +1,15 @@
 import { DatabaseSync } from "node:sqlite";
 import { randomUUID } from "node:crypto";
 import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
 import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
-import type { CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, EvidenceSource, Folder, ImportFilesInput, KnowledgeConfidence, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters, ReconciliationReport, Relationship, RelationshipEndpointType, RelationshipFilters, RelationshipType, SearchInput, SearchResult, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot } from "@orbit/vault-types";
+import type { CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, EvidenceSource, Folder, ImportFilesInput, KnowledgeAggregateSnapshot, KnowledgeConfidence, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeHistoryEvent, KnowledgeHistoryRecord, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters, ReconciliationReport, Relationship, RelationshipEndpointType, RelationshipFilters, RelationshipType, SearchInput, SearchResult, SupersedeKnowledgeInput, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot } from "@orbit/vault-types";
 import { VaultDomainError, type VaultRepository } from "@orbit/vault-core";
 
 type StorageOptions = { vaultRoot: string; developmentMode: boolean; developmentRoot: string };
 type DbRow = Record<string, string | null>;
 type Migration = { version: number; sql?: string; run?: (db: DatabaseSync) => void };
 
 const safeLinkedKind=(path:string,allowedRoot:string):"directory"|"file"|null=>{try{const resolved=realpathSync.native(path),within=relative(realpathSync.native(allowedRoot),resolved);if(within.startsWith(`..${sep}`)||within===".."||isAbsolute(within))return null;const stats=statSync(path);return stats.isDirectory()?"directory":stats.isFile()?"file":null;}catch{return null;}};
 
 const MIGRATIONS: Migration[] = [{
   version: 1,
@@ -299,36 +299,60 @@ export class SqliteVaultRepository implements VaultRepository {
     return this.getDocument(document.id);
   }
   updateMarkdownContent(id: string, content: string) { const document = this.getDocument(id); if (document.kind !== "markdown") throw new VaultDomainError("VALIDATION_ERROR", "Only Markdown documents can be edited."); atomicWrite(this.contentPath(document.projectId, document.relativePath), content); this.db.prepare("UPDATE documents SET updated_at=? WHERE id=?").run(now(), id); return this.getDocument(id); }
   readMarkdownContent(id: string) { const document = this.getDocument(id); const path = this.contentPath(document.projectId, document.relativePath); if (!existsSync(path)) throw notFound("Markdown file"); return readFileSync(path, "utf8"); }
   setDocumentStatus(id: string, status: EntityStatus) { this.getDocument(id); this.db.prepare("UPDATE documents SET status=?, updated_at=? WHERE id=?").run(status, now(), id); return this.getDocument(id); }
   private withAvailability(document:DocumentFile):DocumentFile{return{...document,availability:existsSync(this.contentPath(document.projectId,document.relativePath))?"available":"missing"};}
 
   createKnowledgeObject(input: CreateKnowledgeObjectInput) {
     this.getProject(input.projectId); assertOneOf(input.type, KNOWLEDGE_TYPES, "knowledge type"); assertOneOf(input.confidence, CONFIDENCE_LEVELS, "confidence");
     if(input.parentFolderId){const folder=this.getFolder(input.parentFolderId);if(folder.projectId!==input.projectId)throw invalidMove("Knowledge cannot be assigned to a folder in another project.");}
-    const id=entityId(), timestamp=now();
-    this.db.prepare("INSERT INTO knowledge_objects(id,project_id,type,title,body,status,confidence,author,created_at,updated_at,parent_folder_id) VALUES (?, ?, ?, ?, ?, 'draft', ?, 'user', ?, ?, ?)").run(id, input.projectId, input.type, input.title, input.body, input.confidence, timestamp, timestamp,input.parentFolderId??null);
-    return this.getKnowledgeObject(id);
+    return this.transaction(() => {
+      const id=entityId(), timestamp=now();
+      this.db.prepare("INSERT INTO knowledge_objects(id,project_id,type,title,body,status,confidence,author,created_at,updated_at,parent_folder_id) VALUES (?, ?, ?, ?, ?, 'draft', ?, 'user', ?, ?, ?)").run(id, input.projectId, input.type, input.title, input.body, input.confidence, timestamp, timestamp,input.parentFolderId??null);
+      const created=this.getKnowledgeObject(id); this.appendKnowledgeHistory(id,entityId(),"created",null,this.captureKnowledgeAggregate(id),null);
+      return created;
+    });
   }
   getKnowledgeObject(id: string) { const row=this.db.prepare("SELECT * FROM knowledge_objects WHERE id=?").get(id) as DbRow|undefined; if(!row)throw notFound("Knowledge Object"); return mapKnowledgeObject(row); }
   listKnowledgeObjects(filters: KnowledgeFilters) {
     this.getProject(filters.projectId);
-    return (this.db.prepare("SELECT * FROM knowledge_objects WHERE project_id=? ORDER BY updated_at DESC, title").all(filters.projectId) as DbRow[]).map(mapKnowledgeObject).filter(item=>(!filters.status||item.status===filters.status)&&(!filters.type||item.type===filters.type));
+    return (this.db.prepare("SELECT * FROM knowledge_objects WHERE project_id=? ORDER BY updated_at DESC, title").all(filters.projectId) as DbRow[]).map(mapKnowledgeObject).filter(item=>(filters.status?item.status===filters.status:(item.status!=="archived"&&item.status!=="superseded"))&&(!filters.type||item.type===filters.type));
   }
   updateKnowledgeObject(id: string, changes: UpdateKnowledgeObjectInput) {
     const item=this.getKnowledgeObject(id); if(changes.type)assertOneOf(changes.type,KNOWLEDGE_TYPES,"knowledge type"); if(changes.confidence)assertOneOf(changes.confidence,CONFIDENCE_LEVELS,"confidence");
     if(changes.parentFolderId){const folder=this.getFolder(changes.parentFolderId);if(folder.projectId!==item.projectId)throw invalidMove("Knowledge cannot be assigned to a folder in another project.");}
-    this.db.prepare("UPDATE knowledge_objects SET type=?, title=?, body=?, confidence=?, parent_folder_id=?, updated_at=? WHERE id=?").run(changes.type??item.type,changes.title??item.title,changes.body??item.body,changes.confidence??item.confidence,changes.parentFolderId===undefined?item.parentFolderId:changes.parentFolderId,now(),id);
-    return this.getKnowledgeObject(id);
+    const next={type:changes.type??item.type,title:changes.title??item.title,body:changes.body??item.body,confidence:changes.confidence??item.confidence,parentFolderId:changes.parentFolderId===undefined?item.parentFolderId:changes.parentFolderId};
+    if(next.type===item.type&&next.title===item.title&&next.body===item.body&&next.confidence===item.confidence&&next.parentFolderId===item.parentFolderId)return item;
+    return this.transaction(() => { const before=this.captureKnowledgeAggregate(id); this.db.prepare("UPDATE knowledge_objects SET type=?, title=?, body=?, confidence=?, parent_folder_id=?, updated_at=? WHERE id=?").run(next.type,next.title,next.body,next.confidence,next.parentFolderId,now(),id); this.appendKnowledgeHistory(id,entityId(),"edited",before,this.captureKnowledgeAggregate(id),null); return this.getKnowledgeObject(id); });
+  }
+  setKnowledgeStatus(id: string, status: KnowledgeStatus) {
+    assertOneOf(status,KNOWLEDGE_STATUSES,"knowledge status");
+    return this.transaction(() => { const item=this.getKnowledgeObject(id), before=this.captureKnowledgeAggregate(id); let event:KnowledgeHistoryEvent;
+      if(status==="approved"){if(item.status!=="draft")throw new VaultDomainError("VALIDATION_ERROR","Only draft knowledge can be approved.");if(this.listEvidenceLinks(id).length===0)throw new VaultDomainError("VALIDATION_ERROR","Attach at least one evidence source before approval.","evidence");event="approved";}
+      else if(status==="archived"){if(item.status!=="draft"&&item.status!=="approved")throw new VaultDomainError("VALIDATION_ERROR","Only draft or approved knowledge can be archived.");event="archived";}
+      else throw new VaultDomainError("VALIDATION_ERROR","Use the explicit lifecycle operation for this status.");
+      this.db.prepare("UPDATE knowledge_objects SET status=?, updated_at=? WHERE id=?").run(status,now(),id); this.appendKnowledgeHistory(id,entityId(),event,before,this.captureKnowledgeAggregate(id),null); return this.getKnowledgeObject(id);
+    });
+  }
+  restoreKnowledgeObject(id:string,reason:string|null) {
+    return this.transaction(() => { const item=this.getKnowledgeObject(id); if(item.status!=="archived")throw new VaultDomainError("VALIDATION_ERROR","Only archived knowledge can be restored."); const archive=this.db.prepare("SELECT * FROM knowledge_object_history WHERE knowledge_object_id=? AND event_type='archived' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(id) as DbRow|undefined; const previous=archive?mapKnowledgeHistory(archive).beforeSnapshot?.object.status:null; if(previous!=="draft"&&previous!=="approved")throw new VaultDomainError("VALIDATION_ERROR","Cannot restore knowledge without a valid archive history."); const before=this.captureKnowledgeAggregate(id); this.db.prepare("UPDATE knowledge_objects SET status=?, updated_at=? WHERE id=?").run(previous,now(),id); this.appendKnowledgeHistory(id,entityId(),"restored",before,this.captureKnowledgeAggregate(id),reason); return this.getKnowledgeObject(id); });
+  }
+  supersedeKnowledgeObject(input:SupersedeKnowledgeInput) {
+    return this.transaction(() => { const source=this.getKnowledgeObject(input.knowledgeObjectId); if(source.projectId!==input.projectId)throw new VaultDomainError("VALIDATION_ERROR","Knowledge must belong to the specified project.","knowledgeObjectId"); if(source.status!=="draft"&&source.status!=="approved")throw new VaultDomainError("VALIDATION_ERROR","Only draft or approved knowledge can be superseded."); const replacementId=input.supersededById??null;
+      if(replacementId){if(replacementId===source.id)throw new VaultDomainError("VALIDATION_ERROR","Knowledge cannot supersede itself.","supersededById");const replacement=this.getKnowledgeObject(replacementId);if(replacement.projectId!==source.projectId)throw new VaultDomainError("VALIDATION_ERROR","Replacement knowledge must belong to the same project.","supersededById");if(replacement.status!=="draft"&&replacement.status!=="approved")throw new VaultDomainError("VALIDATION_ERROR","Replacement knowledge must be draft or approved.","supersededById");}
+      const before=this.captureKnowledgeAggregate(source.id); this.db.prepare("UPDATE knowledge_objects SET status='superseded', superseded_by_id=?, updated_at=? WHERE id=?").run(replacementId,now(),source.id); this.appendKnowledgeHistory(source.id,entityId(),"superseded",before,this.captureKnowledgeAggregate(source.id),input.reason??null); return this.getKnowledgeObject(source.id);
+    });
   }
-  setKnowledgeStatus(id: string, status: KnowledgeStatus) { this.getKnowledgeObject(id); assertOneOf(status,KNOWLEDGE_STATUSES,"knowledge status"); this.db.prepare("UPDATE knowledge_objects SET status=?, updated_at=? WHERE id=?").run(status,now(),id); return this.getKnowledgeObject(id); }
+  listKnowledgeHistory(knowledgeObjectId:string) { this.getKnowledgeObject(knowledgeObjectId); return (this.db.prepare("SELECT * FROM knowledge_object_history WHERE knowledge_object_id=? ORDER BY created_at DESC, rowid DESC").all(knowledgeObjectId) as DbRow[]).map(mapKnowledgeHistory); }
+  private captureKnowledgeAggregate(id:string):KnowledgeAggregateSnapshot { return {schemaVersion:1,object:this.getKnowledgeObject(id),evidenceLinks:(this.db.prepare("SELECT * FROM knowledge_evidence_links WHERE knowledge_object_id=? ORDER BY created_at, link_id").all(id) as DbRow[]).map(mapKnowledgeEvidenceLink),incomingRelationships:(this.db.prepare("SELECT * FROM relationships WHERE target_type='knowledge' AND target_id=? ORDER BY created_at, id").all(id) as DbRow[]).map(mapRelationship),outgoingRelationships:(this.db.prepare("SELECT * FROM relationships WHERE source_type='knowledge' AND source_id=? ORDER BY created_at, id").all(id) as DbRow[]).map(mapRelationship)}; }
+  private appendKnowledgeHistory(knowledgeObjectId:string,operationId:string,eventType:KnowledgeHistoryEvent,beforeSnapshot:KnowledgeAggregateSnapshot|null,afterSnapshot:KnowledgeAggregateSnapshot|null,reason:string|null) { this.db.prepare("INSERT INTO knowledge_object_history(history_id, knowledge_object_id, operation_id, event_type, before_snapshot, after_snapshot, actor_type, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, 'user', NULL, ?, ?)").run(entityId(),knowledgeObjectId,operationId,eventType,beforeSnapshot?JSON.stringify(beforeSnapshot):null,afterSnapshot?JSON.stringify(afterSnapshot):null,reason,now()); }
   searchKnowledge(input: KnowledgeSearchInput) {
     const needle=input.query.toLowerCase();
     const projects=input.projectId?[this.getProject(input.projectId)]:this.listProjects({status:"active"});
     const results=projects.flatMap(project=>this.listKnowledgeObjects({projectId:project.id}).filter(item=>(!input.status||item.status===input.status)&&(!input.type||item.type===input.type)&&(item.title.toLowerCase().includes(needle)||item.body.toLowerCase().includes(needle)||item.type.includes(needle)||item.status.includes(needle))));
     return results.slice(0,input.limit??30);
   }
   attachEvidence(input: CreateEvidenceSourceInput) {
     const knowledge=this.getKnowledgeObject(input.knowledgeObjectId); if(knowledge.projectId!==input.projectId)throw invalidMove("Evidence and knowledge must belong to the same project.");
     assertOneOf(input.sourceType,EVIDENCE_TYPES,"evidence source type"); assertOneOf(input.confidence,CONFIDENCE_LEVELS,"confidence");
     if(input.sourceType==="document"||input.sourceType==="file"){if(!input.sourceId)throw new VaultDomainError("VALIDATION_ERROR","Choose a source file.","sourceId");const document=this.getDocument(input.sourceId);if(document.projectId!==input.projectId)throw invalidMove("Evidence cannot reference a file from another project.");if(input.sourceType==="file"&&document.kind!=="file")throw new VaultDomainError("VALIDATION_ERROR","Choose an imported source file.","sourceId");}
@@ -355,21 +379,21 @@ export class SqliteVaultRepository implements VaultRepository {
   listRelationships(filters:RelationshipFilters){this.getProject(filters.projectId);const rows=(this.db.prepare("SELECT * FROM relationships WHERE project_id=? ORDER BY created_at DESC").all(filters.projectId) as DbRow[]).map(mapRelationship);if(!filters.entityType||!filters.entityId)return rows;return rows.filter(item=>(item.sourceType===filters.entityType&&item.sourceId===filters.entityId)||(item.targetType===filters.entityType&&item.targetId===filters.entityId));}
   removeRelationship(id:string){const row=this.db.prepare("SELECT id FROM relationships WHERE id=?").get(id) as {id:string}|undefined;if(!row)throw notFound("Relationship");this.db.prepare("DELETE FROM relationships WHERE id=?").run(id);return{id};}
   private entityProjectId(type:RelationshipEndpointType,id:string){if(type==="project")return this.getProject(id).id;if(type==="folder")return this.getFolder(id).projectId;if(type==="document")return this.getDocument(id).projectId;return this.getKnowledgeObject(id).projectId;}
 
   snapshot(): VaultSnapshot {
     const projects = this.listProjects({ status: "active" });
     const projectIds = new Set(projects.map(project => project.id));
     const folders = (this.db.prepare("SELECT * FROM folders WHERE status='active' ORDER BY relative_path").all() as DbRow[]).map(mapFolder).filter(folder => projectIds.has(folder.projectId));
     const folderIds = new Set(folders.map(folder => folder.id));
     const documents = (this.db.prepare("SELECT * FROM documents WHERE status='active' ORDER BY relative_path").all() as DbRow[]).map(mapDocument).map(item=>this.withAvailability(item)).filter(document => projectIds.has(document.projectId) && (!document.parentFolderId || folderIds.has(document.parentFolderId)));
-    const knowledgeObjects=(this.db.prepare("SELECT * FROM knowledge_objects WHERE status<>'archived' ORDER BY updated_at DESC").all() as DbRow[]).map(mapKnowledgeObject).filter(item=>projectIds.has(item.projectId));
+    const knowledgeObjects=(this.db.prepare("SELECT * FROM knowledge_objects WHERE status NOT IN ('archived','superseded') ORDER BY updated_at DESC").all() as DbRow[]).map(mapKnowledgeObject).filter(item=>projectIds.has(item.projectId));
     const knowledgeIds=new Set(knowledgeObjects.map(item=>item.id));
     const evidenceLinks=(this.db.prepare("SELECT * FROM knowledge_evidence_links ORDER BY created_at DESC, link_id DESC").all() as DbRow[]).map(mapKnowledgeEvidenceLink).filter(link=>knowledgeIds.has(link.knowledgeObjectId));
     const evidenceIds=new Set(evidenceLinks.map(link=>link.evidenceSourceId));
     const evidenceSources=(this.db.prepare("SELECT * FROM evidence_sources ORDER BY created_at DESC").all() as DbRow[]).map(mapEvidenceSource).map(item=>this.withEvidenceAvailability(item)).filter(item=>evidenceIds.has(item.id));
     const relationships=(this.db.prepare("SELECT * FROM relationships ORDER BY created_at DESC").all() as DbRow[]).map(mapRelationship).filter(item=>projectIds.has(item.projectId));
     const evidenceById=new Map(evidenceSources.map(evidence=>[evidence.id,evidence]));
     const firstDocumentEvidence=new Map<string,string>(); for(const link of evidenceLinks){const evidence=evidenceById.get(link.evidenceSourceId);if(evidence?.sourceType==="document"&&evidence.sourceId&&!firstDocumentEvidence.has(link.knowledgeObjectId)&&documents.some(item=>item.id===evidence.sourceId))firstDocumentEvidence.set(link.knowledgeObjectId,evidence.sourceId);}
     const atlasNodes = [
       { id: "vault-root", name: basename(this.options.vaultRoot), type: "vault" as const, parentId: null, projectId: null, path: this.options.vaultRoot },
       ...projects.map(project => ({ id: project.id, name: project.name, type: "project" as const, parentId: "vault-root", projectId: project.id, path: project.name })),
@@ -383,21 +407,21 @@ export class SqliteVaultRepository implements VaultRepository {
     const needle = input.query.toLowerCase(), limit = input.limit ?? 30, results: SearchResult[] = [];
     const projects = this.listProjects({ status: "active" }).filter(project => !input.projectId || project.id === input.projectId);
     for (const project of projects) {
       if (project.name.toLowerCase().includes(needle)) results.push({ id: project.id, entityType: "project", projectId: project.id, projectName: project.name, title: project.name, path: project.name, excerpt: project.description });
       for (const folder of this.listProjectFolders(project.id).filter(folder => folder.status === "active")) if (folder.name.toLowerCase().includes(needle)) results.push({ id: folder.id, entityType: "folder", projectId: project.id, projectName: project.name, title: folder.name, path: `${project.name} / ${folder.relativePath}`, excerpt: null });
       for (const document of this.listProjectDocuments(project.id).filter(document => document.status === "active")) {
         let content = ""; try { content = this.readSearchableContent(document); } catch { content = ""; }
         const contentIndex = content.toLowerCase().indexOf(needle);
         if (document.title.toLowerCase().includes(needle) || contentIndex >= 0) results.push({ id: document.id, entityType: "document", projectId: project.id, projectName: project.name, title: document.title, path: `${project.name} / ${document.relativePath}`, excerpt: contentIndex >= 0 ? content.slice(Math.max(0, contentIndex - 45), contentIndex + needle.length + 75).replace(/\s+/g, " ") : null });
       }
-      for(const item of this.listKnowledgeObjects({projectId:project.id}).filter(item=>item.status!=="archived")){const index=item.body.toLowerCase().indexOf(needle);if(item.title.toLowerCase().includes(needle)||index>=0)results.push({id:item.id,entityType:"knowledge",projectId:project.id,projectName:project.name,title:item.title,path:`${project.name} / Knowledge / ${item.type}`,excerpt:index>=0?item.body.slice(Math.max(0,index-45),index+needle.length+75):null});}
+      for(const item of this.listKnowledgeObjects({projectId:project.id})){const index=item.body.toLowerCase().indexOf(needle);if(item.title.toLowerCase().includes(needle)||index>=0)results.push({id:item.id,entityType:"knowledge",projectId:project.id,projectName:project.name,title:item.title,path:`${project.name} / Knowledge / ${item.type}`,excerpt:index>=0?item.body.slice(Math.max(0,index-45),index+needle.length+75):null});}
     }
     return results.slice(0, limit);
   }
 
   seedDevelopmentFixtures() {
     if (!this.options.developmentMode) throw new VaultDomainError("VALIDATION_ERROR", "Fixture seeding is only available in development.");
     if (this.listProjects().some(project => project.name === "Orbit Vault Test")) return { seeded: false, snapshot: this.snapshot() };
     const orbit = this.createProject({ name: "Orbit Vault Test", description: "Disposable Phase 1 fixture project.", color: "#6d8cff" });
     const docs = this.createFolder({ projectId: orbit.id, parentFolderId: null, name: "docs" });
     const design = this.createFolder({ projectId: orbit.id, parentFolderId: null, name: "design" });
@@ -451,18 +475,19 @@ const CONFIDENCE_LEVELS = ["low","medium","high","verified"] as const;
 const EVIDENCE_TYPES = ["document","file","url","conversation","image","pdf","manual_note"] as const;
 const RELATIONSHIP_ENDPOINT_TYPES = ["project","folder","document","knowledge"] as const;
 const RELATIONSHIP_TYPES = ["supports","references","contradicts","answers","depends_on","blocks","implements","duplicates","derived_from","belongs_to"] as const;
 const assertOneOf = <T extends string>(value:string, allowed:readonly T[], label:string):T => { if(!allowed.includes(value as T))throw new VaultDomainError("VALIDATION_ERROR",`Invalid ${label}.`);return value as T; };
 const mapProject = (row: DbRow): Project => ({ id: row.id!, name: row.name!, storagePath:row.storage_path??`${row.id}/files`, description: row.description, icon: row.icon, color: row.color, status: row.status as EntityStatus, createdAt: row.created_at!, updatedAt: row.updated_at! });
 const mapFolder = (row: DbRow): Folder => ({ id: row.id!, projectId: row.project_id!, parentFolderId: row.parent_folder_id, name: row.name!, relativePath: row.relative_path!, status: row.status as EntityStatus, createdAt: row.created_at!, updatedAt: row.updated_at! });
 const mapDocument = (row: DbRow): DocumentFile => ({ id: row.id!, projectId: row.project_id!, parentFolderId: row.parent_folder_id, title: row.title!, kind: row.kind as "markdown" | "file", relativePath: row.relative_path!, mimeType: row.mime_type, availability:"available", status: row.status as EntityStatus, createdAt: row.created_at!, updatedAt: row.updated_at! });
 const mapKnowledgeObject = (row:DbRow):KnowledgeObject => ({id:row.id!,projectId:row.project_id!,parentFolderId:row.parent_folder_id,type:row.type as KnowledgeObject["type"],title:row.title!,body:row.body!,status:row.status as KnowledgeStatus,confidence:row.confidence as KnowledgeConfidence,author:row.author as KnowledgeObject["author"],supersededById:row.superseded_by_id,createdAt:row.created_at!,updatedAt:row.updated_at!});
 const mapEvidenceSource = (row:DbRow):EvidenceSource => ({id:row.id!,projectId:row.project_id!,sourceType:row.source_type as EvidenceSource["sourceType"],sourceId:row.source_id,sourcePath:row.source_path,excerpt:row.excerpt,locator:row.locator,confidence:row.confidence as KnowledgeConfidence,availability:row.availability as EvidenceSource["availability"],createdAt:row.created_at!});
 const mapKnowledgeEvidenceLink = (row:DbRow):KnowledgeEvidenceLink => ({id:row.link_id!,knowledgeObjectId:row.knowledge_object_id!,evidenceSourceId:row.evidence_source_id!,originalKnowledgeObjectId:row.original_knowledge_object_id!,operationId:row.operation_id!,createdAt:row.created_at!});
+const mapKnowledgeHistory = (row:DbRow):KnowledgeHistoryRecord => ({id:row.history_id!,knowledgeObjectId:row.knowledge_object_id!,operationId:row.operation_id!,eventType:row.event_type as KnowledgeHistoryEvent,beforeSnapshot:row.before_snapshot?JSON.parse(row.before_snapshot) as KnowledgeAggregateSnapshot:null,afterSnapshot:row.after_snapshot?JSON.parse(row.after_snapshot) as KnowledgeAggregateSnapshot:null,actorType:row.actor_type as KnowledgeHistoryRecord["actorType"],actorId:row.actor_id,reason:row.reason,createdAt:row.created_at!});
 const mapRelationship = (row:DbRow):Relationship => ({id:row.id!,projectId:row.project_id!,sourceType:row.source_type as RelationshipEndpointType,sourceId:row.source_id!,targetType:row.target_type as RelationshipEndpointType,targetId:row.target_id!,relationshipType:row.relationship_type as RelationshipType,author:row.author as Relationship["author"],createdAt:row.created_at!});
 const snapshotFolderPath=(folders:Folder[],id:string)=>folders.find(item=>item.id===id)?.relativePath??"Knowledge";
 const SEARCHABLE_EXTENSIONS=new Set([".md",".txt",".json",".csv",".tsv",".js",".jsx",".ts",".tsx",".css",".html",".xml",".yaml",".yml",".toml",".ini",".log",".py",".java",".c",".h",".cpp",".cs",".go",".rs",".sql",".sh",".ps1"]);
 const mimeFor=(name:string)=>({".pdf":"application/pdf",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".svg":"image/svg+xml",".txt":"text/plain",".json":"application/json",".csv":"text/csv",".md":"text/markdown"}[extname(name).toLowerCase()]??"application/octet-stream");
 const IGNORED_DIRECTORIES=new Set([".git",".svn",".hg","node_modules",".pnpm-store","dist","build","out","target","coverage",".next",".nuxt",".cache",".turbo",".parcel-cache","__pycache__",".venv","venv"]);
 const IGNORED_FILES=new Set(["vault.db","vault.db-shm","vault.db-wal","thumbs.db",".ds_store"]);
 
 export const __testing = { safeResolve, atomicWrite, MIGRATIONS };
diff --git a/tests/phase2-knowledge.test.ts b/tests/phase2-knowledge.test.ts
index 9722500..e9749ef 100644
--- a/tests/phase2-knowledge.test.ts
+++ b/tests/phase2-knowledge.test.ts
@@ -81,20 +81,90 @@ test("migration preserves canonical evidence and creates one honest baseline", (
     migrated.close();
 
     service.initialize(); service.close();
     const reopened = new DatabaseSync(join(root, "vault.db"), { readOnly: true });
     assert.equal((reopened.prepare("SELECT count(*) AS count FROM knowledge_evidence_links").get() as { count: number }).count, 3);
     assert.equal((reopened.prepare("SELECT count(*) AS count FROM knowledge_object_history").get() as { count: number }).count, 3);
     reopened.close();
   } finally { service?.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
 });
 
+test("immutable lifecycle history records create edit approve archive restore and supersede", () => {
+  const ctx=fixture(); try {
+    const project=ctx.service.projects.create({name:"Lifecycle history"});
+    const source=ctx.service.knowledge.create({projectId:project.id,type:"decision",title:"Original decision",body:"The first version is evidence-backed.",confidence:"high"});
+    const created=ctx.service.knowledge.history(source.id);
+    assert.equal(created.length,1); assert.equal(created[0].eventType,"created"); assert.equal(created[0].beforeSnapshot,null); assert.deepEqual(created[0].afterSnapshot?.object,source);
+    ctx.service.evidence.attach({projectId:project.id,knowledgeObjectId:source.id,sourceType:"manual_note",sourceId:null,sourcePath:null,excerpt:"A supporting note.",locator:null,confidence:"verified"});
+    const incoming=ctx.service.relationships.create({projectId:project.id,sourceType:"project",sourceId:project.id,targetType:"knowledge",targetId:source.id,relationshipType:"references"});
+    const outgoing=ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:source.id,targetType:"project",targetId:project.id,relationshipType:"implements"});
+    const edited=ctx.service.knowledge.update(source.id,{title:"Revised decision"});
+    const unchanged=ctx.service.knowledge.update(source.id,{title:"Revised decision"});
+    assert.equal(unchanged.updatedAt,edited.updatedAt);
+    assert.equal(ctx.service.knowledge.approve(source.id).status,"approved");
+    assert.equal(ctx.service.knowledge.archive(source.id).status,"archived");
+    assert.equal(ctx.service.knowledge.restore(source.id," restore rationale ").status,"approved");
+    const replacement=ctx.service.knowledge.create({projectId:project.id,type:"decision",title:"Replacement decision",body:"This version supersedes the original.",confidence:"verified"});
+    const superseded=ctx.service.knowledge.supersede({projectId:project.id,knowledgeObjectId:source.id,supersededById:replacement.id,reason:" replacement rationale "});
+    assert.equal(superseded.status,"superseded"); assert.equal(superseded.supersededById,replacement.id);
+    const history=ctx.service.knowledge.history(source.id);
+    assert.deepEqual(history.map(item=>item.eventType),["superseded","restored","archived","approved","edited","created"]);
+    assert.equal(new Set(history.map(item=>item.operationId)).size,history.length);
+    for(const item of history){assert.notEqual(item.operationId,"");assert.equal(item.actorType,"user");assert.equal(item.actorId,null);assert.ok(item.afterSnapshot);}
+    assert.equal(history[0].reason,"replacement rationale"); assert.equal(history[1].reason,"restore rationale"); assert.equal(history[2].reason,null);
+    assert.deepEqual(history[4].beforeSnapshot?.evidenceLinks,history[4].afterSnapshot?.evidenceLinks);
+    assert.deepEqual(history[0].afterSnapshot?.evidenceLinks.map(item=>item.knowledgeObjectId),[source.id]);
+    assert.deepEqual(history[0].afterSnapshot?.incomingRelationships.map(item=>item.id),[incoming.id]);
+    assert.deepEqual(history[0].afterSnapshot?.outgoingRelationships.map(item=>item.id),[outgoing.id]);
+    assert.equal(ctx.service.knowledge.list({projectId:project.id}).some(item=>item.id===source.id),false);
+    assert.deepEqual(ctx.service.knowledge.list({projectId:project.id,status:"superseded"}).map(item=>item.id),[source.id]);
+    assert.equal(ctx.service.knowledge.search({projectId:project.id,query:"revised decision"}).some(item=>item.id===source.id),false);
+    assert.equal(ctx.service.search({projectId:project.id,query:"revised decision"}).some(item=>item.id===source.id),false);
+    assert.equal(ctx.service.snapshot().knowledgeObjects.some(item=>item.id===source.id),false);
+  } finally { ctx.dispose(); }
+});
+
+test("single-object lifecycle rejects invalid transitions and project crossings", () => {
+  const ctx=fixture(); try {
+    const first=ctx.service.projects.create({name:"First lifecycle"}),second=ctx.service.projects.create({name:"Second lifecycle"});
+    const draft=ctx.service.knowledge.create({projectId:first.id,type:"fact",title:"Draft",body:"Requires support before approval.",confidence:"medium"});
+    assert.throws(()=>ctx.service.knowledge.approve(draft.id),/evidence source/);
+    ctx.service.evidence.attach({projectId:first.id,knowledgeObjectId:draft.id,sourceType:"manual_note",sourceId:null,sourcePath:null,excerpt:null,locator:null,confidence:"verified"});
+    assert.equal(ctx.service.knowledge.approve(draft.id).status,"approved");
+    assert.throws(()=>ctx.service.knowledge.approve(draft.id),/draft/);
+    assert.throws(()=>ctx.service.knowledge.restore(draft.id),/archived/);
+    const replacement=ctx.service.knowledge.create({projectId:first.id,type:"fact",title:"Replacement",body:"A valid replacement.",confidence:"high"});
+    assert.throws(()=>ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:draft.id,supersededById:draft.id}),/itself/);
+    const archived=ctx.service.knowledge.create({projectId:first.id,type:"fact",title:"Archived replacement",body:"An invalid replacement.",confidence:"high"});
+    ctx.service.evidence.attach({projectId:first.id,knowledgeObjectId:archived.id,sourceType:"manual_note",sourceId:null,sourcePath:null,excerpt:null,locator:null,confidence:"high"}); ctx.service.knowledge.approve(archived.id); ctx.service.knowledge.archive(archived.id);
+    assert.throws(()=>ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:draft.id,supersededById:archived.id}),/draft or approved/);
+    const foreign=ctx.service.knowledge.create({projectId:second.id,type:"fact",title:"Foreign replacement",body:"Belongs elsewhere.",confidence:"high"});
+    assert.throws(()=>ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:draft.id,supersededById:foreign.id}),/same project/);
+    assert.throws(()=>ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:draft.id,supersededById:replacement.id,reason:"x".repeat(501)}),/500/);
+    ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:draft.id,supersededById:replacement.id});
+    assert.throws(()=>ctx.service.knowledge.archive(draft.id),/draft or approved/);
+  } finally { ctx.dispose(); }
+});
+
+test("knowledge lifecycle history persists across restart", () => {
+  const ctx=fixture(); try {
+    const project=ctx.service.projects.create({name:"Persist lifecycle"});
+    const source=ctx.service.knowledge.create({projectId:project.id,type:"fact",title:"Persistent source",body:"Lifecycle rows must survive restart.",confidence:"high"});
+    ctx.service.evidence.attach({projectId:project.id,knowledgeObjectId:source.id,sourceType:"manual_note",sourceId:null,sourcePath:null,excerpt:null,locator:null,confidence:"verified"}); ctx.service.knowledge.approve(source.id);
+    const replacement=ctx.service.knowledge.create({projectId:project.id,type:"fact",title:"Persistent replacement",body:"The replacement persists too.",confidence:"high"});
+    ctx.service.knowledge.supersede({projectId:project.id,knowledgeObjectId:source.id,supersededById:replacement.id,reason:"restart proof"});
+    const before=ctx.service.knowledge.history(source.id); ctx.service.close(); ctx.service.initialize();
+    const after=ctx.service.knowledge.history(source.id); const reloaded=ctx.service.knowledge.list({projectId:project.id,status:"superseded"})[0]!;
+    assert.equal(reloaded.id,source.id); assert.equal(reloaded.supersededById,replacement.id); assert.deepEqual(after,before);
+  } finally { ctx.dispose(); }
+});
+
 test("manual knowledge remains draft until explicit approval and survives restart", () => {
   const ctx=fixture(); try {
     const project=ctx.service.projects.create({name:"Knowledge Project"});
     const document=ctx.service.documents.createMarkdown({projectId:project.id,parentFolderId:null,title:"architecture",content:"# Architecture\n\nUse SQLite for local-first persistence."});
     const knowledge=ctx.service.knowledge.create({projectId:project.id,type:"decision",title:"Use SQLite",body:"SQLite is the canonical local metadata store.",confidence:"high"});
     assert.equal(knowledge.status,"draft"); assert.equal(knowledge.author,"user");
     assert.throws(()=>ctx.service.knowledge.approve(knowledge.id),/evidence source/);
     const evidence=ctx.service.evidence.attach({projectId:project.id,knowledgeObjectId:knowledge.id,sourceType:"document",sourceId:document.id,sourcePath:document.relativePath,excerpt:"Use SQLite for local-first persistence.",locator:"Architecture",confidence:"verified"});
     assert.equal(evidence.sourceId,document.id);
     assert.equal(ctx.service.knowledge.approve(knowledge.id).status,"approved");
```
