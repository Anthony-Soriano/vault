# Task 4 review package
## Commits
```
d3e4f01 feat: add transactional deterministic knowledge merge
```
## Stat
```
 packages/vault-core/src/index.ts    |   7 +-
 packages/vault-storage/src/index.ts |  83 ++++++++++++++++-
 tests/phase2-knowledge.test.ts      | 181 ++++++++++++++++++++++++++++++++++++
 3 files changed, 269 insertions(+), 2 deletions(-)
```
## Diff
```diff
diff --git a/packages/vault-core/src/index.ts b/packages/vault-core/src/index.ts
index 93b2008..75d7639 100644
--- a/packages/vault-core/src/index.ts
+++ b/packages/vault-core/src/index.ts
@@ -1,13 +1,13 @@
 import type {
   CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, ImportFilesInput,
-  EvidenceSource, Folder, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeHistoryRecord, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters, SupersedeKnowledgeInput,
+  EvidenceSource, Folder, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeHistoryRecord, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, MergeKnowledgeInput, MergeKnowledgePreview, MergeKnowledgeResult, Project, ProjectFilters, SupersedeKnowledgeInput,
   ReconciliationReport, Relationship, RelationshipFilters, SearchInput, SearchResult, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot,
 } from "@orbit/vault-types";
 
 export class VaultDomainError extends Error {
   readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE" | "INVALID_MOVE";
   readonly field?: string;
   constructor(code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE" | "INVALID_MOVE", message: string, field?: string) {
     super(message); this.code = code; this.field = field;
     this.name = "VaultDomainError";
   }
@@ -60,20 +60,22 @@ export interface DocumentRepository {
   setDocumentStatus(id: string, status: EntityStatus): DocumentFile;
 }
 export interface KnowledgeRepository {
   createKnowledgeObject(input: CreateKnowledgeObjectInput): KnowledgeObject;
   getKnowledgeObject(id: string): KnowledgeObject;
   listKnowledgeObjects(filters: KnowledgeFilters): KnowledgeObject[];
   updateKnowledgeObject(id: string, changes: UpdateKnowledgeObjectInput): KnowledgeObject;
   setKnowledgeStatus(id: string, status: KnowledgeStatus): KnowledgeObject;
   restoreKnowledgeObject(id: string, reason: string | null): KnowledgeObject;
   supersedeKnowledgeObject(input: SupersedeKnowledgeInput): KnowledgeObject;
+  previewKnowledgeMerge(input: MergeKnowledgeInput): MergeKnowledgePreview;
+  mergeKnowledgeObjects(input: MergeKnowledgeInput): MergeKnowledgeResult;
   listKnowledgeHistory(knowledgeObjectId: string): KnowledgeHistoryRecord[];
   searchKnowledge(input: KnowledgeSearchInput): KnowledgeObject[];
 }
 export interface EvidenceRepository {
   attachEvidence(input: CreateEvidenceSourceInput): EvidenceSource;
   listEvidence(knowledgeObjectId: string): EvidenceSource[];
   listEvidenceLinks(knowledgeObjectId: string): KnowledgeEvidenceLink[];
 }
 export interface RelationshipRepository {
   createRelationship(input: CreateRelationshipInput): Relationship;
@@ -127,20 +129,22 @@ export class VaultService {
     trash: (id: string) => this.repository.setDocumentStatus(assertIdentifier(id), "trashed"),
   };
   knowledge = {
     list: (filters: KnowledgeFilters) => this.repository.listKnowledgeObjects({ ...filters, projectId: assertIdentifier(filters.projectId, "projectId") }),
     create: (input: CreateKnowledgeObjectInput) => this.repository.createKnowledgeObject({ ...input, projectId: assertIdentifier(input.projectId, "projectId"), parentFolderId: input.parentFolderId ? assertIdentifier(input.parentFolderId, "parentFolderId") : null, title: knowledgeText(input.title, "title", 160), body: knowledgeText(input.body, "body", 20000) }),
     update: (id: string, changes: UpdateKnowledgeObjectInput) => this.repository.updateKnowledgeObject(assertIdentifier(id), { ...changes, ...(changes.parentFolderId !== undefined ? { parentFolderId: changes.parentFolderId ? assertIdentifier(changes.parentFolderId,"parentFolderId") : null } : {}), ...(changes.title !== undefined ? { title: knowledgeText(changes.title, "title", 160) } : {}), ...(changes.body !== undefined ? { body: knowledgeText(changes.body, "body", 20000) } : {}) }),
     approve: (id: string) => this.repository.setKnowledgeStatus(assertIdentifier(id), "approved"),
     archive: (id: string) => this.repository.setKnowledgeStatus(assertIdentifier(id), "archived"),
     restore: (id: string, reason?: string | null) => this.repository.restoreKnowledgeObject(assertIdentifier(id), normalizeReason(reason)),
     supersede: (input: SupersedeKnowledgeInput) => this.repository.supersedeKnowledgeObject({ ...input, projectId: assertIdentifier(input.projectId,"projectId"), knowledgeObjectId: assertIdentifier(input.knowledgeObjectId,"knowledgeObjectId"), ...(input.supersededById !== undefined ? { supersededById: input.supersededById ? assertIdentifier(input.supersededById,"supersededById") : null } : {}), reason: normalizeReason(input.reason) }),
+    previewMerge: (input: MergeKnowledgeInput) => this.repository.previewKnowledgeMerge(normalizeMergeInput(input)),
+    merge: (input: MergeKnowledgeInput) => this.repository.mergeKnowledgeObjects(normalizeMergeInput(input)),
     history: (id: string) => this.repository.listKnowledgeHistory(assertIdentifier(id)),
     search: (input: KnowledgeSearchInput) => { const query=input.query.trim(); return query ? this.repository.searchKnowledge({ ...input, query, limit: clampLimit(input.limit) }) : []; },
   };
   evidence = {
     list: (knowledgeObjectId: string) => this.repository.listEvidence(assertIdentifier(knowledgeObjectId, "knowledgeObjectId")),
     attach: (input: CreateEvidenceSourceInput) => this.repository.attachEvidence({ ...input, projectId: assertIdentifier(input.projectId, "projectId"), knowledgeObjectId: assertIdentifier(input.knowledgeObjectId, "knowledgeObjectId"), sourceId: input.sourceId ? assertIdentifier(input.sourceId, "sourceId") : null, excerpt: input.excerpt?.trim() || null, locator: input.locator?.trim() || null, sourcePath: input.sourcePath?.trim() || null }),
   };
   relationships = {
     list: (filters: RelationshipFilters) => this.repository.listRelationships({ ...filters, projectId: assertIdentifier(filters.projectId,"projectId"), entityId: filters.entityId ? assertIdentifier(filters.entityId,"entityId") : undefined }),
     create: (input: CreateRelationshipInput) => this.repository.createRelationship({ ...input, projectId: assertIdentifier(input.projectId,"projectId"), sourceId: assertIdentifier(input.sourceId,"sourceId"), targetId: assertIdentifier(input.targetId,"targetId") }),
@@ -150,10 +154,11 @@ export class VaultService {
   search(input: SearchInput) {
     const query = input.query.trim(); if (!query) return [];
     return this.repository.search({ ...input, query, limit: clampLimit(input.limit) });
   }
   development = { seed: () => this.repository.seedDevelopmentFixtures(), reset: () => this.repository.resetDevelopmentVault() };
 }
 
 const clampLimit = (limit?: number) => Math.min(100, Math.max(1, limit ?? 30));
 const knowledgeText = (value: string, field: string, maximum: number) => { const text=String(value).trim(); if (!text) throw new VaultDomainError("VALIDATION_ERROR", `Knowledge ${field} is required.`, field); if (text.length>maximum) throw new VaultDomainError("VALIDATION_ERROR", `Knowledge ${field} is too long.`, field); return text; };
 const normalizeReason = (value: string | null | undefined) => { const reason = value == null ? "" : String(value).trim(); if (reason.length > 500) throw new VaultDomainError("VALIDATION_ERROR", "Reason must be 500 characters or fewer.", "reason"); return reason || null; };
+const normalizeMergeInput = (input: MergeKnowledgeInput): MergeKnowledgeInput => ({...input,projectId:assertIdentifier(input.projectId,"projectId"),targetId:assertIdentifier(input.targetId,"targetId"),sourceIds:input.sourceIds.map((id,index)=>assertIdentifier(id,`sourceIds[${index}]`)),reason:normalizeReason(input.reason)});
diff --git a/packages/vault-storage/src/index.ts b/packages/vault-storage/src/index.ts
index 763a8e1..346d324 100644
--- a/packages/vault-storage/src/index.ts
+++ b/packages/vault-storage/src/index.ts
@@ -1,20 +1,24 @@
 import { DatabaseSync } from "node:sqlite";
 import { randomUUID } from "node:crypto";
 import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
 import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
-import type { CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, EvidenceSource, Folder, ImportFilesInput, KnowledgeAggregateSnapshot, KnowledgeConfidence, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeHistoryEvent, KnowledgeHistoryRecord, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters, ReconciliationReport, Relationship, RelationshipEndpointType, RelationshipFilters, RelationshipType, SearchInput, SearchResult, SupersedeKnowledgeInput, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot } from "@orbit/vault-types";
+import type { CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, EvidenceSource, Folder, ImportFilesInput, KnowledgeAggregateSnapshot, KnowledgeConfidence, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeHistoryEvent, KnowledgeHistoryRecord, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, MergeKnowledgeInput, MergeKnowledgePreview, MergeKnowledgeResult, MergeRelationshipConflict, Project, ProjectFilters, ReconciliationReport, Relationship, RelationshipEndpointType, RelationshipFilters, RelationshipType, SearchInput, SearchResult, SupersedeKnowledgeInput, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot } from "@orbit/vault-types";
 import { VaultDomainError, type VaultRepository } from "@orbit/vault-core";
 
 type StorageOptions = { vaultRoot: string; developmentMode: boolean; developmentRoot: string };
 type DbRow = Record<string, string | null>;
 type Migration = { version: number; sql?: string; run?: (db: DatabaseSync) => void };
+type MergePlan = MergeKnowledgePreview & {
+  evidenceActions: {link:KnowledgeEvidenceLink;action:"transfer"|"delete"}[];
+  relationshipActions: {relationship:Relationship;action:"redirect"|"delete"}[];
+};
 
 const safeLinkedKind=(path:string,allowedRoot:string):"directory"|"file"|null=>{try{const resolved=realpathSync.native(path),within=relative(realpathSync.native(allowedRoot),resolved);if(within.startsWith(`..${sep}`)||within===".."||isAbsolute(within))return null;const stats=statSync(path);return stats.isDirectory()?"directory":stats.isFile()?"file":null;}catch{return null;}};
 
 const MIGRATIONS: Migration[] = [{
   version: 1,
   sql: `
     CREATE TABLE IF NOT EXISTS projects (
       id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT,
       status TEXT NOT NULL CHECK(status IN ('active','archived','trashed')),
       created_at TEXT NOT NULL, updated_at TEXT NOT NULL
@@ -336,20 +340,95 @@ export class SqliteVaultRepository implements VaultRepository {
   }
   restoreKnowledgeObject(id:string,reason:string|null) {
     return this.transaction(() => { const item=this.getKnowledgeObject(id); if(item.status!=="archived")throw new VaultDomainError("VALIDATION_ERROR","Only archived knowledge can be restored."); const archive=this.db.prepare("SELECT * FROM knowledge_object_history WHERE knowledge_object_id=? AND event_type='archived' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(id) as DbRow|undefined; const previous=archive?mapKnowledgeHistory(archive).beforeSnapshot?.object.status:null; if(previous!=="draft"&&previous!=="approved")throw new VaultDomainError("VALIDATION_ERROR","Cannot restore knowledge without a valid archive history."); const before=this.captureKnowledgeAggregate(id); this.db.prepare("UPDATE knowledge_objects SET status=?, updated_at=? WHERE id=?").run(previous,now(),id); this.appendKnowledgeHistory(id,entityId(),"restored",before,this.captureKnowledgeAggregate(id),reason); return this.getKnowledgeObject(id); });
   }
   supersedeKnowledgeObject(input:SupersedeKnowledgeInput) {
     return this.transaction(() => { const source=this.getKnowledgeObject(input.knowledgeObjectId); if(source.projectId!==input.projectId)throw new VaultDomainError("VALIDATION_ERROR","Knowledge must belong to the specified project.","knowledgeObjectId"); if(source.status!=="draft"&&source.status!=="approved")throw new VaultDomainError("VALIDATION_ERROR","Only draft or approved knowledge can be superseded."); const replacementId=input.supersededById??null;
       if(replacementId){if(replacementId===source.id)throw new VaultDomainError("VALIDATION_ERROR","Knowledge cannot supersede itself.","supersededById");const replacement=this.getKnowledgeObject(replacementId);if(replacement.projectId!==source.projectId)throw new VaultDomainError("VALIDATION_ERROR","Replacement knowledge must belong to the same project.","supersededById");if(replacement.status!=="draft"&&replacement.status!=="approved")throw new VaultDomainError("VALIDATION_ERROR","Replacement knowledge must be draft or approved.","supersededById");}
       const before=this.captureKnowledgeAggregate(source.id); this.db.prepare("UPDATE knowledge_objects SET status='superseded', superseded_by_id=?, updated_at=? WHERE id=?").run(replacementId,now(),source.id); this.appendKnowledgeHistory(source.id,entityId(),"superseded",before,this.captureKnowledgeAggregate(source.id),input.reason??null); return this.getKnowledgeObject(source.id);
     });
   }
+  previewKnowledgeMerge(input:MergeKnowledgeInput):MergeKnowledgePreview {
+    const {target,sources,evidenceLinks,redirectedRelationships,conflicts,blockingErrors}=this.buildMergePlan(input);
+    return {target,sources,evidenceLinks,redirectedRelationships,conflicts,blockingErrors};
+  }
+  mergeKnowledgeObjects(input:MergeKnowledgeInput):MergeKnowledgeResult {
+    return this.transaction(() => {
+      const plan=this.buildMergePlan(input);
+      if(plan.blockingErrors.length)throw new VaultDomainError("VALIDATION_ERROR",`Merge is blocked: ${plan.blockingErrors.join(" ")}`);
+      const operationId=entityId(),timestamp=now(),aggregateIds=[plan.target.id,...plan.sources.map(source=>source.id)];
+      const beforeSnapshots=new Map(aggregateIds.map(id=>[id,this.captureKnowledgeAggregate(id)]));
+      for(const action of plan.evidenceActions.filter(action=>action.action==="delete"))this.db.prepare("DELETE FROM knowledge_evidence_links WHERE link_id=?").run(action.link.id);
+      for(const action of plan.evidenceActions.filter(action=>action.action==="transfer"))this.db.prepare("UPDATE knowledge_evidence_links SET knowledge_object_id=? WHERE link_id=?").run(plan.target.id,action.link.id);
+      for(const action of plan.relationshipActions.filter(action=>action.action==="delete"))this.db.prepare("DELETE FROM relationships WHERE id=?").run(action.relationship.id);
+      for(const action of plan.relationshipActions.filter(action=>action.action==="redirect"))this.db.prepare("UPDATE relationships SET source_id=?, target_id=? WHERE id=?").run(action.relationship.sourceId,action.relationship.targetId,action.relationship.id);
+      for(const source of plan.sources)this.db.prepare("UPDATE knowledge_objects SET status='superseded', superseded_by_id=?, updated_at=? WHERE id=?").run(plan.target.id,timestamp,source.id);
+      this.db.prepare("UPDATE knowledge_objects SET updated_at=? WHERE id=?").run(timestamp,plan.target.id);
+      const afterSnapshots=new Map(aggregateIds.map(id=>[id,this.captureKnowledgeAggregate(id)]));
+      for(const id of aggregateIds)this.appendKnowledgeHistory(id,operationId,"merged",beforeSnapshots.get(id)!,afterSnapshots.get(id)!,input.reason??null);
+      return {operationId,target:this.getKnowledgeObject(plan.target.id),supersededSources:plan.sources.map(source=>this.getKnowledgeObject(source.id)),transferredEvidenceCount:plan.evidenceActions.filter(action=>action.action==="transfer").length,redirectedRelationshipCount:plan.relationshipActions.filter(action=>action.action==="redirect").length,conflicts:plan.conflicts};
+    });
+  }
+  private buildMergePlan(input:MergeKnowledgeInput):MergePlan {
+    this.getProject(input.projectId);
+    if(input.sourceIds.length===0)throw new VaultDomainError("VALIDATION_ERROR","Choose at least one source Knowledge Object.","sourceIds");
+    const sortedSourceIds=[...input.sourceIds].sort(compareText);
+    if(new Set(sortedSourceIds).size!==sortedSourceIds.length)throw new VaultDomainError("VALIDATION_ERROR","Source Knowledge Object IDs must be unique.","sourceIds");
+    if(sortedSourceIds.includes(input.targetId))throw new VaultDomainError("VALIDATION_ERROR","The target Knowledge Object cannot also be a source.","sourceIds");
+    const target=this.getKnowledgeObject(input.targetId),sources=sortedSourceIds.map(id=>this.getKnowledgeObject(id));
+    if(target.projectId!==input.projectId)throw new VaultDomainError("VALIDATION_ERROR","Target Knowledge Object must belong to the specified project.","targetId");
+    const foreignSource=sources.find(source=>source.projectId!==input.projectId);
+    if(foreignSource)throw new VaultDomainError("VALIDATION_ERROR","Source Knowledge Objects must belong to the specified project.","sourceIds");
+    const blockingErrors:string[]=[];
+    if(target.status!=="draft"&&target.status!=="approved")blockingErrors.push(`Target Knowledge Object ${target.id} must be draft or approved.`);
+    for(const source of sources)if(source.status!=="draft"&&source.status!=="approved")blockingErrors.push(`Source Knowledge Object ${source.id} must be draft or approved.`);
+    const sourceIds=new Set(sortedSourceIds);
+    const relationships=(this.db.prepare("SELECT * FROM relationships WHERE project_id=? ORDER BY created_at, id").all(input.projectId) as DbRow[]).map(mapRelationship);
+    const redirectedRelationships=relationships.filter(relationship=>(relationship.sourceType==="knowledge"&&sourceIds.has(relationship.sourceId))||(relationship.targetType==="knowledge"&&sourceIds.has(relationship.targetId))).map(relationship=>({...relationship,sourceId:relationship.sourceType==="knowledge"&&sourceIds.has(relationship.sourceId)?target.id:relationship.sourceId,targetId:relationship.targetType==="knowledge"&&sourceIds.has(relationship.targetId)?target.id:relationship.targetId})).sort((left,right)=>compareText(left.id,right.id));
+    const conflicts:MergeRelationshipConflict[]=[];
+    const remainingRedirects:Relationship[]=[];
+    for(const relationship of redirectedRelationships){
+      if(relationship.sourceType===relationship.targetType&&relationship.sourceId===relationship.targetId)conflicts.push({relationshipId:relationship.id,resolution:"self_link_removed",retainedRelationshipId:null});
+      else remainingRedirects.push(relationship);
+    }
+    const existingTargetRelationships=relationships.filter(relationship=>!redirectedRelationships.some(redirected=>redirected.id===relationship.id)&&((relationship.sourceType==="knowledge"&&relationship.sourceId===target.id)||(relationship.targetType==="knowledge"&&relationship.targetId===target.id)));
+    const groups=new Map<string,Relationship[]>();
+    for(const relationship of [...remainingRedirects,...existingTargetRelationships]){
+      const key=JSON.stringify([relationship.projectId,relationship.sourceType,relationship.sourceId,relationship.targetType,relationship.targetId,relationship.relationshipType]);
+      const group=groups.get(key)??[];group.push(relationship);groups.set(key,group);
+    }
+    for(const group of groups.values())if(group.length>1){
+      group.sort(compareCreatedThenId);const retained=group[0]!;
+      for(const relationship of group.slice(1))conflicts.push({relationshipId:relationship.id,resolution:"duplicate_collapsed",retainedRelationshipId:retained.id});
+    }
+    const sourceEvidenceLinks=sources.flatMap(source=>(this.db.prepare("SELECT * FROM knowledge_evidence_links WHERE knowledge_object_id=? ORDER BY created_at, link_id").all(source.id) as DbRow[]).map(mapKnowledgeEvidenceLink)).sort(compareCreatedThenId);
+    const sortedConflicts=conflicts.sort((left,right)=>compareText(left.relationshipId,right.relationshipId));
+    const relationshipDeletes=new Set(sortedConflicts.map(conflict=>conflict.relationshipId));
+    const relationshipById=new Map([...redirectedRelationships,...existingTargetRelationships].map(relationship=>[relationship.id,relationship]));
+    const relationshipActions=[
+      ...[...relationshipDeletes].map(id=>({relationship:relationshipById.get(id)!,action:"delete" as const})),
+      ...redirectedRelationships.filter(relationship=>!relationshipDeletes.has(relationship.id)).map(relationship=>({relationship,action:"redirect" as const})),
+    ].sort((left,right)=>compareText(left.relationship.id,right.relationship.id));
+    const targetEvidenceLinks=(this.db.prepare("SELECT * FROM knowledge_evidence_links WHERE knowledge_object_id=? ORDER BY created_at, link_id").all(target.id) as DbRow[]).map(mapKnowledgeEvidenceLink);
+    const evidenceGroups=new Map<string,KnowledgeEvidenceLink[]>();
+    for(const link of [...sourceEvidenceLinks,...targetEvidenceLinks]){const group=evidenceGroups.get(link.evidenceSourceId)??[];group.push(link);evidenceGroups.set(link.evidenceSourceId,group);}
+    const evidenceActions:{link:KnowledgeEvidenceLink;action:"transfer"|"delete"}[]=[];
+    for(const group of evidenceGroups.values()){
+      const sourceGroup=group.filter(link=>sourceIds.has(link.knowledgeObjectId));if(sourceGroup.length===0)continue;
+      group.sort(compareCreatedThenId);const retained=group[0]!;
+      for(const link of group)if(link.id!==retained.id)evidenceActions.push({link,action:"delete"});
+      if(sourceIds.has(retained.knowledgeObjectId))evidenceActions.push({link:retained,action:"transfer"});
+    }
+    evidenceActions.sort((left,right)=>compareText(left.link.id,right.link.id));
+    const evidenceLinks=evidenceActions.filter(action=>action.action==="transfer").map(action=>action.link).sort(compareCreatedThenId);
+    return {target,sources,evidenceLinks,redirectedRelationships,conflicts:sortedConflicts,blockingErrors,evidenceActions,relationshipActions};
+  }
   listKnowledgeHistory(knowledgeObjectId:string) { this.getKnowledgeObject(knowledgeObjectId); return (this.db.prepare("SELECT * FROM knowledge_object_history WHERE knowledge_object_id=? ORDER BY created_at DESC, rowid DESC").all(knowledgeObjectId) as DbRow[]).map(mapKnowledgeHistory); }
   private captureKnowledgeAggregate(id:string):KnowledgeAggregateSnapshot { return {schemaVersion:1,object:this.getKnowledgeObject(id),evidenceLinks:(this.db.prepare("SELECT * FROM knowledge_evidence_links WHERE knowledge_object_id=? ORDER BY created_at, link_id").all(id) as DbRow[]).map(mapKnowledgeEvidenceLink),incomingRelationships:(this.db.prepare("SELECT * FROM relationships WHERE target_type='knowledge' AND target_id=? ORDER BY created_at, id").all(id) as DbRow[]).map(mapRelationship),outgoingRelationships:(this.db.prepare("SELECT * FROM relationships WHERE source_type='knowledge' AND source_id=? ORDER BY created_at, id").all(id) as DbRow[]).map(mapRelationship)}; }
   private appendKnowledgeHistory(knowledgeObjectId:string,operationId:string,eventType:KnowledgeHistoryEvent,beforeSnapshot:KnowledgeAggregateSnapshot|null,afterSnapshot:KnowledgeAggregateSnapshot|null,reason:string|null) { this.db.prepare("INSERT INTO knowledge_object_history(history_id, knowledge_object_id, operation_id, event_type, before_snapshot, after_snapshot, actor_type, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, 'user', NULL, ?, ?)").run(entityId(),knowledgeObjectId,operationId,eventType,beforeSnapshot?JSON.stringify(beforeSnapshot):null,afterSnapshot?JSON.stringify(afterSnapshot):null,reason,now()); }
   searchKnowledge(input: KnowledgeSearchInput) {
     const needle=input.query.toLowerCase();
     const projects=input.projectId?[this.getProject(input.projectId)]:this.listProjects({status:"active"});
     const results=projects.flatMap(project=>this.listKnowledgeObjects({projectId:project.id}).filter(item=>(!input.status||item.status===input.status)&&(!input.type||item.type===input.type)&&(item.title.toLowerCase().includes(needle)||item.body.toLowerCase().includes(needle)||item.type.includes(needle)||item.status.includes(needle))));
     return results.slice(0,input.limit??30);
   }
   attachEvidence(input: CreateEvidenceSourceInput) {
@@ -453,20 +532,22 @@ export class SqliteVaultRepository implements VaultRepository {
   private projectFilesPath(projectId: string) { const project=this.getProject(projectId);return safeResolve(join(this.options.vaultRoot,"projects"),...project.storagePath.split("/")); }
   private contentPath(projectId: string, relativePath: string) { return safeResolve(this.projectFilesPath(projectId), ...relativePath.split("/")); }
   private readSearchableContent(document:DocumentFile){const path=this.contentPath(document.projectId,document.relativePath);if(!existsSync(path))return"";if(!SEARCHABLE_EXTENSIONS.has(extname(document.title).toLowerCase())||statSync(path).size>2_000_000)return"";return readFileSync(path,"utf8");}
   private uniqueProjectName(base: string, excludeId?: string) { return uniqueName(base, name => Boolean(this.db.prepare("SELECT 1 FROM projects WHERE lower(name)=lower(?) AND id<>?").get(name, excludeId ?? ""))); }
   private uniqueFolderName(projectId: string, parentId: string | null, base: string, excludeId?: string) { return uniqueName(base, name => Boolean(this.db.prepare("SELECT 1 FROM folders WHERE project_id=? AND parent_folder_id IS ? AND lower(name)=lower(?) AND id<>?").get(projectId, parentId, name, excludeId ?? ""))); }
   private uniqueDocumentTitle(projectId: string, parentId: string | null, base: string, excludeId?: string) { return uniqueFileName(base, name => Boolean(this.db.prepare("SELECT 1 FROM documents WHERE project_id=? AND parent_folder_id IS ? AND lower(title)=lower(?) AND id<>?").get(projectId, parentId, name, excludeId ?? ""))); }
 }
 
 const now = () => new Date().toISOString();
 const entityId = () => randomUUID().replace(/-/g, "");
+const compareText = (left:string,right:string) => left<right?-1:left>right?1:0;
+const compareCreatedThenId = <T extends {createdAt:string;id:string}>(left:T,right:T) => compareText(left.createdAt,right.createdAt)||compareText(left.id,right.id);
 const posixJoin = (...parts: string[]) => parts.filter(Boolean).join("/");
 const replacePrefix = (value: string, oldPrefix: string, newPrefix: string) => newPrefix + value.slice(oldPrefix.length);
 const uniqueName = (base: string, exists: (candidate: string) => boolean) => { if (!exists(base)) return base; for (let i = 2; i < 1000; i++) { const candidate = `${base} (${i})`; if (!exists(candidate)) return candidate; } throw duplicate("Too many duplicate names."); };
 const uniqueFileName = (base: string, exists: (candidate: string) => boolean) => { if (!exists(base)) return base; const extension = extname(base), stem = extension ? base.slice(0, -extension.length) : base; for (let i = 2; i < 1000; i++) { const candidate = `${stem} (${i})${extension}`; if (!exists(candidate)) return candidate; } throw duplicate("Too many duplicate files."); };
 const safeResolve = (root: string, ...segments: string[]) => { const absoluteRoot = resolve(root), target = resolve(absoluteRoot, ...segments); if (isAbsolute(segments.join(sep)) || (target !== absoluteRoot && !target.startsWith(absoluteRoot + sep))) throw new VaultDomainError("VALIDATION_ERROR", "Unsafe path rejected."); return target; };
 const atomicWrite = (path: string, content: string) => { mkdirSync(dirname(path), { recursive: true }); const temporary = `${path}.${randomUUID()}.tmp`; writeFileSync(temporary, content, "utf8"); renameSync(temporary, path); };
 const notFound = (entity: string) => new VaultDomainError("NOT_FOUND", `${entity} was not found.`);
 const duplicate = (message: string) => new VaultDomainError("DUPLICATE", message);
 const invalidMove = (message: string) => new VaultDomainError("INVALID_MOVE", message);
 const KNOWLEDGE_TYPES = ["fact","decision","goal","question","idea","preference"] as const;
diff --git a/tests/phase2-knowledge.test.ts b/tests/phase2-knowledge.test.ts
index e9749ef..31b8c4e 100644
--- a/tests/phase2-knowledge.test.ts
+++ b/tests/phase2-knowledge.test.ts
@@ -7,20 +7,201 @@ import { DatabaseSync } from "node:sqlite";
 import { VaultService } from "@orbit/vault-core";
 import { SqliteVaultRepository } from "@orbit/vault-storage";
 
 const fixture = () => {
   const root = mkdtempSync(join(tmpdir(), "orbit-vault-phase2-"));
   const service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root }));
   service.initialize();
   return { root, service, dispose: () => { service.close(); rmSync(root, { recursive: true, force: true }); } };
 };
 
+const mergeScenario = () => {
+  const ctx=fixture();
+  const project=ctx.service.projects.create({name:"Deterministic merge"});
+  const document=ctx.service.documents.createMarkdown({projectId:project.id,parentFolderId:null,title:"merge-source",content:"# Merge source\n\nCanonical evidence."});
+  const target=ctx.service.knowledge.create({projectId:project.id,type:"decision",title:"Canonical decision",body:"Keep this target text exactly.",confidence:"verified"});
+  const firstSource=ctx.service.knowledge.create({projectId:project.id,type:"fact",title:"First source text",body:"Never combine this body into the target.",confidence:"high"});
+  const secondSource=ctx.service.knowledge.create({projectId:project.id,type:"goal",title:"Second source text",body:"This body also stays separate.",confidence:"medium"});
+  const [sourceAlpha,sourceZulu]=[firstSource,secondSource].sort((left,right)=>left.id.localeCompare(right.id));
+  const firstEvidence=ctx.service.evidence.attach({projectId:project.id,knowledgeObjectId:sourceZulu.id,sourceType:"manual_note",sourceId:null,sourcePath:null,excerpt:"Later evidence",locator:"note-z",confidence:"high"});
+  const secondEvidence=ctx.service.evidence.attach({projectId:project.id,knowledgeObjectId:sourceAlpha.id,sourceType:"document",sourceId:document.id,sourcePath:document.relativePath,excerpt:"Earlier evidence",locator:"Merge source",confidence:"verified"});
+  const existingDuplicate=ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:target.id,targetType:"document",targetId:document.id,relationshipType:"references"});
+  const duplicateWinner=ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:sourceZulu.id,targetType:"document",targetId:document.id,relationshipType:"references"});
+  const duplicateLoser=ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:sourceAlpha.id,targetType:"document",targetId:document.id,relationshipType:"references"});
+  const incoming=ctx.service.relationships.create({projectId:project.id,sourceType:"document",sourceId:document.id,targetType:"knowledge",targetId:sourceZulu.id,relationshipType:"supports"});
+  const outgoing=ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:sourceAlpha.id,targetType:"project",targetId:project.id,relationshipType:"implements"});
+  const selfLink=ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:sourceZulu.id,targetType:"knowledge",targetId:target.id,relationshipType:"duplicates"});
+  const database=new DatabaseSync(join(ctx.root,"vault.db"));
+  const setRelationship=database.prepare("UPDATE relationships SET id=?, author=?, created_at=? WHERE id=?");
+  setRelationship.run("relationship_existing_001","user","2026-08-05T12:06:00.000Z",existingDuplicate.id);
+  setRelationship.run("relationship_duplicate_alpha","ai","2026-08-05T12:01:00.000Z",duplicateWinner.id);
+  setRelationship.run("relationship_duplicate_zulu","user","2026-08-05T12:01:00.000Z",duplicateLoser.id);
+  setRelationship.run("relationship_incoming_001","ai","2026-08-05T12:03:00.000Z",incoming.id);
+  setRelationship.run("relationship_outgoing_001","user","2026-08-05T12:04:00.000Z",outgoing.id);
+  setRelationship.run("relationship_self_001","ai","2026-08-05T12:02:00.000Z",selfLink.id);
+  database.prepare("UPDATE knowledge_evidence_links SET link_id=?, operation_id=?, created_at=? WHERE evidence_source_id=?").run("evidence_link_zulu_001","evidence_operation_zulu_001","2026-08-05T12:08:00.000Z",firstEvidence.id);
+  database.prepare("UPDATE knowledge_evidence_links SET link_id=?, operation_id=?, created_at=? WHERE evidence_source_id=?").run("evidence_link_alpha_001","evidence_operation_alpha_001","2026-08-05T12:07:00.000Z",secondEvidence.id);
+  database.prepare("INSERT INTO knowledge_evidence_links(link_id, knowledge_object_id, evidence_source_id, original_knowledge_object_id, operation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("evidence_link_existing_001",target.id,firstEvidence.id,target.id,"evidence_operation_existing_001","2026-08-05T12:08:00.000Z");
+  database.close();
+  return {ctx,project,document,target,sourceAlpha,sourceZulu,firstEvidence,secondEvidence};
+};
+
+const readMergeState = (root:string) => {
+  const database=new DatabaseSync(join(root,"vault.db"),{readOnly:true});
+  const rows=(sql:string)=>(database.prepare(sql).all() as Record<string,string|null>[]).map(row=>({...row}));
+  const state={
+    objects:rows("SELECT * FROM knowledge_objects ORDER BY id"),
+    evidenceSources:rows("SELECT * FROM evidence_sources ORDER BY id"),
+    evidenceLinks:rows("SELECT * FROM knowledge_evidence_links ORDER BY link_id"),
+    relationships:rows("SELECT * FROM relationships ORDER BY id"),
+    history:rows("SELECT * FROM knowledge_object_history ORDER BY knowledge_object_id, created_at, rowid"),
+  };
+  database.close(); return state;
+};
+
+test("merge preview is deterministic and reports transfers redirects and conflicts", () => {
+  const scenario=mergeScenario(); try {
+    const {service}=scenario.ctx;
+    const input={projectId:scenario.project.id,targetId:scenario.target.id,sourceIds:[scenario.sourceZulu.id,scenario.sourceAlpha.id],reason:" preview only "};
+    const preview=service.knowledge.previewMerge(input);
+    const reversed=service.knowledge.previewMerge({...input,sourceIds:[...input.sourceIds].reverse()});
+    assert.equal(JSON.stringify(preview),JSON.stringify(reversed));
+    assert.deepEqual(preview.target,scenario.target);
+    assert.deepEqual(preview.sources.map(item=>item.id),[scenario.sourceAlpha.id,scenario.sourceZulu.id]);
+    assert.deepEqual(preview.evidenceLinks,[
+      {id:"evidence_link_alpha_001",knowledgeObjectId:scenario.sourceAlpha.id,evidenceSourceId:scenario.secondEvidence.id,originalKnowledgeObjectId:scenario.sourceAlpha.id,operationId:"evidence_operation_alpha_001",createdAt:"2026-08-05T12:07:00.000Z"},
+    ]);
+    assert.deepEqual(preview.redirectedRelationships,[
+      {id:"relationship_duplicate_alpha",projectId:scenario.project.id,sourceType:"knowledge",sourceId:scenario.target.id,targetType:"document",targetId:scenario.document.id,relationshipType:"references",author:"ai",createdAt:"2026-08-05T12:01:00.000Z"},
+      {id:"relationship_duplicate_zulu",projectId:scenario.project.id,sourceType:"knowledge",sourceId:scenario.target.id,targetType:"document",targetId:scenario.document.id,relationshipType:"references",author:"user",createdAt:"2026-08-05T12:01:00.000Z"},
+      {id:"relationship_incoming_001",projectId:scenario.project.id,sourceType:"document",sourceId:scenario.document.id,targetType:"knowledge",targetId:scenario.target.id,relationshipType:"supports",author:"ai",createdAt:"2026-08-05T12:03:00.000Z"},
+      {id:"relationship_outgoing_001",projectId:scenario.project.id,sourceType:"knowledge",sourceId:scenario.target.id,targetType:"project",targetId:scenario.project.id,relationshipType:"implements",author:"user",createdAt:"2026-08-05T12:04:00.000Z"},
+      {id:"relationship_self_001",projectId:scenario.project.id,sourceType:"knowledge",sourceId:scenario.target.id,targetType:"knowledge",targetId:scenario.target.id,relationshipType:"duplicates",author:"ai",createdAt:"2026-08-05T12:02:00.000Z"},
+    ]);
+    assert.deepEqual(preview.conflicts,[
+      {relationshipId:"relationship_duplicate_zulu",resolution:"duplicate_collapsed",retainedRelationshipId:"relationship_duplicate_alpha"},
+      {relationshipId:"relationship_existing_001",resolution:"duplicate_collapsed",retainedRelationshipId:"relationship_duplicate_alpha"},
+      {relationshipId:"relationship_self_001",resolution:"self_link_removed",retainedRelationshipId:null},
+    ]);
+    assert.deepEqual(preview.blockingErrors,[]);
+    assert.equal(preview.target.title,"Canonical decision"); assert.equal(preview.target.body,"Keep this target text exactly.");
+    assert.equal("combinedTitle" in preview,false); assert.equal("combinedBody" in preview,false);
+  } finally { scenario.ctx.dispose(); }
+});
+
+test("merge preserves identity provenance metadata and grouped immutable history", () => {
+  const scenario=mergeScenario(); try {
+    const {service}=scenario.ctx;
+    const setup=new DatabaseSync(join(scenario.ctx.root,"vault.db"));
+    setup.prepare("UPDATE knowledge_objects SET updated_at=? WHERE id=?").run("2026-08-05T11:00:00.000Z",scenario.target.id);
+    setup.close();
+    const before=readMergeState(scenario.ctx.root);
+    const targetBefore=service.knowledge.list({projectId:scenario.project.id}).find(item=>item.id===scenario.target.id)!;
+    const result=service.knowledge.merge({projectId:scenario.project.id,targetId:scenario.target.id,sourceIds:[scenario.sourceZulu.id,scenario.sourceAlpha.id],reason:" consolidate evidence "});
+    assert.match(result.operationId,/^[a-f0-9]{32}$/); assert.notEqual(result.operationId,"");
+    assert.deepEqual({...result.target,updatedAt:targetBefore.updatedAt},targetBefore); assert.notEqual(result.target.updatedAt,targetBefore.updatedAt);
+    assert.deepEqual(result.supersededSources.map(item=>item.id),[scenario.sourceAlpha.id,scenario.sourceZulu.id]);
+    assert.deepEqual(result.supersededSources.map(item=>[item.status,item.supersededById]),[["superseded",scenario.target.id],["superseded",scenario.target.id]]);
+    assert.equal(result.transferredEvidenceCount,1); assert.equal(result.redirectedRelationshipCount,3);
+    assert.deepEqual(result.conflicts,[
+      {relationshipId:"relationship_duplicate_zulu",resolution:"duplicate_collapsed",retainedRelationshipId:"relationship_duplicate_alpha"},
+      {relationshipId:"relationship_existing_001",resolution:"duplicate_collapsed",retainedRelationshipId:"relationship_duplicate_alpha"},
+      {relationshipId:"relationship_self_001",resolution:"self_link_removed",retainedRelationshipId:null},
+    ]);
+    const after=readMergeState(scenario.ctx.root);
+    assert.deepEqual(after.evidenceSources,before.evidenceSources);
+    assert.deepEqual(after.evidenceLinks,[
+      {link_id:"evidence_link_alpha_001",knowledge_object_id:scenario.target.id,evidence_source_id:scenario.secondEvidence.id,original_knowledge_object_id:scenario.sourceAlpha.id,operation_id:"evidence_operation_alpha_001",created_at:"2026-08-05T12:07:00.000Z"},
+      {link_id:"evidence_link_existing_001",knowledge_object_id:scenario.target.id,evidence_source_id:scenario.firstEvidence.id,original_knowledge_object_id:scenario.target.id,operation_id:"evidence_operation_existing_001",created_at:"2026-08-05T12:08:00.000Z"},
+    ]);
+    assert.deepEqual(after.relationships,[
+      {id:"relationship_duplicate_alpha",project_id:scenario.project.id,source_type:"knowledge",source_id:scenario.target.id,target_type:"document",target_id:scenario.document.id,relationship_type:"references",author:"ai",created_at:"2026-08-05T12:01:00.000Z"},
+      {id:"relationship_incoming_001",project_id:scenario.project.id,source_type:"document",source_id:scenario.document.id,target_type:"knowledge",target_id:scenario.target.id,relationship_type:"supports",author:"ai",created_at:"2026-08-05T12:03:00.000Z"},
+      {id:"relationship_outgoing_001",project_id:scenario.project.id,source_type:"knowledge",source_id:scenario.target.id,target_type:"project",target_id:scenario.project.id,relationship_type:"implements",author:"user",created_at:"2026-08-05T12:04:00.000Z"},
+    ]);
+    assert.equal(service.knowledge.list({projectId:scenario.project.id}).some(item=>item.id===scenario.sourceAlpha.id||item.id===scenario.sourceZulu.id),false);
+    assert.deepEqual(service.knowledge.list({projectId:scenario.project.id,status:"superseded"}).map(item=>item.id).sort(),[scenario.sourceAlpha.id,scenario.sourceZulu.id]);
+    assert.equal(service.knowledge.search({projectId:scenario.project.id,query:"never combine"}).length,0);
+    assert.equal(service.search({projectId:scenario.project.id,query:"second source text"}).length,0);
+    const snapshot=service.snapshot();
+    assert.equal(snapshot.knowledgeObjects.some(item=>item.id===scenario.sourceAlpha.id||item.id===scenario.sourceZulu.id),false);
+    assert.equal(snapshot.atlasNodes.some(item=>item.id===scenario.sourceAlpha.id||item.id===scenario.sourceZulu.id),false);
+    const histories=[scenario.target.id,scenario.sourceAlpha.id,scenario.sourceZulu.id].map(id=>service.knowledge.history(id)[0]!);
+    assert.deepEqual(histories.map(history=>history.eventType),["merged","merged","merged"]);
+    assert.deepEqual(histories.map(history=>history.operationId),[result.operationId,result.operationId,result.operationId]);
+    for(const history of histories){assert.equal(history.actorType,"user");assert.equal(history.actorId,null);assert.equal(history.reason,"consolidate evidence");assert.ok(history.beforeSnapshot);assert.ok(history.afterSnapshot);}
+    const [targetHistory,alphaHistory,zuluHistory]=histories;
+    assert.deepEqual(targetHistory.beforeSnapshot?.object,targetBefore);
+    assert.deepEqual(targetHistory.beforeSnapshot?.evidenceLinks.map(link=>link.id),["evidence_link_existing_001"]);
+    assert.deepEqual(targetHistory.afterSnapshot?.evidenceLinks.map(link=>link.id),["evidence_link_alpha_001","evidence_link_existing_001"]);
+    assert.deepEqual(targetHistory.afterSnapshot?.outgoingRelationships.map(relationship=>relationship.id),["relationship_duplicate_alpha","relationship_outgoing_001"]);
+    assert.deepEqual(targetHistory.afterSnapshot?.incomingRelationships.map(relationship=>relationship.id),["relationship_incoming_001"]);
+    assert.deepEqual(alphaHistory.beforeSnapshot?.evidenceLinks.map(link=>link.id),["evidence_link_alpha_001"]);
+    assert.deepEqual(zuluHistory.beforeSnapshot?.evidenceLinks.map(link=>link.id),["evidence_link_zulu_001"]);
+    for(const history of [alphaHistory,zuluHistory]){assert.equal(history.afterSnapshot?.object.status,"superseded");assert.equal(history.afterSnapshot?.object.supersededById,scenario.target.id);assert.deepEqual(history.afterSnapshot?.evidenceLinks,[]);assert.deepEqual(history.afterSnapshot?.incomingRelationships,[]);assert.deepEqual(history.afterSnapshot?.outgoingRelationships,[]);}
+    const canonicalBeforeRestart=readMergeState(scenario.ctx.root); const historiesBeforeRestart=[scenario.target.id,scenario.sourceAlpha.id,scenario.sourceZulu.id].map(id=>service.knowledge.history(id));
+    service.close(); service.initialize();
+    assert.deepEqual(readMergeState(scenario.ctx.root),canonicalBeforeRestart);
+    assert.deepEqual([scenario.target.id,scenario.sourceAlpha.id,scenario.sourceZulu.id].map(id=>service.knowledge.history(id)),historiesBeforeRestart);
+  } finally { scenario.ctx.dispose(); }
+});
+
+test("merge rejects invalid stale and cross-project plans", () => {
+  const ctx=fixture(); try {
+    const first=ctx.service.projects.create({name:"Merge validation"}),second=ctx.service.projects.create({name:"Foreign merge"});
+    const target=ctx.service.knowledge.create({projectId:first.id,type:"decision",title:"Target",body:"Canonical target.",confidence:"high"});
+    const source=ctx.service.knowledge.create({projectId:first.id,type:"fact",title:"Source",body:"Local source.",confidence:"medium"});
+    const otherSource=ctx.service.knowledge.create({projectId:second.id,type:"fact",title:"Foreign",body:"Foreign source.",confidence:"low"});
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:first.id,targetId:target.id,sourceIds:[]}),/at least one source/i);
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:first.id,targetId:target.id,sourceIds:[source.id,source.id]}),/unique/i);
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:first.id,targetId:target.id,sourceIds:[target.id]}),/cannot also be a source/i);
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:first.id,targetId:target.id,sourceIds:[otherSource.id]}),/specified project/i);
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:"bad",targetId:target.id,sourceIds:[source.id]}),/Invalid identifier/);
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:first.id,targetId:"bad",sourceIds:[source.id]}),/Invalid identifier/);
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:first.id,targetId:target.id,sourceIds:["bad"]}),/Invalid identifier/);
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:second.id,targetId:target.id,sourceIds:[otherSource.id]}),/specified project/i);
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:first.id,targetId:"missing_target_001",sourceIds:[source.id]}),/not found/i);
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:first.id,targetId:target.id,sourceIds:["missing_source_001"]}),/not found/i);
+    assert.throws(()=>ctx.service.knowledge.previewMerge({projectId:first.id,targetId:target.id,sourceIds:[source.id],reason:"x".repeat(501)}),/500/);
+    const cleanPreview=ctx.service.knowledge.previewMerge({projectId:first.id,targetId:target.id,sourceIds:[source.id]}); assert.deepEqual(cleanPreview.blockingErrors,[]);
+    ctx.service.knowledge.archive(source.id);
+    const stalePreview=ctx.service.knowledge.previewMerge({projectId:first.id,targetId:target.id,sourceIds:[source.id]});
+    assert.deepEqual(stalePreview.blockingErrors,[`Source Knowledge Object ${source.id} must be draft or approved.`]);
+    assert.throws(()=>ctx.service.knowledge.merge({projectId:first.id,targetId:target.id,sourceIds:[source.id]}),/blocking|draft or approved/i);
+    const archivedTarget=ctx.service.knowledge.create({projectId:first.id,type:"goal",title:"Archived target",body:"Cannot receive a merge.",confidence:"medium"}); ctx.service.knowledge.archive(archivedTarget.id);
+    assert.deepEqual(ctx.service.knowledge.previewMerge({projectId:first.id,targetId:archivedTarget.id,sourceIds:[target.id]}).blockingErrors,[`Target Knowledge Object ${archivedTarget.id} must be draft or approved.`]);
+    assert.throws(()=>ctx.service.knowledge.merge({projectId:first.id,targetId:archivedTarget.id,sourceIds:[target.id]}),/blocking|draft or approved/i);
+    const supersededSource=ctx.service.knowledge.create({projectId:first.id,type:"idea",title:"Superseded source",body:"Already replaced.",confidence:"low"}); ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:supersededSource.id,supersededById:target.id});
+    assert.deepEqual(ctx.service.knowledge.previewMerge({projectId:first.id,targetId:target.id,sourceIds:[supersededSource.id]}).blockingErrors,[`Source Knowledge Object ${supersededSource.id} must be draft or approved.`]);
+    assert.throws(()=>ctx.service.knowledge.merge({projectId:first.id,targetId:target.id,sourceIds:[supersededSource.id]}),/blocking|draft or approved/i);
+    const supersededTarget=ctx.service.knowledge.create({projectId:first.id,type:"question",title:"Superseded target",body:"Cannot be canonical.",confidence:"low"}); ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:supersededTarget.id,supersededById:target.id});
+    assert.deepEqual(ctx.service.knowledge.previewMerge({projectId:first.id,targetId:supersededTarget.id,sourceIds:[target.id]}).blockingErrors,[`Target Knowledge Object ${supersededTarget.id} must be draft or approved.`]);
+    assert.throws(()=>ctx.service.knowledge.merge({projectId:first.id,targetId:supersededTarget.id,sourceIds:[target.id]}),/blocking|draft or approved/i);
+    assert.throws(()=>ctx.service.knowledge.merge({projectId:first.id,targetId:target.id,sourceIds:[otherSource.id]}),/specified project/i);
+    assert.throws(()=>ctx.service.knowledge.merge({projectId:first.id,targetId:target.id,sourceIds:[target.id],reason:"x".repeat(501)}),/500/);
+  } finally { ctx.dispose(); }
+});
+
+test("merge rolls back every record when a mid-merge write fails", () => {
+  const scenario=mergeScenario(); try {
+    const before=readMergeState(scenario.ctx.root);
+    const trigger=new DatabaseSync(join(scenario.ctx.root,"vault.db"));
+    trigger.exec(`CREATE TRIGGER force_merge_rollback BEFORE UPDATE OF status ON knowledge_objects WHEN OLD.id='${scenario.sourceZulu.id}' AND NEW.status='superseded' BEGIN SELECT RAISE(ABORT, 'forced merge failure'); END;`); trigger.close();
+    assert.throws(()=>scenario.ctx.service.knowledge.merge({projectId:scenario.project.id,targetId:scenario.target.id,sourceIds:[scenario.sourceZulu.id,scenario.sourceAlpha.id],reason:"must roll back"}),/forced merge failure/);
+    const cleanup=new DatabaseSync(join(scenario.ctx.root,"vault.db")); cleanup.exec("DROP TRIGGER force_merge_rollback;"); cleanup.close();
+    assert.deepEqual(readMergeState(scenario.ctx.root),before);
+  } finally {
+    const cleanup=new DatabaseSync(join(scenario.ctx.root,"vault.db")); cleanup.exec("DROP TRIGGER IF EXISTS force_merge_rollback;"); cleanup.close();
+    scenario.ctx.dispose();
+  }
+});
+
 test("migration preserves canonical evidence and creates one honest baseline", () => {
   const root = mkdtempSync(join(tmpdir(), "orbit-vault-migration-"));
   const projectId = "project_legacy_001", folderId = "folder_legacy_001", documentId = "document_legacy_001", knowledgeId = "knowledge_target_001";
   const createdAt = "2026-08-01T10:00:00.000Z", updatedAt = "2026-08-01T10:10:00.000Z";
   const targetObject = { id: knowledgeId, projectId, parentFolderId: folderId, type: "decision", title: "Target decision", body: "Preserve every aggregate field.", status: "approved", confidence: "verified", author: "user", supersededById: null, createdAt, updatedAt };
   const alphaObject = { id: "knowledge_alpha_001", projectId, parentFolderId: null, type: "fact", title: "Alpha fact", body: "A second baseline is required.", status: "draft", confidence: "medium", author: "ai", supersededById: null, createdAt: "2026-08-01T10:02:00.000Z", updatedAt: "2026-08-01T10:12:00.000Z" };
   const zebraObject = { id: "knowledge_zebra_001", projectId, parentFolderId: folderId, type: "goal", title: "Zebra goal", body: "A third baseline is required.", status: "archived", confidence: "low", author: "user", supersededById: null, createdAt: "2026-08-01T10:01:00.000Z", updatedAt: "2026-08-01T10:11:00.000Z" };
   const targetEvidence = [
     { id: "evidence_zulu_001", projectId, sourceType: "url", sourceId: "source_zulu_001", sourcePath: "https://example.test/zulu", excerpt: "Zulu provenance.", locator: "section-z", confidence: "verified", availability: "available", createdAt: "2026-08-01T10:20:00.000Z" },
     { id: "evidence_alpha_001", projectId, sourceType: "manual_note", sourceId: null, sourcePath: null, excerpt: null, locator: "note-a", confidence: "low", availability: "missing", createdAt: "2026-08-01T10:15:00.000Z" },
```
