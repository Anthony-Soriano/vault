import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, EvidenceSource, Folder, ImportFilesInput, KnowledgeAggregateSnapshot, KnowledgeConfidence, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeHistoryEvent, KnowledgeHistoryRecord, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, MergeKnowledgeInput, MergeKnowledgePreview, MergeKnowledgeResult, MergeRelationshipConflict, Project, ProjectFilters, ReconciliationReport, Relationship, RelationshipEndpointType, RelationshipFilters, RelationshipType, SearchInput, SearchResult, SupersedeKnowledgeInput, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot } from "@orbit/vault-types";
import { VaultDomainError, analyzeKnowledgeIntegrity, type VaultRepository } from "@orbit/vault-core";

type StorageOptions = { vaultRoot: string; developmentMode: boolean; developmentRoot: string };
type DbRow = Record<string, string | null>;
type Migration = { version: number; sql?: string; run?: (db: DatabaseSync) => void };
type MergePlan = MergeKnowledgePreview & {
  evidenceActions: {link:KnowledgeEvidenceLink;action:"transfer"|"delete"}[];
  relationshipActions: {relationship:Relationship;action:"redirect"|"delete"}[];
};

const safeLinkedKind=(path:string,allowedRoot:string):"directory"|"file"|null=>{try{const resolved=realpathSync.native(path),within=relative(realpathSync.native(allowedRoot),resolved);if(within.startsWith(`..${sep}`)||within===".."||isAbsolute(within))return null;const stats=statSync(path);return stats.isDirectory()?"directory":stats.isFile()?"file":null;}catch{return null;}};

const MIGRATIONS: Migration[] = [{
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
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, relative_path)
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), parent_folder_id TEXT REFERENCES folders(id),
      title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('markdown','file')), relative_path TEXT NOT NULL,
      mime_type TEXT, status TEXT NOT NULL CHECK(status IN ('active','archived','trashed')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, relative_path)
    );
    CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
    CREATE INDEX IF NOT EXISTS folders_project_idx ON folders(project_id);
    CREATE INDEX IF NOT EXISTS folders_parent_idx ON folders(parent_folder_id);
    CREATE INDEX IF NOT EXISTS documents_project_idx ON documents(project_id);
    CREATE INDEX IF NOT EXISTS documents_parent_idx ON documents(parent_folder_id);
    CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);
    CREATE INDEX IF NOT EXISTS folders_path_idx ON folders(project_id, relative_path);
    CREATE INDEX IF NOT EXISTS documents_path_idx ON documents(project_id, relative_path);
  `,
}, {
  version: 2,
  sql: `
    CREATE TABLE IF NOT EXISTS knowledge_objects (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL CHECK(type IN ('fact','decision','goal','question','idea','preference')),
      title TEXT NOT NULL, body TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft','approved','superseded','archived')),
      confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high','verified')),
      author TEXT NOT NULL CHECK(author IN ('user','ai')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evidence_sources (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK(source_type IN ('document','file','url','conversation','image','pdf','manual_note')),
      source_id TEXT, source_path TEXT, excerpt TEXT, locator TEXT,
      confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high','verified')),
      availability TEXT NOT NULL CHECK(availability IN ('available','missing')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS knowledge_project_idx ON knowledge_objects(project_id);
    CREATE INDEX IF NOT EXISTS knowledge_status_idx ON knowledge_objects(status);
    CREATE INDEX IF NOT EXISTS knowledge_type_idx ON knowledge_objects(type);
    CREATE INDEX IF NOT EXISTS evidence_knowledge_idx ON evidence_sources(knowledge_object_id);
    CREATE INDEX IF NOT EXISTS evidence_source_idx ON evidence_sources(source_type, source_id);
  `,
}, {
  version: 3,
  sql: `
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      source_type TEXT NOT NULL CHECK(source_type IN ('project','folder','document','knowledge')),
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('project','folder','document','knowledge')),
      target_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL CHECK(relationship_type IN ('supports','references','contradicts','answers','depends_on','blocks','implements','duplicates','derived_from','belongs_to')),
      author TEXT NOT NULL CHECK(author IN ('user','ai')),
      created_at TEXT NOT NULL,
      UNIQUE(project_id, source_type, source_id, target_type, target_id, relationship_type)
    );
    CREATE INDEX IF NOT EXISTS relationships_project_idx ON relationships(project_id);
    CREATE INDEX IF NOT EXISTS relationships_source_idx ON relationships(source_type, source_id);
    CREATE INDEX IF NOT EXISTS relationships_target_idx ON relationships(target_type, target_id);
  `,
}, {
  version: 4,
  sql: `
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
}, {
  version: 6,
  run: migrateEvidenceLinks,
}];

