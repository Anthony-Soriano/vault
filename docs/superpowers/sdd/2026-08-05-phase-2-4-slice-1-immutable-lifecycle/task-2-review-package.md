# Task 2 review package
## Commits
```
6859991 feat: normalize evidence links and add history schema
```
## Stat
```
 packages/vault-core/src/index.ts    |  3 +-
 packages/vault-storage/src/index.ts | 99 ++++++++++++++++++++++++++++++++-----
 packages/vault-types/src/index.ts   |  4 +-
 tests/phase2-knowledge.test.ts      | 49 ++++++++++++++++++
 4 files changed, 140 insertions(+), 15 deletions(-)
```
## Diff
```diff
diff --git a/packages/vault-core/src/index.ts b/packages/vault-core/src/index.ts
index ac01a1e..ec0c546 100644
--- a/packages/vault-core/src/index.ts
+++ b/packages/vault-core/src/index.ts
@@ -1,13 +1,13 @@
 import type {
   CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, ImportFilesInput,
-  EvidenceSource, Folder, KnowledgeFilters, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters,
+  EvidenceSource, Folder, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters,
   ReconciliationReport, Relationship, RelationshipFilters, SearchInput, SearchResult, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot,
 } from "@orbit/vault-types";
 
 export class VaultDomainError extends Error {
   readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE" | "INVALID_MOVE";
   readonly field?: string;
   constructor(code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE" | "INVALID_MOVE", message: string, field?: string) {
     super(message); this.code = code; this.field = field;
     this.name = "VaultDomainError";
   }
@@ -63,20 +63,21 @@ export interface KnowledgeRepository {
   createKnowledgeObject(input: CreateKnowledgeObjectInput): KnowledgeObject;
   getKnowledgeObject(id: string): KnowledgeObject;
   listKnowledgeObjects(filters: KnowledgeFilters): KnowledgeObject[];
   updateKnowledgeObject(id: string, changes: UpdateKnowledgeObjectInput): KnowledgeObject;
   setKnowledgeStatus(id: string, status: KnowledgeStatus): KnowledgeObject;
   searchKnowledge(input: KnowledgeSearchInput): KnowledgeObject[];
 }
 export interface EvidenceRepository {
   attachEvidence(input: CreateEvidenceSourceInput): EvidenceSource;
   listEvidence(knowledgeObjectId: string): EvidenceSource[];
+  listEvidenceLinks(knowledgeObjectId: string): KnowledgeEvidenceLink[];
 }
 export interface RelationshipRepository {
   createRelationship(input: CreateRelationshipInput): Relationship;
   listRelationships(filters: RelationshipFilters): Relationship[];
   removeRelationship(id: string): { id: string };
 }
 export interface VaultRepository extends ProjectRepository, FolderRepository, DocumentRepository, KnowledgeRepository, EvidenceRepository, RelationshipRepository {
   initialize(): void;
   close(): void;
   snapshot(): VaultSnapshot;
diff --git a/packages/vault-storage/src/index.ts b/packages/vault-storage/src/index.ts
index a483174..2c3ceb3 100644
--- a/packages/vault-storage/src/index.ts
+++ b/packages/vault-storage/src/index.ts
@@ -1,23 +1,24 @@
 import { DatabaseSync } from "node:sqlite";
 import { randomUUID } from "node:crypto";
 import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
 import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
-import type { CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, EvidenceSource, Folder, ImportFilesInput, KnowledgeConfidence, KnowledgeFilters, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters, ReconciliationReport, Relationship, RelationshipEndpointType, RelationshipFilters, RelationshipType, SearchInput, SearchResult, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot } from "@orbit/vault-types";
+import type { CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, EvidenceSource, Folder, ImportFilesInput, KnowledgeConfidence, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters, ReconciliationReport, Relationship, RelationshipEndpointType, RelationshipFilters, RelationshipType, SearchInput, SearchResult, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot } from "@orbit/vault-types";
 import { VaultDomainError, type VaultRepository } from "@orbit/vault-core";
 
 type StorageOptions = { vaultRoot: string; developmentMode: boolean; developmentRoot: string };
 type DbRow = Record<string, string | null>;
+type Migration = { version: number; sql?: string; run?: (db: DatabaseSync) => void };
 
 const safeLinkedKind=(path:string,allowedRoot:string):"directory"|"file"|null=>{try{const resolved=realpathSync.native(path),within=relative(realpathSync.native(allowedRoot),resolved);if(within.startsWith(`..${sep}`)||within===".."||isAbsolute(within))return null;const stats=statSync(path);return stats.isDirectory()?"directory":stats.isFile()?"file":null;}catch{return null;}};
 
-const MIGRATIONS = [{
+const MIGRATIONS: Migration[] = [{
   version: 1,
   sql: `
     CREATE TABLE IF NOT EXISTS projects (
       id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT,
       status TEXT NOT NULL CHECK(status IN ('active','archived','trashed')),
       created_at TEXT NOT NULL, updated_at TEXT NOT NULL
     );
     CREATE TABLE IF NOT EXISTS folders (
       id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), parent_folder_id TEXT REFERENCES folders(id),
       name TEXT NOT NULL, relative_path TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','archived','trashed')),
