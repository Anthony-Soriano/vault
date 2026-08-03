export type EntityStatus = "active" | "archived" | "trashed";
export type DocumentKind = "markdown" | "file";

export interface Project {
  id: string;
  name: string;
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
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export type CreateProjectInput = Pick<Project, "name"> & Partial<Pick<Project, "description" | "icon" | "color">>;
export type UpdateProjectInput = Partial<Pick<Project, "name" | "description" | "icon" | "color">>;
export type CreateFolderInput = { projectId: string; parentFolderId: string | null; name: string };
export type CreateMarkdownInput = { projectId: string; parentFolderId: string | null; title: string; content?: string };
export type ProjectFilters = { status?: EntityStatus };
export type SearchInput = { query: string; projectId?: string; limit?: number };
export type SearchResult = {
  id: string;
  entityType: "project" | "folder" | "document";
  projectId: string;
  projectName: string;
  title: string;
  path: string;
  excerpt: string | null;
};

export type AtlasNode = {
  id: string;
  name: string;
  type: "vault" | "project" | "folder" | "file";
  parentId: string | null;
  projectId: string | null;
  path: string;
};

export type VaultSnapshot = {
  vaultName: string;
  projects: Project[];
  folders: Folder[];
  documents: DocumentFile[];
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
    read(id: string): Promise<ApiResult<{ document: DocumentFile; content: string }>>;
    updateContent(id: string, content: string): Promise<ApiResult<DocumentFile>>;
    rename(id: string, title: string): Promise<ApiResult<DocumentFile>>;
    move(id: string, parentFolderId: string | null): Promise<ApiResult<DocumentFile>>;
    archive(id: string): Promise<ApiResult<DocumentFile>>;
    restore(id: string): Promise<ApiResult<DocumentFile>>;
    trash(id: string): Promise<ApiResult<DocumentFile>>;
  };
  search: { query(input: SearchInput): Promise<ApiResult<SearchResult[]>> };
  development: {
    seed(): Promise<ApiResult<{ seeded: boolean; snapshot: VaultSnapshot }>>;
    reset(): Promise<ApiResult<VaultSnapshot>>;
  };
}
