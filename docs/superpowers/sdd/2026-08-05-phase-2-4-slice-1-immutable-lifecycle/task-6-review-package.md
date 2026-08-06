# Task 6 review package
## Commits
```
df9b5e8 feat: add knowledge lifecycle inspector workflows
```
## Stat
```
 apps/vault-desktop/renderer/src/KnowledgeView.tsx | 645 ++++++++++++++++++++--
 apps/vault-desktop/renderer/src/styles.css        |  13 +
 scripts/phase2-lifecycle-ui-regression.mjs        |  31 +-
 3 files changed, 649 insertions(+), 40 deletions(-)
```
## Diff
```diff
diff --git a/apps/vault-desktop/renderer/src/KnowledgeView.tsx b/apps/vault-desktop/renderer/src/KnowledgeView.tsx
index 4ab187b..3b8476f 100644
--- a/apps/vault-desktop/renderer/src/KnowledgeView.tsx
+++ b/apps/vault-desktop/renderer/src/KnowledgeView.tsx
@@ -1,39 +1,606 @@
-import { useEffect, useMemo, useState } from "react";
-import type { ApiResult, EvidenceSource, KnowledgeConfidence, KnowledgeObject, KnowledgeType, Project, Relationship, RelationshipEndpointType, RelationshipType, VaultSnapshot } from "@orbit/vault-types";
-
-const unwrap=<T,>(result:ApiResult<T>)=>{if(!result.ok)throw new Error(result.error.message);return result.value;};
-const types:KnowledgeType[]=["fact","decision","goal","question","idea","preference"];
-const confidenceLevels:KnowledgeConfidence[]=["low","medium","high","verified"];
-const relationshipTypes:RelationshipType[]=["supports","references","contradicts","answers","depends_on","blocks","implements","duplicates","derived_from","belongs_to"];
-type Props={snapshot:VaultSnapshot;project:Project|null;selectedId:string|null;onSelected:(id:string|null)=>void;onChanged:()=>Promise<void>;onError:(reason:unknown)=>void;onOpenDocument:(id:string)=>void};
-
-export default function KnowledgeView({snapshot,project,selectedId,onSelected,onChanged,onError,onOpenDocument}:Props){
-  const [query,setQuery]=useState(""); const [results,setResults]=useState<KnowledgeObject[]>([]); const [creating,setCreating]=useState(false);
-  const [title,setTitle]=useState(""); const [body,setBody]=useState(""); const [type,setType]=useState<KnowledgeType>("fact"); const [confidence,setConfidence]=useState<KnowledgeConfidence>("medium"); const [parentFolderId,setParentFolderId]=useState<string|null>(null);
-  const [evidence,setEvidence]=useState<EvidenceSource[]>([]); const [sourceId,setSourceId]=useState(""); const [excerpt,setExcerpt]=useState(""); const [locator,setLocator]=useState("");
-  const [relationshipType,setRelationshipType]=useState<RelationshipType>("supports"); const [relationshipTarget,setRelationshipTarget]=useState("");
-  const projectKnowledge=useMemo(()=>snapshot.knowledgeObjects.filter(item=>item.projectId===project?.id),[snapshot,project]);
-  const selected=projectKnowledge.find(item=>item.id===selectedId)??null;
-  const documents=snapshot.documents.filter(item=>item.projectId===project?.id&&item.status==="active");
-  const folders=snapshot.folders.filter(item=>item.projectId===project?.id&&item.status==="active");
-  const relationships=snapshot.relationships.filter(item=>item.projectId===project?.id&&(item.sourceId===selectedId||item.targetId===selectedId));
-  useEffect(()=>{if(!project)return setResults([]);const timer=setTimeout(()=>{if(!query.trim())return setResults(projectKnowledge);void window.vault.knowledge.search({query,projectId:project.id,limit:100}).then(value=>setResults(unwrap(value))).catch(onError);},160);return()=>clearTimeout(timer);},[query,project,projectKnowledge,onError]);
-  useEffect(()=>{if(!selected){setEvidence([]);return;}setTitle(selected.title);setBody(selected.body);setType(selected.type);setConfidence(selected.confidence);setParentFolderId(selected.parentFolderId);void window.vault.evidence.list(selected.id).then(value=>setEvidence(unwrap(value))).catch(onError);},[selected?.id,selected?.updatedAt,onError]);
-  const create=async()=>{if(!project||!title.trim()||!body.trim())return;try{const item=unwrap(await window.vault.knowledge.create({projectId:project.id,parentFolderId,type,title,body,confidence}));setCreating(false);onSelected(item.id);await onChanged();}catch(reason){onError(reason);}};
-  const save=async()=>{if(!selected)return;try{unwrap(await window.vault.knowledge.update(selected.id,{title,body,type,confidence,parentFolderId}));await onChanged();}catch(reason){onError(reason);}};
-  const approve=async()=>{if(!selected)return;try{unwrap(await window.vault.knowledge.approve(selected.id));await onChanged();}catch(reason){onError(reason);}};
-  const archive=async()=>{if(!selected)return;try{unwrap(await window.vault.knowledge.archive(selected.id));onSelected(null);await onChanged();}catch(reason){onError(reason);}};
-  const attach=async()=>{if(!project||!selected||!sourceId)return;const document=snapshot.documents.find(item=>item.id===sourceId);if(!document)return;try{unwrap(await window.vault.evidence.attach({projectId:project.id,knowledgeObjectId:selected.id,sourceType:document.kind==="file"?"file":"document",sourceId:document.id,sourcePath:document.relativePath,excerpt:excerpt.trim()||null,locator:locator.trim()||null,confidence}));setExcerpt("");setLocator("");setSourceId("");await onChanged();setEvidence(unwrap(await window.vault.evidence.list(selected.id)));}catch(reason){onError(reason);}};
-  const addRelationship=async()=>{if(!project||!selected||!relationshipTarget)return;const [targetType,targetId]=relationshipTarget.split(":") as [RelationshipEndpointType,string];try{unwrap(await window.vault.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:selected.id,targetType,targetId,relationshipType}));setRelationshipTarget("");await onChanged();}catch(reason){onError(reason);}};
-  const removeRelationship=async(id:string)=>{try{unwrap(await window.vault.relationships.remove(id));await onChanged();}catch(reason){onError(reason);}};
-  const entityLabel=(entityType:RelationshipEndpointType,id:string)=>entityType==="project"?project?.name??"Project":entityType==="document"?documents.find(item=>item.id===id)?.title??"Missing document":entityType==="knowledge"?projectKnowledge.find(item=>item.id===id)?.title??"Missing knowledge":snapshot.folders.find(item=>item.id===id)?.name??"Missing folder";
-  const follow=(entityType:RelationshipEndpointType,id:string)=>{if(entityType==="knowledge"){setCreating(false);onSelected(id);}else if(entityType==="document")onOpenDocument(id);};
-  if(!project)return <div className="empty-state"><h2>Select a project</h2><p>Knowledge remains isolated to one project.</p></div>;
-  return <div className="knowledge-layout"><aside className="knowledge-list"><div className="knowledge-heading"><div><b>Project Knowledge</b><small>{projectKnowledge.length} objects</small></div><button onClick={()=>{setCreating(true);onSelected(null);setTitle("");setBody("");setType("fact");setConfidence("medium");setParentFolderId(null);}}>+ Knowledge</button></div><input className="knowledge-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search knowledge…"/><div className="knowledge-items">{results.map(item=><button className={item.id===selectedId?"selected":""} onClick={()=>{setCreating(false);onSelected(item.id);}} key={item.id}><span className={`knowledge-type ${item.type}`}>{item.type[0].toUpperCase()}</span><span><b>{item.title}</b><small>{folders.find(folder=>folder.id===item.parentFolderId)?.relativePath??"Project Knowledge"} · {item.type} · {item.status}</small></span></button>)}{results.length===0&&<p>No knowledge objects found.</p>}</div></aside><section className="knowledge-inspector">{creating?<><InspectorHeader title="New draft" status="draft"/><KnowledgeForm title={title} body={body} type={type} confidence={confidence} parentFolderId={parentFolderId} folders={folders} setTitle={setTitle} setBody={setBody} setType={setType} setConfidence={setConfidence} setParentFolderId={setParentFolderId}/><div className="inspector-actions"><button onClick={()=>setCreating(false)}>Cancel</button><button className="primary" disabled={!title.trim()||!body.trim()} onClick={()=>void create()}>Create draft</button></div><div className="knowledge-principle">Folder placement organizes knowledge but does not change its evidence, relationships, or project boundary.</div></>:selected?<><InspectorHeader title={selected.title} status={selected.status}/><KnowledgeForm title={title} body={body} type={type} confidence={confidence} parentFolderId={parentFolderId} folders={folders} setTitle={setTitle} setBody={setBody} setType={setType} setConfidence={setConfidence} setParentFolderId={setParentFolderId}/><div className="inspector-actions"><button onClick={()=>void archive()}>Archive</button><button onClick={()=>void save()}>Save changes</button>{selected.status==="draft"&&<button className="primary" disabled={evidence.length===0} title={evidence.length===0?"Attach evidence before approval":""} onClick={()=>void approve()}>Approve</button>}</div><EvidencePanel evidence={evidence} documents={documents} sourceId={sourceId} locator={locator} excerpt={excerpt} setSourceId={setSourceId} setLocator={setLocator} setExcerpt={setExcerpt} onOpenDocument={onOpenDocument} attach={attach}/><section className="relationship-panel"><div className="evidence-title"><b>Relationships & backlinks</b><span>{relationships.length} links</span></div>{relationships.map(item=><RelationshipCard key={item.id} item={item} selectedId={selected.id} entityLabel={entityLabel} follow={follow} remove={removeRelationship}/>) }<div className="relationship-create"><select value={relationshipType} onChange={event=>setRelationshipType(event.target.value as RelationshipType)}>{relationshipTypes.map(value=><option value={value} key={value}>{value.replaceAll("_"," ")}</option>)}</select><select value={relationshipTarget} onChange={event=>setRelationshipTarget(event.target.value)}><option value="">Choose target…</option><optgroup label="Knowledge">{projectKnowledge.filter(item=>item.id!==selected.id).map(item=><option value={`knowledge:${item.id}`} key={item.id}>{item.title}</option>)}</optgroup><optgroup label="Documents">{documents.map(item=><option value={`document:${item.id}`} key={item.id}>{item.relativePath}</option>)}</optgroup></select><button disabled={!relationshipTarget} onClick={()=>void addRelationship()}>Add relationship</button></div></section></>:<div className="empty-editor"><h2>Knowledge Inspector</h2><p>Select an object or create a manual draft.</p></div>}</section></div>;
-}
-
-function EvidencePanel({evidence,documents,sourceId,locator,excerpt,confidence,setSourceId,setLocator,setExcerpt,onOpenDocument,attach}:any){return <section className="evidence-panel"><div className="evidence-title"><b>Evidence</b><span>{evidence.length} sources</span></div>{evidence.map((item:EvidenceSource)=>{const document=documents.find((doc:any)=>doc.id===item.sourceId);return <div className="evidence-card" key={item.id}><button onClick={()=>item.sourceId&&onOpenDocument(item.sourceId)}>{document?.title??item.sourcePath??item.sourceType}</button><small>{item.locator||"Document"} · {item.confidence} · {item.availability}</small>{item.excerpt&&<p>“{item.excerpt}”</p>}</div>})}<div className="attach-evidence"><select value={sourceId} onChange={(event:any)=>setSourceId(event.target.value)}><option value="">Choose source document…</option>{documents.map((document:any)=><option value={document.id} key={document.id}>{document.relativePath}</option>)}</select><input value={locator} onChange={(event:any)=>setLocator(event.target.value)} placeholder="Heading, line, or location"/><textarea value={excerpt} onChange={(event:any)=>setExcerpt(event.target.value)} placeholder="Supporting excerpt (optional)"/><button disabled={!sourceId} onClick={()=>void attach()}>Attach document evidence</button></div></section>}
-function RelationshipCard({item,selectedId,entityLabel,follow,remove}:{item:Relationship;selectedId:string;entityLabel:(type:RelationshipEndpointType,id:string)=>string;follow:(type:RelationshipEndpointType,id:string)=>void;remove:(id:string)=>Promise<void>}){const outgoing=item.sourceId===selectedId;const type=outgoing?item.targetType:item.sourceType;const id=outgoing?item.targetId:item.sourceId;return <div className="relationship-card"><span className={`relationship-direction ${outgoing?"outgoing":"incoming"}`}>{outgoing?"Outgoing":"Backlink"}</span><button onClick={()=>follow(type,id)}>{entityLabel(type,id)}</button><small>{outgoing?item.relationshipType.replaceAll("_"," "):`${item.relationshipType.replaceAll("_"," ")} this`}</small><button className="relationship-remove" title="Remove relationship" onClick={()=>void remove(item.id)}>×</button></div>}
-function InspectorHeader({title,status}:{title:string;status:string}){return <div className="inspector-head"><div><small>Knowledge Inspector</small><h2>{title}</h2></div><span className={`knowledge-status ${status}`}>{status}</span></div>}
-type FormProps={title:string;body:string;type:KnowledgeType;confidence:KnowledgeConfidence;parentFolderId:string|null;folders:VaultSnapshot["folders"];setTitle:(value:string)=>void;setBody:(value:string)=>void;setType:(value:KnowledgeType)=>void;setConfidence:(value:KnowledgeConfidence)=>void;setParentFolderId:(value:string|null)=>void};
-function KnowledgeForm(props:FormProps){return <div className="knowledge-form"><label>Title<input value={props.title} onChange={event=>props.setTitle(event.target.value)} placeholder="A concise claim or outcome"/></label><div className="knowledge-fields"><label>Type<select value={props.type} onChange={event=>props.setType(event.target.value as KnowledgeType)}>{types.map(type=><option value={type} key={type}>{type}</option>)}</select></label><label>Confidence<select value={props.confidence} onChange={event=>props.setConfidence(event.target.value as KnowledgeConfidence)}>{confidenceLevels.map(level=><option value={level} key={level}>{level}</option>)}</select></label></div><label>Folder<select value={props.parentFolderId??""} onChange={event=>props.setParentFolderId(event.target.value||null)}><option value="">Project Knowledge (unfiled)</option>{props.folders.map(folder=><option value={folder.id} key={folder.id}>{folder.relativePath}</option>)}</select></label><label>Description<textarea value={props.body} onChange={event=>props.setBody(event.target.value)} placeholder="What should the project remember?"/></label></div>}
+import { useCallback, useEffect, useMemo, useRef, useState } from "react";
+import type {
+  ApiResult,
+  EvidenceSource,
+  KnowledgeAggregateSnapshot,
+  KnowledgeConfidence,
+  KnowledgeHistoryEvent,
+  KnowledgeHistoryRecord,
+  KnowledgeObject,
+  KnowledgeType,
+  MergeKnowledgeInput,
+  MergeKnowledgePreview,
+  Project,
+  Relationship,
+  RelationshipEndpointType,
+  RelationshipType,
+  VaultSnapshot,
+} from "@orbit/vault-types";
+
+const unwrap = <T,>(result: ApiResult<T>) => {
+  if (!result.ok) throw new Error(result.error.message);
+  return result.value;
+};
+
+const types: KnowledgeType[] = ["fact", "decision", "goal", "question", "idea", "preference"];
+const confidenceLevels: KnowledgeConfidence[] = ["low", "medium", "high", "verified"];
+const relationshipTypes: RelationshipType[] = ["supports", "references", "contradicts", "answers", "depends_on", "blocks", "implements", "duplicates", "derived_from", "belongs_to"];
+const historyLabels: Record<KnowledgeHistoryEvent, string> = {
+  created: "Created draft",
+  edited: "Edited knowledge",
+  approved: "Approved knowledge",
+  archived: "Archived knowledge",
+  restored: "Restored knowledge",
+  superseded: "Superseded knowledge",
+  merged: "Merged knowledge",
+  baseline_migrated: "Recorded history baseline",
+};
+
+type Props = {
+  snapshot: VaultSnapshot;
+  project: Project | null;
+  selectedId: string | null;
+  onSelected: (id: string | null) => void;
+  onChanged: () => Promise<void>;
+  onError: (reason: unknown) => void;
+  onOpenDocument: (id: string) => void;
+};
+type KnowledgeMode = "active" | "history";
+type LifecyclePending = "approve" | "archive" | "restore" | "supersede" | "preview" | "merge" | null;
+type LifecycleModal = { kind: "supersede"; sourceId: string } | { kind: "merge"; targetId: string } | null;
+
+const uniqueKnowledge = (items: KnowledgeObject[]) => [...new Map(items.map(item => [item.id, item])).values()];
+const sameIds = (left: string[], right: string[]) => left.length === right.length && left.every((id, index) => id === right[index]);
+
+export default function KnowledgeView({ snapshot, project, selectedId, onSelected, onChanged, onError, onOpenDocument }: Props) {
+  const [mode, setMode] = useState<KnowledgeMode>("active");
+  const [query, setQuery] = useState("");
+  const [results, setResults] = useState<KnowledgeObject[]>([]);
+  const [historicalKnowledge, setHistoricalKnowledge] = useState<KnowledgeObject[]>([]);
+  const [historicalLoading, setHistoricalLoading] = useState(false);
+  const [creating, setCreating] = useState(false);
+  const [title, setTitle] = useState("");
+  const [body, setBody] = useState("");
+  const [type, setType] = useState<KnowledgeType>("fact");
+  const [confidence, setConfidence] = useState<KnowledgeConfidence>("medium");
+  const [parentFolderId, setParentFolderId] = useState<string | null>(null);
+  const [evidence, setEvidence] = useState<EvidenceSource[]>([]);
+  const [sourceId, setSourceId] = useState("");
+  const [excerpt, setExcerpt] = useState("");
+  const [locator, setLocator] = useState("");
+  const [relationshipType, setRelationshipType] = useState<RelationshipType>("supports");
+  const [relationshipTarget, setRelationshipTarget] = useState("");
+  const [historyRecords, setHistoryRecords] = useState<KnowledgeHistoryRecord[]>([]);
+  const [recordHistoryLoading, setRecordHistoryLoading] = useState(false);
+  const historyRequest = useRef(0);
+  const [modal, setModal] = useState<LifecycleModal>(null);
+  const [lifecyclePending, setLifecyclePending] = useState<LifecyclePending>(null);
+  const [supersedeReplacementId, setSupersedeReplacementId] = useState("");
+  const [supersedeReason, setSupersedeReason] = useState("");
+  const [mergeSourceIds, setMergeSourceIds] = useState<string[]>([]);
+  const [mergeReason, setMergeReason] = useState("");
+  const [mergePreview, setMergePreview] = useState<MergeKnowledgePreview | null>(null);
+  const [mergePreviewInput, setMergePreviewInput] = useState<MergeKnowledgeInput | null>(null);
+
+  const activeKnowledge = useMemo(
+    () => snapshot.knowledgeObjects.filter(item => item.projectId === project?.id && (item.status === "draft" || item.status === "approved")),
+    [snapshot, project],
+  );
+  const allKnowledge = useMemo(() => uniqueKnowledge([...activeKnowledge, ...historicalKnowledge]), [activeKnowledge, historicalKnowledge]);
+  const selected = allKnowledge.find(item => item.id === selectedId) ?? null;
+  const activeCandidates = activeKnowledge.filter(item => item.status === "draft" || item.status === "approved");
+  const documents = snapshot.documents.filter(item => item.projectId === project?.id && item.status === "active");
+  const folders = snapshot.folders.filter(item => item.projectId === project?.id && item.status === "active");
+  const relationships = snapshot.relationships.filter(item => item.projectId === project?.id && (item.sourceId === selectedId || item.targetId === selectedId));
+
+  const loadHistoricalKnowledge = useCallback(async (projectId: string) => {
+    setHistoricalLoading(true);
+    try {
+      const [archived, superseded] = await Promise.all([
+        window.vault.knowledge.list({ projectId, status: "archived" }),
+        window.vault.knowledge.list({ projectId, status: "superseded" }),
+      ]);
+      const loaded = uniqueKnowledge([...unwrap(archived), ...unwrap(superseded)]);
+      setHistoricalKnowledge(loaded);
+      return loaded;
+    } catch (reason) {
+      onError(reason);
+      return null;
+    } finally {
+      setHistoricalLoading(false);
+    }
+  }, [onError]);
+
+  const reloadHistory = useCallback(async (knowledgeObjectId: string) => {
+    const requestId = ++historyRequest.current;
+    setRecordHistoryLoading(true);
+    try {
+      const records = unwrap(await window.vault.knowledge.history(knowledgeObjectId));
+      if (historyRequest.current === requestId) setHistoryRecords(records);
+      return records;
+    } catch (reason) {
+      if (historyRequest.current === requestId) onError(reason);
+      return null;
+    } finally {
+      if (historyRequest.current === requestId) setRecordHistoryLoading(false);
+    }
+  }, [onError]);
+
+  useEffect(() => {
+    setHistoricalKnowledge([]);
+    setMode("active");
+    setQuery("");
+    setCreating(false);
+  }, [project?.id]);
+
+  useEffect(() => {
+    if (mode === "history" && project) void loadHistoricalKnowledge(project.id);
+  }, [mode, project?.id, snapshot, loadHistoricalKnowledge]);
+
+  useEffect(() => {
+    if (!project || mode !== "active") {
+      setResults([]);
+      return;
+    }
+    let current = true;
+    const timer = setTimeout(() => {
+      if (!query.trim()) {
+        setResults(activeKnowledge);
+        return;
+      }
+      void window.vault.knowledge.search({ query, projectId: project.id, limit: 100 })
+        .then(value => {
+          if (current) setResults(unwrap(value).filter(item => item.status === "draft" || item.status === "approved"));
+        })
+        .catch(reason => {
+          if (current) onError(reason);
+        });
+    }, 160);
+    return () => {
+      current = false;
+      clearTimeout(timer);
+    };
+  }, [query, mode, project, activeKnowledge, onError]);
+
+  useEffect(() => {
+    if (!selected) {
+      setEvidence([]);
+      setHistoryRecords([]);
+      setRecordHistoryLoading(false);
+      historyRequest.current += 1;
+      return;
+    }
+    setTitle(selected.title);
+    setBody(selected.body);
+    setType(selected.type);
+    setConfidence(selected.confidence);
+    setParentFolderId(selected.parentFolderId);
+    void window.vault.evidence.list(selected.id).then(value => setEvidence(unwrap(value))).catch(onError);
+    void reloadHistory(selected.id);
+  }, [selected?.id, selected?.updatedAt, onError, reloadHistory]);
+
+  const historyResults = useMemo(() => {
+    const needle = query.trim().toLowerCase();
+    return [...allKnowledge]
+      .filter(item => !needle || [item.title, item.body, item.type, item.status].some(value => value.toLowerCase().includes(needle)))
+      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
+  }, [allKnowledge, query]);
+  const visibleResults = mode === "history" ? historyResults : results;
+
+  const create = async () => {
+    if (!project || !title.trim() || !body.trim()) return;
+    try {
+      const item = unwrap(await window.vault.knowledge.create({ projectId: project.id, parentFolderId, type, title, body, confidence }));
+      setCreating(false);
+      onSelected(item.id);
+      await onChanged();
+    } catch (reason) {
+      onError(reason);
+    }
+  };
+  const save = async () => {
+    if (!selected) return;
+    try {
+      unwrap(await window.vault.knowledge.update(selected.id, { title, body, type, confidence, parentFolderId }));
+      await onChanged();
+    } catch (reason) {
+      onError(reason);
+    }
+  };
+  const approve = async () => {
+    if (!selected || lifecyclePending) return;
+    setLifecyclePending("approve");
+    try {
+      unwrap(await window.vault.knowledge.approve(selected.id));
+      await onChanged();
+    } catch (reason) {
+      onError(reason);
+    } finally {
+      setLifecyclePending(null);
+    }
+  };
+  const archive = async () => {
+    if (!selected || lifecyclePending) return;
+    setLifecyclePending("archive");
+    try {
+      unwrap(await window.vault.knowledge.archive(selected.id));
+      await onChanged();
+      onSelected(null);
+    } catch (reason) {
+      onError(reason);
+    } finally {
+      setLifecyclePending(null);
+    }
+  };
+  const restore = async () => {
+    if (!selected || selected.status !== "archived" || lifecyclePending) return;
+    setLifecyclePending("restore");
+    try {
+      const restored = unwrap(await window.vault.knowledge.restore(selected.id));
+      await onChanged();
+      setHistoricalKnowledge(items => items.filter(item => item.id !== restored.id));
+      setMode("active");
+      onSelected(restored.id);
+      await reloadHistory(restored.id);
+    } catch (reason) {
+      onError(reason);
+    } finally {
+      setLifecyclePending(null);
+    }
+  };
+  const attach = async () => {
+    if (!project || !selected || !sourceId) return;
+    const document = snapshot.documents.find(item => item.id === sourceId);
+    if (!document) return;
+    try {
+      unwrap(await window.vault.evidence.attach({ projectId: project.id, knowledgeObjectId: selected.id, sourceType: document.kind === "file" ? "file" : "document", sourceId: document.id, sourcePath: document.relativePath, excerpt: excerpt.trim() || null, locator: locator.trim() || null, confidence }));
+      setExcerpt("");
+      setLocator("");
+      setSourceId("");
+      await onChanged();
+      setEvidence(unwrap(await window.vault.evidence.list(selected.id)));
+    } catch (reason) {
+      onError(reason);
+    }
+  };
+  const addRelationship = async () => {
+    if (!project || !selected || !relationshipTarget) return;
+    const [targetType, targetId] = relationshipTarget.split(":") as [RelationshipEndpointType, string];
+    try {
+      unwrap(await window.vault.relationships.create({ projectId: project.id, sourceType: "knowledge", sourceId: selected.id, targetType, targetId, relationshipType }));
+      setRelationshipTarget("");
+      await onChanged();
+    } catch (reason) {
+      onError(reason);
+    }
+  };
+  const removeRelationship = async (id: string) => {
+    try {
+      unwrap(await window.vault.relationships.remove(id));
+      await onChanged();
+    } catch (reason) {
+      onError(reason);
+    }
+  };
+
+  const entityLabel = (entityType: RelationshipEndpointType, id: string) => entityType === "project"
+    ? project?.name ?? "Project"
+    : entityType === "document"
+      ? documents.find(item => item.id === id)?.title ?? "Missing document"
+      : entityType === "knowledge"
+        ? allKnowledge.find(item => item.id === id)?.title ?? "Missing knowledge"
+        : snapshot.folders.find(item => item.id === id)?.name ?? "Missing folder";
+  const evidenceLabel = (id: string) => {
+    const source = snapshot.evidenceSources.find(item => item.id === id);
+    if (!source) return id;
+    return (source.sourceId ? documents.find(item => item.id === source.sourceId)?.title : null) ?? source.sourcePath ?? source.sourceType;
+  };
+  const follow = (entityType: RelationshipEndpointType, id: string) => {
+    if (entityType === "knowledge") {
+      setCreating(false);
+      onSelected(id);
+    } else if (entityType === "document") onOpenDocument(id);
+  };
+  const changeMode = (next: KnowledgeMode) => {
+    setMode(next);
+    setCreating(false);
+    if (next === "active" && selected && !activeKnowledge.some(item => item.id === selected.id)) onSelected(null);
+  };
+  const startCreating = () => {
+    setCreating(true);
+    onSelected(null);
+    setTitle("");
+    setBody("");
+    setType("fact");
+    setConfidence("medium");
+    setParentFolderId(null);
+  };
+
+  const resetModal = () => {
+    setModal(null);
+    setSupersedeReplacementId("");
+    setSupersedeReason("");
+    setMergeSourceIds([]);
+    setMergeReason("");
+    setMergePreview(null);
+    setMergePreviewInput(null);
+  };
+  const closeModal = () => {
+    if (!lifecyclePending) resetModal();
+  };
+  const openSupersede = () => {
+    if (!selected || lifecyclePending) return;
+    setSupersedeReplacementId("");
+    setSupersedeReason("");
+    setModal({ kind: "supersede", sourceId: selected.id });
+  };
+  const openMerge = () => {
+    if (!selected || lifecyclePending) return;
+    setMergeSourceIds([]);
+    setMergeReason("");
+    setMergePreview(null);
+    setMergePreviewInput(null);
+    setModal({ kind: "merge", targetId: selected.id });
+  };
+  const submitSupersede = async () => {
+    if (!project || modal?.kind !== "supersede" || lifecyclePending) return;
+    setLifecyclePending("supersede");
+    try {
+      const superseded = unwrap(await window.vault.knowledge.supersede({
+        projectId: project.id,
+        knowledgeObjectId: modal.sourceId,
+        supersededById: supersedeReplacementId || null,
+        reason: supersedeReason.trim() || null,
+      }));
+      await onChanged();
+      const loaded = await loadHistoricalKnowledge(project.id);
+      if (!loaded?.some(item => item.id === superseded.id)) setHistoricalKnowledge(items => uniqueKnowledge([...items, superseded]));
+      setMode("history");
+      setCreating(false);
+      onSelected(superseded.id);
+      await reloadHistory(superseded.id);
+      resetModal();
+    } catch (reason) {
+      onError(reason);
+    } finally {
+      setLifecyclePending(null);
+    }
+  };
+  const toggleMergeSource = (id: string) => {
+    if (lifecyclePending) return;
+    setMergeSourceIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
+    setMergePreview(null);
+    setMergePreviewInput(null);
+  };
+  const requestMergePreview = async () => {
+    if (!project || modal?.kind !== "merge" || mergeSourceIds.length === 0 || lifecyclePending) return;
+    const input: MergeKnowledgeInput = {
+      projectId: project.id,
+      targetId: modal.targetId,
+      sourceIds: [...mergeSourceIds],
+      reason: mergeReason.trim() || null,
+    };
+    setLifecyclePending("preview");
+    setMergePreview(null);
+    setMergePreviewInput(null);
+    try {
+      const preview = unwrap(await window.vault.knowledge.previewMerge(input));
+      setMergePreview(preview);
+      setMergePreviewInput(input);
+    } catch (reason) {
+      onError(reason);
+    } finally {
+      setLifecyclePending(null);
+    }
+  };
+  const canMerge = Boolean(
+    project
+    && modal?.kind === "merge"
+    && mergePreview
+    && mergePreviewInput
+    && mergePreviewInput.projectId === project.id
+    && mergePreviewInput.targetId === modal.targetId
+    && sameIds(mergePreviewInput.sourceIds, mergeSourceIds)
+    && mergeSourceIds.length > 0
+    && mergePreview.blockingErrors.length === 0
+    && !lifecyclePending,
+  );
+  const submitMerge = async () => {
+    if (!project || !canMerge || !mergePreviewInput) return;
+    setLifecyclePending("merge");
+    try {
+      const merged = unwrap(await window.vault.knowledge.merge({
+        projectId: mergePreviewInput.projectId,
+        targetId: mergePreviewInput.targetId,
+        sourceIds: [...mergePreviewInput.sourceIds],
+        reason: mergeReason.trim() || null,
+      }));
+      await onChanged();
+      setMode("active");
+      setCreating(false);
+      onSelected(merged.target.id);
+      await reloadHistory(merged.target.id);
+      resetModal();
+    } catch (reason) {
+      onError(reason);
+    } finally {
+      setLifecyclePending(null);
+    }
+  };
+
+  useEffect(() => {
+    if (!modal) return;
+    const onKeyDown = (event: KeyboardEvent) => {
+      if (event.key === "Escape" && !lifecyclePending) closeModal();
+    };
+    document.addEventListener("keydown", onKeyDown);
+    return () => document.removeEventListener("keydown", onKeyDown);
+  }, [modal, lifecyclePending]);
+
+  if (!project) return <div className="empty-state"><h2>Select a project</h2><p>Knowledge remains isolated to one project.</p></div>;
+
+  const readOnly = selected?.status === "archived" || selected?.status === "superseded";
+  const supersededTarget = selected?.supersededById ? allKnowledge.find(item => item.id === selected.supersededById) ?? null : null;
+  const modalSource = modal?.kind === "supersede" ? allKnowledge.find(item => item.id === modal.sourceId) ?? null : null;
+  const mergeTarget = modal?.kind === "merge" ? activeCandidates.find(item => item.id === modal.targetId) ?? null : null;
+  const mergeSources = activeCandidates.filter(item => item.id !== mergeTarget?.id);
+
+  return <div className="knowledge-layout">
+    <aside className="knowledge-list">
+      <div className="knowledge-heading">
+        <div><b>Project Knowledge</b><small>{mode === "active" ? activeKnowledge.length : allKnowledge.length} objects</small></div>
+        {mode === "active" && <button onClick={startCreating}>+ Knowledge</button>}
+      </div>
+      <div className="knowledge-mode-switch" aria-label="Knowledge list mode">
+        <button className={mode === "active" ? "active" : ""} aria-pressed={mode === "active"} onClick={() => changeMode("active")}>Active</button>
+        <button className={mode === "history" ? "active" : ""} aria-pressed={mode === "history"} onClick={() => changeMode("history")}>History</button>
+      </div>
+      <input className="knowledge-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={mode === "history" ? "Search active and historical knowledge…" : "Search knowledge…"} />
+      <div className="knowledge-items">
+        {visibleResults.map(item => <button className={item.id === selectedId ? "selected" : ""} onClick={() => { setCreating(false); onSelected(item.id); }} key={item.id}>
+          <span className={`knowledge-type ${item.type}`}>{item.type[0].toUpperCase()}</span>
+          <span><b>{item.title}</b><small>{folders.find(folder => folder.id === item.parentFolderId)?.relativePath ?? "Project Knowledge"} · {item.type} · {item.status}</small></span>
+        </button>)}
+        {mode === "history" && historicalLoading && <p>Loading historical knowledge…</p>}
+        {!historicalLoading && visibleResults.length === 0 && <p>{mode === "history" ? "No active or historical knowledge matches this search." : "No knowledge objects found."}</p>}
+      </div>
+    </aside>
+    <section className="knowledge-inspector">
+      {creating ? <>
+        <InspectorHeader title="New draft" status="draft" />
+        <KnowledgeForm title={title} body={body} type={type} confidence={confidence} parentFolderId={parentFolderId} folders={folders} setTitle={setTitle} setBody={setBody} setType={setType} setConfidence={setConfidence} setParentFolderId={setParentFolderId} />
+        <div className="inspector-actions"><button onClick={() => setCreating(false)}>Cancel</button><button className="primary" disabled={!title.trim() || !body.trim()} onClick={() => void create()}>Create draft</button></div>
+        <div className="knowledge-principle">Folder placement organizes knowledge but does not change its evidence, relationships, or project boundary.</div>
+      </> : selected ? <>
+        <InspectorHeader title={selected.title} status={selected.status} />
+        {selected.status === "superseded" && <div className="superseded-notice">
+          {supersededTarget ? <button onClick={() => onSelected(supersededTarget.id)}>Superseded by {supersededTarget.title}</button> : selected.supersededById ? <>Superseded by knowledge object {selected.supersededById}</> : <>Superseded without a replacement.</>}
+        </div>}
+        <KnowledgeForm title={title} body={body} type={type} confidence={confidence} parentFolderId={parentFolderId} folders={folders} setTitle={setTitle} setBody={setBody} setType={setType} setConfidence={setConfidence} setParentFolderId={setParentFolderId} readOnly={readOnly} />
+        <div className="inspector-actions">
+          {selected.status === "archived" ? <button className="primary" disabled={Boolean(lifecyclePending)} onClick={() => void restore()}>{lifecyclePending === "restore" ? "Restoring…" : "Restore"}</button> : selected.status !== "superseded" && <>
+            <button className="consequential" disabled={Boolean(lifecyclePending)} onClick={openSupersede}>Supersede</button>
+            <button className="consequential" disabled={Boolean(lifecyclePending) || activeCandidates.length < 2} onClick={openMerge}>Merge knowledge</button>
+            <button disabled={Boolean(lifecyclePending)} onClick={() => void archive()}>{lifecyclePending === "archive" ? "Archiving…" : "Archive"}</button>
+            <button disabled={Boolean(lifecyclePending)} onClick={() => void save()}>Save changes</button>
+            {selected.status === "draft" && <button className="primary" disabled={Boolean(lifecyclePending) || evidence.length === 0} title={evidence.length === 0 ? "Attach evidence before approval" : ""} onClick={() => void approve()}>{lifecyclePending === "approve" ? "Approving…" : "Approve"}</button>}
+          </>}
+        </div>
+        <EvidencePanel evidence={evidence} documents={documents} sourceId={sourceId} locator={locator} excerpt={excerpt} setSourceId={setSourceId} setLocator={setLocator} setExcerpt={setExcerpt} onOpenDocument={onOpenDocument} attach={attach} readOnly={readOnly} />
+        <section className="relationship-panel">
+          <div className="evidence-title"><b>Relationships & backlinks</b><span>{relationships.length} links</span></div>
+          {relationships.map(item => <RelationshipCard key={item.id} item={item} selectedId={selected.id} entityLabel={entityLabel} follow={follow} remove={readOnly ? undefined : removeRelationship} />)}
+          {!readOnly && <div className="relationship-create">
+            <select value={relationshipType} onChange={event => setRelationshipType(event.target.value as RelationshipType)}>{relationshipTypes.map(value => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select>
+            <select value={relationshipTarget} onChange={event => setRelationshipTarget(event.target.value)}><option value="">Choose target…</option><optgroup label="Knowledge">{activeCandidates.filter(item => item.id !== selected.id).map(item => <option value={`knowledge:${item.id}`} key={item.id}>{item.title}</option>)}</optgroup><optgroup label="Documents">{documents.map(item => <option value={`document:${item.id}`} key={item.id}>{item.relativePath}</option>)}</optgroup></select>
+            <button disabled={!relationshipTarget} onClick={() => void addRelationship()}>Add relationship</button>
+          </div>}
+        </section>
+        <KnowledgeHistory records={historyRecords} loading={recordHistoryLoading} />
+      </> : <div className="empty-editor"><h2>Knowledge Inspector</h2><p>{mode === "history" ? "Select an active, archived, or superseded object to inspect its audit trail." : "Select an object or create a manual draft."}</p></div>}
+    </section>
+
+    {modal?.kind === "supersede" && modalSource && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
+      <form className="lifecycle-modal" role="dialog" aria-modal="true" aria-labelledby="supersede-title" onSubmit={event => { event.preventDefault(); void submitSupersede(); }}>
+        <header><small>Lifecycle action</small><h2 id="supersede-title">Supersede knowledge</h2><p>Remove an outdated object from Active knowledge while preserving its complete audit trail.</p></header>
+        <div className="lifecycle-identity"><span className={`knowledge-type ${modalSource.type}`}>{modalSource.type[0].toUpperCase()}</span><div><b>{modalSource.title}</b><small>{modalSource.type} · {modalSource.status}</small></div></div>
+        <label>Replacement (optional)<select autoFocus value={supersedeReplacementId} disabled={Boolean(lifecyclePending)} onChange={event => setSupersedeReplacementId(event.target.value)}><option value="">No replacement</option>{activeCandidates.filter(item => item.id !== modalSource.id).map(item => <option value={item.id} key={item.id}>{item.title} · {item.status}</option>)}</select></label>
+        <label>Reason (optional)<textarea value={supersedeReason} disabled={Boolean(lifecyclePending)} onChange={event => setSupersedeReason(event.target.value)} placeholder="Why is this knowledge no longer current?" /></label>
+        <div className="lifecycle-consequences"><b>What happens</b><ul><li>The source leaves the Active view.</li><li>Evidence and relationships stay attached.</li><li>History remains available from the Knowledge sidebar.</li></ul></div>
+        <div className="lifecycle-modal-actions"><button type="button" disabled={Boolean(lifecyclePending)} onClick={closeModal}>Cancel</button><button className="consequential" type="submit" disabled={Boolean(lifecyclePending)}>{lifecyclePending === "supersede" ? "Superseding…" : "Supersede knowledge"}</button></div>
+      </form>
+    </div>}
+
+    {modal?.kind === "merge" && mergeTarget && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
+      <form className="lifecycle-modal merge" role="dialog" aria-modal="true" aria-labelledby="merge-title" onSubmit={event => { event.preventDefault(); void submitMerge(); }}>
+        <header><small>Preview required</small><h2 id="merge-title">Merge knowledge</h2><p>The canonical text stays unchanged. Evidence and relationships move only after you review the merge plan.</p></header>
+        <div className="lifecycle-identity"><span className={`knowledge-type ${mergeTarget.type}`}>{mergeTarget.type[0].toUpperCase()}</span><div><small>Canonical target</small><b>{mergeTarget.title}</b><small>{mergeTarget.type} · {mergeTarget.status}</small></div></div>
+        <fieldset className="merge-source-list" disabled={Boolean(lifecyclePending)}><legend>Source objects</legend>{mergeSources.map((item, index) => <label key={item.id}><input autoFocus={index === 0} type="checkbox" checked={mergeSourceIds.includes(item.id)} onChange={() => toggleMergeSource(item.id)} /><span><b>{item.title}</b><small>{item.type} · {item.status}</small></span></label>)}{mergeSources.length === 0 && <p>No other active knowledge is available to merge.</p>}</fieldset>
+        <label>Reason (optional)<textarea value={mergeReason} disabled={Boolean(lifecyclePending)} onChange={event => setMergeReason(event.target.value)} placeholder="Why should these objects share one canonical target?" /></label>
+        <div className="merge-preview-actions"><button type="button" disabled={mergeSourceIds.length === 0 || Boolean(lifecyclePending)} onClick={() => void requestMergePreview()}>{lifecyclePending === "preview" ? "Previewing…" : "Preview merge"}</button>{mergePreviewInput && !sameIds(mergePreviewInput.sourceIds, mergeSourceIds) && <small>Source selection changed. Preview again.</small>}</div>
+        {mergePreview && <MergePreviewPanel preview={mergePreview} entityLabel={entityLabel} evidenceLabel={evidenceLabel} />}
+        <div className="lifecycle-modal-actions"><button type="button" disabled={Boolean(lifecyclePending)} onClick={closeModal}>Cancel</button><button className="consequential" type="submit" disabled={!canMerge}>{lifecyclePending === "merge" ? "Merging…" : "Merge knowledge"}</button></div>
+      </form>
+    </div>}
+  </div>;
+}
+
+type EvidencePanelProps = {
+  evidence: EvidenceSource[];
+  documents: VaultSnapshot["documents"];
+  sourceId: string;
+  locator: string;
+  excerpt: string;
+  setSourceId: (value: string) => void;
+  setLocator: (value: string) => void;
+  setExcerpt: (value: string) => void;
+  onOpenDocument: (id: string) => void;
+  attach: () => Promise<void>;
+  readOnly: boolean;
+};
+
+function EvidencePanel({ evidence, documents, sourceId, locator, excerpt, setSourceId, setLocator, setExcerpt, onOpenDocument, attach, readOnly }: EvidencePanelProps) {
+  return <section className="evidence-panel"><div className="evidence-title"><b>Evidence</b><span>{evidence.length} sources</span></div>{evidence.map(item => {
+    const document = documents.find(doc => doc.id === item.sourceId);
+    return <div className="evidence-card" key={item.id}><button onClick={() => item.sourceId && onOpenDocument(item.sourceId)}>{document?.title ?? item.sourcePath ?? item.sourceType}</button><small>{item.locator || "Document"} · {item.confidence} · {item.availability}</small>{item.excerpt && <p>“{item.excerpt}”</p>}</div>;
+  })}{!readOnly && <div className="attach-evidence"><select value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Choose source document…</option>{documents.map(document => <option value={document.id} key={document.id}>{document.relativePath}</option>)}</select><input value={locator} onChange={event => setLocator(event.target.value)} placeholder="Heading, line, or location" /><textarea value={excerpt} onChange={event => setExcerpt(event.target.value)} placeholder="Supporting excerpt (optional)" /><button disabled={!sourceId} onClick={() => void attach()}>Attach document evidence</button></div>}</section>;
+}
+
+function RelationshipCard({ item, selectedId, entityLabel, follow, remove }: { item: Relationship; selectedId: string; entityLabel: (type: RelationshipEndpointType, id: string) => string; follow: (type: RelationshipEndpointType, id: string) => void; remove?: (id: string) => Promise<void> }) {
+  const outgoing = item.sourceId === selectedId;
+  const type = outgoing ? item.targetType : item.sourceType;
+  const id = outgoing ? item.targetId : item.sourceId;
+  return <div className="relationship-card"><span className={`relationship-direction ${outgoing ? "outgoing" : "incoming"}`}>{outgoing ? "Outgoing" : "Backlink"}</span><button onClick={() => follow(type, id)}>{entityLabel(type, id)}</button><small>{outgoing ? item.relationshipType.replaceAll("_", " ") : `${item.relationshipType.replaceAll("_", " ")} this`}</small>{remove && <button className="relationship-remove" title="Remove relationship" onClick={() => void remove(item.id)}>×</button>}</div>;
+}
+
+function InspectorHeader({ title, status }: { title: string; status: string }) {
+  return <div className="inspector-head"><div><small>Knowledge Inspector</small><h2>{title}</h2></div><span className={`knowledge-status ${status}`}>{status}</span></div>;
+}
+
+type FormProps = {
+  title: string;
+  body: string;
+  type: KnowledgeType;
+  confidence: KnowledgeConfidence;
+  parentFolderId: string | null;
+  folders: VaultSnapshot["folders"];
+  setTitle: (value: string) => void;
+  setBody: (value: string) => void;
+  setType: (value: KnowledgeType) => void;
+  setConfidence: (value: KnowledgeConfidence) => void;
+  setParentFolderId: (value: string | null) => void;
+  readOnly?: boolean;
+};
+
+function KnowledgeForm(props: FormProps) {
+  return <div className={`knowledge-form ${props.readOnly ? "read-only" : ""}`}><label>Title<input value={props.title} readOnly={props.readOnly} onChange={event => props.setTitle(event.target.value)} placeholder="A concise claim or outcome" /></label><div className="knowledge-fields"><label>Type<select value={props.type} disabled={props.readOnly} onChange={event => props.setType(event.target.value as KnowledgeType)}>{types.map(type => <option value={type} key={type}>{type}</option>)}</select></label><label>Confidence<select value={props.confidence} disabled={props.readOnly} onChange={event => props.setConfidence(event.target.value as KnowledgeConfidence)}>{confidenceLevels.map(level => <option value={level} key={level}>{level}</option>)}</select></label></div><label>Folder<select value={props.parentFolderId ?? ""} disabled={props.readOnly} onChange={event => props.setParentFolderId(event.target.value || null)}><option value="">Project Knowledge (unfiled)</option>{props.folders.map(folder => <option value={folder.id} key={folder.id}>{folder.relativePath}</option>)}</select></label><label>Description<textarea value={props.body} readOnly={props.readOnly} onChange={event => props.setBody(event.target.value)} placeholder="What should the project remember?" /></label></div>;
+}
+
+function KnowledgeHistory({ records, loading }: { records: KnowledgeHistoryRecord[]; loading: boolean }) {
+  const ordered = [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
+  const groups: { operationId: string; records: KnowledgeHistoryRecord[] }[] = [];
+  for (const record of ordered) {
+    const previous = groups.at(-1);
+    if (previous?.operationId === record.operationId) previous.records.push(record);
+    else groups.push({ operationId: record.operationId, records: [record] });
+  }
+  return <section className="knowledge-history"><div className="evidence-title"><b>History</b><span>{records.length} events</span></div>{loading ? <p className="history-empty">Loading immutable history…</p> : groups.length === 0 ? <p className="history-empty">No history has been recorded for this object yet.</p> : <div className="history-spine">{groups.map(group => <article className="history-operation" key={`${group.operationId}-${group.records[0]?.id}`}><header><span>Operation</span><code title={group.operationId}>{group.operationId}</code></header>{group.records.map(record => <div className="history-event" key={record.id}><div className="history-event-head"><b>{historyLabels[record.eventType]}</b><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time></div><small>Actor: {record.actorType}{record.actorId ? ` · ${record.actorId}` : ""}</small>{record.reason && <p className="history-reason">{record.reason}</p>}<p className="history-change"><span>{snapshotSummary(record.beforeSnapshot)}</span><i aria-hidden="true">→</i><span>{snapshotSummary(record.afterSnapshot)}</span></p><details><summary>Linked IDs</summary><SnapshotLinks label="Before" snapshot={record.beforeSnapshot} /><SnapshotLinks label="After" snapshot={record.afterSnapshot} /></details></div>)}</article>)}</div>}</section>;
+}
+
+const snapshotSummary = (snapshot: KnowledgeAggregateSnapshot | null) => snapshot ? `${snapshot.object.status} · ${snapshot.object.title}` : "No snapshot";
+
+function SnapshotLinks({ label, snapshot }: { label: string; snapshot: KnowledgeAggregateSnapshot | null }) {
+  if (!snapshot) return <div className="history-snapshot"><b>{label}</b><small>No snapshot</small></div>;
+  const rows = [
+    ["Evidence", snapshot.evidenceLinks.map(item => item.id)],
+    ["Incoming", snapshot.incomingRelationships.map(item => item.id)],
+    ["Outgoing", snapshot.outgoingRelationships.map(item => item.id)],
+  ] as const;
+  return <div className="history-snapshot"><b>{label}</b>{rows.map(([name, ids]) => <div key={name}><span>{name}</span><code>{ids.length ? ids.join(", ") : "None"}</code></div>)}</div>;
+}
+
+function MergePreviewPanel({ preview, entityLabel, evidenceLabel }: { preview: MergeKnowledgePreview; entityLabel: (type: RelationshipEndpointType, id: string) => string; evidenceLabel: (id: string) => string }) {
+  const duplicates = preview.conflicts.filter(item => item.resolution === "duplicate_collapsed");
+  const selfLinks = preview.conflicts.filter(item => item.resolution === "self_link_removed");
+  return <section className="merge-preview" aria-live="polite"><div className="merge-preview-heading"><b>Merge preview</b><span>{preview.blockingErrors.length ? "Blocked" : "Ready"}</span></div><div className="merge-preview-grid"><section><small>Canonical target</small><b>{preview.target.title}</b></section><section><small>Source objects</small>{preview.sources.map(item => <b key={item.id}>{item.title}</b>)}</section></div><section><h3>Evidence transferred <span>{preview.evidenceLinks.length}</span></h3>{preview.evidenceLinks.length ? <ul>{preview.evidenceLinks.map(link => <li key={link.id}><code>{link.id}</code><span>{evidenceLabel(link.evidenceSourceId)}</span></li>)}</ul> : <p>No Evidence links will move.</p>}</section><section><h3>Relationships redirected <span>{preview.redirectedRelationships.length}</span></h3>{preview.redirectedRelationships.length ? <ul>{preview.redirectedRelationships.map(item => <li key={item.id}><code>{item.id}</code><span>{entityLabel(item.sourceType, item.sourceId)} → {entityLabel(item.targetType, item.targetId)} · {item.relationshipType.replaceAll("_", " ")}</span></li>)}</ul> : <p>No relationships will be redirected.</p>}</section><section className="merge-conflicts"><div><h3>Duplicate links collapsed <span>{duplicates.length}</span></h3>{duplicates.length ? <ul>{duplicates.map(item => <li key={item.relationshipId}><code>{item.relationshipId}</code><span>Retain {item.retainedRelationshipId}</span></li>)}</ul> : <p>None</p>}</div><div><h3>Self-links removed <span>{selfLinks.length}</span></h3>{selfLinks.length ? <ul>{selfLinks.map(item => <li key={item.relationshipId}><code>{item.relationshipId}</code></li>)}</ul> : <p>None</p>}</div></section>{preview.blockingErrors.length > 0 && <section className="merge-blocking"><h3>Blocking errors</h3><ul>{preview.blockingErrors.map(error => <li key={error}>{error}</li>)}</ul></section>}</section>;
+}
diff --git a/apps/vault-desktop/renderer/src/styles.css b/apps/vault-desktop/renderer/src/styles.css
index 670a808..5b6e77b 100644
--- a/apps/vault-desktop/renderer/src/styles.css
+++ b/apps/vault-desktop/renderer/src/styles.css
@@ -32,10 +32,23 @@ nav { display:grid; gap:3px; }.nav-item,.folder { width:100%; border:0; backgrou
 .editor-bar select,.folder-actions select{max-width:170px;border:1px solid #3a3d4b;border-radius:6px;background:#242631;color:#c6cad6;padding:5px}.list-empty{padding:15px;color:var(--muted)}.folder-actions,.project-actions{display:flex;justify-content:center;gap:7px;margin-top:12px}.folder-actions button,.project-actions button{border:1px solid #3a3d4b;border-radius:6px;background:#242631;color:#c6cad6;padding:7px 10px}.save-state.failed{color:#ff858f}.save-state.saving,.save-state.edited{color:#f0b45b}
 .atlas-wrap{height:100%;padding-top:54px;touch-action:none;background:radial-gradient(circle,#202331,#14151c 66%);cursor:grab}.atlas-wrap:active{cursor:grabbing}.atlas-wrap svg{width:100%;height:100%}.atlas-wrap line{stroke:#697088;stroke-width:1;opacity:.45}.atlas-node{cursor:pointer}.atlas-node circle{fill:#8fa7ff;stroke:#dce3ff;stroke-width:1}.atlas-node.folder circle{fill:#f0b45b}.atlas-node.file circle{fill:#b9c1d4}.atlas-node.project circle{fill:#8ad6a5}.atlas-node.vault circle{fill:#fff}.atlas-node text{fill:#dfe3ed;font-size:11px;text-anchor:middle;paint-order:stroke;stroke:#15161d;stroke-width:3px;pointer-events:none}.atlas-tools{position:absolute;left:18px;bottom:18px;display:flex;align-items:center;gap:4px;padding:4px;border:1px solid #3a3d49;border-radius:8px;background:#1d1e28}.atlas-tools button{border:0;border-radius:5px;background:transparent;color:white;padding:6px 9px}.atlas-tools span{width:45px;text-align:center;color:var(--muted)}
 .graph-v2{height:100%;display:grid;grid-template-columns:1fr;background:radial-gradient(circle at 48% 47%,#202331 0,#14151c 67%)}.graph-v2.with-panel{grid-template-columns:minmax(0,1fr) 248px}.graph-stage{position:relative;min-width:0;min-height:0;overflow:hidden}.graph-search{position:absolute;z-index:5;left:18px;top:14px;width:min(420px,62%)}.graph-search>input{width:100%;border:1px solid #383a46;border-radius:9px;outline:0;padding:10px 12px;background:rgba(29,30,40,.97);color:var(--text);box-shadow:0 10px 30px #090a0f55}.graph-search .search-results{top:44px}.graph-controls{width:248px;background:#181922;border-left:1px solid var(--line);overflow:auto}.graph-controls section{padding:15px;border-bottom:1px solid var(--line)}.graph-controls button:disabled{opacity:.38;cursor:not-allowed}.open-graph-panel{position:absolute;right:16px;top:14px;z-index:5;border:1px solid #393c49;border-radius:7px;background:#22242f;color:#cbd0dc;padding:7px 10px}.graph-v2 .selection-pill{z-index:4}.graph-v2 .graph-help{z-index:3}.graph-v2 .graph-actions{z-index:4}
 .dialog-backdrop{position:fixed;inset:0;z-index:30;display:grid;place-items:center;background:#08090dbb;backdrop-filter:blur(3px)}.text-dialog{width:min(420px,calc(100vw - 36px));padding:20px;border:1px solid #3b3e4b;border-radius:12px;background:#20212b;box-shadow:0 24px 70px #05060acc}.text-dialog h2{margin:0 0 14px;font-size:17px}.text-dialog input{width:100%;padding:10px 12px;border:1px solid #484c5c;border-radius:7px;outline:0;background:#15161d;color:var(--text)}.text-dialog input:focus{border-color:#7389dd;box-shadow:0 0 0 3px #5369bf33}.text-dialog>div{display:flex;justify-content:flex-end;gap:7px;margin-top:16px}.text-dialog button{padding:7px 13px;border:1px solid #414552;border-radius:7px;background:#292b36;color:#d4d7e1}.text-dialog button.primary{border-color:#667bd0;background:#5369bf;color:white}.text-dialog button:disabled{opacity:.45}
 .knowledge-overlay{position:absolute;inset:0;z-index:4;background:var(--bg)}.knowledge-layout{height:100%;display:grid;grid-template-columns:330px minmax(0,1fr)}.knowledge-list{min-width:0;border-right:1px solid var(--line);background:#181922;overflow:auto}.knowledge-heading{display:flex;align-items:center;justify-content:space-between;padding:17px 15px 12px}.knowledge-heading>div{display:flex;flex-direction:column}.knowledge-heading small,.inspector-head small{color:var(--muted)}.knowledge-heading button,.inspector-actions button,.attach-evidence button{border:1px solid #414656;border-radius:7px;background:#292d3a;color:#d8dbe5;padding:7px 10px}.knowledge-search{width:calc(100% - 28px);margin:0 14px 12px;padding:9px 11px;border:1px solid #373a47;border-radius:8px;background:#13141b;color:var(--text);outline:0}.knowledge-items>button{width:100%;display:flex;align-items:center;gap:10px;padding:11px 14px;border:0;border-top:1px solid #292b35;background:transparent;color:#d5d8e2;text-align:left}.knowledge-items>button:hover,.knowledge-items>button.selected{background:#262936}.knowledge-items>button>span:last-child{min-width:0}.knowledge-items b,.knowledge-items small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.knowledge-items small{color:var(--muted);margin-top:2px}.knowledge-items>p{padding:10px 15px;color:var(--muted)}.knowledge-type{display:grid;place-items:center;width:27px;height:27px;flex:0 0 auto;border-radius:7px;background:#39405a;color:#dce4ff;font-weight:700}.knowledge-type.decision{background:#594438}.knowledge-type.goal{background:#315143}.knowledge-type.question{background:#4c3b61}.knowledge-inspector{overflow:auto;padding:26px clamp(24px,5vw,74px)}.knowledge-inspector>*{max-width:850px;margin-left:auto;margin-right:auto}.inspector-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}.inspector-head h2{margin:3px 0 0;font-size:24px}.knowledge-status{padding:5px 9px;border:1px solid #4b5061;border-radius:99px;color:#b9becc;text-transform:capitalize}.knowledge-status.approved{border-color:#3a7558;background:#234331;color:#92dfb2}.knowledge-status.draft{border-color:#77613a;background:#45371f;color:#efc477}.knowledge-form{display:grid;gap:16px}.knowledge-form label{display:grid;gap:6px;color:#aeb3c2;font-size:12px}.knowledge-form input,.knowledge-form select,.knowledge-form textarea,.attach-evidence input,.attach-evidence select,.attach-evidence textarea{width:100%;border:1px solid #3b3e4c;border-radius:8px;background:#191a22;color:var(--text);padding:9px 11px;outline:0}.knowledge-form textarea{min-height:170px;resize:vertical;font:14px/1.6 Inter,system-ui}.knowledge-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.inspector-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:17px}.inspector-actions button.primary{border-color:#667bd0;background:#5369bf;color:white}.inspector-actions button:disabled{opacity:.42}.knowledge-principle{margin-top:28px;padding:13px 15px;border:1px solid #3b3e4c;border-radius:8px;background:#1b1d27;color:#9fa5b5}.evidence-panel{margin-top:32px;padding-top:20px;border-top:1px solid var(--line)}.evidence-title{display:flex;justify-content:space-between;margin-bottom:10px}.evidence-title span{color:var(--muted)}.evidence-card{padding:12px 13px;margin:8px 0;border:1px solid #343744;border-radius:8px;background:#1a1b23}.evidence-card button{border:0;background:transparent;color:#aebfff;padding:0;font-weight:600}.evidence-card small{display:block;color:var(--muted);margin-top:3px}.evidence-card p{margin:9px 0 0;color:#c3c7d2}.attach-evidence{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.attach-evidence textarea{grid-column:1/-1;min-height:72px;resize:vertical}.attach-evidence button{grid-column:2;justify-self:end}.attach-evidence button:disabled{opacity:.4}
 .relationship-panel{margin-top:28px;padding-top:20px;border-top:1px solid var(--line)}.relationship-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:9px;padding:10px 12px;margin:8px 0;border:1px solid #343744;border-radius:8px;background:#1a1b23}.relationship-card>button:not(.relationship-remove){overflow:hidden;border:0;background:transparent;color:#aebfff;text-align:left;text-overflow:ellipsis;white-space:nowrap}.relationship-card small{color:var(--muted)}.relationship-direction{padding:3px 6px;border-radius:5px;background:#293551;color:#aebfff;font-size:10px;text-transform:uppercase}.relationship-direction.incoming{background:#443450;color:#d9b8ef}.relationship-remove{border:0;background:transparent;color:#777d8e;font-size:18px}.relationship-remove:hover{color:#ef9d9d}.relationship-create{display:grid;grid-template-columns:160px minmax(0,1fr) auto;gap:8px;margin-top:14px}.relationship-create select{min-width:0;border:1px solid #3b3e4c;border-radius:8px;background:#191a22;color:var(--text);padding:9px 11px}.relationship-create button{border:1px solid #414656;border-radius:7px;background:#292d3a;color:#d8dbe5;padding:7px 10px}.relationship-create button:disabled{opacity:.4}
 .relationship-legend{display:grid;gap:5px;margin-top:10px;color:#8f95a5;font-size:10px}.relationship-legend span{display:flex;align-items:center;gap:7px}.relationship-legend i{width:18px;border-top:2px dashed #9caeff}.relationship-legend i.positive{border-color:#74d6a0}.relationship-legend i.negative{border-color:#ef7b86}
 .source-import{left:auto;right:18px;top:66px;width:110px}
 .filesystem-actions{position:absolute;z-index:9;right:140px;top:66px;display:flex;gap:6px}.filesystem-actions button{border:1px solid #3c4050;border-radius:7px;background:#252734;color:#c8ccda;padding:6px 9px;font-size:11px}.sync-message{position:absolute;z-index:12;right:18px;top:104px;padding:7px 10px;border:1px solid #3d5d4c;border-radius:7px;background:#1d3528;color:#a9dfbc;font-size:11px}
 @media(max-width:800px){.vault-app{grid-template-columns:64px 1fr}.vault-sidebar{overflow:hidden}.vault-sidebar>*{min-width:196px}.files-layout{grid-template-columns:220px 1fr}.crumb,.save-state{display:none}}
+
+.knowledge-mode-switch{display:grid;grid-template-columns:1fr 1fr;gap:3px;margin:0 14px 10px;padding:3px;border:1px solid #30333f;border-radius:8px;background:#12131a}.knowledge-mode-switch button{border:0;border-radius:5px;background:transparent;color:#8c91a3;padding:6px 9px;cursor:pointer}.knowledge-mode-switch button.active{background:#292d3a;color:#f0f1f6;box-shadow:inset 0 0 0 1px #3d4251}.knowledge-status.archived{border-color:#596071;background:#292c36;color:#c0c5d2}.knowledge-status.superseded{border-color:#806638;background:#40351f;color:#efc477}.knowledge-form.read-only input,.knowledge-form.read-only select,.knowledge-form.read-only textarea{border-color:#343744;background:#1a1b23;color:#c4c8d3}.knowledge-form.read-only select:disabled{opacity:1}.superseded-notice{margin:-4px 0 18px;padding:10px 12px;border-left:3px solid #efc477;background:#27251f;color:#c9bd9f}.superseded-notice button{border:0;background:transparent;color:#aebfff;padding:0;cursor:pointer;font-weight:600}.inspector-actions{flex-wrap:wrap}.inspector-actions button.consequential{border-color:#755d32;background:#3c301d;color:#efc477}.knowledge-items>button,.knowledge-heading button,.inspector-actions button,.attach-evidence button{cursor:pointer}
+
+.knowledge-history{margin-top:34px;padding-top:21px;border-top:1px solid #30323e}.history-empty{margin:10px 0;color:#8c91a3}.history-spine{display:grid;gap:16px;margin-top:12px}.history-operation{position:relative;padding:0 0 2px 24px;border-left:2px solid #4a526c}.history-operation:before{content:"";position:absolute;left:-6px;top:2px;width:10px;height:10px;border:2px solid #181922;border-radius:50%;background:#aebfff;box-shadow:0 0 0 3px #30384f}.history-operation>header{display:flex;align-items:center;gap:8px;min-width:0;margin-bottom:8px;color:#7f869a;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.history-operation>header code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aebfff;text-transform:none;letter-spacing:0}.history-event{position:relative;margin:7px 0;padding:12px 13px;border:1px solid #343744;border-radius:8px;background:#1a1b23}.history-event:before{content:"";position:absolute;left:-30px;top:18px;width:8px;height:1px;background:#4a526c}.history-event-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.history-event-head b{color:#e6e8ef}.history-event-head time,.history-event>small{color:#8c91a3;font-size:11px}.history-reason{margin:9px 0;padding:8px 10px;border-left:2px solid #efc477;background:#23221f;color:#d8caa9}.history-change{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:9px;margin:11px 0 0}.history-change span{min-width:0;padding:7px 8px;border:1px solid #30333e;border-radius:6px;background:#181922;color:#bfc4d0;overflow-wrap:anywhere}.history-change i{color:#aebfff;font-style:normal}.history-event details{margin-top:10px;border-top:1px solid #30323e;padding-top:8px}.history-event summary{width:max-content;color:#aebfff;cursor:pointer;font-size:12px}.history-snapshot{display:grid;gap:5px;margin-top:9px;padding:8px 9px;border-radius:6px;background:#181922}.history-snapshot>b{color:#aeb3c2;font-size:11px}.history-snapshot>small{color:#73798a}.history-snapshot>div{display:grid;grid-template-columns:64px minmax(0,1fr);gap:8px;font-size:11px}.history-snapshot span{color:#73798a}.history-snapshot code{color:#b5bbc9;overflow-wrap:anywhere}
+
+.lifecycle-modal{width:min(620px,calc(100vw - 36px));max-height:min(820px,calc(100vh - 36px));overflow:auto;padding:22px;border:1px solid #414656;border-radius:12px;background:#181922;box-shadow:0 28px 80px #05060acc}.lifecycle-modal.merge{width:min(780px,calc(100vw - 36px))}.lifecycle-modal>header{margin-bottom:17px}.lifecycle-modal>header small{color:#efc477;text-transform:uppercase;letter-spacing:.09em;font-size:10px}.lifecycle-modal h2{margin:4px 0 5px;font-size:21px}.lifecycle-modal>header p{margin:0;color:#9da2b1}.lifecycle-modal label{display:grid;gap:6px;margin-top:14px;color:#aeb3c2;font-size:12px}.lifecycle-modal select,.lifecycle-modal textarea{width:100%;border:1px solid #3b3e4c;border-radius:8px;outline:0;background:#14151c;color:#f0f1f6;padding:9px 11px}.lifecycle-modal textarea{min-height:78px;resize:vertical}.lifecycle-modal button{border:1px solid #414656;border-radius:7px;background:#292d3a;color:#d8dbe5;padding:8px 11px;cursor:pointer}.lifecycle-modal button.consequential{border-color:#806638;background:#49381e;color:#f5ce85}.lifecycle-modal button:disabled,.lifecycle-modal fieldset:disabled{opacity:.48;cursor:not-allowed}.lifecycle-identity{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid #343744;border-radius:8px;background:#1a1b23}.lifecycle-identity>div{min-width:0;display:grid}.lifecycle-identity b,.lifecycle-identity small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lifecycle-identity small{color:#8c91a3}.lifecycle-consequences{margin-top:15px;padding:12px 14px;border:1px solid #514831;border-radius:8px;background:#24221d}.lifecycle-consequences>b{color:#efc477}.lifecycle-consequences ul{margin:8px 0 0;padding-left:19px;color:#b9b29f}.lifecycle-consequences li+li{margin-top:4px}.lifecycle-modal-actions{position:sticky;bottom:-22px;display:flex;justify-content:flex-end;gap:8px;margin:20px -22px -22px;padding:14px 22px;border-top:1px solid #343744;background:#181922ee;backdrop-filter:blur(6px)}
+
+.merge-source-list{display:grid;gap:7px;margin:15px 0 0;padding:0;border:0}.merge-source-list legend{margin-bottom:7px;color:#aeb3c2;font-size:12px}.merge-source-list label{grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;margin:0;padding:9px 10px;border:1px solid #343744;border-radius:7px;background:#1a1b23;cursor:pointer}.merge-source-list input{accent-color:#aebfff}.merge-source-list span{display:grid}.merge-source-list small{color:#8c91a3}.merge-source-list p{margin:0;color:#8c91a3}.merge-preview-actions{display:flex;align-items:center;gap:10px;margin-top:14px}.merge-preview-actions small{color:#efc477}.merge-preview{display:grid;gap:12px;margin-top:16px;padding:15px;border:1px solid #46506d;border-radius:10px;background:#161820}.merge-preview-heading{display:flex;justify-content:space-between}.merge-preview-heading>span{color:#92dfb2}.merge-preview-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.merge-preview-grid>section,.merge-preview>section{padding:10px 11px;border:1px solid #343744;border-radius:7px;background:#1a1b23}.merge-preview-grid section{display:grid;gap:3px}.merge-preview small,.merge-preview p{color:#8c91a3}.merge-preview h3{display:flex;justify-content:space-between;gap:8px;margin:0 0 7px;color:#cfd3dd;font-size:12px}.merge-preview h3 span{color:#aebfff;font-variant-numeric:tabular-nums}.merge-preview ul{display:grid;gap:6px;margin:0;padding:0;list-style:none}.merge-preview li{display:grid;grid-template-columns:minmax(95px,.7fr) minmax(0,1.3fr);gap:9px;color:#bdc2ce;font-size:11px}.merge-preview code{overflow:hidden;text-overflow:ellipsis;color:#aebfff}.merge-preview p{margin:0}.merge-conflicts{display:grid!important;grid-template-columns:1fr 1fr;gap:8px;background:transparent!important;padding:0!important;border:0!important}.merge-conflicts>div{padding:10px 11px;border:1px solid #4c4230;border-radius:7px;background:#211f1b}.merge-blocking{border-color:#75444b!important;background:#2d2024!important;color:#efb3ba}
+
+:where(.knowledge-mode-switch button,.knowledge-heading button,.knowledge-items>button,.knowledge-search,.knowledge-form input,.knowledge-form select,.knowledge-form textarea,.inspector-actions button,.attach-evidence button,.attach-evidence input,.attach-evidence select,.attach-evidence textarea,.relationship-card button,.relationship-create button,.relationship-create select,.superseded-notice button,.history-event summary,.lifecycle-modal button,.lifecycle-modal select,.lifecycle-modal textarea,.merge-source-list input):focus-visible{outline:2px solid #aebfff;outline-offset:2px}
+
+@media(max-width:800px){.knowledge-layout{grid-template-columns:250px minmax(0,1fr)}.knowledge-inspector{padding:22px 20px}.history-event-head{align-items:flex-start;flex-direction:column;gap:2px}.lifecycle-modal{max-height:calc(100vh - 20px)}}
+@media(max-width:620px){.knowledge-layout{grid-template-columns:210px minmax(0,1fr)}.knowledge-heading{align-items:flex-start}.knowledge-heading button{padding:5px 7px}.knowledge-inspector{padding:18px 14px}.knowledge-fields,.merge-preview-grid,.merge-conflicts{grid-template-columns:1fr}.history-change{grid-template-columns:1fr}.history-change i{transform:rotate(90deg);justify-self:center}.lifecycle-modal{width:calc(100vw - 20px);padding:17px}.lifecycle-modal-actions{bottom:-17px;margin:18px -17px -17px;padding:12px 17px}.merge-preview li{grid-template-columns:1fr}.knowledge-history{margin-top:26px}}
diff --git a/scripts/phase2-lifecycle-ui-regression.mjs b/scripts/phase2-lifecycle-ui-regression.mjs
index 474f410..130b413 100644
--- a/scripts/phase2-lifecycle-ui-regression.mjs
+++ b/scripts/phase2-lifecycle-ui-regression.mjs
@@ -1,20 +1,22 @@
 import assert from "node:assert/strict";
 import { readFileSync } from "node:fs";
 import { resolve } from "node:path";
 import { fileURLToPath } from "node:url";
 
 const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
 const read = path => readFileSync(resolve(root, path), "utf8");
 const main = read("apps/vault-desktop/electron/main/main.ts");
 const preload = read("apps/vault-desktop/electron/preload/preload.cts");
 const types = read("packages/vault-types/src/index.ts");
+const renderer = read("apps/vault-desktop/renderer/src/KnowledgeView.tsx");
+const styles = read("apps/vault-desktop/renderer/src/styles.css");
 
 const requireContract = (source, pattern, description) =>
   assert.match(source, pattern, `Missing lifecycle IPC contract: ${description}`);
 const count = (source, pattern) => [...source.matchAll(pattern)].length;
 
 const channels = [
   "vault:knowledge:restore",
   "vault:knowledge:supersede",
   "vault:knowledge:merge-preview",
   "vault:knowledge:merge",
@@ -58,11 +60,38 @@ const typeContracts = [
   /history\(knowledgeObjectId: string\): Promise<ApiResult<KnowledgeHistoryRecord\[\]>>;/,
 ];
 
 for (const contract of typeContracts) requireContract(types, contract, `VaultRendererApi knowledge method ${contract}`);
 
 const orbitDesktopBridge = types.match(/export interface OrbitDesktopBridge \{([\s\S]*?)\n\}/)?.[1] ?? "";
 for (const method of ["restore", "supersede", "previewMerge", "merge", "history"]) {
   assert.doesNotMatch(orbitDesktopBridge, new RegExp(`\\b${method}\\b`), `Lifecycle method ${method} must not be added to OrbitDesktopBridge`);
 }
 
-console.log("Lifecycle IPC/preload regression checks passed.");
+const visibleLabels = [
+  "History",
+  "Restore",
+  "Supersede",
+  "Merge knowledge",
+  "Evidence transferred",
+  "Relationships redirected",
+  "Duplicate links collapsed",
+  "Self-links removed",
+];
+
+for (const label of visibleLabels) {
+  assert.match(renderer, new RegExp(label), `Missing lifecycle UI label: ${label}`);
+}
+
+for (const method of ["history", "restore", "supersede", "previewMerge", "merge"]) {
+  assert.match(renderer, new RegExp(`\\.${method}\\(`), `Missing lifecycle UI API call: knowledge.${method}`);
+}
+
+assert.match(renderer, /role="dialog"/, "Lifecycle application modal must use role=dialog");
+assert.match(renderer, /aria-modal="true"/, "Lifecycle application modal must be aria-modal");
+assert.doesNotMatch(renderer, /window\.confirm/, "Lifecycle actions must not use window.confirm");
+
+for (const selector of [".knowledge-history", ".history-operation", ".lifecycle-modal", ".merge-preview", ".merge-conflicts"]) {
+  assert.match(styles, new RegExp(selector.replace(".", "\\.")), `Missing lifecycle UI style: ${selector}`);
+}
+
+console.log("Lifecycle IPC/preload/UI regression checks passed.");
```
