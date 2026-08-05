import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResult, IntegrityFinding, IntegrityReport, KnowledgeObject } from "@orbit/vault-types";

const unwrap = <T,>(result: ApiResult<T>): T => { if (!result.ok) throw result.error; return result.value; };

const KIND_LABEL: Record<IntegrityFinding["kind"], string> = {
  broken_reference: "Broken reference",
  missing_evidence: "Missing evidence",
  orphaned: "Orphaned knowledge",
  duplicate_candidate: "Duplicate candidate",
  unanswered_question: "Unanswered question",
};
const KIND_ORDER: IntegrityFinding["kind"][] = ["broken_reference", "missing_evidence", "orphaned", "duplicate_candidate", "unanswered_question"];

type Props = {
  projectId: string;
  knowledgeById: Map<string, KnowledgeObject>;
  onError: (reason: unknown) => void;
  onInspect: (knowledgeObjectId: string) => void;
  onMergePair: (targetId: string, sourceId: string) => void;
  onAttachEvidence: (knowledgeObjectId: string) => void;
};

export default function IntegrityView({ projectId, knowledgeById, onError, onInspect, onMergePair, onAttachEvidence }: Props) {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState<string | null>(null);
  const requestRef = useRef(0);

  const analyze = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const next = unwrap(await window.vault.integrity.analyze(projectId));
      if (requestRef.current === requestId) { setReport(next); setLastAnalyzed(new Date().toLocaleString()); }
    } catch (reason) {
      if (requestRef.current === requestId) onError(reason);
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [projectId, onError]);

  useEffect(() => { void analyze(); return () => { requestRef.current += 1; }; }, [analyze]);

  const title = (id: string) => knowledgeById.get(id)?.title ?? id;
  const action = (finding: IntegrityFinding) => {
    switch (finding.kind) {
      case "missing_evidence": return <button className="link" onClick={() => onAttachEvidence(finding.subjectId)}>Attach evidence</button>;
      case "duplicate_candidate": return <button className="link" onClick={() => onMergePair(finding.subjectId, finding.relatedIds[0]!)}>Merge…</button>;
      default: return <button className="link" onClick={() => onInspect(finding.subjectId)}>Open</button>;
    }
  };

  return <div className="integrity-view">
    <div className="integrity-summary">
      <div><b>Integrity</b>{report && <small>{report.errorCount} errors · {report.warningCount} warnings</small>}</div>
      <div className="integrity-summary-actions">
        {lastAnalyzed && <small>Last analyzed {lastAnalyzed}</small>}
        <button disabled={loading} onClick={() => void analyze()}>{loading ? "Analyzing…" : "Refresh"}</button>
      </div>
    </div>
    {loading && !report && <p className="integrity-empty">Analyzing project knowledge…</p>}
    {report && report.findings.length === 0 && <p className="integrity-empty">No integrity issues detected.</p>}
    {report && KIND_ORDER.filter(kind => report.countsByKind[kind] > 0).map(kind => <section className="integrity-group" key={kind}>
      <h3>{KIND_LABEL[kind]}<span>{report.countsByKind[kind]}</span></h3>
      {report.findings.filter(f => f.kind === kind).map(finding => <div className={`integrity-finding ${finding.severity}`} key={finding.id}>
        <span className={`integrity-severity ${finding.severity}`}>{finding.severity}</span>
        <div className="integrity-finding-body">
          <p>{finding.message}</p>
          <small>{title(finding.subjectId)}{finding.relatedIds.length > 0 && ` · ${finding.relatedIds.map(title).join(", ")}`}</small>
        </div>
        {action(finding)}
      </div>)}
    </section>)}
  </div>;
}
