import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import IntegrityView from "./IntegrityView";
import type {
  ApiResult,
  EvidenceSource,
  KnowledgeAggregateSnapshot,
  KnowledgeConfidence,
  KnowledgeHistoryEvent,
  KnowledgeHistoryRecord,
  KnowledgeObject,
  KnowledgeType,
  MergeKnowledgeInput,
  MergeKnowledgePreview,
  Project,
  Relationship,
  RelationshipEndpointType,
  RelationshipType,
  VaultSnapshot,
} from "@orbit/vault-types";

const unwrap = <T,>(result: ApiResult<T>) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const types: KnowledgeType[] = ["fact", "decision", "goal", "question", "idea", "preference"];
const confidenceLevels: KnowledgeConfidence[] = ["low", "medium", "high", "verified"];
const relationshipTypes: RelationshipType[] = ["supports", "references", "contradicts", "answers", "depends_on", "blocks", "implements", "duplicates", "derived_from", "belongs_to"];
const historyLabels: Record<KnowledgeHistoryEvent, string> = {
  created: "Created draft",
  edited: "Edited knowledge",
  approved: "Approved knowledge",
  archived: "Archived knowledge",
  restored: "Restored knowledge",
  superseded: "Superseded knowledge",
  merged: "Merged knowledge",
  baseline_migrated: "Recorded history baseline",
};

type Props = {
  snapshot: VaultSnapshot;
  project: Project | null;
  selectedId: string | null;
  onSelected: (id: string | null) => void;
  onChanged: () => Promise<void>;
  onError: (reason: unknown) => void;
  onOpenDocument: (id: string) => void;
};
type KnowledgeMode = "active" | "history" | "integrity";
type LifecyclePending = "approve" | "archive" | "restore" | "supersede" | "preview" | "merge" | null;
type LifecycleModal = { kind: "supersede"; sourceId: string } | { kind: "merge"; targetId: string } | null;

const uniqueKnowledge = (items: KnowledgeObject[]) => [...new Map(items.map(item => [item.id, item])).values()];
const sameIds = (left: string[], right: string[]) => left.length === right.length && left.every((id, index) => id === right[index]);
const sameIdSet = (left: string[], right: string[]) => sameIds([...left].sort(), [...right].sort());
const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

