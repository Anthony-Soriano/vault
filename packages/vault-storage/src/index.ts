import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CreateFolderInput, CreateMarkdownInput, CreateProjectInput, DocumentFile, EntityStatus, Folder, Project, ProjectFilters, SearchInput, SearchResult, UpdateProjectInput, VaultSnapshot } from "@orbit/vault-types";
import { VaultDomainError, type VaultRepository } from "@orbit/vault-core";

type StorageOptions = { vaultRoot: string; developmentMode: boolean; developmentRoot: string };
type DbRow = Record<string, string | null>;

const MIGRATIONS = [{
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
}];

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
      this.db.exec(migration.sql);
      this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(migration.version, now());
    });
  }
  close() { this.database?.close(); this.database = null; }
  private get db() { if (!this.database) throw new Error("Vault database is not initialized"); return this.database; }
  private transaction<T>(operation: () => T): T { this.db.exec("BEGIN IMMEDIATE"); try { const value = operation(); this.db.exec("COMMIT"); return value; } catch (error) { this.db.exec("ROLLBACK"); throw error; } }

  createProject(input: CreateProjectInput) {
    const name = this.uniqueProjectName(input.name), id = entityId(), timestamp = now();
    const project: Project = { id, name, description: input.description ?? null, icon: input.icon ?? null, color: input.color ?? null, status: "active", createdAt: timestamp, updatedAt: timestamp };
    const projectPath = this.projectFilesPath(id); mkdirSync(projectPath, { recursive: true });
    try { this.db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, name, project.description, project.icon, project.color, project.status, timestamp, timestamp); }
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
  getDocument(id: string) { const row = this.db.prepare("SELECT * FROM documents WHERE id=?").get(id) as DbRow | undefined; if (!row) throw notFound("Document"); return mapDocument(row); }
  listProjectDocuments(projectId: string) { this.getProject(projectId); return (this.db.prepare("SELECT * FROM documents WHERE project_id=? ORDER BY relative_path").all(projectId) as DbRow[]).map(mapDocument); }
  listFolderDocuments(folderId: string) { this.getFolder(folderId); return (this.db.prepare("SELECT * FROM documents WHERE parent_folder_id=? ORDER BY title").all(folderId) as DbRow[]).map(mapDocument); }
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

  snapshot(): VaultSnapshot {
    const projects = this.listProjects({ status: "active" });
    const projectIds = new Set(projects.map(project => project.id));
    const folders = (this.db.prepare("SELECT * FROM folders WHERE status='active' ORDER BY relative_path").all() as DbRow[]).map(mapFolder).filter(folder => projectIds.has(folder.projectId));
    const folderIds = new Set(folders.map(folder => folder.id));
    const documents = (this.db.prepare("SELECT * FROM documents WHERE status='active' ORDER BY relative_path").all() as DbRow[]).map(mapDocument).filter(document => projectIds.has(document.projectId) && (!document.parentFolderId || folderIds.has(document.parentFolderId)));
    const atlasNodes = [
      { id: "vault-root", name: basename(this.options.vaultRoot), type: "vault" as const, parentId: null, projectId: null, path: this.options.vaultRoot },
      ...projects.map(project => ({ id: project.id, name: project.name, type: "project" as const, parentId: "vault-root", projectId: project.id, path: project.name })),
      ...folders.map(folder => ({ id: folder.id, name: folder.name, type: "folder" as const, parentId: folder.parentFolderId ?? folder.projectId, projectId: folder.projectId, path: folder.relativePath })),
      ...documents.map(document => ({ id: document.id, name: document.title, type: "file" as const, parentId: document.parentFolderId ?? document.projectId, projectId: document.projectId, path: document.relativePath })),
    ];
    return { vaultName: basename(this.options.vaultRoot), projects, folders, documents, atlasNodes };
  }
  search(input: SearchInput): SearchResult[] {
    const needle = input.query.toLowerCase(), limit = input.limit ?? 30, results: SearchResult[] = [];
    const projects = this.listProjects({ status: "active" }).filter(project => !input.projectId || project.id === input.projectId);
    for (const project of projects) {
      if (project.name.toLowerCase().includes(needle)) results.push({ id: project.id, entityType: "project", projectId: project.id, projectName: project.name, title: project.name, path: project.name, excerpt: project.description });
      for (const folder of this.listProjectFolders(project.id).filter(folder => folder.status === "active")) if (folder.name.toLowerCase().includes(needle)) results.push({ id: folder.id, entityType: "folder", projectId: project.id, projectName: project.name, title: folder.name, path: `${project.name} / ${folder.relativePath}`, excerpt: null });
      for (const document of this.listProjectDocuments(project.id).filter(document => document.status === "active")) {
        let content = ""; try { content = document.kind === "markdown" ? this.readMarkdownContent(document.id) : ""; } catch { content = ""; }
        const contentIndex = content.toLowerCase().indexOf(needle);
        if (document.title.toLowerCase().includes(needle) || contentIndex >= 0) results.push({ id: document.id, entityType: "document", projectId: project.id, projectName: project.name, title: document.title, path: `${project.name} / ${document.relativePath}`, excerpt: contentIndex >= 0 ? content.slice(Math.max(0, contentIndex - 45), contentIndex + needle.length + 75).replace(/\s+/g, " ") : null });
      }
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

  private projectFilesPath(projectId: string) { return safeResolve(this.options.vaultRoot, join("projects", projectId, "files")); }
  private contentPath(projectId: string, relativePath: string) { return safeResolve(this.projectFilesPath(projectId), ...relativePath.split("/")); }
  private uniqueProjectName(base: string, excludeId?: string) { return uniqueName(base, name => Boolean(this.db.prepare("SELECT 1 FROM projects WHERE lower(name)=lower(?) AND id<>?").get(name, excludeId ?? ""))); }
  private uniqueFolderName(projectId: string, parentId: string | null, base: string, excludeId?: string) { return uniqueName(base, name => Boolean(this.db.prepare("SELECT 1 FROM folders WHERE project_id=? AND parent_folder_id IS ? AND lower(name)=lower(?) AND id<>?").get(projectId, parentId, name, excludeId ?? ""))); }
  private uniqueDocumentTitle(projectId: string, parentId: string | null, base: string, excludeId?: string) { return uniqueFileName(base, name => Boolean(this.db.prepare("SELECT 1 FROM documents WHERE project_id=? AND parent_folder_id IS ? AND lower(title)=lower(?) AND id<>?").get(projectId, parentId, name, excludeId ?? ""))); }
}

const now = () => new Date().toISOString();
const entityId = () => randomUUID().replace(/-/g, "");
const posixJoin = (...parts: string[]) => parts.filter(Boolean).join("/");
const replacePrefix = (value: string, oldPrefix: string, newPrefix: string) => newPrefix + value.slice(oldPrefix.length);
const uniqueName = (base: string, exists: (candidate: string) => boolean) => { if (!exists(base)) return base; for (let i = 2; i < 1000; i++) { const candidate = `${base} (${i})`; if (!exists(candidate)) return candidate; } throw duplicate("Too many duplicate names."); };
const uniqueFileName = (base: string, exists: (candidate: string) => boolean) => { if (!exists(base)) return base; const extension = extname(base), stem = extension ? base.slice(0, -extension.length) : base; for (let i = 2; i < 1000; i++) { const candidate = `${stem} (${i})${extension}`; if (!exists(candidate)) return candidate; } throw duplicate("Too many duplicate files."); };
const safeResolve = (root: string, ...segments: string[]) => { const absoluteRoot = resolve(root), target = resolve(absoluteRoot, ...segments); if (isAbsolute(segments.join(sep)) || (target !== absoluteRoot && !target.startsWith(absoluteRoot + sep))) throw new VaultDomainError("VALIDATION_ERROR", "Unsafe path rejected."); return target; };
const atomicWrite = (path: string, content: string) => { mkdirSync(dirname(path), { recursive: true }); const temporary = `${path}.${randomUUID()}.tmp`; writeFileSync(temporary, content, "utf8"); renameSync(temporary, path); };
const notFound = (entity: string) => new VaultDomainError("NOT_FOUND", `${entity} was not found.`);
const duplicate = (message: string) => new VaultDomainError("DUPLICATE", message);
const invalidMove = (message: string) => new VaultDomainError("INVALID_MOVE", message);
const mapProject = (row: DbRow): Project => ({ id: row.id!, name: row.name!, description: row.description, icon: row.icon, color: row.color, status: row.status as EntityStatus, createdAt: row.created_at!, updatedAt: row.updated_at! });
const mapFolder = (row: DbRow): Folder => ({ id: row.id!, projectId: row.project_id!, parentFolderId: row.parent_folder_id, name: row.name!, relativePath: row.relative_path!, status: row.status as EntityStatus, createdAt: row.created_at!, updatedAt: row.updated_at! });
const mapDocument = (row: DbRow): DocumentFile => ({ id: row.id!, projectId: row.project_id!, parentFolderId: row.parent_folder_id, title: row.title!, kind: row.kind as "markdown" | "file", relativePath: row.relative_path!, mimeType: row.mime_type, status: row.status as EntityStatus, createdAt: row.created_at!, updatedAt: row.updated_at! });

export const __testing = { safeResolve, atomicWrite, MIGRATIONS };
