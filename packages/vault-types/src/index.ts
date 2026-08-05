export type EntityStatus = "active" | "archived" | "trashed";
export type DocumentKind = "markdown" | "file";
export type KnowledgeType = "fact" | "decision" | "goal" | "question" | "idea" | "preference";
export type KnowledgeStatus = "draft" | "approved" | "superseded" | "archived";
export type KnowledgeConfidence = "low" | "medium" | "high" | "verified";
export type KnowledgeAuthor = "user" | "ai";
export type KnowledgeActorType = "user" | "system" | "ai";
export type KnowledgeHistoryEvent = "created" | "edited" | "approved" | "archived" | "restored" | "superseded" | "merged" | "baseline_migrated";
export type EvidenceSourceType = "document" | "file" | "url" | "conversation" | "image" | "pdf" | "manual_note";
export type RelationshipEndpointType = "project" | "folder" | "document" | "knowledge";
export type RelationshipType = "supports" | "references" | "contradicts" | "answers" | "depends_on" | "blocks" | "implements" | "duplicates" | "derived_from" | "belongs_to";

export interface Project {
  id: string;
  name: string;
  storagePath: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  projectId: string;
  parentFolderId: string | null;
  name: string;
  relativePath: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentFile {
  id: string;
  projectId: string;
  parentFolderId: string | null;
  title: string;
  kind: DocumentKind;
  relativePath: string;
  mimeType: string | null;
  availability: "available" | "missing";
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

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
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceSource {
  id: string;
  projectId: string;
  sourceType: EvidenceSourceType;
  sourceId: string | null;
  sourcePath: string | null;
  excerpt: string | null;
  locator: string | null;
  confidence: KnowledgeConfidence;
  availability: "available" | "missing";
  createdAt: string;
}

export interface Relationship {
  id: string;
  projectId: string;
  sourceType: RelationshipEndpointType;
  sourceId: string;
  targetType: RelationshipEndpointType;
  targetId: string;
  relationshipType: RelationshipType;
  author: KnowledgeAuthor;
  createdAt: string;
}

export interface KnowledgeEvidenceLink {
  id: string;
  knowledgeObjectId: string;
  evidenceSourceId: string;
  originalKnowledgeObjectId: string;
  operationId: string;
  createdAt: string;
}

export interface KnowledgeAggregateSnapshot {
  schemaVersion: 1;
  object: KnowledgeObject;
  evidenceLinks: KnowledgeEvidenceLink[];
  incomingRelationships: Relationship[];
  outgoingRelationships: Relationship[];
}

export interface KnowledgeHistoryRecord {
  id: string;
  knowledgeObjectId: string;
  operationId: string;
  eventType: KnowledgeHistoryEvent;
  beforeSnapshot: KnowledgeAggregateSnapshot | null;
  afterSnapshot: KnowledgeAggregateSnapshot | null;
  actorType: KnowledgeActorType;
  actorId: string | null;
  reason: string | null;
  createdAt: string;
}

export type CreateProjectInput = Pick<Project, "name"> & Partial<Pick<Project, "description" | "icon" | "color">>;
export type UpdateProjectInput = Partial<Pick<Project, "name" | "description" | "icon" | "color">>;
export type CreateFolderInput = { projectId: string; parentFolderId: string | null; name: string };
export type CreateMarkdownInput = { projectId: string; parentFolderId: string | null; title: string; content?: string };
export type ImportFilesInput = { projectId: string; parentFolderId: string | null; sourcePaths: string[] };
export type CreateKnowledgeObjectInput = Pick<KnowledgeObject, "projectId" | "type" | "title" | "body" | "confidence"> & { parentFolderId?: string | null };
export type UpdateKnowledgeObjectInput = Partial<Pick<KnowledgeObject, "parentFolderId" | "type" | "title" | "body" | "confidence">>;
export type KnowledgeFilters = { projectId: string; status?: KnowledgeStatus; type?: KnowledgeType };
export type KnowledgeSearchInput = { query: string; projectId?: string; status?: KnowledgeStatus; type?: KnowledgeType; limit?: number };
export type CreateEvidenceSourceInput = Pick<EvidenceSource, "projectId" | "sourceType" | "sourceId" | "sourcePath" | "excerpt" | "locator" | "confidence"> & { knowledgeObjectId: string };
export type CreateRelationshipInput = Pick<Relationship, "projectId" | "sourceType" | "sourceId" | "targetType" | "targetId" | "relationshipType">;
export type SupersedeKnowledgeInput = { projectId: string; knowledgeObjectId: string; supersededById?: string | null; reason?: string | null };
export type MergeKnowledgeInput = { projectId: string; targetId: string; sourceIds: string[]; reason?: string | null };
export type MergeRelationshipConflict = { relationshipId: string; resolution: "self_link_removed" | "duplicate_collapsed"; retainedRelationshipId: string | null };
export type MergeKnowledgePreview = { target: KnowledgeObject; sources: KnowledgeObject[]; evidenceLinks: KnowledgeEvidenceLink[]; redirectedRelationships: Relationship[]; conflicts: MergeRelationshipConflict[]; blockingErrors: string[] };
export type MergeKnowledgeResult = { operationId: string; target: KnowledgeObject; supersededSources: KnowledgeObject[]; transferredEvidenceCount: number; redirectedRelationshipCount: number; conflicts: MergeRelationshipConflict[] };
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
  path: string;
  excerpt: string | null;
};

export type AtlasNode = {
  id: string;
  name: string;
  type: "vault" | "project" | "folder" | "file" | "knowledge";
  parentId: string | null;
  projectId: string | null;
  path: string;
};

export type VaultSnapshot = {
  vaultName: string;
  projects: Project[];
  folders: Folder[];
  documents: DocumentFile[];
  knowledgeObjects: KnowledgeObject[];
  evidenceSources: EvidenceSource[];
  relationships: Relationship[];
  atlasNodes: AtlasNode[];
};

export type VaultDescriptor = { path: string; name: string; lastOpenedAt: string };
export type VaultLifecycleState = { active: VaultDescriptor; recent: VaultDescriptor[] };

export type VaultErrorCode =
  | "VALIDATION_ERROR" | "NOT_FOUND" | "DUPLICATE" | "INVALID_MOVE"
  | "FILESYSTEM_ERROR" | "DATABASE_ERROR" | "DEVELOPMENT_ONLY" | "INTERNAL_ERROR";
export type VaultApiError = { code: VaultErrorCode; message: string; field?: string };
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: VaultApiError };

