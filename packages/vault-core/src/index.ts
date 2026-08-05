import type {
  CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, ImportFilesInput,
  EvidenceSource, Folder, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeHistoryRecord, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, Project, ProjectFilters, SupersedeKnowledgeInput,
  ReconciliationReport, Relationship, RelationshipFilters, SearchInput, SearchResult, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot,
} from "@orbit/vault-types";

export class VaultDomainError extends Error {
  readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE" | "INVALID_MOVE";
  readonly field?: string;
  constructor(code: "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE" | "INVALID_MOVE", message: string, field?: string) {
    super(message); this.code = code; this.field = field;
    this.name = "VaultDomainError";
  }
}

export const sanitizeEntityName = (input: string) => {
  const clean = input.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").replace(/[. ]+$/g, "");
  if (!clean || clean === "." || clean === "..") throw new VaultDomainError("VALIDATION_ERROR", "Enter a valid name.", "name");
  if (clean.length > 120) throw new VaultDomainError("VALIDATION_ERROR", "Names must be 120 characters or fewer.", "name");
  return clean;
};

export const markdownTitle = (input: string) => {
  const name = sanitizeEntityName(input);
  return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
};

export const assertIdentifier = (id: string, field = "id") => {
  if (!/^[a-zA-Z0-9_-]{6,80}$/.test(id)) throw new VaultDomainError("VALIDATION_ERROR", "Invalid identifier.", field);
  return id;
};

export interface ProjectRepository {
  createProject(input: CreateProjectInput): Project;
  getProject(id: string): Project;
  listProjects(filters?: ProjectFilters): Project[];
  updateProject(id: string, changes: UpdateProjectInput): Project;
  setProjectStatus(id: string, status: EntityStatus): Project;
}
export interface FolderRepository {
  createFolder(input: CreateFolderInput): Folder;
  getFolder(id: string): Folder;
  listProjectFolders(projectId: string): Folder[];
  listChildFolders(parentFolderId: string): Folder[];
  renameFolder(id: string, name: string): Folder;
  moveFolder(id: string, newParentFolderId: string | null): Folder;
  setFolderStatus(id: string, status: EntityStatus): Folder;
}
export interface DocumentRepository {
  createMarkdownDocument(input: CreateMarkdownInput): DocumentFile;
  importFiles(input: ImportFilesInput): DocumentFile[];
  getDocumentAbsolutePath(id: string): string;
  getDocument(id: string): DocumentFile;
  listProjectDocuments(projectId: string): DocumentFile[];
  listFolderDocuments(folderId: string): DocumentFile[];
  renameDocument(id: string, title: string): DocumentFile;
  moveDocument(id: string, newParentFolderId: string | null): DocumentFile;
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
  restoreKnowledgeObject(id: string, reason: string | null): KnowledgeObject;
  supersedeKnowledgeObject(input: SupersedeKnowledgeInput): KnowledgeObject;
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
  listRelationships(filters: RelationshipFilters): Relationship[];
  removeRelationship(id: string): { id: string };
}
export interface VaultRepository extends ProjectRepository, FolderRepository, DocumentRepository, KnowledgeRepository, EvidenceRepository, RelationshipRepository {
  initialize(): void;
  close(): void;
  snapshot(): VaultSnapshot;
  search(input: SearchInput): SearchResult[];
  seedDevelopmentFixtures(): { seeded: boolean; snapshot: VaultSnapshot };
  resetDevelopmentVault(): VaultSnapshot;
  reconcileFilesystem(): ReconciliationReport;
}

