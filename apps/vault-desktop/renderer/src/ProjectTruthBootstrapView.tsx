import { useCallback, useRef, useState } from "react";
import type { ApiResult, ProjectTruthBootstrapResult, ProjectTruthDisposition, ProjectTruthDocState } from "@orbit/vault-types";

const unwrap = <T,>(result: ApiResult<T>): T => { if (!result.ok) throw result.error; return result.value; };

const DOC_STATE_LABEL: Record<ProjectTruthDocState, string> = {
  missing: "Missing", partial: "Partial", present: "Present",
};
const DISPOSITION_LABEL: Record<ProjectTruthDisposition, string> = {
  create: "Create", merge: "Merge", replace: "Replace", skip: "Skip", keep_existing: "Keep existing",
};

type Props = { projectId: string; onError: (reason: unknown) => void };

export default function ProjectTruthBootstrapView({ projectId, onError }: Props) {
  const [result, setResult] = useState<ProjectTruthBootstrapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const generate = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const next = unwrap(await window.vault.projectTruth.bootstrap(projectId));
      if (requestRef.current === requestId) setResult(next);
    } catch (reason) {
      if (requestRef.current === requestId) onError(reason);
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [projectId, onError]);

  return <section className="project-truth-view">
    <div className="ptb-summary">
      <div><b>Project Truth Bootstrap</b>{result && <small>{result.drafts.length} draft{result.drafts.length === 1 ? "" : "s"}</small>}</div>
      <div className="ptb-summary-actions">
        <button disabled={loading} onClick={() => void generate()}>{loading ? "Generating…" : "Generate Project Truth drafts"}</button>
      </div>
    </div>
    <p className="context-note">Read-only drafting. Nothing is saved, merged, or applied — these are ephemeral suggestions the owner reviews elsewhere.</p>
    {loading && !result && <p className="context-empty">Generating Project Truth drafts…</p>}
    {result && <section className="context-readiness">
      <h3>Project Truth readiness <span className={`context-readiness-state ${result.readiness.state}`}>{result.readiness.state}</span></h3>
      <div className="ptb-meta"><span>Provider: {result.provider ?? "none"}</span><span>Model: {result.model ?? "none"}</span></div>
    </section>}
    {result && result.unresolvedInfo.length > 0 && <section className="context-readiness ptb-owner-input">
      <h3>Unresolved info</h3>
      <ul>{result.unresolvedInfo.map(item => <li key={item}>{item}</li>)}</ul>
    </section>}
    {result && result.drafts.map(draft => <section className="ptb-draft" key={draft.targetDoc}>
      <h3><code>{draft.targetDoc}</code><span className={`context-readiness-state ${draft.docState}`}>{DOC_STATE_LABEL[draft.docState]}</span><span className="ptb-disposition">{DISPOSITION_LABEL[draft.suggestedDisposition]}</span></h3>
      <div className="ptb-facts">
        <b>Technical facts (cited)</b>
        {draft.verifiedEvidence.length ? <ul>{draft.verifiedEvidence.map((evidence, index) => <li key={`${evidence.ref ?? "inferred"}-${index}`}><code>{evidence.ref ?? "(inferred)"}</code>{evidence.excerpt && <small>{evidence.excerpt}</small>}</li>)}</ul> : <small>None</small>}
      </div>
      <div className="ptb-owner-input">
        <b>Needs owner input</b>
        {draft.ownerInputNeeded.length ? <ul>{draft.ownerInputNeeded.map(item => <li key={item}>{item}</li>)}</ul> : <small>None</small>}
      </div>
    </section>)}
  </section>;
}
