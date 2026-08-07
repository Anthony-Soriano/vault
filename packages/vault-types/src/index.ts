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

export type IntegrityFindingKind =
  | "missing_evidence" | "orphaned" | "broken_reference" | "duplicate_candidate" | "unanswered_question";
export type IntegritySeverity = "error" | "warning";
export interface IntegrityFinding {
  id: string;
  kind: IntegrityFindingKind;
  severity: IntegritySeverity;
  subjectId: string;
  relatedIds: string[];
  message: string;
}
export interface IntegrityReport {
  projectId: string;
  findings: IntegrityFinding[];
  totalCount: number;
  errorCount: number;
  warningCount: number;
  countsByKind: Record<IntegrityFindingKind, number>;
}
export interface IntegrityAnalyzerInput {
  projectId: string;
  projects: Project[];
  folders: Folder[];
  documents: DocumentFile[];
  knowledgeObjects: KnowledgeObject[];
  evidenceSources: EvidenceSource[];
  relationships: Relationship[];
  evidenceLinks: KnowledgeEvidenceLink[];
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

// --- BL-03 Recovery & Backup ---------------------------------------------
// A snapshot's on-disk manifest. Describes the snapshot, not SQLite internals.
export interface SnapshotManifest {
  snapshotVersion: 1;
  vaultVersion: string;
  createdAt: string;              // ISO-8601
  vaultId: string;               // source Vault UUID
  schemaVersion: number;         // max applied migration version at capture
  projectCount: number;
  checksums: Record<string, string>; // relative POSIX path -> "sha256:<hex>"; includes "vault.db"
}
export interface SnapshotSummary {
  id: string;                    // "<iso-dashed>_<uuid>" directory name
  createdAt: string;
  sizeBytes: number;
  projectCount: number;
  schemaVersion: number;
  vaultVersion: string;
}
export interface SnapshotInspection { manifest: SnapshotManifest; integrityOk: boolean; problems: string[] }
export interface CreateSnapshotOptions { appVersion: string }
// Service/storage contract: caller supplies a parent directory + a new (non-existent) folder name.
export interface RestoreSnapshotInput { snapshotId: string; parentPath: string; folderName: string }
export interface RestoreResult { vaultId: string; targetPath: string }

// --- Phase 3 / v0.3.0 — AI Foundation contracts ---
// Provider-neutral, proposal-only AI plumbing. Nothing here becomes canonical:
// every proposal is non-canonical until an explicit user action promotes it
// (owner-approved decisions, .orbit/DECISIONS.md). The AI layer never accesses
// vault.db directly — it only exchanges these typed structures.

/** Categories of thing a proposal targets. Later Phase 3 slices produce these; v0.3.0 only defines the contract. */
export type AiProposalKind = "knowledge" | "project_truth" | "other";
/** Where a piece of provenance points. `model_inference` marks content the model inferred rather than read from a cited source. */
export type AiProvenanceKind = "repository_file" | "document" | "knowledge" | "evidence" | "manual_note" | "model_inference";
/** A single provenance pointer behind a generated claim. */
export interface AiEvidenceRef {
  kind: AiProvenanceKind;
  /** Id or path of the supporting source; null for pure model inference. */
  ref: string | null;
  /** Line range, section, or other in-source locator; null if not applicable. */
  locator: string | null;
  /** Short supporting excerpt; null if none. */
  excerpt: string | null;
}
/** Provenance carried by every model-generated proposal. */
export interface AiProvenance {
  /** Provider id that produced the proposal. */
  provider: string;
  /** Model identifier if known. */
  model: string | null;
  /** ISO timestamp of generation. */
  generatedAt: string;
  /** Cited supporting evidence. May be empty only when `inferred` is true. */
  evidence: AiEvidenceRef[];
  /** True when the proposal is model inference beyond cited evidence (e.g. owner-intent that cannot be read from the repository). */
  inferred: boolean;
}

/** Kinds of item that can appear in an explicitly constructed context package. */
export type AiContextItemKind = "instruction" | "project_truth" | "document" | "knowledge" | "evidence" | "repository_file" | "note";
/** One inspectable unit of context supplied to a model. */
export interface AiContextItem {
  id: string;
  kind: AiContextItemKind;
  label: string;
  content: string;
  /** Id/path this content came from, retained so context stays inspectable and traceable; null for synthetic instructions. */
  sourceRef: string | null;
}
/** A transparent, inspectable bundle of context supplied to a model for one request. */
export interface AiContextPackage {
  projectId: string;
  /** Human-readable reason this context was assembled. */
  purpose: string;
  items: AiContextItem[];
  createdAt: string;
}

/** A generated proposal is always non-canonical at generation time. */
export type AiProposalStatus = "proposed";
/** A normalized, provenance-carrying, non-canonical proposal returned to callers. */
export interface AiProposal {
  id: string;
  projectId: string;
  kind: AiProposalKind;
  title: string;
  body: string;
  /** Always "proposed" — nothing AI-generated is canonical until an explicit user action. */
  status: AiProposalStatus;
  provenance: AiProvenance;
  createdAt: string;
}

/** A request to generate structured proposals from an explicitly constructed context. */
export interface AiProposalRequest {
  projectId: string;
  purpose: string;
  context: AiContextPackage;
  desiredKind: AiProposalKind;
  instructions?: string;
}
/** The structured, non-canonical result of a proposal request. */
export interface AiProposalResponse {
  requestId: string;
  projectId: string;
  proposals: AiProposal[];
  provider: string;
  model: string | null;
  createdAt: string;
}

/** Provider-neutral configuration for selecting/configuring a model backend. No vendor is baked in. */
export interface AiProviderConfig {
  /** Provider id, e.g. "stub"; later "ollama" or another backend. */
  provider: string;
  model: string | null;
  endpoint: string | null;
  options: Record<string, string | number | boolean>;
}

export type AiErrorCode =
  | "AI_VALIDATION_ERROR" | "AI_NOT_CONFIGURED" | "AI_PROVIDER_ERROR"
  | "AI_TRANSPORT_ERROR" | "AI_RESPONSE_INVALID" | "AI_PROJECT_ISOLATION";
export interface AiError { code: AiErrorCode; message: string; provider?: string }
export type AiResult<T> = { ok: true; value: T } | { ok: false; error: AiError };

/** The low-level request a provider receives. The service builds this from an AiProposalRequest after validation. */
export interface AiProviderRequest {
  projectId: string;
  purpose: string;
  instructions: string | null;
  context: AiContextPackage;
  desiredKind: AiProposalKind;
}
/** A raw proposal as returned by a provider, before the service normalizes and enforces trust invariants. */
export interface AiRawProposal {
  kind: AiProposalKind;
  title: string;
  body: string;
  evidence: AiEvidenceRef[];
  /** True when the content is model inference beyond cited evidence. */
  inferred: boolean;
}
/** The raw response a provider returns for one request. */
export interface AiProviderRawResponse {
  model: string | null;
  proposals: AiRawProposal[];
}

// --- Phase 3 / v0.3.1 — Project Context & Repository Analysis contracts ---
// Deterministic, local-first analysis of a project's evidence. Read-only: nothing
// here generates Project Truth, invokes a model, or mutates canonical state. The
// context package it builds reuses the v0.3.0 AiContextPackage/AiContextItem verbatim.

/** Technical-fact categories for discovered evidence. No category asserts owner intent. */
export type ProjectEvidenceCategory =
  | "manifest" | "config" | "schema_migration" | "test" | "documentation"
  | "project_truth" | "source" | "todo_marker" | "other";

/** A raw file discovered by the filesystem walker, before classification. */
export interface RawEvidenceFile {
  /** Project-relative POSIX path. */
  relativePath: string;
  sizeBytes: number;
}

/** One classified evidence file. Content is not embedded — the inventory is a manifest of what exists. */
export interface ProjectEvidenceItem {
  relativePath: string;
  category: ProjectEvidenceCategory;
  sizeBytes: number;
}

/** The deterministic inventory of a project's discoverable evidence (stably ordered). */
export interface ProjectEvidenceInventory {
  projectId: string;
  items: ProjectEvidenceItem[];
  totalFiles: number;
  /** True when discovery hit the visited-entry cap and stopped early. */
  truncated: boolean;
}

/** Deterministic readiness state of a project's Project Truth stack. */
export type ProjectTruthReadinessState =
  | "complete" | "partial" | "missing" | "duplicated" | "potentially_stale";

/** Deterministic, inspectable assessment of the Project Truth stack. Staleness signals are heuristic, never semantic. */
export interface ProjectTruthReadiness {
  state: ProjectTruthReadinessState;
  presentDocuments: string[];
  missingDocuments: string[];
  duplicateDocuments: string[];
  /** Deterministic, labeled heuristic signals (e.g. present-but-empty truth doc). Not semantic judgment. */
  stalenessSignals: string[];
}

/** The top-level read-only result of analyzing a project's context. */
export interface ProjectContextAnalysis {
  projectId: string;
  ruleVersion: string;
  inventory: ProjectEvidenceInventory;
  readiness: ProjectTruthReadiness;
  contextPackage: AiContextPackage;
  generatedAt: string;
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
    restore(id: string, reason?: string | null): Promise<ApiResult<KnowledgeObject>>;
    supersede(input: SupersedeKnowledgeInput): Promise<ApiResult<KnowledgeObject>>;
    previewMerge(input: MergeKnowledgeInput): Promise<ApiResult<MergeKnowledgePreview>>;
    merge(input: MergeKnowledgeInput): Promise<ApiResult<MergeKnowledgeResult>>;
    history(knowledgeObjectId: string): Promise<ApiResult<KnowledgeHistoryRecord[]>>;
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
  integrity: { analyze(projectId: string): Promise<ApiResult<IntegrityReport>> };
  context: { analyze(projectId: string): Promise<ApiResult<ProjectContextAnalysis>> };
  backup: {
    create(): Promise<ApiResult<SnapshotSummary>>;
    list(): Promise<ApiResult<SnapshotSummary[]>>;
    inspect(snapshotId: string): Promise<ApiResult<SnapshotInspection>>;
    delete(snapshotId: string): Promise<ApiResult<{ id: string }>>;
    restoreToNewVault(input: { snapshotId: string; folderName: string }): Promise<ApiResult<RestoreResult>>;
    diskUsage(): Promise<ApiResult<{ totalBytes: number; count: number }>>;
  };
  search: { query(input: SearchInput): Promise<ApiResult<SearchResult[]>> };
  development: {
    seed(): Promise<ApiResult<{ seeded: boolean; snapshot: VaultSnapshot }>>;
    reset(): Promise<ApiResult<VaultSnapshot>>;
  };
}