function migrateEvidenceLinks(db: DatabaseSync) {
  db.exec(`
    ALTER TABLE knowledge_objects ADD COLUMN superseded_by_id TEXT;
    CREATE INDEX knowledge_superseded_by_idx ON knowledge_objects(superseded_by_id);
    ALTER TABLE evidence_sources RENAME TO evidence_sources_legacy;
    DROP INDEX IF EXISTS evidence_knowledge_idx;
    DROP INDEX IF EXISTS evidence_source_idx;
    CREATE TABLE evidence_sources (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      source_type TEXT NOT NULL CHECK(source_type IN ('document','file','url','conversation','image','pdf','manual_note')),
      source_id TEXT, source_path TEXT, excerpt TEXT, locator TEXT,
      confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high','verified')),
      availability TEXT NOT NULL CHECK(availability IN ('available','missing')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX evidence_source_idx ON evidence_sources(source_type, source_id);
    CREATE TABLE knowledge_evidence_links (
      link_id TEXT PRIMARY KEY,
      knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id),
      evidence_source_id TEXT NOT NULL REFERENCES evidence_sources(id),
      original_knowledge_object_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(knowledge_object_id, evidence_source_id)
    );
    CREATE INDEX knowledge_evidence_links_knowledge_idx ON knowledge_evidence_links(knowledge_object_id);
    CREATE INDEX knowledge_evidence_links_evidence_idx ON knowledge_evidence_links(evidence_source_id);
  `);
  const legacyEvidence = db.prepare("SELECT * FROM evidence_sources_legacy ORDER BY id").all() as DbRow[];
  const insertEvidence = db.prepare("INSERT INTO evidence_sources(id, project_id, source_type, source_id, source_path, excerpt, locator, confidence, availability, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertLink = db.prepare("INSERT INTO knowledge_evidence_links(link_id, knowledge_object_id, evidence_source_id, original_knowledge_object_id, operation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  for (const evidence of legacyEvidence) {
    insertEvidence.run(evidence.id, evidence.project_id, evidence.source_type, evidence.source_id, evidence.source_path, evidence.excerpt, evidence.locator, evidence.confidence, evidence.availability, evidence.created_at);
    insertLink.run(entityId(), evidence.knowledge_object_id, evidence.id, evidence.knowledge_object_id, `migration6-link-${evidence.id}`, evidence.created_at);
  }
  db.exec(`
    CREATE TABLE knowledge_object_history (
      history_id TEXT PRIMARY KEY,
      knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id),
      operation_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      before_snapshot TEXT,
      after_snapshot TEXT,
      actor_type TEXT NOT NULL CHECK(actor_type IN ('user','system','ai')),
      actor_id TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX knowledge_object_history_knowledge_idx ON knowledge_object_history(knowledge_object_id);
    CREATE INDEX knowledge_object_history_operation_idx ON knowledge_object_history(operation_id);
    CREATE INDEX knowledge_object_history_created_at_idx ON knowledge_object_history(created_at);
  `);
  const insertHistory = db.prepare("INSERT INTO knowledge_object_history(history_id, knowledge_object_id, operation_id, event_type, before_snapshot, after_snapshot, actor_type, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const knowledgeObjects = db.prepare("SELECT * FROM knowledge_objects ORDER BY id").all() as DbRow[];
  for (const object of knowledgeObjects) {
    const evidenceLinks = (db.prepare("SELECT * FROM knowledge_evidence_links WHERE knowledge_object_id=? ORDER BY created_at, link_id").all(object.id) as DbRow[]).map(mapKnowledgeEvidenceLink);
    const incomingRelationships = (db.prepare("SELECT * FROM relationships WHERE target_type='knowledge' AND target_id=? ORDER BY created_at, id").all(object.id) as DbRow[]).map(mapRelationship);
    const outgoingRelationships = (db.prepare("SELECT * FROM relationships WHERE source_type='knowledge' AND source_id=? ORDER BY created_at, id").all(object.id) as DbRow[]).map(mapRelationship);
    const afterSnapshot = JSON.stringify({ schemaVersion: 1, object: mapKnowledgeObject(object), evidenceLinks, incomingRelationships, outgoingRelationships });
    insertHistory.run(entityId(), object.id, `migration6-baseline-${object.id}`, "baseline_migrated", null, afterSnapshot, "system", null, "Immutable tracking began at migration 6; earlier edits cannot be reconstructed.", now());
  }
  db.exec("DROP TABLE evidence_sources_legacy;");
}

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
      if (migration.sql) this.db.exec(migration.sql);
      migration.run?.(this.db);
      this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(migration.version, now());
    });
  }
  close() { this.database?.close(); this.database = null; }
  private get db() { if (!this.database) throw new Error("Vault database is not initialized"); return this.database; }
  private transaction<T>(operation: () => T): T { this.db.exec("BEGIN IMMEDIATE"); try { const value = operation(); this.db.exec("COMMIT"); return value; } catch (error) { this.db.exec("ROLLBACK"); throw error; } }

  createProject(input: CreateProjectInput) {
    const name = this.uniqueProjectName(input.name), id = entityId(), timestamp = now(), storagePath=`${id}/files`;
    const project: Project = { id, name, storagePath, description: input.description ?? null, icon: input.icon ?? null, color: input.color ?? null, status: "active", createdAt: timestamp, updatedAt: timestamp };
    const projectPath = safeResolve(join(this.options.vaultRoot,"projects"),...storagePath.split("/")); mkdirSync(projectPath, { recursive: true });
    try { this.db.prepare("INSERT INTO projects(id,name,description,icon,color,status,created_at,updated_at,storage_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, name, project.description, project.icon, project.color, project.status, timestamp, timestamp,storagePath); }
    catch (error) { rmSync(join(this.options.vaultRoot, "projects", id), { recursive: true, force: true }); throw error; }
    return project;
  }
  getProject(id: string) { const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as DbRow | undefined; if (!row) throw notFound("Project"); return mapProject(row); }
  listProjects(filters?: ProjectFilters) {
    const rows = filters?.status
      ? this.db.prepare("SELECT * FROM projects WHERE status = ? ORDER BY updated_at DESC, name").all(filters.status)
      : this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC, name").all();
    return (rows as DbRow[]).map(mapProject);
  }
  updateProject(id: string, changes: UpdateProjectInput) {
    const project = this.getProject(id), name = changes.name && changes.name !== project.name ? this.uniqueProjectName(changes.name, id) : project.name, updatedAt = now();
    this.db.prepare("UPDATE projects SET name=?, description=?, icon=?, color=?, updated_at=? WHERE id=?").run(name, changes.description === undefined ? project.description : changes.description, changes.icon === undefined ? project.icon : changes.icon, changes.color === undefined ? project.color : changes.color, updatedAt, id);
    return this.getProject(id);
  }
  setProjectStatus(id: string, status: EntityStatus) {
    this.getProject(id); const timestamp = now();
    this.transaction(() => { this.db.prepare("UPDATE projects SET status=?, updated_at=? WHERE id=?").run(status, timestamp, id); this.db.prepare("UPDATE folders SET status=?, updated_at=? WHERE project_id=?").run(status, timestamp, id); this.db.prepare("UPDATE documents SET status=?, updated_at=? WHERE project_id=?").run(status, timestamp, id); });
    return this.getProject(id);
  }

  reconcileFilesystem():ReconciliationReport{
    const report:ReconciliationReport={projectsAdded:0,projectsArchived:0,foldersAdded:0,documentsAdded:0,missingDocuments:0,ignoredEntries:0,scannedAt:now()},projectsRoot=join(this.options.vaultRoot,"projects");mkdirSync(projectsRoot,{recursive:true});
    const projects=this.listProjects(),claimed=new Set(projects.map(item=>item.storagePath.split("/")[0].toLowerCase()));
    for(const entry of readdirSync(projectsRoot,{withFileTypes:true})){const absolute=join(projectsRoot,entry.name),kind=entry.isDirectory()?"directory":entry.isSymbolicLink()?safeLinkedKind(absolute,projectsRoot):null;if(kind!=="directory")continue;if(IGNORED_DIRECTORIES.has(entry.name.toLowerCase())){report.ignoredEntries++;continue;}if(claimed.has(entry.name.toLowerCase()))continue;const name=this.uniqueProjectName(entry.name),id=entityId(),timestamp=now();this.db.prepare("INSERT INTO projects(id,name,description,icon,color,status,created_at,updated_at,storage_path) VALUES (?, ?, NULL, NULL, NULL, 'active', ?, ?, ?)").run(id,name,timestamp,timestamp,entry.name);report.projectsAdded++;}
    for(const project of this.listProjects({status:"active"})){if(!existsSync(this.projectFilesPath(project.id))){this.setProjectStatus(project.id,"archived");report.projectsArchived++;continue;}this.reconcileProject(project,report);}
    report.missingDocuments=this.listProjects().flatMap(project=>this.listProjectDocuments(project.id)).filter(item=>item.availability==="missing").length;return report;
  }
  private reconcileProject(project:Project,report:ReconciliationReport){const root=this.projectFilesPath(project.id);if(!existsSync(root))return;const folderByPath=new Map(this.listProjectFolders(project.id).map(item=>[item.relativePath,item]));const documentPaths=new Set(this.listProjectDocuments(project.id).map(item=>item.relativePath));let visited=0;const visit=(absolute:string,relativePath:string,parentFolderId:string|null)=>{if(++visited>25000)throw new VaultDomainError("VALIDATION_ERROR",`Project ${project.name} exceeds the 25,000 item reconciliation limit.`);for(const entry of readdirSync(absolute,{withFileTypes:true})){const childRelative=posixJoin(relativePath,entry.name),childAbsolute=join(absolute,entry.name),linkedKind=entry.isSymbolicLink()?safeLinkedKind(childAbsolute,root):null,isDirectory=entry.isDirectory()||linkedKind==="directory",isFile=entry.isFile()||linkedKind==="file";if(entry.isSymbolicLink()&&!linkedKind){report.ignoredEntries++;continue;}if(isDirectory){if(IGNORED_DIRECTORIES.has(entry.name.toLowerCase())){report.ignoredEntries++;continue;}let folder=folderByPath.get(childRelative);if(!folder){const id=entityId(),timestamp=now();this.db.prepare("INSERT INTO folders VALUES (?, ?, ?, ?, ?, 'active', ?, ?)").run(id,project.id,parentFolderId,entry.name,childRelative,timestamp,timestamp);folder=this.getFolder(id);folderByPath.set(childRelative,folder);report.foldersAdded++;}visit(childAbsolute,childRelative,folder.id);continue;}if(!isFile||IGNORED_FILES.has(entry.name.toLowerCase())){report.ignoredEntries++;continue;}if(documentPaths.has(childRelative))continue;const id=entityId(),timestamp=now(),kind=extname(entry.name).toLowerCase()===".md"?"markdown":"file";this.db.prepare("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)").run(id,project.id,parentFolderId,entry.name,kind,childRelative,mimeFor(entry.name),timestamp,timestamp);documentPaths.add(childRelative);report.documentsAdded++;}};visit(root,"",null);}

  createFolder(input: CreateFolderInput) {
    this.getProject(input.projectId); const parent = input.parentFolderId ? this.getFolder(input.parentFolderId) : null;
    if (parent && parent.projectId !== input.projectId) throw invalidMove("A folder cannot use a parent from another project.");
    const name = this.uniqueFolderName(input.projectId, input.parentFolderId, input.name), relativePath = posixJoin(parent?.relativePath ?? "", name), id = entityId(), timestamp = now();
    const absolute = this.contentPath(input.projectId, relativePath); mkdirSync(absolute, { recursive: true });
    try { this.db.prepare("INSERT INTO folders VALUES (?, ?, ?, ?, ?, 'active', ?, ?)").run(id, input.projectId, input.parentFolderId, name, relativePath, timestamp, timestamp); }
    catch (error) { rmSync(absolute, { recursive: true, force: true }); throw error; }
    return this.getFolder(id);
  }
  getFolder(id: string) { const row = this.db.prepare("SELECT * FROM folders WHERE id=?").get(id) as DbRow | undefined; if (!row) throw notFound("Folder"); return mapFolder(row); }
  listProjectFolders(projectId: string) { this.getProject(projectId); return (this.db.prepare("SELECT * FROM folders WHERE project_id=? ORDER BY relative_path").all(projectId) as DbRow[]).map(mapFolder); }
  listChildFolders(parentFolderId: string) { this.getFolder(parentFolderId); return (this.db.prepare("SELECT * FROM folders WHERE parent_folder_id=? ORDER BY name").all(parentFolderId) as DbRow[]).map(mapFolder); }
  renameFolder(id: string, requestedName: string) { const folder = this.getFolder(id); return this.relocateFolder(folder, folder.parentFolderId, requestedName); }
  moveFolder(id: string, parentFolderId: string | null) {
    const folder = this.getFolder(id), parent = parentFolderId ? this.getFolder(parentFolderId) : null;
    if (parent?.projectId !== undefined && parent.projectId !== folder.projectId) throw invalidMove("Folders cannot move between projects.");
    let cursor = parent; while (cursor) { if (cursor.id === folder.id) throw invalidMove("A folder cannot move inside itself or one of its descendants."); cursor = cursor.parentFolderId ? this.getFolder(cursor.parentFolderId) : null; }
    return this.relocateFolder(folder, parentFolderId, folder.name);
  }
  private relocateFolder(folder: Folder, parentFolderId: string | null, requestedName: string) {
    const parent = parentFolderId ? this.getFolder(parentFolderId) : null;
    const name = this.uniqueFolderName(folder.projectId, parentFolderId, requestedName, folder.id);
    const newPath = posixJoin(parent?.relativePath ?? "", name), oldPath = folder.relativePath;
    if (newPath === oldPath) return folder;
    const source = this.contentPath(folder.projectId, oldPath), destination = this.contentPath(folder.projectId, newPath); mkdirSync(dirname(destination), { recursive: true });
    if (existsSync(destination)) throw duplicate("An item already exists at that location.");
    renameSync(source, destination);
    try { this.transaction(() => {
      const timestamp = now();
      const descendants = this.db.prepare("SELECT id, relative_path FROM folders WHERE project_id=? AND (relative_path=? OR relative_path LIKE ?)").all(folder.projectId, oldPath, `${oldPath}/%`) as { id: string; relative_path: string }[];
      for (const row of descendants) this.db.prepare("UPDATE folders SET relative_path=?, updated_at=? WHERE id=?").run(replacePrefix(row.relative_path, oldPath, newPath), timestamp, row.id);
      const documents = this.db.prepare("SELECT id, relative_path FROM documents WHERE project_id=? AND relative_path LIKE ?").all(folder.projectId, `${oldPath}/%`) as { id: string; relative_path: string }[];
      for (const row of documents) this.db.prepare("UPDATE documents SET relative_path=?, updated_at=? WHERE id=?").run(replacePrefix(row.relative_path, oldPath, newPath), timestamp, row.id);
      this.db.prepare("UPDATE folders SET name=?, parent_folder_id=? WHERE id=?").run(name, parentFolderId, folder.id);
    }); } catch (error) { renameSync(destination, source); throw error; }
    return this.getFolder(folder.id);
  }
  setFolderStatus(id: string, status: EntityStatus) {
    const folder = this.getFolder(id), timestamp = now();
    this.transaction(() => { this.db.prepare("UPDATE folders SET status=?, updated_at=? WHERE project_id=? AND (relative_path=? OR relative_path LIKE ?)").run(status, timestamp, folder.projectId, folder.relativePath, `${folder.relativePath}/%`); this.db.prepare("UPDATE documents SET status=?, updated_at=? WHERE project_id=? AND relative_path LIKE ?").run(status, timestamp, folder.projectId, `${folder.relativePath}/%`); });
    return this.getFolder(id);
  }

  createMarkdownDocument(input: CreateMarkdownInput) {
    this.getProject(input.projectId); const parent = input.parentFolderId ? this.getFolder(input.parentFolderId) : null;
    if (parent && parent.projectId !== input.projectId) throw invalidMove("A document cannot use a folder from another project.");
    const title = this.uniqueDocumentTitle(input.projectId, input.parentFolderId, input.title), relativePath = posixJoin(parent?.relativePath ?? "", title), id = entityId(), timestamp = now(), absolute = this.contentPath(input.projectId, relativePath);
    mkdirSync(dirname(absolute), { recursive: true }); atomicWrite(absolute, input.content ?? `# ${title.replace(/\.md$/i, "")}\n`);
    try { this.db.prepare("INSERT INTO documents VALUES (?, ?, ?, ?, 'markdown', ?, 'text/markdown', 'active', ?, ?)").run(id, input.projectId, input.parentFolderId, title, relativePath, timestamp, timestamp); }
    catch (error) { rmSync(absolute, { force: true }); throw error; }
    return this.getDocument(id);
  }
  importFiles(input:ImportFilesInput){
    this.getProject(input.projectId);const parent=input.parentFolderId?this.getFolder(input.parentFolderId):null;if(parent&&parent.projectId!==input.projectId)throw invalidMove("A file cannot use a folder from another project.");
    const imported:DocumentFile[]=[];for(const sourcePath of input.sourcePaths){if(!isAbsolute(sourcePath)||!existsSync(sourcePath)||!statSync(sourcePath).isFile())throw new VaultDomainError("VALIDATION_ERROR",`Source file is unavailable: ${basename(sourcePath)}`);const title=this.uniqueDocumentTitle(input.projectId,input.parentFolderId,basename(sourcePath)),relativePath=posixJoin(parent?.relativePath??"",title),absolute=this.contentPath(input.projectId,relativePath),id=entityId(),timestamp=now(),temporary=`${absolute}.${randomUUID()}.tmp`;mkdirSync(dirname(absolute),{recursive:true});copyFileSync(sourcePath,temporary);renameSync(temporary,absolute);try{this.db.prepare("INSERT INTO documents VALUES (?, ?, ?, ?, 'file', ?, ?, 'active', ?, ?)").run(id,input.projectId,input.parentFolderId,title,relativePath,mimeFor(title),timestamp,timestamp);}catch(error){rmSync(absolute,{force:true});throw error;}imported.push(this.getDocument(id));}return imported;
  }
  getDocument(id: string) { const row = this.db.prepare("SELECT * FROM documents WHERE id=?").get(id) as DbRow | undefined; if (!row) throw notFound("Document"); return this.withAvailability(mapDocument(row)); }
  getDocumentAbsolutePath(id:string){const document=this.getDocument(id);return this.contentPath(document.projectId,document.relativePath);}
  listProjectDocuments(projectId: string) { this.getProject(projectId); return (this.db.prepare("SELECT * FROM documents WHERE project_id=? ORDER BY relative_path").all(projectId) as DbRow[]).map(mapDocument).map(item=>this.withAvailability(item)); }
  listFolderDocuments(folderId: string) { this.getFolder(folderId); return (this.db.prepare("SELECT * FROM documents WHERE parent_folder_id=? ORDER BY title").all(folderId) as DbRow[]).map(mapDocument).map(item=>this.withAvailability(item)); }
  renameDocument(id: string, requestedTitle: string) { const document = this.getDocument(id); return this.relocateDocument(document, document.parentFolderId, requestedTitle); }
  moveDocument(id: string, parentFolderId: string | null) { const document = this.getDocument(id); return this.relocateDocument(document, parentFolderId, document.title); }
  private relocateDocument(document: DocumentFile, parentFolderId: string | null, requestedTitle: string) {
    const parent = parentFolderId ? this.getFolder(parentFolderId) : null;
    if (parent && parent.projectId !== document.projectId) throw invalidMove("Documents cannot move between projects.");
    const title = this.uniqueDocumentTitle(document.projectId, parentFolderId, requestedTitle, document.id), newPath = posixJoin(parent?.relativePath ?? "", title);
    if (newPath === document.relativePath) return document;
    const source = this.contentPath(document.projectId, document.relativePath), destination = this.contentPath(document.projectId, newPath); mkdirSync(dirname(destination), { recursive: true });
    if (existsSync(destination)) throw duplicate("A document already exists at that location.");
    renameSync(source, destination);
    try { this.db.prepare("UPDATE documents SET title=?, parent_folder_id=?, relative_path=?, updated_at=? WHERE id=?").run(title, parentFolderId, newPath, now(), document.id); }
    catch (error) { renameSync(destination, source); throw error; }
    return this.getDocument(document.id);
  }
  updateMarkdownContent(id: string, content: string) { const document = this.getDocument(id); if (document.kind !== "markdown") throw new VaultDomainError("VALIDATION_ERROR", "Only Markdown documents can be edited."); atomicWrite(this.contentPath(document.projectId, document.relativePath), content); this.db.prepare("UPDATE documents SET updated_at=? WHERE id=?").run(now(), id); return this.getDocument(id); }
  readMarkdownContent(id: string) { const document = this.getDocument(id); const path = this.contentPath(document.projectId, document.relativePath); if (!existsSync(path)) throw notFound("Markdown file"); return readFileSync(path, "utf8"); }
  setDocumentStatus(id: string, status: EntityStatus) { this.getDocument(id); this.db.prepare("UPDATE documents SET status=?, updated_at=? WHERE id=?").run(status, now(), id); return this.getDocument(id); }
  private withAvailability(document:DocumentFile):DocumentFile{return{...document,availability:existsSync(this.contentPath(document.projectId,document.relativePath))?"available":"missing"};}

  createKnowledgeObject(input: CreateKnowledgeObjectInput) {
    this.getProject(input.projectId); assertOneOf(input.type, KNOWLEDGE_TYPES, "knowledge type"); assertOneOf(input.confidence, CONFIDENCE_LEVELS, "confidence");
    if(input.parentFolderId){const folder=this.getFolder(input.parentFolderId);if(folder.projectId!==input.projectId)throw invalidMove("Knowledge cannot be assigned to a folder in another project.");}
    return this.transaction(() => {
      const id=entityId(), timestamp=now();
      this.db.prepare("INSERT INTO knowledge_objects(id,project_id,type,title,body,status,confidence,author,created_at,updated_at,parent_folder_id) VALUES (?, ?, ?, ?, ?, 'draft', ?, 'user', ?, ?, ?)").run(id, input.projectId, input.type, input.title, input.body, input.confidence, timestamp, timestamp,input.parentFolderId??null);
      const created=this.getKnowledgeObject(id); this.appendKnowledgeHistory(id,entityId(),"created",null,this.captureKnowledgeAggregate(id),null);
      return created;
    });
  }
  getKnowledgeObject(id: string) { const row=this.db.prepare("SELECT * FROM knowledge_objects WHERE id=?").get(id) as DbRow|undefined; if(!row)throw notFound("Knowledge Object"); return mapKnowledgeObject(row); }
  listKnowledgeObjects(filters: KnowledgeFilters) {
    this.getProject(filters.projectId);
    return (this.db.prepare("SELECT * FROM knowledge_objects WHERE project_id=? ORDER BY updated_at DESC, title").all(filters.projectId) as DbRow[]).map(mapKnowledgeObject).filter(item=>(filters.status?item.status===filters.status:(item.status!=="archived"&&item.status!=="superseded"))&&(!filters.type||item.type===filters.type));
  }
  updateKnowledgeObject(id: string, changes: UpdateKnowledgeObjectInput) {
    const item=this.getKnowledgeObject(id); if(changes.type)assertOneOf(changes.type,KNOWLEDGE_TYPES,"knowledge type"); if(changes.confidence)assertOneOf(changes.confidence,CONFIDENCE_LEVELS,"confidence");
    if(changes.parentFolderId){const folder=this.getFolder(changes.parentFolderId);if(folder.projectId!==item.projectId)throw invalidMove("Knowledge cannot be assigned to a folder in another project.");}
    const next={type:changes.type??item.type,title:changes.title??item.title,body:changes.body??item.body,confidence:changes.confidence??item.confidence,parentFolderId:changes.parentFolderId===undefined?item.parentFolderId:changes.parentFolderId};
    if(next.type===item.type&&next.title===item.title&&next.body===item.body&&next.confidence===item.confidence&&next.parentFolderId===item.parentFolderId)return item;
    return this.transaction(() => { const before=this.captureKnowledgeAggregate(id); this.db.prepare("UPDATE knowledge_objects SET type=?, title=?, body=?, confidence=?, parent_folder_id=?, updated_at=? WHERE id=?").run(next.type,next.title,next.body,next.confidence,next.parentFolderId,now(),id); this.appendKnowledgeHistory(id,entityId(),"edited",before,this.captureKnowledgeAggregate(id),null); return this.getKnowledgeObject(id); });
  }
  setKnowledgeStatus(id: string, status: KnowledgeStatus) {
    assertOneOf(status,KNOWLEDGE_STATUSES,"knowledge status");
    return this.transaction(() => { const item=this.getKnowledgeObject(id), before=this.captureKnowledgeAggregate(id); let event:KnowledgeHistoryEvent;
      if(status==="approved"){if(item.status!=="draft")throw new VaultDomainError("VALIDATION_ERROR","Only draft knowledge can be approved.");if(this.listEvidenceLinks(id).length===0)throw new VaultDomainError("VALIDATION_ERROR","Attach at least one evidence source before approval.","evidence");event="approved";}
      else if(status==="archived"){if(item.status!=="draft"&&item.status!=="approved")throw new VaultDomainError("VALIDATION_ERROR","Only draft or approved knowledge can be archived.");event="archived";}
      else throw new VaultDomainError("VALIDATION_ERROR","Use the explicit lifecycle operation for this status.");
      this.db.prepare("UPDATE knowledge_objects SET status=?, updated_at=? WHERE id=?").run(status,now(),id); this.appendKnowledgeHistory(id,entityId(),event,before,this.captureKnowledgeAggregate(id),null); return this.getKnowledgeObject(id);
    });
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
  previewKnowledgeMerge(input:MergeKnowledgeInput):MergeKnowledgePreview {
    const {target,sources,evidenceLinks,redirectedRelationships,conflicts,blockingErrors}=this.buildMergePlan(input);
    return {target,sources,evidenceLinks,redirectedRelationships,conflicts,blockingErrors};
  }
  mergeKnowledgeObjects(input:MergeKnowledgeInput):MergeKnowledgeResult {
    return this.transaction(() => {
      const plan=this.buildMergePlan(input);
      if(plan.blockingErrors.length)throw new VaultDomainError("VALIDATION_ERROR",`Merge is blocked: ${plan.blockingErrors.join(" ")}`);
      const operationId=entityId(),timestamp=now(),aggregateIds=[plan.target.id,...plan.sources.map(source=>source.id)];
      const beforeSnapshots=new Map(aggregateIds.map(id=>[id,this.captureKnowledgeAggregate(id)]));
      for(const action of plan.evidenceActions.filter(action=>action.action==="delete"))this.db.prepare("DELETE FROM knowledge_evidence_links WHERE link_id=?").run(action.link.id);
      for(const action of plan.evidenceActions.filter(action=>action.action==="transfer"))this.db.prepare("UPDATE knowledge_evidence_links SET knowledge_object_id=? WHERE link_id=?").run(plan.target.id,action.link.id);
      for(const action of plan.relationshipActions.filter(action=>action.action==="delete"))this.db.prepare("DELETE FROM relationships WHERE id=?").run(action.relationship.id);
      for(const action of plan.relationshipActions.filter(action=>action.action==="redirect"))this.db.prepare("UPDATE relationships SET source_id=?, target_id=? WHERE id=?").run(action.relationship.sourceId,action.relationship.targetId,action.relationship.id);
      for(const source of plan.sources)this.db.prepare("UPDATE knowledge_objects SET status='superseded', superseded_by_id=?, updated_at=? WHERE id=?").run(plan.target.id,timestamp,source.id);
      this.db.prepare("UPDATE knowledge_objects SET updated_at=? WHERE id=?").run(timestamp,plan.target.id);
      const afterSnapshots=new Map(aggregateIds.map(id=>[id,this.captureKnowledgeAggregate(id)]));
      for(const id of aggregateIds)this.appendKnowledgeHistory(id,operationId,"merged",beforeSnapshots.get(id)!,afterSnapshots.get(id)!,input.reason??null);
      return {operationId,target:this.getKnowledgeObject(plan.target.id),supersededSources:plan.sources.map(source=>this.getKnowledgeObject(source.id)),transferredEvidenceCount:plan.evidenceActions.filter(action=>action.action==="transfer").length,redirectedRelationshipCount:plan.relationshipActions.filter(action=>action.action==="redirect").length,conflicts:plan.conflicts};
    });
  }
  private buildMergePlan(input:MergeKnowledgeInput):MergePlan {
    this.getProject(input.projectId);
    if(input.sourceIds.length===0)throw new VaultDomainError("VALIDATION_ERROR","Choose at least one source Knowledge Object.","sourceIds");
    const sortedSourceIds=[...input.sourceIds].sort(compareText);
    if(new Set(sortedSourceIds).size!==sortedSourceIds.length)throw new VaultDomainError("VALIDATION_ERROR","Source Knowledge Object IDs must be unique.","sourceIds");
    if(sortedSourceIds.includes(input.targetId))throw new VaultDomainError("VALIDATION_ERROR","The target Knowledge Object cannot also be a source.","sourceIds");
    const target=this.getKnowledgeObject(input.targetId),sources=sortedSourceIds.map(id=>this.getKnowledgeObject(id));
    if(target.projectId!==input.projectId)throw new VaultDomainError("VALIDATION_ERROR","Target Knowledge Object must belong to the specified project.","targetId");
    const foreignSource=sources.find(source=>source.projectId!==input.projectId);
    if(foreignSource)throw new VaultDomainError("VALIDATION_ERROR","Source Knowledge Objects must belong to the specified project.","sourceIds");
    const blockingErrors:string[]=[];
    if(target.status!=="draft"&&target.status!=="approved")blockingErrors.push(`Target Knowledge Object ${target.id} must be draft or approved.`);
    for(const source of sources)if(source.status!=="draft"&&source.status!=="approved")blockingErrors.push(`Source Knowledge Object ${source.id} must be draft or approved.`);
    const sourceIds=new Set(sortedSourceIds);
    const relationships=(this.db.prepare("SELECT * FROM relationships WHERE project_id=? ORDER BY created_at, id").all(input.projectId) as DbRow[]).map(mapRelationship);
    const redirectedRelationships=relationships.filter(relationship=>(relationship.sourceType==="knowledge"&&sourceIds.has(relationship.sourceId))||(relationship.targetType==="knowledge"&&sourceIds.has(relationship.targetId))).map(relationship=>({...relationship,sourceId:relationship.sourceType==="knowledge"&&sourceIds.has(relationship.sourceId)?target.id:relationship.sourceId,targetId:relationship.targetType==="knowledge"&&sourceIds.has(relationship.targetId)?target.id:relationship.targetId})).sort((left,right)=>compareText(left.id,right.id));
    const conflicts:MergeRelationshipConflict[]=[];
    const remainingRedirects:Relationship[]=[];
    for(const relationship of redirectedRelationships){
      if(relationship.sourceType===relationship.targetType&&relationship.sourceId===relationship.targetId)conflicts.push({relationshipId:relationship.id,resolution:"self_link_removed",retainedRelationshipId:null});
      else remainingRedirects.push(relationship);
    }
    const existingTargetRelationships=relationships.filter(relationship=>!redirectedRelationships.some(redirected=>redirected.id===relationship.id)&&((relationship.sourceType==="knowledge"&&relationship.sourceId===target.id)||(relationship.targetType==="knowledge"&&relationship.targetId===target.id)));
    const groups=new Map<string,Relationship[]>();
    for(const relationship of [...remainingRedirects,...existingTargetRelationships]){
      const key=JSON.stringify([relationship.projectId,relationship.sourceType,relationship.sourceId,relationship.targetType,relationship.targetId,relationship.relationshipType]);
      const group=groups.get(key)??[];group.push(relationship);groups.set(key,group);
    }
    for(const group of groups.values())if(group.length>1){
      group.sort(compareCreatedThenId);const retained=group[0]!;
      for(const relationship of group.slice(1))conflicts.push({relationshipId:relationship.id,resolution:"duplicate_collapsed",retainedRelationshipId:retained.id});
    }
    const sourceEvidenceLinks=sources.flatMap(source=>(this.db.prepare("SELECT * FROM knowledge_evidence_links WHERE knowledge_object_id=? ORDER BY created_at, link_id").all(source.id) as DbRow[]).map(mapKnowledgeEvidenceLink)).sort(compareCreatedThenId);
    const sortedConflicts=conflicts.sort((left,right)=>compareText(left.relationshipId,right.relationshipId));
    const relationshipDeletes=new Set(sortedConflicts.map(conflict=>conflict.relationshipId));
    const relationshipById=new Map([...redirectedRelationships,...existingTargetRelationships].map(relationship=>[relationship.id,relationship]));
    const relationshipActions=[
      ...[...relationshipDeletes].map(id=>({relationship:relationshipById.get(id)!,action:"delete" as const})),
      ...redirectedRelationships.filter(relationship=>!relationshipDeletes.has(relationship.id)).map(relationship=>({relationship,action:"redirect" as const})),
    ].sort((left,right)=>compareText(left.relationship.id,right.relationship.id));
    const targetEvidenceLinks=(this.db.prepare("SELECT * FROM knowledge_evidence_links WHERE knowledge_object_id=? ORDER BY created_at, link_id").all(target.id) as DbRow[]).map(mapKnowledgeEvidenceLink);
    const evidenceGroups=new Map<string,KnowledgeEvidenceLink[]>();
    for(const link of [...sourceEvidenceLinks,...targetEvidenceLinks]){const group=evidenceGroups.get(link.evidenceSourceId)??[];group.push(link);evidenceGroups.set(link.evidenceSourceId,group);}
    const evidenceActions:{link:KnowledgeEvidenceLink;action:"transfer"|"delete"}[]=[];
    for(const group of evidenceGroups.values()){
      const sourceGroup=group.filter(link=>sourceIds.has(link.knowledgeObjectId));if(sourceGroup.length===0)continue;
      group.sort(compareCreatedThenId);const retained=group[0]!;
      for(const link of group)if(link.id!==retained.id)evidenceActions.push({link,action:"delete"});
      if(sourceIds.has(retained.knowledgeObjectId))evidenceActions.push({link:retained,action:"transfer"});
    }
    evidenceActions.sort((left,right)=>compareText(left.link.id,right.link.id));
    const evidenceLinks=evidenceActions.filter(action=>action.action==="transfer").map(action=>action.link).sort(compareCreatedThenId);
    return {target,sources,evidenceLinks,redirectedRelationships,conflicts:sortedConflicts,blockingErrors,evidenceActions,relationshipActions};
  }
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
    const knowledge=this.getKnowledgeObject(input.knowledgeObjectId); if(knowledge.projectId!==input.projectId)throw invalidMove("Evidence and knowledge must belong to the same project.");
    assertOneOf(input.sourceType,EVIDENCE_TYPES,"evidence source type"); assertOneOf(input.confidence,CONFIDENCE_LEVELS,"confidence");
    if(input.sourceType==="document"||input.sourceType==="file"){if(!input.sourceId)throw new VaultDomainError("VALIDATION_ERROR","Choose a source file.","sourceId");const document=this.getDocument(input.sourceId);if(document.projectId!==input.projectId)throw invalidMove("Evidence cannot reference a file from another project.");if(input.sourceType==="file"&&document.kind!=="file")throw new VaultDomainError("VALIDATION_ERROR","Choose an imported source file.","sourceId");}
    return this.transaction(() => {
      const id=entityId(), linkId=entityId(), operationId=entityId(), timestamp=now();
      this.db.prepare("INSERT INTO evidence_sources(id, project_id, source_type, source_id, source_path, excerpt, locator, confidence, availability, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)").run(id,input.projectId,input.sourceType,input.sourceId,input.sourcePath,input.excerpt,input.locator,input.confidence,timestamp);
      this.db.prepare("INSERT INTO knowledge_evidence_links(link_id, knowledge_object_id, evidence_source_id, original_knowledge_object_id, operation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(linkId,input.knowledgeObjectId,id,input.knowledgeObjectId,operationId,timestamp);
      return this.withEvidenceAvailability(mapEvidenceSource(this.db.prepare("SELECT * FROM evidence_sources WHERE id=?").get(id) as DbRow));
    });
  }
  listEvidence(knowledgeObjectId: string) { this.getKnowledgeObject(knowledgeObjectId); return (this.db.prepare("SELECT evidence_sources.* FROM evidence_sources JOIN knowledge_evidence_links ON knowledge_evidence_links.evidence_source_id=evidence_sources.id WHERE knowledge_evidence_links.knowledge_object_id=? ORDER BY evidence_sources.created_at DESC").all(knowledgeObjectId) as DbRow[]).map(mapEvidenceSource).map(item=>this.withEvidenceAvailability(item)); }
  listEvidenceLinks(knowledgeObjectId: string) { this.getKnowledgeObject(knowledgeObjectId); return (this.db.prepare("SELECT * FROM knowledge_evidence_links WHERE knowledge_object_id=? ORDER BY created_at DESC, link_id DESC").all(knowledgeObjectId) as DbRow[]).map(mapKnowledgeEvidenceLink); }
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
  }
  listRelationships(filters:RelationshipFilters){this.getProject(filters.projectId);const rows=(this.db.prepare("SELECT * FROM relationships WHERE project_id=? ORDER BY created_at DESC").all(filters.projectId) as DbRow[]).map(mapRelationship);if(!filters.entityType||!filters.entityId)return rows;return rows.filter(item=>(item.sourceType===filters.entityType&&item.sourceId===filters.entityId)||(item.targetType===filters.entityType&&item.targetId===filters.entityId));}
  removeRelationship(id:string){const row=this.db.prepare("SELECT id FROM relationships WHERE id=?").get(id) as {id:string}|undefined;if(!row)throw notFound("Relationship");this.db.prepare("DELETE FROM relationships WHERE id=?").run(id);return{id};}
  private entityProjectId(type:RelationshipEndpointType,id:string){if(type==="project")return this.getProject(id).id;if(type==="folder")return this.getFolder(id).projectId;if(type==="document")return this.getDocument(id).projectId;return this.getKnowledgeObject(id).projectId;}

  analyzeIntegrity(projectId: string) {
    this.getProject(projectId);
    const projects = this.listProjects();
    const folders = projects.flatMap(project => this.listProjectFolders(project.id));
    const documents = projects.flatMap(project => this.listProjectDocuments(project.id));
    const knowledgeObjects = projects.flatMap(project => this.listKnowledgeObjects({ projectId: project.id }));
    const relationships = projects.flatMap(project => this.listRelationships({ projectId: project.id }));
    const evidenceLinks = knowledgeObjects.flatMap(object => this.listEvidenceLinks(object.id));
    const evidenceById = new Map<string, EvidenceSource>();
    for (const object of knowledgeObjects) for (const source of this.listEvidence(object.id)) evidenceById.set(source.id, source);
    return analyzeKnowledgeIntegrity({
      projectId, projects, folders, documents, knowledgeObjects,
      evidenceSources: [...evidenceById.values()], relationships, evidenceLinks,
    });
  }

  snapshot(): VaultSnapshot {
    const projects = this.listProjects({ status: "active" });
    const projectIds = new Set(projects.map(project => project.id));
    const folders = (this.db.prepare("SELECT * FROM folders WHERE status='active' ORDER BY relative_path").all() as DbRow[]).map(mapFolder).filter(folder => projectIds.has(folder.projectId));
    const folderIds = new Set(folders.map(folder => folder.id));
    const documents = (this.db.prepare("SELECT * FROM documents WHERE status='active' ORDER BY relative_path").all() as DbRow[]).map(mapDocument).map(item=>this.withAvailability(item)).filter(document => projectIds.has(document.projectId) && (!document.parentFolderId || folderIds.has(document.parentFolderId)));
    const knowledgeObjects=(this.db.prepare("SELECT * FROM knowledge_objects WHERE status NOT IN ('archived','superseded') ORDER BY updated_at DESC").all() as DbRow[]).map(mapKnowledgeObject).filter(item=>projectIds.has(item.projectId));
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
      ...folders.map(folder => ({ id: folder.id, name: folder.name, type: "folder" as const, parentId: folder.parentFolderId ?? folder.projectId, projectId: folder.projectId, path: folder.relativePath })),
      ...documents.map(document => ({ id: document.id, name: document.title, type: "file" as const, parentId: document.parentFolderId ?? document.projectId, projectId: document.projectId, path: document.relativePath })),
      ...knowledgeObjects.map(item => ({ id: item.id, name: item.title, type: "knowledge" as const, parentId: (item.parentFolderId&&folderIds.has(item.parentFolderId)?item.parentFolderId:null)??firstDocumentEvidence.get(item.id)??item.projectId, projectId: item.projectId, path: `${item.parentFolderId?snapshotFolderPath(folders,item.parentFolderId)+" / ":"Knowledge / "}${item.type} / ${item.title}` })),
    ];
    return { vaultName: basename(this.options.vaultRoot), projects, folders, documents, knowledgeObjects, evidenceSources, relationships, atlasNodes };
  }
  search(input: SearchInput): SearchResult[] {
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
      for(const item of this.listKnowledgeObjects({projectId:project.id})){const index=item.body.toLowerCase().indexOf(needle);if(item.title.toLowerCase().includes(needle)||index>=0)results.push({id:item.id,entityType:"knowledge",projectId:project.id,projectName:project.name,title:item.title,path:`${project.name} / Knowledge / ${item.type}`,excerpt:index>=0?item.body.slice(Math.max(0,index-45),index+needle.length+75):null});}
    }
    return results.slice(0, limit);
  }

  seedDevelopmentFixtures() {
    if (!this.options.developmentMode) throw new VaultDomainError("VALIDATION_ERROR", "Fixture seeding is only available in development.");
    if (this.listProjects().some(project => project.name === "Orbit Vault Test")) return { seeded: false, snapshot: this.snapshot() };
    const orbit = this.createProject({ name: "Orbit Vault Test", description: "Disposable Phase 1 fixture project.", color: "#6d8cff" });
    const docs = this.createFolder({ projectId: orbit.id, parentFolderId: null, name: "docs" });
    const design = this.createFolder({ projectId: orbit.id, parentFolderId: null, name: "design" });
    const src = this.createFolder({ projectId: orbit.id, parentFolderId: null, name: "src" });
    const renderer = this.createFolder({ projectId: orbit.id, parentFolderId: src.id, name: "renderer" });
    const electron = this.createFolder({ projectId: orbit.id, parentFolderId: src.id, name: "electron" });
    this.createMarkdownDocument({ projectId: orbit.id, parentFolderId: null, title: "README.md", content: "# Orbit Vault Test\n\nA disposable local-first Vault used to verify Phase 1 persistence.\n" });
    this.createMarkdownDocument({ projectId: orbit.id, parentFolderId: docs.id, title: "architecture.md", content: "# Architecture\n\nRenderer → secure IPC → Vault Core → repositories → SQLite and filesystem.\n" });
    this.createMarkdownDocument({ projectId: orbit.id, parentFolderId: docs.id, title: "roadmap.md", content: "# Roadmap\n\nPhase 1 proves local persistence, Markdown editing, Atlas generation, and search.\n" });
    this.createMarkdownDocument({ projectId: orbit.id, parentFolderId: docs.id, title: "ux-audit.md", content: "# UX audit\n\nKeep the workflow lightweight and make save state visible.\n" });
    this.createMarkdownDocument({ projectId: orbit.id, parentFolderId: design.id, title: "atlas-notes.md", content: "# Atlas notes\n\nThe graph visualizes canonical project, folder, and file data.\n" });
    this.createMarkdownDocument({ projectId: orbit.id, parentFolderId: design.id, title: "graph-reference.md", content: "# Graph reference\n\nHierarchy owns layout. Relationships are future overlays.\n" });
    this.createMarkdownDocument({ projectId: orbit.id, parentFolderId: renderer.id, title: "app-notes.md", content: "# Renderer\n\nThe renderer has no direct Node.js or filesystem access.\n" });
    this.createMarkdownDocument({ projectId: orbit.id, parentFolderId: electron.id, title: "ipc-notes.md", content: "# IPC\n\nOnly narrow typed Vault methods cross the preload bridge.\n" });
    const spark = this.createProject({ name: "SPARK Test", color: "#f0b45b" });
    const memory = this.createFolder({ projectId: spark.id, parentFolderId: null, name: "memory" }); const research = this.createFolder({ projectId: spark.id, parentFolderId: null, name: "research" });
    this.createMarkdownDocument({ projectId: spark.id, parentFolderId: null, title: "planning.md", content: "# SPARK planning\n\nExplore project planning without implementing AI in Phase 1.\n" });
    this.createMarkdownDocument({ projectId: spark.id, parentFolderId: memory.id, title: "brain-layer.md", content: "# Brain layer\n\nKnowledge objects and evidence belong to Phase 2.\n" });
    this.createMarkdownDocument({ projectId: spark.id, parentFolderId: research.id, title: "models.md", content: "# Models\n\nModel integration is intentionally deferred.\n" });
    const personal = this.createProject({ name: "Personal Notes", color: "#8ad6a5" });
    this.createMarkdownDocument({ projectId: personal.id, parentFolderId: null, title: "vacation-notes.md", content: "# Vacation notes\n\nUse disposable fixture content while away from the primary PC.\n" });
    return { seeded: true, snapshot: this.snapshot() };
  }
  resetDevelopmentVault() {
    if (!this.options.developmentMode || resolve(this.options.vaultRoot) !== resolve(this.options.developmentRoot)) throw new VaultDomainError("VALIDATION_ERROR", "Development reset is unavailable for this vault.");
    this.close(); rmSync(this.options.vaultRoot, { recursive: true, force: true }); this.initialize(); return this.snapshot();
  }

  private projectFilesPath(projectId: string) { const project=this.getProject(projectId);return safeResolve(join(this.options.vaultRoot,"projects"),...project.storagePath.split("/")); }
  private contentPath(projectId: string, relativePath: string) { return safeResolve(this.projectFilesPath(projectId), ...relativePath.split("/")); }
  private readSearchableContent(document:DocumentFile){const path=this.contentPath(document.projectId,document.relativePath);if(!existsSync(path))return"";if(!SEARCHABLE_EXTENSIONS.has(extname(document.title).toLowerCase())||statSync(path).size>2_000_000)return"";return readFileSync(path,"utf8");}
  private uniqueProjectName(base: string, excludeId?: string) { return uniqueName(base, name => Boolean(this.db.prepare("SELECT 1 FROM projects WHERE lower(name)=lower(?) AND id<>?").get(name, excludeId ?? ""))); }
  private uniqueFolderName(projectId: string, parentId: string | null, base: string, excludeId?: string) { return uniqueName(base, name => Boolean(this.db.prepare("SELECT 1 FROM folders WHERE project_id=? AND parent_folder_id IS ? AND lower(name)=lower(?) AND id<>?").get(projectId, parentId, name, excludeId ?? ""))); }
  private uniqueDocumentTitle(projectId: string, parentId: string | null, base: string, excludeId?: string) { return uniqueFileName(base, name => Boolean(this.db.prepare("SELECT 1 FROM documents WHERE project_id=? AND parent_folder_id IS ? AND lower(title)=lower(?) AND id<>?").get(projectId, parentId, name, excludeId ?? ""))); }
}