export type DesktopInfo = { platform: string; version: string; development: boolean };
export interface OrbitDesktopBridge {
  getInfo(): Promise<DesktopInfo>;
  openFiles(): Promise<string[]>;
  openFolder(): Promise<string | null>;
}

export interface VaultRendererApi {
  snapshot(): Promise<ApiResult<VaultSnapshot>>;
  onChanged(callback: () => void): () => void;
  onLifecycleRequest(callback: (action: "create" | "open") => void): () => void;
  lifecycle: {
    state(): Promise<ApiResult<VaultLifecycleState>>;
    create(): Promise<ApiResult<VaultLifecycleState | null>>;
    open(): Promise<ApiResult<VaultLifecycleState | null>>;
    switch(path: string): Promise<ApiResult<VaultLifecycleState>>;
  };
  filesystem: { reconcile(): Promise<ApiResult<ReconciliationReport>>; openProjectsFolder():Promise<ApiResult<string>> };
  projects: {
    list(filters?: ProjectFilters): Promise<ApiResult<Project[]>>;
    create(input: CreateProjectInput): Promise<ApiResult<Project>>;
    update(id: string, changes: UpdateProjectInput): Promise<ApiResult<Project>>;
    archive(id: string): Promise<ApiResult<Project>>;
    restore(id: string): Promise<ApiResult<Project>>;
    trash(id: string): Promise<ApiResult<Project>>;
  };
  folders: {
    list(projectId: string): Promise<ApiResult<Folder[]>>;
    create(input: CreateFolderInput): Promise<ApiResult<Folder>>;
    rename(id: string, name: string): Promise<ApiResult<Folder>>;
    move(id: string, parentFolderId: string | null): Promise<ApiResult<Folder>>;
    archive(id: string): Promise<ApiResult<Folder>>;
    restore(id: string): Promise<ApiResult<Folder>>;
    trash(id: string): Promise<ApiResult<Folder>>;
  };
  documents: {
    list(projectId: string): Promise<ApiResult<DocumentFile[]>>;
    createMarkdown(input: CreateMarkdownInput): Promise<ApiResult<DocumentFile>>;
    importFiles(input: ImportFilesInput): Promise<ApiResult<DocumentFile[]>>;
    read(id: string): Promise<ApiResult<{ document: DocumentFile; content: string }>>;
    updateContent(id: string, content: string): Promise<ApiResult<DocumentFile>>;
    rename(id: string, title: string): Promise<ApiResult<DocumentFile>>;
    move(id: string, parentFolderId: string | null): Promise<ApiResult<DocumentFile>>;
    archive(id: string): Promise<ApiResult<DocumentFile>>;
    restore(id: string): Promise<ApiResult<DocumentFile>>;
    trash(id: string): Promise<ApiResult<DocumentFile>>;
    open(id: string): Promise<ApiResult<{ id: string }>>;
    reveal(id: string): Promise<ApiResult<{ id: string }>>;
  };
  knowledge: {
    list(filters: KnowledgeFilters): Promise<ApiResult<KnowledgeObject[]>>;
    create(input: CreateKnowledgeObjectInput): Promise<ApiResult<KnowledgeObject>>;
    update(id: string, changes: UpdateKnowledgeObjectInput): Promise<ApiResult<KnowledgeObject>>;
    approve(id: string): Promise<ApiResult<KnowledgeObject>>;
    archive(id: string): Promise<ApiResult<KnowledgeObject>>;
    search(input: KnowledgeSearchInput): Promise<ApiResult<KnowledgeObject[]>>;
  };
  evidence: {
    list(knowledgeObjectId: string): Promise<ApiResult<EvidenceSource[]>>;
    attach(input: CreateEvidenceSourceInput): Promise<ApiResult<EvidenceSource>>;
  };
  relationships: {
    list(filters: RelationshipFilters): Promise<ApiResult<Relationship[]>>;
    create(input: CreateRelationshipInput): Promise<ApiResult<Relationship>>;
    remove(id: string): Promise<ApiResult<{ id: string }>>;
  };
  search: { query(input: SearchInput): Promise<ApiResult<SearchResult[]>> };
  development: {
    seed(): Promise<ApiResult<{ seeded: boolean; snapshot: VaultSnapshot }>>;
    reset(): Promise<ApiResult<VaultSnapshot>>;
  };
}
