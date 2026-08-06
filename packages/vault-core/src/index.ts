import type {
  CreateEvidenceSourceInput, CreateFolderInput, CreateKnowledgeObjectInput, CreateMarkdownInput, CreateProjectInput, CreateRelationshipInput, DocumentFile, EntityStatus, ImportFilesInput,
  EvidenceSource, Folder, KnowledgeEvidenceLink, KnowledgeFilters, KnowledgeHistoryRecord, KnowledgeObject, KnowledgeSearchInput, KnowledgeStatus, MergeKnowledgeInput, MergeKnowledgePreview, MergeKnowledgeResult, Project, ProjectFilters, SupersedeKnowledgeInput,
  ReconciliationReport, Relationship, RelationshipFilters, SearchInput, SearchResult, UpdateKnowledgeObjectInput, UpdateProjectInput, VaultSnapshot,
  IntegrityAnalyzerInput, IntegrityFinding, IntegrityFindingKind, IntegrityReport, IntegritySeverity,
  CreateSnapshotOptions, RestoreResult, RestoreSnapshotInput, SnapshotInspection, SnapshotSummary,
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
  previewKnowledgeMerge(input: MergeKnowledgeInput): MergeKnowledgePreview;
  mergeKnowledgeObjects(input: MergeKnowledgeInput): MergeKnowledgeResult;
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
  analyzeIntegrity(projectId: string): IntegrityReport;
  createSnapshot(options: CreateSnapshotOptions): SnapshotSummary;
  listSnapshots(): SnapshotSummary[];
  inspectSnapshot(snapshotId: string): SnapshotInspection;
  deleteSnapshot(snapshotId: string): { id: string };
  restoreSnapshotToNewVault(input: RestoreSnapshotInput): RestoreResult;
  backupsDiskUsage(): { totalBytes: number; count: number };
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
    previewMerge: (input: MergeKnowledgeInput) => this.repository.previewKnowledgeMerge(normalizeMergeInput(input)),
    merge: (input: MergeKnowledgeInput) => this.repository.mergeKnowledgeObjects(normalizeMergeInput(input)),
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
  integrity = {
    analyze: (projectId: string) => this.repository.analyzeIntegrity(assertIdentifier(projectId, "projectId")),
  };
  backup = {
    create: (options: CreateSnapshotOptions) => this.repository.createSnapshot(options),
    list: () => this.repository.listSnapshots(),
    inspect: (snapshotId: string) => this.repository.inspectSnapshot(assertIdentifier(snapshotId, "snapshotId")),
    delete: (snapshotId: string) => this.repository.deleteSnapshot(assertIdentifier(snapshotId, "snapshotId")),
    restoreToNewVault: (input: RestoreSnapshotInput) => this.repository.restoreSnapshotToNewVault({ snapshotId: assertIdentifier(input.snapshotId, "snapshotId"), parentPath: String(input.parentPath), folderName: String(input.folderName) }),
    diskUsage: () => this.repository.backupsDiskUsage(),
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
const normalizeMergeInput = (input: MergeKnowledgeInput): MergeKnowledgeInput => ({...input,projectId:assertIdentifier(input.projectId,"projectId"),targetId:assertIdentifier(input.targetId,"targetId"),sourceIds:input.sourceIds.map((id,index)=>assertIdentifier(id,`sourceIds[${index}]`)),reason:normalizeReason(input.reason)});

// --- Deterministic knowledge integrity analyzer (Phase 2.4 Slice 2) ---

export const INTEGRITY_RULE_VERSION = "1";

const INTEGRITY_KIND_ORDER: IntegrityFindingKind[] = ["broken_reference", "missing_evidence", "orphaned", "duplicate_candidate", "unanswered_question"];
const INTEGRITY_SEVERITY_ORDER: IntegritySeverity[] = ["error", "warning"];
const INTEGRITY_ACTIVE = new Set<KnowledgeObject["status"]>(["draft", "approved"]);

type IntegrityEndpointState = "ok" | "missing" | "cross_project" | "archived" | "trashed";
const describeEndpointState = (state: IntegrityEndpointState) => (state === "cross_project" ? "cross-project" : state);
const normalizeIntegrityTitle = (title: string) =>
  title.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ").replace(/[.,;:!?]+$/g, "");
const integrityFindingId = (projectId: string, kind: IntegrityFindingKind, subjectId: string, relatedIds: string[]) =>
  `${projectId}::${INTEGRITY_RULE_VERSION}::${kind}::${subjectId}::${[...relatedIds].sort().join(",")}`;

export function analyzeKnowledgeIntegrity(input: IntegrityAnalyzerInput): IntegrityReport {
  const { projectId } = input;
  const findings: IntegrityFinding[] = [];

  const byId = new Map<string, { projectId: string; status: string }>();
  const index = (id: string, ownerProjectId: string, status: string) => byId.set(id, { projectId: ownerProjectId, status });
  for (const p of input.projects) index(p.id, p.id, p.status);
  for (const f of input.folders) index(f.id, f.projectId, f.status);
  for (const d of input.documents) index(d.id, d.projectId, d.status);
  for (const k of input.knowledgeObjects) index(k.id, k.projectId, k.status);
  for (const e of input.evidenceSources) index(e.id, e.projectId, "active");

  const resolve = (id: string): IntegrityEndpointState => {
    const entity = byId.get(id);
    if (!entity) return "missing";
    if (entity.projectId !== projectId) return "cross_project";
    if (entity.status === "archived") return "archived";
    if (entity.status === "trashed") return "trashed";
    return "ok";
  };
  const severityFor = (state: IntegrityEndpointState): IntegritySeverity => (state === "archived" || state === "trashed" ? "warning" : "error");

  const knowledge = input.knowledgeObjects.filter(k => k.projectId === projectId);
  const knowledgeIds = new Set(knowledge.map(k => k.id));
  const relationships = input.relationships.filter(r => r.projectId === projectId);
  const evidenceLinks = input.evidenceLinks.filter(l => knowledgeIds.has(l.knowledgeObjectId));
  const evidenceSources = input.evidenceSources.filter(e => e.projectId === projectId);

  const evidenceCount = new Map<string, number>();
  for (const l of evidenceLinks) evidenceCount.set(l.knowledgeObjectId, (evidenceCount.get(l.knowledgeObjectId) ?? 0) + 1);
  const relatedKnowledge = new Set<string>();
  for (const r of relationships) {
    if (r.sourceType === "knowledge") relatedKnowledge.add(r.sourceId);
    if (r.targetType === "knowledge") relatedKnowledge.add(r.targetId);
  }

  const add = (kind: IntegrityFindingKind, severity: IntegritySeverity, subjectId: string, relatedIds: string[], message: string) =>
    findings.push({ id: integrityFindingId(projectId, kind, subjectId, relatedIds), kind, severity, subjectId, relatedIds, message });

  for (const r of relationships) {
    for (const [type, id] of [[r.sourceType, r.sourceId], [r.targetType, r.targetId]] as const) {
      const state = resolve(id);
      if (state === "ok") continue;
      add("broken_reference", severityFor(state), r.id, [id], `Relationship ${r.relationshipType} references a ${describeEndpointState(state)} ${type} (${id}).`);
    }
  }
  for (const l of evidenceLinks) {
    const state = resolve(l.evidenceSourceId);
    if (state === "ok") continue;
    add("broken_reference", severityFor(state), l.knowledgeObjectId, [l.evidenceSourceId], `Evidence link references a ${describeEndpointState(state)} evidence source (${l.evidenceSourceId}).`);
  }
  for (const e of evidenceSources) {
    if (!e.sourceId) continue;
    const state = resolve(e.sourceId);
    if (state === "ok") continue;
    add("broken_reference", severityFor(state), e.id, [e.sourceId], `Evidence source references a ${describeEndpointState(state)} ${e.sourceType} (${e.sourceId}).`);
  }

  for (const k of knowledge) {
    if (k.status === "approved" && (evidenceCount.get(k.id) ?? 0) === 0) {
      add("missing_evidence", "error", k.id, [], `Approved knowledge "${k.title}" has no attached evidence.`);
    }
  }

  for (const k of knowledge) {
    if (!INTEGRITY_ACTIVE.has(k.status)) continue;
    if ((evidenceCount.get(k.id) ?? 0) === 0 && !relatedKnowledge.has(k.id)) {
      add("orphaned", "warning", k.id, [], `Knowledge "${k.title}" has no evidence and no relationships.`);
    }
  }

  const active = knowledge.filter(k => INTEGRITY_ACTIVE.has(k.status));
  const pairs = new Set<string>();
  const emitPair = (a: KnowledgeObject, b: KnowledgeObject) => {
    if (a.id === b.id || a.type !== b.type) return;
    const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    const key = `${lo}|${hi}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    add("duplicate_candidate", "warning", lo, [hi], `Possible duplicate: "${a.title}" and "${b.title}" (${a.type}).`);
  };
  const byTitle = new Map<string, KnowledgeObject[]>();
  for (const k of active) {
    const key = `${k.type}::${normalizeIntegrityTitle(k.title)}`;
    const group = byTitle.get(key); if (group) group.push(k); else byTitle.set(key, [k]);
  }
  for (const group of byTitle.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) emitPair(group[i]!, group[j]!);
  const activeById = new Map(active.map(k => [k.id, k]));
  for (const r of relationships) {
    if (r.relationshipType !== "duplicates" || r.sourceType !== "knowledge" || r.targetType !== "knowledge") continue;
    const a = activeById.get(r.sourceId), b = activeById.get(r.targetId);
    if (a && b) emitPair(a, b);
  }

  const answered = new Set<string>();
  for (const r of relationships) {
    if (r.relationshipType !== "answers" || r.targetType !== "knowledge") continue;
    const sourceState = resolve(r.sourceId);
    if (sourceState !== "missing" && sourceState !== "cross_project") answered.add(r.targetId);
  }
  for (const k of knowledge) {
    if (k.type === "question" && INTEGRITY_ACTIVE.has(k.status) && !answered.has(k.id)) {
      add("unanswered_question", "warning", k.id, [], `Question "${k.title}" has no answer.`);
    }
  }

  findings.sort((a, b) =>
    INTEGRITY_SEVERITY_ORDER.indexOf(a.severity) - INTEGRITY_SEVERITY_ORDER.indexOf(b.severity)
    || INTEGRITY_KIND_ORDER.indexOf(a.kind) - INTEGRITY_KIND_ORDER.indexOf(b.kind)
    || a.subjectId.localeCompare(b.subjectId)
    || a.relatedIds.join(",").localeCompare(b.relatedIds.join(","))
    || a.id.localeCompare(b.id));

  const countsByKind = Object.fromEntries(INTEGRITY_KIND_ORDER.map(k => [k, 0])) as Record<IntegrityFindingKind, number>;
  for (const f of findings) countsByKind[f.kind]++;
  const errorCount = findings.filter(f => f.severity === "error").length;
  return { projectId, findings, totalCount: findings.length, errorCount, warningCount: findings.length - errorCount, countsByKind };
}