export class VaultService {
  private readonly repository: VaultRepository;
  constructor(repository: VaultRepository) { this.repository = repository; }
  initialize() { this.repository.initialize(); }
  close() { this.repository.close(); }
  snapshot() { return this.repository.snapshot(); }
  projects = {
    list: (filters?: ProjectFilters) => this.repository.listProjects(filters),
    create: (input: CreateProjectInput) => this.repository.createProject({ ...input, name: sanitizeEntityName(input.name) }),
    update: (id: string, changes: UpdateProjectInput) => this.repository.updateProject(assertIdentifier(id), { ...changes, ...(changes.name ? { name: sanitizeEntityName(changes.name) } : {}) }),
    archive: (id: string) => this.repository.setProjectStatus(assertIdentifier(id), "archived"),
    restore: (id: string) => this.repository.setProjectStatus(assertIdentifier(id), "active"),
    trash: (id: string) => this.repository.setProjectStatus(assertIdentifier(id), "trashed"),
  };
  folders = {
    list: (projectId: string) => this.repository.listProjectFolders(assertIdentifier(projectId, "projectId")),
    create: (input: CreateFolderInput) => this.repository.createFolder({ ...input, projectId: assertIdentifier(input.projectId, "projectId"), parentFolderId: input.parentFolderId ? assertIdentifier(input.parentFolderId, "parentFolderId") : null, name: sanitizeEntityName(input.name) }),
    rename: (id: string, name: string) => this.repository.renameFolder(assertIdentifier(id), sanitizeEntityName(name)),
    move: (id: string, parent: string | null) => this.repository.moveFolder(assertIdentifier(id), parent ? assertIdentifier(parent) : null),
    archive: (id: string) => this.repository.setFolderStatus(assertIdentifier(id), "archived"),
    restore: (id: string) => this.repository.setFolderStatus(assertIdentifier(id), "active"),
    trash: (id: string) => this.repository.setFolderStatus(assertIdentifier(id), "trashed"),
  };
  documents = {
    list: (projectId: string) => this.repository.listProjectDocuments(assertIdentifier(projectId, "projectId")),
    createMarkdown: (input: CreateMarkdownInput) => this.repository.createMarkdownDocument({ ...input, projectId: assertIdentifier(input.projectId, "projectId"), parentFolderId: input.parentFolderId ? assertIdentifier(input.parentFolderId, "parentFolderId") : null, title: markdownTitle(input.title) }),
    importFiles: (input: ImportFilesInput) => this.repository.importFiles({ ...input, projectId: assertIdentifier(input.projectId,"projectId"), parentFolderId: input.parentFolderId ? assertIdentifier(input.parentFolderId,"parentFolderId") : null, sourcePaths: input.sourcePaths.map(String) }),
    resolvePath: (id: string) => this.repository.getDocumentAbsolutePath(assertIdentifier(id)),
    read: (id: string) => ({ document: this.repository.getDocument(assertIdentifier(id)), content: this.repository.readMarkdownContent(id) }),
    updateContent: (id: string, content: string) => this.repository.updateMarkdownContent(assertIdentifier(id), String(content)),
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
    approve: (id: string) => this.repository.setKnowledgeStatus(assertIdentifier(id), "approved"),
    archive: (id: string) => this.repository.setKnowledgeStatus(assertIdentifier(id), "archived"),
    restore: (id: string, reason?: string | null) => this.repository.restoreKnowledgeObject(assertIdentifier(id), normalizeReason(reason)),
    supersede: (input: SupersedeKnowledgeInput) => this.repository.supersedeKnowledgeObject({ ...input, projectId: assertIdentifier(input.projectId,"projectId"), knowledgeObjectId: assertIdentifier(input.knowledgeObjectId,"knowledgeObjectId"), ...(input.supersededById !== undefined ? { supersededById: input.supersededById ? assertIdentifier(input.supersededById,"supersededById") : null } : {}), reason: normalizeReason(input.reason) }),
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
    remove: (id: string) => this.repository.removeRelationship(assertIdentifier(id)),
  };
  filesystem = { reconcile: () => this.repository.reconcileFilesystem() };
  search(input: SearchInput) {
    const query = input.query.trim(); if (!query) return [];
    return this.repository.search({ ...input, query, limit: clampLimit(input.limit) });
  }
  development = { seed: () => this.repository.seedDevelopmentFixtures(), reset: () => this.repository.resetDevelopmentVault() };
}

const clampLimit = (limit?: number) => Math.min(100, Math.max(1, limit ?? 30));
const knowledgeText = (value: string, field: string, maximum: number) => { const text=String(value).trim(); if (!text) throw new VaultDomainError("VALIDATION_ERROR", `Knowledge ${field} is required.`, field); if (text.length>maximum) throw new VaultDomainError("VALIDATION_ERROR", `Knowledge ${field} is too long.`, field); return text; };
const normalizeReason = (value: string | null | undefined) => { const reason = value == null ? "" : String(value).trim(); if (reason.length > 500) throw new VaultDomainError("VALIDATION_ERROR", "Reason must be 500 characters or fewer.", "reason"); return reason || null; };
