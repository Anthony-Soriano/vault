import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResult, ProjectContextAnalysis, ProjectEvidenceCategory, ProjectTruthReadinessState } from "@orbit/vault-types";

const unwrap = <T,>(result: ApiResult<T>): T => { if (!result.ok) throw result.error; return result.value; };

const READINESS_LABEL: Record<ProjectTruthReadinessState, string> = {
  complete: "Complete", partial: "Partial", missing: "Missing", duplicated: "Duplicated", potentially_stale: "Potentially stale",
};
const CATEGORY_LABEL: Record<ProjectEvidenceCategory, string> = {
  project_truth: "Project Truth", manifest: "Manifests", schema_migration: "Schema & migrations", config: "Config",
  documentation: "Documentation", test: "Tests", source: "Source", todo_marker: "TODO markers", other: "Other",
};
const CATEGORY_ORDER: ProjectEvidenceCategory[] = ["project_truth", "manifest", "schema_migration", "config", "documentation", "todo_marker", "test", "source", "other"];

type Props = { projectId: string; onError: (reason: unknown) => void };

export default function ProjectContextView({ projectId, onError }: Props) {
  const [analysis, setAnalysis] = useState<ProjectContextAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastAnalyzed, setLastAnalyzed] = useState<string | null>(null);
  const requestRef = useRef(0);

  const analyze = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const next = unwrap(await window.vault.context.analyze(projectId));
      if (requestRef.current === requestId) { setAnalysis(next); setLastAnalyzed(new Date().toLocaleString()); }
    } catch (reason) {
      if (requestRef.current === requestId) onError(reason);
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [projectId, onError]);

  useEffect(() => { void analyze(); return () => { requestRef.current += 1; }; }, [analyze]);

  const readiness = analysis?.readiness;
  const counts = new Map<ProjectEvidenceCategory, number>();
  for (const item of analysis?.inventory.items ?? []) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);

  return <div className="context-view">
    <div className="context-summary">
      <div><b>Project Context</b>{analysis && <small>{analysis.inventory.totalFiles} files analyzed{analysis.inventory.truncated ? " · truncated" : ""}</small>}</div>
      <div className="context-summary-actions">
        {lastAnalyzed && <small>Last analyzed {lastAnalyzed}</small>}
        <button disabled={loading} onClick={() => void analyze()}>{loading ? "Analyzing…" : "Refresh"}</button>
      </div>
    </div>
    <p className="context-note">Read-only analysis. No AI is called and nothing is generated or changed — this shows what evidence exists and the context a later step could use.</p>
    {loading && !analysis && <p className="context-empty">Analyzing project evidence…</p>}
    {readiness && <section className="context-readiness">
      <h3>Project Truth readiness <span className={`context-readiness-state ${readiness.state}`}>{READINESS_LABEL[readiness.state]}</span></h3>
      <div className="context-readiness-grid">
        <div><b>Present</b>{readiness.presentDocuments.length ? <ul>{readiness.presentDocuments.map(doc => <li key={doc}>{doc}</li>)}</ul> : <small>None</small>}</div>
        <div><b>Missing</b>{readiness.missingDocuments.length ? <ul>{readiness.missingDocuments.map(doc => <li key={doc}>{doc}</li>)}</ul> : <small>None</small>}</div>
        {readiness.duplicateDocuments.length > 0 && <div><b>Duplicated</b><ul>{readiness.duplicateDocuments.map(doc => <li key={doc}>{doc}</li>)}</ul></div>}
        {readiness.stalenessSignals.length > 0 && <div><b>Heuristic signals</b><ul>{readiness.stalenessSignals.map(signal => <li key={signal}>{signal}</li>)}</ul></div>}
      </div>
    </section>}
    {analysis && <section className="context-inventory">
      <h3>Evidence inventory</h3>
      {CATEGORY_ORDER.filter(category => (counts.get(category) ?? 0) > 0).map(category => <div className="context-group" key={category}>
        <h4>{CATEGORY_LABEL[category]}<span>{counts.get(category)}</span></h4>
        <ul>{analysis.inventory.items.filter(item => item.category === category).map(item => <li key={item.relativePath}><code>{item.relativePath}</code><small>{item.sizeBytes} B</small></li>)}</ul>
      </div>)}
    </section>}
    {analysis && <section className="context-package">
      <h3>Context package <small>{analysis.contextPackage.items.length} items</small></h3>
      <p className="context-note">Targeted, source-traceable context that a later slice could send to a model. It is built, not sent.</p>
      <ul>{analysis.contextPackage.items.map(item => <li key={item.id}><span className={`context-item-kind ${item.kind}`}>{item.kind}</span><code>{item.sourceRef ?? item.label}</code></li>)}</ul>
    </section>}
  </div>;
}