@@ -89,37 +90,105 @@ const MIGRATIONS = [{
     ALTER TABLE knowledge_objects ADD COLUMN parent_folder_id TEXT REFERENCES folders(id);
     CREATE INDEX IF NOT EXISTS knowledge_parent_folder_idx ON knowledge_objects(parent_folder_id);
   `,
 }, {
   version: 5,
   sql: `
     ALTER TABLE projects ADD COLUMN storage_path TEXT;
     UPDATE projects SET storage_path=id || '/files' WHERE storage_path IS NULL;
     CREATE UNIQUE INDEX IF NOT EXISTS projects_storage_path_idx ON projects(storage_path);
   `,
+}, {
+  version: 6,
+  run: migrateEvidenceLinks,
 }];
 
+function migrateEvidenceLinks(db: DatabaseSync) {
+  db.exec(`
+    ALTER TABLE knowledge_objects ADD COLUMN superseded_by_id TEXT;
+    CREATE INDEX knowledge_superseded_by_idx ON knowledge_objects(superseded_by_id);
+    ALTER TABLE evidence_sources RENAME TO evidence_sources_legacy;
+    DROP INDEX IF EXISTS evidence_knowledge_idx;
+    DROP INDEX IF EXISTS evidence_source_idx;
+    CREATE TABLE evidence_sources (
+      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
+      source_type TEXT NOT NULL CHECK(source_type IN ('document','file','url','conversation','image','pdf','manual_note')),
+      source_id TEXT, source_path TEXT, excerpt TEXT, locator TEXT,
+      confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high','verified')),
+      availability TEXT NOT NULL CHECK(availability IN ('available','missing')),
+      created_at TEXT NOT NULL
+    );
+    CREATE INDEX evidence_source_idx ON evidence_sources(source_type, source_id);
+    CREATE TABLE knowledge_evidence_links (
+      link_id TEXT PRIMARY KEY,
+      knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id),
+      evidence_source_id TEXT NOT NULL REFERENCES evidence_sources(id),
+      original_knowledge_object_id TEXT NOT NULL,
+      operation_id TEXT NOT NULL,
+      created_at TEXT NOT NULL,
+      UNIQUE(knowledge_object_id, evidence_source_id)
+    );
+    CREATE INDEX knowledge_evidence_links_knowledge_idx ON knowledge_evidence_links(knowledge_object_id);
+    CREATE INDEX knowledge_evidence_links_evidence_idx ON knowledge_evidence_links(evidence_source_id);
+  `);
+  const legacyEvidence = db.prepare("SELECT * FROM evidence_sources_legacy ORDER BY id").all() as DbRow[];
+  const insertEvidence = db.prepare("INSERT INTO evidence_sources(id, project_id, source_type, source_id, source_path, excerpt, locator, confidence, availability, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
+  const insertLink = db.prepare("INSERT INTO knowledge_evidence_links(link_id, knowledge_object_id, evidence_source_id, original_knowledge_object_id, operation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)");
+  for (const evidence of legacyEvidence) {
+    insertEvidence.run(evidence.id, evidence.project_id, evidence.source_type, evidence.source_id, evidence.source_path, evidence.excerpt, evidence.locator, evidence.confidence, evidence.availability, evidence.created_at);
+    insertLink.run(entityId(), evidence.knowledge_object_id, evidence.id, evidence.knowledge_object_id, `migration6-link-${evidence.id}`, evidence.created_at);
+  }
+  db.exec(`
+    CREATE TABLE knowledge_object_history (
+      history_id TEXT PRIMARY KEY,
+      knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id),
+      operation_id TEXT NOT NULL,
+      event_type TEXT NOT NULL,
+      before_snapshot TEXT,
+      after_snapshot TEXT,
+      actor_type TEXT NOT NULL CHECK(actor_type IN ('user','system','ai')),
+      actor_id TEXT,
+      reason TEXT,
+      created_at TEXT NOT NULL
+    );
+    CREATE INDEX knowledge_object_history_knowledge_idx ON knowledge_object_history(knowledge_object_id);
+    CREATE INDEX knowledge_object_history_operation_idx ON knowledge_object_history(operation_id);
+    CREATE INDEX knowledge_object_history_created_at_idx ON knowledge_object_history(created_at);
+  `);
+  const insertHistory = db.prepare("INSERT INTO knowledge_object_history(history_id, knowledge_object_id, operation_id, event_type, before_snapshot, after_snapshot, actor_type, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
+  const knowledgeObjects = db.prepare("SELECT * FROM knowledge_objects ORDER BY id").all() as DbRow[];
+  for (const object of knowledgeObjects) {
+    const evidenceLinks = (db.prepare("SELECT * FROM knowledge_evidence_links WHERE knowledge_object_id=? ORDER BY created_at, link_id").all(object.id) as DbRow[]).map(mapKnowledgeEvidenceLink);
+    const incomingRelationships = (db.prepare("SELECT * FROM relationships WHERE target_type='knowledge' AND target_id=? ORDER BY created_at, id").all(object.id) as DbRow[]).map(mapRelationship);
+    const outgoingRelationships = (db.prepare("SELECT * FROM relationships WHERE source_type='knowledge' AND source_id=? ORDER BY created_at, id").all(object.id) as DbRow[]).map(mapRelationship);
+    const afterSnapshot = JSON.stringify({ schemaVersion: 1, object: mapKnowledgeObject(object), evidenceLinks, incomingRelationships, outgoingRelationships });
+    insertHistory.run(entityId(), object.id, `migration6-baseline-${object.id}`, "baseline_migrated", null, afterSnapshot, "system", null, "Immutable tracking began at migration 6; earlier edits cannot be reconstructed.", now());
+  }
+  db.exec("DROP TABLE evidence_sources_legacy;");
+}
+
 export class SqliteVaultRepository implements VaultRepository {
   private database: DatabaseSync | null = null;
   readonly kind = "sqlite-filesystem";
   private readonly options: StorageOptions;
   constructor(options: StorageOptions) { this.options = options; }
 
   initialize() {
     mkdirSync(this.options.vaultRoot, { recursive: true });
     mkdirSync(join(this.options.vaultRoot, "projects"), { recursive: true });
     mkdirSync(join(this.options.vaultRoot, "backups"), { recursive: true });
     this.database = new DatabaseSync(join(this.options.vaultRoot, "vault.db"));
     this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);");
     const applied = new Set((this.db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map(row => row.version));
     for (const migration of MIGRATIONS) if (!applied.has(migration.version)) this.transaction(() => {
-      this.db.exec(migration.sql);
+      if (migration.sql) this.db.exec(migration.sql);
+      migration.run?.(this.db);
       this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(migration.version, now());
     });
   }
   close() { this.database?.close(); this.database = null; }
   private get db() { if (!this.database) throw new Error("Vault database is not initialized"); return this.database; }
   private transaction<T>(operation: () => T): T { this.db.exec("BEGIN IMMEDIATE"); try { const value = operation(); this.db.exec("COMMIT"); return value; } catch (error) { this.db.exec("ROLLBACK"); throw error; } }
 
   createProject(input: CreateProjectInput) {
     const name = this.uniqueProjectName(input.name), id = entityId(), timestamp = now(), storagePath=`${id}/files`;
     const project: Project = { id, name, storagePath, description: input.description ?? null, icon: input.icon ?? null, color: input.color ?? null, status: "active", createdAt: timestamp, updatedAt: timestamp };
@@ -256,25 +325,29 @@ export class SqliteVaultRepository implements VaultRepository {
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
-    const id=entityId(), timestamp=now();
-    this.db.prepare("INSERT INTO evidence_sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)").run(id,input.projectId,input.knowledgeObjectId,input.sourceType,input.sourceId,input.sourcePath,input.excerpt,input.locator,input.confidence,timestamp);
-    return this.listEvidence(input.knowledgeObjectId).find(item=>item.id===id)!;
+    return this.transaction(() => {
+      const id=entityId(), linkId=entityId(), operationId=entityId(), timestamp=now();
+      this.db.prepare("INSERT INTO evidence_sources(id, project_id, source_type, source_id, source_path, excerpt, locator, confidence, availability, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)").run(id,input.projectId,input.sourceType,input.sourceId,input.sourcePath,input.excerpt,input.locator,input.confidence,timestamp);
+      this.db.prepare("INSERT INTO knowledge_evidence_links(link_id, knowledge_object_id, evidence_source_id, original_knowledge_object_id, operation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(linkId,input.knowledgeObjectId,id,input.knowledgeObjectId,operationId,timestamp);
+      return this.withEvidenceAvailability(mapEvidenceSource(this.db.prepare("SELECT * FROM evidence_sources WHERE id=?").get(id) as DbRow));
+    });
   }
-  listEvidence(knowledgeObjectId: string) { this.getKnowledgeObject(knowledgeObjectId); return (this.db.prepare("SELECT * FROM evidence_sources WHERE knowledge_object_id=? ORDER BY created_at DESC").all(knowledgeObjectId) as DbRow[]).map(mapEvidenceSource).map(item=>this.withEvidenceAvailability(item)); }
+  listEvidence(knowledgeObjectId: string) { this.getKnowledgeObject(knowledgeObjectId); return (this.db.prepare("SELECT evidence_sources.* FROM evidence_sources JOIN knowledge_evidence_links ON knowledge_evidence_links.evidence_source_id=evidence_sources.id WHERE knowledge_evidence_links.knowledge_object_id=? ORDER BY evidence_sources.created_at DESC").all(knowledgeObjectId) as DbRow[]).map(mapEvidenceSource).map(item=>this.withEvidenceAvailability(item)); }
+  listEvidenceLinks(knowledgeObjectId: string) { this.getKnowledgeObject(knowledgeObjectId); return (this.db.prepare("SELECT * FROM knowledge_evidence_links WHERE knowledge_object_id=? ORDER BY created_at DESC, link_id DESC").all(knowledgeObjectId) as DbRow[]).map(mapKnowledgeEvidenceLink); }
   private withEvidenceAvailability(evidence:EvidenceSource):EvidenceSource{if((evidence.sourceType==="document"||evidence.sourceType==="file")&&evidence.sourceId){try{return{...evidence,availability:this.getDocument(evidence.sourceId).availability};}catch{return{...evidence,availability:"missing"};}}return evidence;}
   createRelationship(input:CreateRelationshipInput){
     assertOneOf(input.sourceType,RELATIONSHIP_ENDPOINT_TYPES,"relationship source type");assertOneOf(input.targetType,RELATIONSHIP_ENDPOINT_TYPES,"relationship target type");assertOneOf(input.relationshipType,RELATIONSHIP_TYPES,"relationship type");
     if(input.sourceType===input.targetType&&input.sourceId===input.targetId)throw new VaultDomainError("VALIDATION_ERROR","An entity cannot relate to itself.");
     const sourceProject=this.entityProjectId(input.sourceType,input.sourceId),targetProject=this.entityProjectId(input.targetType,input.targetId);
     if(sourceProject!==input.projectId||targetProject!==input.projectId)throw invalidMove("Relationships cannot cross project boundaries.");
     const existing=this.db.prepare("SELECT 1 FROM relationships WHERE project_id=? AND source_type=? AND source_id=? AND target_type=? AND target_id=? AND relationship_type=?").get(input.projectId,input.sourceType,input.sourceId,input.targetType,input.targetId,input.relationshipType);
     if(existing)throw duplicate("That relationship already exists.");
     const id=entityId();this.db.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?)").run(id,input.projectId,input.sourceType,input.sourceId,input.targetType,input.targetId,input.relationshipType,now());
     return mapRelationship(this.db.prepare("SELECT * FROM relationships WHERE id=?").get(id) as DbRow);
@@ -284,23 +357,26 @@ export class SqliteVaultRepository implements VaultRepository {
   private entityProjectId(type:RelationshipEndpointType,id:string){if(type==="project")return this.getProject(id).id;if(type==="folder")return this.getFolder(id).projectId;if(type==="document")return this.getDocument(id).projectId;return this.getKnowledgeObject(id).projectId;}
 
   snapshot(): VaultSnapshot {
     const projects = this.listProjects({ status: "active" });
     const projectIds = new Set(projects.map(project => project.id));
     const folders = (this.db.prepare("SELECT * FROM folders WHERE status='active' ORDER BY relative_path").all() as DbRow[]).map(mapFolder).filter(folder => projectIds.has(folder.projectId));
     const folderIds = new Set(folders.map(folder => folder.id));
     const documents = (this.db.prepare("SELECT * FROM documents WHERE status='active' ORDER BY relative_path").all() as DbRow[]).map(mapDocument).map(item=>this.withAvailability(item)).filter(document => projectIds.has(document.projectId) && (!document.parentFolderId || folderIds.has(document.parentFolderId)));
     const knowledgeObjects=(this.db.prepare("SELECT * FROM knowledge_objects WHERE status<>'archived' ORDER BY updated_at DESC").all() as DbRow[]).map(mapKnowledgeObject).filter(item=>projectIds.has(item.projectId));
     const knowledgeIds=new Set(knowledgeObjects.map(item=>item.id));
-    const evidenceSources=(this.db.prepare("SELECT * FROM evidence_sources ORDER BY created_at DESC").all() as DbRow[]).map(mapEvidenceSource).map(item=>this.withEvidenceAvailability(item)).filter(item=>knowledgeIds.has(item.knowledgeObjectId));
+    const evidenceLinks=(this.db.prepare("SELECT * FROM knowledge_evidence_links ORDER BY created_at DESC, link_id DESC").all() as DbRow[]).map(mapKnowledgeEvidenceLink).filter(link=>knowledgeIds.has(link.knowledgeObjectId));
+    const evidenceIds=new Set(evidenceLinks.map(link=>link.evidenceSourceId));
+    const evidenceSources=(this.db.prepare("SELECT * FROM evidence_sources ORDER BY created_at DESC").all() as DbRow[]).map(mapEvidenceSource).map(item=>this.withEvidenceAvailability(item)).filter(item=>evidenceIds.has(item.id));
     const relationships=(this.db.prepare("SELECT * FROM relationships ORDER BY created_at DESC").all() as DbRow[]).map(mapRelationship).filter(item=>projectIds.has(item.projectId));
-    const firstDocumentEvidence=new Map<string,string>(); for(const evidence of evidenceSources)if(evidence.sourceType==="document"&&evidence.sourceId&&!firstDocumentEvidence.has(evidence.knowledgeObjectId)&&documents.some(item=>item.id===evidence.sourceId))firstDocumentEvidence.set(evidence.knowledgeObjectId,evidence.sourceId);
+    const evidenceById=new Map(evidenceSources.map(evidence=>[evidence.id,evidence]));
+    const firstDocumentEvidence=new Map<string,string>(); for(const link of evidenceLinks){const evidence=evidenceById.get(link.evidenceSourceId);if(evidence?.sourceType==="document"&&evidence.sourceId&&!firstDocumentEvidence.has(link.knowledgeObjectId)&&documents.some(item=>item.id===evidence.sourceId))firstDocumentEvidence.set(link.knowledgeObjectId,evidence.sourceId);}
     const atlasNodes = [
       { id: "vault-root", name: basename(this.options.vaultRoot), type: "vault" as const, parentId: null, projectId: null, path: this.options.vaultRoot },
       ...projects.map(project => ({ id: project.id, name: project.name, type: "project" as const, parentId: "vault-root", projectId: project.id, path: project.name })),
       ...folders.map(folder => ({ id: folder.id, name: folder.name, type: "folder" as const, parentId: folder.parentFolderId ?? folder.projectId, projectId: folder.projectId, path: folder.relativePath })),
       ...documents.map(document => ({ id: document.id, name: document.title, type: "file" as const, parentId: document.parentFolderId ?? document.projectId, projectId: document.projectId, path: document.relativePath })),
       ...knowledgeObjects.map(item => ({ id: item.id, name: item.title, type: "knowledge" as const, parentId: (item.parentFolderId&&folderIds.has(item.parentFolderId)?item.parentFolderId:null)??firstDocumentEvidence.get(item.id)??item.projectId, projectId: item.projectId, path: `${item.parentFolderId?snapshotFolderPath(folders,item.parentFolderId)+" / ":"Knowledge / "}${item.type} / ${item.title}` })),
     ];
     return { vaultName: basename(this.options.vaultRoot), projects, folders, documents, knowledgeObjects, evidenceSources, relationships, atlasNodes };
   }
   search(input: SearchInput): SearchResult[] {
@@ -372,20 +448,21 @@ const invalidMove = (message: string) => new VaultDomainError("INVALID_MOVE", me
 const KNOWLEDGE_TYPES = ["fact","decision","goal","question","idea","preference"] as const;
 const KNOWLEDGE_STATUSES = ["draft","approved","superseded","archived"] as const;
 const CONFIDENCE_LEVELS = ["low","medium","high","verified"] as const;
 const EVIDENCE_TYPES = ["document","file","url","conversation","image","pdf","manual_note"] as const;
 const RELATIONSHIP_ENDPOINT_TYPES = ["project","folder","document","knowledge"] as const;
 const RELATIONSHIP_TYPES = ["supports","references","contradicts","answers","depends_on","blocks","implements","duplicates","derived_from","belongs_to"] as const;
 const assertOneOf = <T extends string>(value:string, allowed:readonly T[], label:string):T => { if(!allowed.includes(value as T))throw new VaultDomainError("VALIDATION_ERROR",`Invalid ${label}.`);return value as T; };
 const mapProject = (row: DbRow): Project => ({ id: row.id!, name: row.name!, storagePath:row.storage_path??`${row.id}/files`, description: row.description, icon: row.icon, color: row.color, status: row.status as EntityStatus, createdAt: row.created_at!, updatedAt: row.updated_at! });
 const mapFolder = (row: DbRow): Folder => ({ id: row.id!, projectId: row.project_id!, parentFolderId: row.parent_folder_id, name: row.name!, relativePath: row.relative_path!, status: row.status as EntityStatus, createdAt: row.created_at!, updatedAt: row.updated_at! });
 const mapDocument = (row: DbRow): DocumentFile => ({ id: row.id!, projectId: row.project_id!, parentFolderId: row.parent_folder_id, title: row.title!, kind: row.kind as "markdown" | "file", relativePath: row.relative_path!, mimeType: row.mime_type, availability:"available", status: row.status as EntityStatus, createdAt: row.created_at!, updatedAt: row.updated_at! });
-const mapKnowledgeObject = (row:DbRow):KnowledgeObject => ({id:row.id!,projectId:row.project_id!,parentFolderId:row.parent_folder_id,type:row.type as KnowledgeObject["type"],title:row.title!,body:row.body!,status:row.status as KnowledgeStatus,confidence:row.confidence as KnowledgeConfidence,author:row.author as KnowledgeObject["author"],createdAt:row.created_at!,updatedAt:row.updated_at!});
-const mapEvidenceSource = (row:DbRow):EvidenceSource => ({id:row.id!,projectId:row.project_id!,knowledgeObjectId:row.knowledge_object_id!,sourceType:row.source_type as EvidenceSource["sourceType"],sourceId:row.source_id,sourcePath:row.source_path,excerpt:row.excerpt,locator:row.locator,confidence:row.confidence as KnowledgeConfidence,availability:row.availability as EvidenceSource["availability"],createdAt:row.created_at!});
+const mapKnowledgeObject = (row:DbRow):KnowledgeObject => ({id:row.id!,projectId:row.project_id!,parentFolderId:row.parent_folder_id,type:row.type as KnowledgeObject["type"],title:row.title!,body:row.body!,status:row.status as KnowledgeStatus,confidence:row.confidence as KnowledgeConfidence,author:row.author as KnowledgeObject["author"],supersededById:row.superseded_by_id,createdAt:row.created_at!,updatedAt:row.updated_at!});
+const mapEvidenceSource = (row:DbRow):EvidenceSource => ({id:row.id!,projectId:row.project_id!,sourceType:row.source_type as EvidenceSource["sourceType"],sourceId:row.source_id,sourcePath:row.source_path,excerpt:row.excerpt,locator:row.locator,confidence:row.confidence as KnowledgeConfidence,availability:row.availability as EvidenceSource["availability"],createdAt:row.created_at!});
+const mapKnowledgeEvidenceLink = (row:DbRow):KnowledgeEvidenceLink => ({id:row.link_id!,knowledgeObjectId:row.knowledge_object_id!,evidenceSourceId:row.evidence_source_id!,originalKnowledgeObjectId:row.original_knowledge_object_id!,operationId:row.operation_id!,createdAt:row.created_at!});
 const mapRelationship = (row:DbRow):Relationship => ({id:row.id!,projectId:row.project_id!,sourceType:row.source_type as RelationshipEndpointType,sourceId:row.source_id!,targetType:row.target_type as RelationshipEndpointType,targetId:row.target_id!,relationshipType:row.relationship_type as RelationshipType,author:row.author as Relationship["author"],createdAt:row.created_at!});
 const snapshotFolderPath=(folders:Folder[],id:string)=>folders.find(item=>item.id===id)?.relativePath??"Knowledge";
 const SEARCHABLE_EXTENSIONS=new Set([".md",".txt",".json",".csv",".tsv",".js",".jsx",".ts",".tsx",".css",".html",".xml",".yaml",".yml",".toml",".ini",".log",".py",".java",".c",".h",".cpp",".cs",".go",".rs",".sql",".sh",".ps1"]);
 const mimeFor=(name:string)=>({".pdf":"application/pdf",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".svg":"image/svg+xml",".txt":"text/plain",".json":"application/json",".csv":"text/csv",".md":"text/markdown"}[extname(name).toLowerCase()]??"application/octet-stream");
 const IGNORED_DIRECTORIES=new Set([".git",".svn",".hg","node_modules",".pnpm-store","dist","build","out","target","coverage",".next",".nuxt",".cache",".turbo",".parcel-cache","__pycache__",".venv","venv"]);
 const IGNORED_FILES=new Set(["vault.db","vault.db-shm","vault.db-wal","thumbs.db",".ds_store"]);
 
 export const __testing = { safeResolve, atomicWrite, MIGRATIONS };
diff --git a/packages/vault-types/src/index.ts b/packages/vault-types/src/index.ts
index 96d2aee..3c47495 100644
--- a/packages/vault-types/src/index.ts
+++ b/packages/vault-types/src/index.ts
@@ -50,30 +50,28 @@ export interface DocumentFile {
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
-  supersededById?: string | null;
+  supersededById: string | null;
   createdAt: string;
   updatedAt: string;
 }
 
 export interface EvidenceSource {
   id: string;
   projectId: string;
-  /** @deprecated Migration 6 replaces ownership with KnowledgeEvidenceLink. */
-  knowledgeObjectId: string;
   sourceType: EvidenceSourceType;
   sourceId: string | null;
   sourcePath: string | null;
   excerpt: string | null;
   locator: string | null;
   confidence: KnowledgeConfidence;
   availability: "available" | "missing";
   createdAt: string;
 }
 
diff --git a/tests/phase2-knowledge.test.ts b/tests/phase2-knowledge.test.ts
index 9f605f1..2ce59a3 100644
--- a/tests/phase2-knowledge.test.ts
+++ b/tests/phase2-knowledge.test.ts
@@ -1,25 +1,74 @@
 import test from "node:test";
 import assert from "node:assert/strict";
 import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
 import { join } from "node:path";
 import { tmpdir } from "node:os";
+import { DatabaseSync } from "node:sqlite";
 import { VaultService } from "@orbit/vault-core";
 import { SqliteVaultRepository } from "@orbit/vault-storage";
 
 const fixture = () => {
   const root = mkdtempSync(join(tmpdir(), "orbit-vault-phase2-"));
   const service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root }));
   service.initialize();
   return { root, service, dispose: () => { service.close(); rmSync(root, { recursive: true, force: true }); } };
 };
 
+test("migration preserves canonical evidence and creates one honest baseline", () => {
+  const root = mkdtempSync(join(tmpdir(), "orbit-vault-migration-"));
+  const projectId = "project_legacy_001", knowledgeId = "knowledge_legacy_001", evidenceId = "evidence_legacy_001";
+  const createdAt = "2026-08-01T10:00:00.000Z";
+  let service: VaultService | null = null;
+  try {
+    const legacy = new DatabaseSync(join(root, "vault.db"));
+    legacy.exec(`
+      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
+      CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, storage_path TEXT);
+      CREATE TABLE knowledge_objects (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, confidence TEXT NOT NULL, author TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, parent_folder_id TEXT);
+      CREATE TABLE evidence_sources (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, knowledge_object_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT, source_path TEXT, excerpt TEXT, locator TEXT, confidence TEXT NOT NULL, availability TEXT NOT NULL, created_at TEXT NOT NULL);
+      CREATE TABLE relationships (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, relationship_type TEXT NOT NULL, author TEXT NOT NULL, created_at TEXT NOT NULL);
+    `);
+    for (let version = 1; version <= 5; version++) legacy.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(version, createdAt);
+    legacy.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(projectId, "Legacy Project", null, null, null, "active", createdAt, createdAt, `${projectId}/files`);
+    legacy.prepare("INSERT INTO knowledge_objects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(knowledgeId, projectId, "decision", "Legacy decision", "Preserve provenance.", "approved", "verified", "user", createdAt, createdAt, null);
+    legacy.prepare("INSERT INTO evidence_sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(evidenceId, projectId, knowledgeId, "url", "source_legacy_001", "https://example.test/provenance", "Preserve this excerpt.", "section-2", "verified", "available", createdAt);
+    legacy.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("relationship_in_001", projectId, "document", "document_legacy_001", "knowledge", knowledgeId, "supports", "user", "2026-08-01T10:01:00.000Z");
+    legacy.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("relationship_out_001", projectId, "knowledge", knowledgeId, "project", projectId, "references", "user", "2026-08-01T10:02:00.000Z");
+    legacy.close();
+
+    service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: false, developmentRoot: root }));
+    service.initialize();
+    const [evidence] = service.evidence.list(knowledgeId);
+    assert.deepEqual(evidence, { id: evidenceId, projectId, sourceType: "url", sourceId: "source_legacy_001", sourcePath: "https://example.test/provenance", excerpt: "Preserve this excerpt.", locator: "section-2", confidence: "verified", availability: "available", createdAt });
+    service.close();
+
+    const migrated = new DatabaseSync(join(root, "vault.db"), { readOnly: true });
+    assert.equal((migrated.prepare("PRAGMA table_info(evidence_sources)").all() as { name: string }[]).some(column => column.name === "knowledge_object_id"), false);
+    assert.deepEqual((migrated.prepare("SELECT knowledge_object_id, evidence_source_id, original_knowledge_object_id FROM knowledge_evidence_links").all() as Record<string, string>[]).map(row => ({ ...row })), [{ knowledge_object_id: knowledgeId, evidence_source_id: evidenceId, original_knowledge_object_id: knowledgeId }]);
+    const baseline = migrated.prepare("SELECT event_type, actor_type, reason, before_snapshot, after_snapshot FROM knowledge_object_history WHERE knowledge_object_id=?").get(knowledgeId) as { event_type: string; actor_type: string; reason: string; before_snapshot: null; after_snapshot: string };
+    assert.equal(baseline.event_type, "baseline_migrated"); assert.equal(baseline.actor_type, "system"); assert.match(baseline.reason, /immutable tracking began.*earlier edits cannot be reconstructed/i); assert.equal(baseline.before_snapshot, null);
+    const after = JSON.parse(baseline.after_snapshot);
+    assert.equal(after.schemaVersion, 1); assert.equal(after.object.supersededById, null);
+    assert.deepEqual(after.evidenceLinks.map((link: { knowledgeObjectId: string; evidenceSourceId: string; originalKnowledgeObjectId: string }) => ({ knowledgeObjectId: link.knowledgeObjectId, evidenceSourceId: link.evidenceSourceId, originalKnowledgeObjectId: link.originalKnowledgeObjectId })), [{ knowledgeObjectId: knowledgeId, evidenceSourceId: evidenceId, originalKnowledgeObjectId: knowledgeId }]);
+    assert.deepEqual(after.incomingRelationships.map((relationship: { id: string }) => relationship.id), ["relationship_in_001"]);
+    assert.deepEqual(after.outgoingRelationships.map((relationship: { id: string }) => relationship.id), ["relationship_out_001"]);
+    migrated.close();
+
+    service.initialize(); service.close();
+    const reopened = new DatabaseSync(join(root, "vault.db"), { readOnly: true });
+    assert.equal((reopened.prepare("SELECT count(*) AS count FROM knowledge_evidence_links").get() as { count: number }).count, 1);
+    assert.equal((reopened.prepare("SELECT count(*) AS count FROM knowledge_object_history").get() as { count: number }).count, 1);
+    reopened.close();
+  } finally { service?.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
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