const now = () => new Date().toISOString();
const entityId = () => randomUUID().replace(/-/g, "");
const compareText = (left:string,right:string) => left<right?-1:left>right?1:0;
const compareCreatedThenId = <T extends {createdAt:string;id:string}>(left:T,right:T) => compareText(left.createdAt,right.createdAt)||compareText(left.id,right.id);
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
const KNOWLEDGE_STATUSES = ["draft","approved","superseded","archived"] as const;
const CONFIDENCE_LEVELS = ["low","medium","high","verified"] as const;
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
const mapKnowledgeHistory = (row:DbRow):KnowledgeHistoryRecord => ({id:row.history_id!,knowledgeObjectId:row.knowledge_object_id!,operationId:row.operation_id!,eventType:row.event_type as KnowledgeHistoryEvent,beforeSnapshot:row.before_snapshot?JSON.parse(row.before_snapshot) as KnowledgeAggregateSnapshot:null,afterSnapshot:row.after_snapshot?JSON.parse(row.after_snapshot) as KnowledgeAggregateSnapshot:null,actorType:row.actor_type as KnowledgeHistoryRecord["actorType"],actorId:row.actor_id,reason:row.reason,createdAt:row.created_at!});
const mapRelationship = (row:DbRow):Relationship => ({id:row.id!,projectId:row.project_id!,sourceType:row.source_type as RelationshipEndpointType,sourceId:row.source_id!,targetType:row.target_type as RelationshipEndpointType,targetId:row.target_id!,relationshipType:row.relationship_type as RelationshipType,author:row.author as Relationship["author"],createdAt:row.created_at!});
const snapshotFolderPath=(folders:Folder[],id:string)=>folders.find(item=>item.id===id)?.relativePath??"Knowledge";
const SEARCHABLE_EXTENSIONS=new Set([".md",".txt",".json",".csv",".tsv",".js",".jsx",".ts",".tsx",".css",".html",".xml",".yaml",".yml",".toml",".ini",".log",".py",".java",".c",".h",".cpp",".cs",".go",".rs",".sql",".sh",".ps1"]);
const mimeFor=(name:string)=>({".pdf":"application/pdf",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".svg":"image/svg+xml",".txt":"text/plain",".json":"application/json",".csv":"text/csv",".md":"text/markdown"}[extname(name).toLowerCase()]??"application/octet-stream");
const IGNORED_DIRECTORIES=new Set([".git",".svn",".hg","node_modules",".pnpm-store","dist","build","out","target","coverage",".next",".nuxt",".cache",".turbo",".parcel-cache","__pycache__",".venv","venv"]);
const IGNORED_FILES=new Set(["vault.db","vault.db-shm","vault.db-wal","thumbs.db",".ds_store"]);

export const __testing = { safeResolve, atomicWrite, MIGRATIONS };