export default function KnowledgeView({ snapshot, project, selectedId, onSelected, onChanged, onError, onOpenDocument }: Props) {
  const [mode, setMode] = useState<KnowledgeMode>("active");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeObject[]>([]);
  const [historicalKnowledge, setHistoricalKnowledge] = useState<KnowledgeObject[]>([]);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<KnowledgeType>("fact");
  const [confidence, setConfidence] = useState<KnowledgeConfidence>("medium");
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);
  const [evidenceState, setEvidenceState] = useState<{ knowledgeObjectId: string | null; items: EvidenceSource[] }>({ knowledgeObjectId: null, items: [] });
  const [sourceId, setSourceId] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [locator, setLocator] = useState("");
  const [relationshipType, setRelationshipType] = useState<RelationshipType>("supports");
  const [relationshipTarget, setRelationshipTarget] = useState("");
  const [historyRecords, setHistoryRecords] = useState<KnowledgeHistoryRecord[]>([]);
  const [recordHistoryLoading, setRecordHistoryLoading] = useState(false);
  const historicalRequest = useRef(0);
  const projectIdRef = useRef<string | null>(project?.id ?? null);
  const evidenceRequest = useRef(0);
  const historyRequest = useRef(0);
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const modalTriggerRef = useRef<HTMLElement | null>(null);
  const [modal, setModal] = useState<LifecycleModal>(null);
  const [lifecyclePending, setLifecyclePending] = useState<LifecyclePending>(null);
  const lifecyclePendingRef = useRef<LifecyclePending>(null);
  const [supersedeReplacementId, setSupersedeReplacementId] = useState("");
  const [supersedeReason, setSupersedeReason] = useState("");
  const [mergeSourceIds, setMergeSourceIds] = useState<string[]>([]);
  const [mergeReason, setMergeReason] = useState("");
  const [mergePreview, setMergePreview] = useState<MergeKnowledgePreview | null>(null);
  const [mergePreviewInput, setMergePreviewInput] = useState<MergeKnowledgeInput | null>(null);
  const [mergePreviewSnapshotKey, setMergePreviewSnapshotKey] = useState<string | null>(null);
  lifecyclePendingRef.current = lifecyclePending;

  const activeKnowledge = useMemo(
    () => snapshot.knowledgeObjects.filter(item => item.projectId === project?.id && (item.status === "draft" || item.status === "approved")),
    [snapshot, project],
  );
  projectIdRef.current = project?.id ?? null;
  const allKnowledge = useMemo(() => uniqueKnowledge([...activeKnowledge, ...historicalKnowledge.filter(item => item.projectId === project?.id)]), [activeKnowledge, historicalKnowledge, project?.id]);
  const selected = allKnowledge.find(item => item.id === selectedId) ?? null;
  const selectedKnowledgeIdRef = useRef<string | null>(selected?.id ?? null);
  selectedKnowledgeIdRef.current = selected?.id ?? null;
  const evidence = selected && evidenceState.knowledgeObjectId === selected.id ? evidenceState.items : [];
  const activeCandidates = activeKnowledge.filter(item => item.status === "draft" || item.status === "approved");
  const knowledgeById = useMemo(() => new Map(allKnowledge.map(item => [item.id, item])), [allKnowledge]);
  const inspectFromIntegrity = useCallback((id: string) => { setMode("active"); onSelected(id); }, [onSelected]);
  const mergePairFromIntegrity = useCallback((targetId: string, sourceId: string) => {
    setMode("active"); onSelected(targetId); setMergeSourceIds([sourceId]); setModal({ kind: "merge", targetId });
  }, [onSelected]);
  const mergeSnapshotKey = useMemo(() => {
    if (modal?.kind !== "merge") return null;
    return [modal.targetId, ...mergeSourceIds]
      .sort()
      .map(id => {
        const item = activeKnowledge.find(candidate => candidate.id === id);
        return item ? `${item.id}:${item.status}:${item.updatedAt}` : `${id}:missing`;
      })
      .join("|");
  }, [modal, mergeSourceIds, activeKnowledge]);
  const clearMergePreview = useCallback(() => {
    setMergePreview(null);
    setMergePreviewInput(null);
    setMergePreviewSnapshotKey(null);
  }, []);
  const documents = snapshot.documents.filter(item => item.projectId === project?.id && item.status === "active");
  const folders = snapshot.folders.filter(item => item.projectId === project?.id && item.status === "active");
  const relationships = snapshot.relationships.filter(item => item.projectId === project?.id && (item.sourceId === selectedId || item.targetId === selectedId));

  const loadHistoricalKnowledge = useCallback(async (projectId: string) => {
    const requestId = ++historicalRequest.current;
    setHistoricalLoading(true);
    try {
      const [archived, superseded] = await Promise.all([
        window.vault.knowledge.list({ projectId, status: "archived" }),
        window.vault.knowledge.list({ projectId, status: "superseded" }),
      ]);
      const loaded = uniqueKnowledge([...unwrap(archived), ...unwrap(superseded)]);
      const scoped = loaded.filter(item => item.projectId === projectId);
      const isCurrent = historicalRequest.current === requestId && projectIdRef.current === projectId;
      if (isCurrent) setHistoricalKnowledge(scoped);
      return isCurrent ? scoped : null;
    } catch (reason) {
      if (historicalRequest.current === requestId && projectIdRef.current === projectId) onError(reason);
      return null;
    } finally {
      if (historicalRequest.current === requestId && projectIdRef.current === projectId) setHistoricalLoading(false);
    }
  }, [onError]);

  const reloadEvidence = useCallback(async (knowledgeObjectId: string) => {
    if (selectedKnowledgeIdRef.current !== knowledgeObjectId) return null;
    const requestId = ++evidenceRequest.current;
    setEvidenceState({ knowledgeObjectId: null, items: [] });
    try {
      const items = unwrap(await window.vault.evidence.list(knowledgeObjectId));
      if (evidenceRequest.current === requestId && selectedKnowledgeIdRef.current === knowledgeObjectId) {
        setEvidenceState({ knowledgeObjectId, items });
      }
      return items;
    } catch (reason) {
      if (evidenceRequest.current === requestId && selectedKnowledgeIdRef.current === knowledgeObjectId) onError(reason);
      return null;
    }
  }, [onError]);

  const reloadHistory = useCallback(async (knowledgeObjectId: string) => {
    const requestId = ++historyRequest.current;
    setRecordHistoryLoading(true);
    try {
      const records = unwrap(await window.vault.knowledge.history(knowledgeObjectId));
      if (historyRequest.current === requestId) setHistoryRecords(records);
      return records;
    } catch (reason) {
      if (historyRequest.current === requestId) onError(reason);
      return null;
    } finally {
      if (historyRequest.current === requestId) setRecordHistoryLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    historicalRequest.current += 1;
    setHistoricalLoading(false);
    setHistoricalKnowledge([]);
    setMode("active");
    setQuery("");
    setCreating(false);
    setModal(null);
    if (selectedId && !snapshot.knowledgeObjects.some(item => item.id === selectedId && item.projectId === project?.id)) onSelected(null);
  }, [project?.id]);

  useEffect(() => {
    if (mode === "history" && project) void loadHistoricalKnowledge(project.id);
  }, [mode, project?.id, snapshot, loadHistoricalKnowledge]);

  useEffect(() => {
    if (!project || mode !== "active") {
      setResults([]);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setResults(activeKnowledge);
        return;
      }
      void window.vault.knowledge.search({ query, projectId: project.id, limit: 100 })
        .then(value => {
          if (current) setResults(unwrap(value).filter(item => item.status === "draft" || item.status === "approved"));
        })
        .catch(reason => {
          if (current) onError(reason);
        });
    }, 160);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, mode, project, activeKnowledge, onError]);

  useEffect(() => {
    evidenceRequest.current += 1;
    setEvidenceState({ knowledgeObjectId: null, items: [] });
    if (!selected) {
      setHistoryRecords([]);
      setRecordHistoryLoading(false);
      historyRequest.current += 1;
      return;
    }
    setTitle(selected.title);
    setBody(selected.body);
    setType(selected.type);
    setConfidence(selected.confidence);
    setParentFolderId(selected.parentFolderId);
    void reloadEvidence(selected.id);
    void reloadHistory(selected.id);
  }, [selected?.id, selected?.updatedAt, reloadEvidence, reloadHistory]);

  useEffect(() => {
    if (mergePreviewInput && mergePreviewSnapshotKey !== mergeSnapshotKey) clearMergePreview();
  }, [mergePreviewInput, mergePreviewSnapshotKey, mergeSnapshotKey, clearMergePreview]);

  const historyResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...allKnowledge]
      .filter(item => !needle || [item.title, item.body, item.type, item.status].some(value => value.toLowerCase().includes(needle)))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [allKnowledge, query]);
  const visibleResults = mode === "history" ? historyResults : results;

  const create = async () => {
    if (!project || !title.trim() || !body.trim()) return;
    try {
      const item = unwrap(await window.vault.knowledge.create({ projectId: project.id, parentFolderId, type, title, body, confidence }));
      setCreating(false);
      onSelected(item.id);
      await onChanged();
    } catch (reason) {
      onError(reason);
    }
  };
  const save = async () => {
    if (!selected) return;
    try {
      unwrap(await window.vault.knowledge.update(selected.id, { title, body, type, confidence, parentFolderId }));
      await onChanged();
    } catch (reason) {
      onError(reason);
    }
  };
  const approve = async () => {
    if (!selected || lifecyclePending) return;
    setLifecyclePending("approve");
    try {
      unwrap(await window.vault.knowledge.approve(selected.id));
      await onChanged();
    } catch (reason) {
      onError(reason);
    } finally {
      setLifecyclePending(null);
    }
  };
  const archive = async () => {
    if (!selected || lifecyclePending) return;
    setLifecyclePending("archive");
    try {
      unwrap(await window.vault.knowledge.archive(selected.id));
      await onChanged();
      onSelected(null);
    } catch (reason) {
      onError(reason);
    } finally {
      setLifecyclePending(null);
    }
  };
  const restore = async () => {
    if (!selected || selected.status !== "archived" || lifecyclePending) return;
    setLifecyclePending("restore");
    try {
      const restored = unwrap(await window.vault.knowledge.restore(selected.id));
      await onChanged();
      setHistoricalKnowledge(items => items.filter(item => item.id !== restored.id));
      setMode("active");
      onSelected(restored.id);
      await reloadHistory(restored.id);
    } catch (reason) {
      onError(reason);
    } finally {
      setLifecyclePending(null);
    }
  };
  const attach = async () => {
    if (!project || !selected || !sourceId) return;
    const document = snapshot.documents.find(item => item.id === sourceId);
    if (!document) return;
    try {
      unwrap(await window.vault.evidence.attach({ projectId: project.id, knowledgeObjectId: selected.id, sourceType: document.kind === "file" ? "file" : "document", sourceId: document.id, sourcePath: document.relativePath, excerpt: excerpt.trim() || null, locator: locator.trim() || null, confidence }));
      setExcerpt("");
      setLocator("");
      setSourceId("");
      await onChanged();
      await reloadEvidence(selected.id);
    } catch (reason) {
      onError(reason);
    }
  };
  const addRelationship = async () => {
    if (!project || !selected || !relationshipTarget) return;
    const [targetType, targetId] = relationshipTarget.split(":") as [RelationshipEndpointType, string];
    try {
      unwrap(await window.vault.relationships.create({ projectId: project.id, sourceType: "knowledge", sourceId: selected.id, targetType, targetId, relationshipType }));
      setRelationshipTarget("");
      await onChanged();
    } catch (reason) {
      onError(reason);
    }
  };
  const removeRelationship = async (id: string) => {
    try {
      unwrap(await window.vault.relationships.remove(id));
      await onChanged();
    } catch (reason) {
      onError(reason);
    }
  };

  const entityLabel = (entityType: RelationshipEndpointType, id: string) => entityType === "project"
    ? project?.name ?? "Project"
    : entityType === "document"
      ? documents.find(item => item.id === id)?.title ?? "Missing document"
      : entityType === "knowledge"
        ? allKnowledge.find(item => item.id === id)?.title ?? "Missing knowledge"
        : snapshot.folders.find(item => item.id === id)?.name ?? "Missing folder";
  const evidenceLabel = (id: string) => {
    const source = snapshot.evidenceSources.find(item => item.id === id);
    if (!source) return id;
    return (source.sourceId ? documents.find(item => item.id === source.sourceId)?.title : null) ?? source.sourcePath ?? source.sourceType;
  };
  const follow = (entityType: RelationshipEndpointType, id: string) => {
    if (entityType === "knowledge") {
      setCreating(false);
      onSelected(id);
    } else if (entityType === "document") onOpenDocument(id);
  };
  const changeMode = (next: KnowledgeMode) => {
    setMode(next);
    setCreating(false);
    if (next === "active" && selected && !activeKnowledge.some(item => item.id === selected.id)) onSelected(null);
  };
  const startCreating = () => {
    setCreating(true);
    onSelected(null);
    setTitle("");
    setBody("");
    setType("fact");
    setConfidence("medium");
    setParentFolderId(null);
  };

  const resetModal = () => {
    setModal(null);
    setSupersedeReplacementId("");
    setSupersedeReason("");
    setMergeSourceIds([]);
    setMergeReason("");
    clearMergePreview();
  };
  const closeModal = () => {
    if (!lifecyclePending) resetModal();
  };
  const openSupersede = (trigger: HTMLElement) => {
    if (!selected || lifecyclePending) return;
    modalTriggerRef.current = trigger;
    setSupersedeReplacementId("");
    setSupersedeReason("");
    setModal({ kind: "supersede", sourceId: selected.id });
  };
  const openMerge = (trigger: HTMLElement) => {
    if (!selected || lifecyclePending) return;
    modalTriggerRef.current = trigger;
    setMergeSourceIds([]);
    setMergeReason("");
    clearMergePreview();
    setModal({ kind: "merge", targetId: selected.id });
  };
  const submitSupersede = async () => {
    if (!project || modal?.kind !== "supersede" || lifecyclePending) return;
    setLifecyclePending("supersede");
    try {
      const superseded = unwrap(await window.vault.knowledge.supersede({
        projectId: project.id,
        knowledgeObjectId: modal.sourceId,
        supersededById: supersedeReplacementId || null,
        reason: supersedeReason.trim() || null,
      }));
      await onChanged();
      const loaded = await loadHistoricalKnowledge(project.id);
      if (!loaded?.some(item => item.id === superseded.id)) setHistoricalKnowledge(items => uniqueKnowledge([...items, superseded]));
      setMode("history");
      setCreating(false);
      onSelected(superseded.id);
      await reloadHistory(superseded.id);
      resetModal();
    } catch (reason) {
      onError(reason);
    } finally {
      setLifecyclePending(null);
    }
  };
  const toggleMergeSource = (id: string) => {
    if (lifecyclePending) return;
    setMergeSourceIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
    clearMergePreview();
  };
  const requestMergePreview = async () => {
    if (!project || modal?.kind !== "merge" || mergeSourceIds.length === 0 || lifecyclePending || !mergeSnapshotKey) return;
    const input: MergeKnowledgeInput = {
      projectId: project.id,
      targetId: modal.targetId,
      sourceIds: [...mergeSourceIds],
      reason: mergeReason.trim() || null,
    };
    const snapshotKey = mergeSnapshotKey;
    setLifecyclePending("preview");
    clearMergePreview();
    try {
      const preview = unwrap(await window.vault.knowledge.previewMerge(input));
      setMergePreview(preview);
      setMergePreviewInput(input);
      setMergePreviewSnapshotKey(snapshotKey);
    } catch (reason) {
      onError(reason);
    } finally {
      setLifecyclePending(null);
    }
  };
  const canMerge = Boolean(
    project
    && modal?.kind === "merge"
    && mergePreview
    && mergePreviewInput
    && mergePreviewInput.projectId === project.id
    && mergePreviewInput.targetId === modal.targetId
    && sameIds(mergePreviewInput.sourceIds, mergeSourceIds)
    && mergePreview.target.id === mergePreviewInput.targetId
    && sameIdSet(mergePreview.sources.map(item => item.id), mergePreviewInput.sourceIds)
    && mergePreviewSnapshotKey === mergeSnapshotKey
    && mergeSourceIds.length > 0
    && mergePreview.blockingErrors.length === 0
    && !lifecyclePending,
  );
  const submitMerge = async () => {
    if (!project || !canMerge || !mergePreviewInput) return;
    setLifecyclePending("merge");
    try {
      const merged = unwrap(await window.vault.knowledge.merge({
        projectId: mergePreviewInput.projectId,
        targetId: mergePreviewInput.targetId,
        sourceIds: [...mergePreviewInput.sourceIds],
        reason: mergeReason.trim() || null,
      }));
      await onChanged();
      setMode("active");
      setCreating(false);
      onSelected(merged.target.id);
      await reloadHistory(merged.target.id);
      resetModal();
    } catch (reason) {
      onError(reason);
    } finally {
      setLifecyclePending(null);
    }
  };

  useEffect(() => {
    const modalObjectExists = modal?.kind === "supersede"
      ? allKnowledge.some(item => item.id === modal.sourceId)
      : modal?.kind === "merge"
        ? activeKnowledge.some(item => item.id === modal.targetId)
        : true;
    if (!modalObjectExists) resetModal();
  }, [modal, allKnowledge, activeKnowledge]);

  useLayoutEffect(() => {
    if (!modal) return;
    const dialog = dialogRef.current;
    const appRoot = document.querySelector<HTMLElement>(".vault-app");
    if (!dialog || !appRoot) return;
    const previouslyFocused = modalTriggerRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const wasInert = appRoot.inert;
    appRoot.inert = true;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
    (focusable()[0] ?? dialog).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !lifecyclePendingRef.current) {
        event.preventDefault();
        resetModal();
        return;
      }
      if (event.key === "Tab") {
        const controls = focusable();
        if (controls.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = controls[0]!;
        const last = controls.at(-1)!;
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) (focusable()[0] ?? dialog).focus();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      appRoot.inert = wasInert;
      previouslyFocused?.focus();
      if (!previouslyFocused?.isConnected) document.querySelector<HTMLElement>(".knowledge-search, .knowledge-inspector button")?.focus();
      modalTriggerRef.current = null;
    };
  }, [modal]);

  if (!project) return <div className="empty-state"><h2>Select a project</h2><p>Knowledge remains isolated to one project.</p></div>;

  const readOnly = selected?.status === "archived" || selected?.status === "superseded";
  const supersededTarget = selected?.supersededById ? allKnowledge.find(item => item.id === selected.supersededById) ?? null : null;
  const modalSource = modal?.kind === "supersede" ? allKnowledge.find(item => item.id === modal.sourceId) ?? null : null;
  const mergeTarget = modal?.kind === "merge" ? activeCandidates.find(item => item.id === modal.targetId) ?? null : null;
  const mergeSources = activeCandidates.filter(item => item.id !== mergeTarget?.id);

  return <><div className="knowledge-layout">
    <aside className="knowledge-list">
      <div className="knowledge-heading">
        <div><b>Project Knowledge</b><small>{mode === "active" ? activeKnowledge.length : allKnowledge.length} objects</small></div>
        {mode === "active" && <button onClick={startCreating}>+ Knowledge</button>}
      </div>
      <div className="knowledge-mode-switch" aria-label="Knowledge list mode">
        <button className={mode === "active" ? "active" : ""} aria-pressed={mode === "active"} onClick={() => changeMode("active")}>Active</button>
        <button className={mode === "history" ? "active" : ""} aria-pressed={mode === "history"} onClick={() => changeMode("history")}>History</button>
        <button className={mode === "integrity" ? "active" : ""} aria-pressed={mode === "integrity"} onClick={() => changeMode("integrity")}>Integrity</button>
      </div>
      <input className="knowledge-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={mode === "history" ? "Search active and historical knowledge…" : "Search knowledge…"} />
      <div className="knowledge-items">
        {visibleResults.map(item => <button className={item.id === selectedId ? "selected" : ""} onClick={() => { setCreating(false); onSelected(item.id); }} key={item.id}>
          <span className={`knowledge-type ${item.type}`}>{item.type[0].toUpperCase()}</span>
          <span><b>{item.title}</b><small>{folders.find(folder => folder.id === item.parentFolderId)?.relativePath ?? "Project Knowledge"} · {item.type} · {item.status}</small></span>
        </button>)}
        {mode === "history" && historicalLoading && <p>Loading historical knowledge…</p>}
        {!historicalLoading && visibleResults.length === 0 && <p>{mode === "history" ? "No active or historical knowledge matches this search." : "No knowledge objects found."}</p>}
      </div>
    </aside>
    <section className="knowledge-inspector">
      {mode === "integrity" ? <IntegrityView projectId={project.id} knowledgeById={knowledgeById} onError={onError} onInspect={inspectFromIntegrity} onMergePair={mergePairFromIntegrity} onAttachEvidence={inspectFromIntegrity} />
      : creating ? <>
        <InspectorHeader title="New draft" status="draft" />
        <KnowledgeForm title={title} body={body} type={type} confidence={confidence} parentFolderId={parentFolderId} folders={folders} setTitle={setTitle} setBody={setBody} setType={setType} setConfidence={setConfidence} setParentFolderId={setParentFolderId} />
        <div className="inspector-actions"><button onClick={() => setCreating(false)}>Cancel</button><button className="primary" disabled={!title.trim() || !body.trim()} onClick={() => void create()}>Create draft</button></div>
        <div className="knowledge-principle">Folder placement organizes knowledge but does not change its evidence, relationships, or project boundary.</div>
      </> : selected ? <>
        <InspectorHeader title={selected.title} status={selected.status} />
        {selected.status === "superseded" && <div className="superseded-notice">
          {supersededTarget ? <button onClick={() => onSelected(supersededTarget.id)}>Superseded by {supersededTarget.title}</button> : selected.supersededById ? <>Superseded by knowledge object {selected.supersededById}</> : <>Superseded without a replacement.</>}
        </div>}
        <KnowledgeForm title={title} body={body} type={type} confidence={confidence} parentFolderId={parentFolderId} folders={folders} setTitle={setTitle} setBody={setBody} setType={setType} setConfidence={setConfidence} setParentFolderId={setParentFolderId} readOnly={readOnly} />
        <div className="inspector-actions">
          {selected.status === "archived" ? <button className="primary" disabled={Boolean(lifecyclePending)} onClick={() => void restore()}>{lifecyclePending === "restore" ? "Restoring…" : "Restore"}</button> : selected.status !== "superseded" && <>
            <button className="consequential" disabled={Boolean(lifecyclePending)} onClick={event => openSupersede(event.currentTarget)}>Supersede</button>
            <button className="consequential" disabled={Boolean(lifecyclePending) || activeCandidates.length < 2} onClick={event => openMerge(event.currentTarget)}>Merge knowledge</button>
            <button disabled={Boolean(lifecyclePending)} onClick={() => void archive()}>{lifecyclePending === "archive" ? "Archiving…" : "Archive"}</button>
            <button disabled={Boolean(lifecyclePending)} onClick={() => void save()}>Save changes</button>
            {selected.status === "draft" && <button className="primary" disabled={Boolean(lifecyclePending) || evidence.length === 0} title={evidence.length === 0 ? "Attach evidence before approval" : ""} onClick={() => void approve()}>{lifecyclePending === "approve" ? "Approving…" : "Approve"}</button>}
          </>}
        </div>
        <EvidencePanel evidence={evidence} documents={documents} sourceId={sourceId} locator={locator} excerpt={excerpt} setSourceId={setSourceId} setLocator={setLocator} setExcerpt={setExcerpt} onOpenDocument={onOpenDocument} attach={attach} readOnly={readOnly} />
        <section className="relationship-panel">
          <div className="evidence-title"><b>Relationships & backlinks</b><span>{relationships.length} links</span></div>
          {relationships.map(item => <RelationshipCard key={item.id} item={item} selectedId={selected.id} entityLabel={entityLabel} follow={follow} remove={readOnly ? undefined : removeRelationship} />)}
          {!readOnly && <div className="relationship-create">
            <select value={relationshipType} onChange={event => setRelationshipType(event.target.value as RelationshipType)}>{relationshipTypes.map(value => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select>
            <select value={relationshipTarget} onChange={event => setRelationshipTarget(event.target.value)}><option value="">Choose target…</option><optgroup label="Knowledge">{activeCandidates.filter(item => item.id !== selected.id).map(item => <option value={`knowledge:${item.id}`} key={item.id}>{item.title}</option>)}</optgroup><optgroup label="Documents">{documents.map(item => <option value={`document:${item.id}`} key={item.id}>{item.relativePath}</option>)}</optgroup></select>
            <button disabled={!relationshipTarget} onClick={() => void addRelationship()}>Add relationship</button>
          </div>}
        </section>
        <KnowledgeHistory records={historyRecords} loading={recordHistoryLoading} />
      </> : <div className="empty-editor"><h2>Knowledge Inspector</h2><p>{mode === "history" ? "Select an active, archived, or superseded object to inspect its audit trail." : "Select an object or create a manual draft."}</p></div>}
    </section>
  </div>

    {modal?.kind === "supersede" && modalSource && createPortal(<div className="dialog-backdrop lifecycle-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
      <form ref={dialogRef} tabIndex={-1} className="lifecycle-modal" role="dialog" aria-modal="true" aria-labelledby="supersede-title" onSubmit={event => { event.preventDefault(); void submitSupersede(); }}>
        <header><small>Lifecycle action</small><h2 id="supersede-title">Supersede knowledge</h2><p>Remove an outdated object from Active knowledge while preserving its complete audit trail.</p></header>
        <div className="lifecycle-identity"><span className={`knowledge-type ${modalSource.type}`}>{modalSource.type[0].toUpperCase()}</span><div><b>{modalSource.title}</b><small>{modalSource.type} · {modalSource.status}</small></div></div>
        <label>Replacement (optional)<select autoFocus value={supersedeReplacementId} disabled={Boolean(lifecyclePending)} onChange={event => setSupersedeReplacementId(event.target.value)}><option value="">No replacement</option>{activeCandidates.filter(item => item.id !== modalSource.id).map(item => <option value={item.id} key={item.id}>{item.title} · {item.status}</option>)}</select></label>
        <label>Reason (optional)<textarea value={supersedeReason} disabled={Boolean(lifecyclePending)} onChange={event => setSupersedeReason(event.target.value)} placeholder="Why is this knowledge no longer current?" /></label>
        <div className="lifecycle-consequences"><b>What happens</b><ul><li>The source leaves the Active view.</li><li>Evidence and relationships stay attached.</li><li>History remains available from the Knowledge sidebar.</li></ul></div>
        <div className="lifecycle-modal-actions"><button type="button" disabled={Boolean(lifecyclePending)} onClick={closeModal}>Cancel</button><button className="consequential" type="submit" disabled={Boolean(lifecyclePending)}>{lifecyclePending === "supersede" ? "Superseding…" : "Supersede knowledge"}</button></div>
      </form>
    </div>, document.body)}

    {modal?.kind === "merge" && mergeTarget && createPortal(<div className="dialog-backdrop lifecycle-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
      <form ref={dialogRef} tabIndex={-1} className="lifecycle-modal merge" role="dialog" aria-modal="true" aria-labelledby="merge-title" onSubmit={event => { event.preventDefault(); void submitMerge(); }}>
        <header><small>Preview required</small><h2 id="merge-title">Merge knowledge</h2><p>The canonical text stays unchanged. Evidence and relationships move only after you review the merge plan.</p></header>
        <div className="lifecycle-identity"><span className={`knowledge-type ${mergeTarget.type}`}>{mergeTarget.type[0].toUpperCase()}</span><div><small>Canonical target</small><b>{mergeTarget.title}</b><small>{mergeTarget.type} · {mergeTarget.status}</small></div></div>
        <fieldset className="merge-source-list" disabled={Boolean(lifecyclePending)}><legend>Source objects</legend>{mergeSources.map((item, index) => <label key={item.id}><input autoFocus={index === 0} type="checkbox" checked={mergeSourceIds.includes(item.id)} onChange={() => toggleMergeSource(item.id)} /><span><b>{item.title}</b><small>{item.type} · {item.status}</small></span></label>)}{mergeSources.length === 0 && <p>No other active knowledge is available to merge.</p>}</fieldset>
        <label>Reason (optional)<textarea value={mergeReason} disabled={Boolean(lifecyclePending)} onChange={event => setMergeReason(event.target.value)} placeholder="Why should these objects share one canonical target?" /></label>
        <div className="merge-preview-actions"><button type="button" disabled={mergeSourceIds.length === 0 || Boolean(lifecyclePending)} onClick={() => void requestMergePreview()}>{lifecyclePending === "preview" ? "Previewing…" : "Preview merge"}</button>{mergePreviewInput && !sameIds(mergePreviewInput.sourceIds, mergeSourceIds) && <small>Source selection changed. Preview again.</small>}</div>
        {mergePreview && <MergePreviewPanel preview={mergePreview} entityLabel={entityLabel} evidenceLabel={evidenceLabel} />}
        <div className="lifecycle-modal-actions"><button type="button" disabled={Boolean(lifecyclePending)} onClick={closeModal}>Cancel</button><button className="consequential" type="submit" disabled={!canMerge}>{lifecyclePending === "merge" ? "Merging…" : "Merge knowledge"}</button></div>
      </form>
    </div>, document.body)}
  </>;
}

type EvidencePanelProps = {
  evidence: EvidenceSource[];
  documents: VaultSnapshot["documents"];
  sourceId: string;
  locator: string;
  excerpt: string;
  setSourceId: (value: string) => void;
  setLocator: (value: string) => void;
  setExcerpt: (value: string) => void;
  onOpenDocument: (id: string) => void;
  attach: () => Promise<void>;
  readOnly: boolean;
};

function EvidencePanel({ evidence, documents, sourceId, locator, excerpt, setSourceId, setLocator, setExcerpt, onOpenDocument, attach, readOnly }: EvidencePanelProps) {
  return <section className="evidence-panel"><div className="evidence-title"><b>Evidence</b><span>{evidence.length} sources</span></div>{evidence.map(item => {
    const document = documents.find(doc => doc.id === item.sourceId);
    return <div className="evidence-card" key={item.id}><button onClick={() => item.sourceId && onOpenDocument(item.sourceId)}>{document?.title ?? item.sourcePath ?? item.sourceType}</button><small>{item.locator || "Document"} · {item.confidence} · {item.availability}</small>{item.excerpt && <p>“{item.excerpt}”</p>}</div>;
  })}{!readOnly && <div className="attach-evidence"><select value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Choose source document…</option>{documents.map(document => <option value={document.id} key={document.id}>{document.relativePath}</option>)}</select><input value={locator} onChange={event => setLocator(event.target.value)} placeholder="Heading, line, or location" /><textarea value={excerpt} onChange={event => setExcerpt(event.target.value)} placeholder="Supporting excerpt (optional)" /><button disabled={!sourceId} onClick={() => void attach()}>Attach document evidence</button></div>}</section>;
}

function RelationshipCard({ item, selectedId, entityLabel, follow, remove }: { item: Relationship; selectedId: string; entityLabel: (type: RelationshipEndpointType, id: string) => string; follow: (type: RelationshipEndpointType, id: string) => void; remove?: (id: string) => Promise<void> }) {
  const outgoing = item.sourceId === selectedId;
  const type = outgoing ? item.targetType : item.sourceType;
  const id = outgoing ? item.targetId : item.sourceId;
  return <div className="relationship-card"><span className={`relationship-direction ${outgoing ? "outgoing" : "incoming"}`}>{outgoing ? "Outgoing" : "Backlink"}</span><button onClick={() => follow(type, id)}>{entityLabel(type, id)}</button><small>{outgoing ? item.relationshipType.replaceAll("_", " ") : `${item.relationshipType.replaceAll("_", " ")} this`}</small>{remove && <button className="relationship-remove" title="Remove relationship" onClick={() => void remove(item.id)}>×</button>}</div>;
}

function InspectorHeader({ title, status }: { title: string; status: string }) {
  return <div className="inspector-head"><div><small>Knowledge Inspector</small><h2>{title}</h2></div><span className={`knowledge-status ${status}`}>{status}</span></div>;
}

type FormProps = {
  title: string;
  body: string;
  type: KnowledgeType;
  confidence: KnowledgeConfidence;
  parentFolderId: string | null;
  folders: VaultSnapshot["folders"];
  setTitle: (value: string) => void;
  setBody: (value: string) => void;
  setType: (value: KnowledgeType) => void;
  setConfidence: (value: KnowledgeConfidence) => void;
  setParentFolderId: (value: string | null) => void;
  readOnly?: boolean;
};

function KnowledgeForm(props: FormProps) {
  return <div className={`knowledge-form ${props.readOnly ? "read-only" : ""}`}><label>Title<input value={props.title} readOnly={props.readOnly} onChange={event => props.setTitle(event.target.value)} placeholder="A concise claim or outcome" /></label><div className="knowledge-fields"><label>Type<select value={props.type} disabled={props.readOnly} onChange={event => props.setType(event.target.value as KnowledgeType)}>{types.map(type => <option value={type} key={type}>{type}</option>)}</select></label><label>Confidence<select value={props.confidence} disabled={props.readOnly} onChange={event => props.setConfidence(event.target.value as KnowledgeConfidence)}>{confidenceLevels.map(level => <option value={level} key={level}>{level}</option>)}</select></label></div><label>Folder<select value={props.parentFolderId ?? ""} disabled={props.readOnly} onChange={event => props.setParentFolderId(event.target.value || null)}><option value="">Project Knowledge (unfiled)</option>{props.folders.map(folder => <option value={folder.id} key={folder.id}>{folder.relativePath}</option>)}</select></label><label>Description<textarea value={props.body} readOnly={props.readOnly} onChange={event => props.setBody(event.target.value)} placeholder="What should the project remember?" /></label></div>;
}

function KnowledgeHistory({ records, loading }: { records: KnowledgeHistoryRecord[]; loading: boolean }) {
  const ordered = [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const groups: { operationId: string; records: KnowledgeHistoryRecord[] }[] = [];
  for (const record of ordered) {
    const previous = groups.at(-1);
    if (previous?.operationId === record.operationId) previous.records.push(record);
    else groups.push({ operationId: record.operationId, records: [record] });
  }
  return <section className="knowledge-history"><div className="evidence-title"><b>History</b><span>{records.length} events</span></div>{loading ? <p className="history-empty">Loading immutable history…</p> : groups.length === 0 ? <p className="history-empty">No history has been recorded for this object yet.</p> : <div className="history-spine">{groups.map(group => <article className="history-operation" key={`${group.operationId}-${group.records[0]?.id}`}><header><span>Operation</span><code title={group.operationId}>{group.operationId}</code></header>{group.records.map(record => <div className="history-event" key={record.id}><div className="history-event-head"><b>{historyLabels[record.eventType]}</b><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time></div><small>Actor: {record.actorType}{record.actorId ? ` · ${record.actorId}` : ""}</small>{record.reason && <p className="history-reason">{record.reason}</p>}<p className="history-change"><span>{snapshotSummary(record.beforeSnapshot)}</span><i aria-hidden="true">→</i><span>{snapshotSummary(record.afterSnapshot)}</span></p><details><summary>Linked IDs</summary><SnapshotLinks label="Before" snapshot={record.beforeSnapshot} /><SnapshotLinks label="After" snapshot={record.afterSnapshot} /></details></div>)}</article>)}</div>}</section>;
}

const snapshotSummary = (snapshot: KnowledgeAggregateSnapshot | null) => snapshot ? `${snapshot.object.status} · ${snapshot.object.title}` : "No snapshot";

function SnapshotLinks({ label, snapshot }: { label: string; snapshot: KnowledgeAggregateSnapshot | null }) {
  if (!snapshot) return <div className="history-snapshot"><b>{label}</b><small>No snapshot</small></div>;
  const rows = [
    ["Evidence", snapshot.evidenceLinks.map(item => item.id)],
    ["Incoming", snapshot.incomingRelationships.map(item => item.id)],
    ["Outgoing", snapshot.outgoingRelationships.map(item => item.id)],
  ] as const;
  return <div className="history-snapshot"><b>{label}</b>{rows.map(([name, ids]) => <div key={name}><span>{name}</span><code>{ids.length ? ids.join(", ") : "None"}</code></div>)}</div>;
}

function MergePreviewPanel({ preview, entityLabel, evidenceLabel }: { preview: MergeKnowledgePreview; entityLabel: (type: RelationshipEndpointType, id: string) => string; evidenceLabel: (id: string) => string }) {
  const duplicates = preview.conflicts.filter(item => item.resolution === "duplicate_collapsed");
  const selfLinks = preview.conflicts.filter(item => item.resolution === "self_link_removed");
  return <section className="merge-preview" aria-live="polite"><div className="merge-preview-heading"><b>Merge preview</b><span>{preview.blockingErrors.length ? "Blocked" : "Ready"}</span></div><div className="merge-preview-grid"><section><small>Canonical target</small><b>{preview.target.title}</b></section><section><small>Source objects</small>{preview.sources.map(item => <b key={item.id}>{item.title}</b>)}</section></div><section><h3>Evidence transferred <span>{preview.evidenceLinks.length}</span></h3>{preview.evidenceLinks.length ? <ul>{preview.evidenceLinks.map(link => <li key={link.id}><code>{link.id}</code><span>{evidenceLabel(link.evidenceSourceId)}</span></li>)}</ul> : <p>No Evidence links will move.</p>}</section><section><h3>Relationships redirected <span>{preview.redirectedRelationships.length}</span></h3>{preview.redirectedRelationships.length ? <ul>{preview.redirectedRelationships.map(item => <li key={item.id}><code>{item.id}</code><span>{entityLabel(item.sourceType, item.sourceId)} → {entityLabel(item.targetType, item.targetId)} · {item.relationshipType.replaceAll("_", " ")}</span></li>)}</ul> : <p>No relationships will be redirected.</p>}</section><section className="merge-conflicts"><div><h3>Duplicate links collapsed <span>{duplicates.length}</span></h3>{duplicates.length ? <ul>{duplicates.map(item => <li key={item.relationshipId}><code>{item.relationshipId}</code><span>Retain {item.retainedRelationshipId}</span></li>)}</ul> : <p>None</p>}</div><div><h3>Self-links removed <span>{selfLinks.length}</span></h3>{selfLinks.length ? <ul>{selfLinks.map(item => <li key={item.relationshipId}><code>{item.relationshipId}</code></li>)}</ul> : <p>None</p>}</div></section>{preview.blockingErrors.length > 0 && <section className="merge-blocking"><h3>Blocking errors</h3><ul>{preview.blockingErrors.map(error => <li key={error}>{error}</li>)}</ul></section>}</section>;
}
