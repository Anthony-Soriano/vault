# Phase 2.4 Slice 2 — Knowledge Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, read-only knowledge-integrity analysis (five rules) plus a dedicated Integrity review panel that routes users into the existing fix workflows.

**Architecture:** A pure analyzer in `@orbit/vault-core` (`analyzeKnowledgeIntegrity`) computes an `IntegrityReport` from a whole-vault input assembled read-only by `SqliteVaultRepository.analyzeIntegrity`. One new read-only IPC channel (`vault:integrity:analyze`) exposes it as `window.vault.integrity.analyze(projectId)`. The renderer adds an `Active | History | Integrity` switch and an `IntegrityView` that never mutates data — it only navigates into Slice 1's Knowledge / Evidence / Relationship / Merge flows.

**Tech Stack:** TypeScript, Node 22 built-in test runner (`node --experimental-strip-types --test`), Electron IPC, React 19 + Vite, `node:sqlite`.

## Global Constraints

- Node `>=22.13.0`, pnpm `11.9.0`. Run pnpm through the corepack shim if `pnpm` is not on PATH.
- **Read-only slice.** No mutation of canonical data anywhere in the analyzer, storage assembly, or UI. No persisted findings, no new tables, no migrations.
- **Deterministic.** Analyzer is pure: no I/O, no SQLite, no filesystem, no randomness, no internally generated timestamps, no mutable global state. Identical input ⇒ byte-identical output.
- `INTEGRITY_RULE_VERSION = "1"` participates in every finding id.
- **Active knowledge** = status `draft` or `approved` (never `superseded`/`archived`/`trashed`).
- **Canonical `answers` direction:** `(answer) --answers--> (question)` — a question is answered iff a relationship exists with `relationshipType === "answers"`, `targetType === "knowledge"`, `targetId === question.id`, and a `sourceId` that resolves to an existing entity that is **not** missing and **not** cross-project.
- No AI, embeddings, fuzzy/semantic matching, drift detection, automatic repair/merge/evidence, background analysis, or file watching.
- All existing tests (26) and the static UI regression must stay green. Renderer must keep every Slice 1 assertion in `scripts/phase2-lifecycle-ui-regression.mjs`.
- Commit after each task with the message shown in that task's final step.

---

## File Structure

- `packages/vault-types/src/index.ts` — **modify.** Add integrity types + `VaultRendererApi.integrity`.
- `packages/vault-core/src/integrity.ts` — **create.** Pure analyzer + rule constants. One responsibility: compute a report from an input.
- `packages/vault-core/src/index.ts` — **modify.** Re-export `./integrity`; add `analyzeIntegrity` to `VaultRepository`; add `VaultService.integrity`.
- `packages/vault-storage/src/index.ts` — **modify.** Implement `analyzeIntegrity(projectId)` (read-only assembly + call analyzer).
- `apps/vault-desktop/electron/main/main.ts` — **modify.** Register `vault:integrity:analyze`.
- `apps/vault-desktop/electron/preload/preload.cts` — **modify.** Add `integrity.analyze` bridge method.
- `apps/vault-desktop/renderer/src/IntegrityView.tsx` — **create.** Read-only review panel.
- `apps/vault-desktop/renderer/src/KnowledgeView.tsx` — **modify.** `Active | History | Integrity` switch; mount `IntegrityView`; fix-routing callbacks.
- `apps/vault-desktop/renderer/src/styles.css` — **modify.** Integrity panel styles.
- `tests/phase2-integrity.test.ts` — **create.** Pure-analyzer rule tests + storage integration tests.
- `scripts/phase2-lifecycle-ui-regression.mjs` — **modify.** Add integrity IPC + UI contract assertions (keep all existing).

---

## Task 1: Integrity types + pure analyzer

**Files:**
- Modify: `packages/vault-types/src/index.ts`
- Create: `packages/vault-core/src/integrity.ts`
- Modify: `packages/vault-core/src/index.ts` (re-export only, in this task)
- Test: `tests/phase2-integrity.test.ts`

**Interfaces:**
- Produces:
  - `IntegrityFindingKind = "missing_evidence" | "orphaned" | "broken_reference" | "duplicate_candidate" | "unanswered_question"`
  - `IntegritySeverity = "error" | "warning"`
  - `IntegrityFinding { id: string; kind: IntegrityFindingKind; severity: IntegritySeverity; subjectId: string; relatedIds: string[]; message: string }`
  - `IntegrityReport { projectId: string; findings: IntegrityFinding[]; totalCount: number; errorCount: number; warningCount: number; countsByKind: Record<IntegrityFindingKind, number> }`
  - `IntegrityAnalyzerInput { projectId: string; projects: Project[]; folders: Folder[]; documents: DocumentFile[]; knowledgeObjects: KnowledgeObject[]; evidenceSources: EvidenceSource[]; relationships: Relationship[]; evidenceLinks: KnowledgeEvidenceLink[] }`
  - `analyzeKnowledgeIntegrity(input: IntegrityAnalyzerInput): IntegrityReport`
  - `INTEGRITY_RULE_VERSION = "1"`

- [ ] **Step 1: Add integrity types to `packages/vault-types/src/index.ts`**

Append after the `KnowledgeEvidenceLink` / snapshot types block (near the other Phase 2 types):

```ts
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
```

Also add `integrity` to `VaultRendererApi` (right after the `relationships:` block):

```ts
  integrity: { analyze(projectId: string): Promise<ApiResult<IntegrityReport>> };
```

- [ ] **Step 2: Write the failing analyzer tests**

Create `tests/phase2-integrity.test.ts`. This file holds Task 1 (pure) and Task 2 (integration) tests; add only the pure block now.

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeKnowledgeIntegrity, INTEGRITY_RULE_VERSION } from "@orbit/vault-core";
import type {
  DocumentFile, EvidenceSource, IntegrityAnalyzerInput, KnowledgeEvidenceLink,
  KnowledgeObject, Project, Relationship,
} from "@orbit/vault-types";

const project = (id: string): Project => ({
  id, name: id, storagePath: id, description: null, icon: null, color: null,
  status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
});
const knowledge = (over: Partial<KnowledgeObject> & Pick<KnowledgeObject, "id" | "projectId">): KnowledgeObject => ({
  parentFolderId: null, type: "fact", title: "Title", body: "Body", status: "approved",
  confidence: "medium", author: "user", supersededById: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
});
const evidence = (over: Partial<EvidenceSource> & Pick<EvidenceSource, "id" | "projectId">): EvidenceSource => ({
  sourceType: "manual_note", sourceId: null, sourcePath: null, excerpt: null, locator: null,
  confidence: "medium", availability: "available", createdAt: "2026-01-01T00:00:00.000Z", ...over,
});
const link = (over: Partial<KnowledgeEvidenceLink> & Pick<KnowledgeEvidenceLink, "id" | "knowledgeObjectId" | "evidenceSourceId">): KnowledgeEvidenceLink => ({
  originalKnowledgeObjectId: over.knowledgeObjectId, operationId: "op", createdAt: "2026-01-01T00:00:00.000Z", ...over,
});
const rel = (over: Partial<Relationship> & Pick<Relationship, "id" | "projectId" | "sourceId" | "targetId" | "relationshipType">): Relationship => ({
  sourceType: "knowledge", targetType: "knowledge", author: "user", createdAt: "2026-01-01T00:00:00.000Z", ...over,
});
const doc = (over: Partial<DocumentFile> & Pick<DocumentFile, "id" | "projectId">): DocumentFile => ({
  parentFolderId: null, title: "Doc", kind: "file", relativePath: over.id, mimeType: null,
  availability: "available", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
});
const base = (over: Partial<IntegrityAnalyzerInput> & Pick<IntegrityAnalyzerInput, "projectId">): IntegrityAnalyzerInput => ({
  projects: [project(over.projectId)], folders: [], documents: [], knowledgeObjects: [],
  evidenceSources: [], relationships: [], evidenceLinks: [], ...over,
});
const kinds = (report: ReturnType<typeof analyzeKnowledgeIntegrity>) => report.findings.map(f => f.kind);

test("approved object without evidence is flagged missing_evidence (error)", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "approved" })] }));
  const f = report.findings.find(f => f.kind === "missing_evidence");
  assert.ok(f); assert.equal(f.severity, "error"); assert.equal(f.subjectId, "k1");
  assert.equal(report.errorCount, 1);
});

test("draft without evidence is NOT flagged missing_evidence", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "draft" })] }));
  assert.equal(report.findings.filter(f => f.kind === "missing_evidence").length, 0);
});

test("active object with no evidence and no relationships is orphaned (warning)", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "draft" })] }));
  const f = report.findings.find(f => f.kind === "orphaned");
  assert.ok(f); assert.equal(f.severity, "warning");
});

test("superseded and archived objects are ignored by orphaned", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [
    knowledge({ id: "k1", projectId: "p1", status: "superseded" }),
    knowledge({ id: "k2", projectId: "p1", status: "archived" }),
  ] }));
  assert.equal(report.findings.filter(f => f.kind === "orphaned").length, 0);
});

test("duplicate via normalized-identical title, emitted once, smaller id is subject", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [
    knowledge({ id: "kb", projectId: "p1", type: "idea", title: "Ship  It.", status: "draft" }),
    knowledge({ id: "ka", projectId: "p1", type: "idea", title: "ship it", status: "approved" }),
  ], evidenceLinks: [link({ id: "l1", knowledgeObjectId: "ka", evidenceSourceId: "e1" })], evidenceSources: [evidence({ id: "e1", projectId: "p1" })] }));
  const dups = report.findings.filter(f => f.kind === "duplicate_candidate");
  assert.equal(dups.length, 1);
  assert.equal(dups[0].subjectId, "ka"); assert.deepEqual(dups[0].relatedIds, ["kb"]);
});

test("different types with identical titles are not duplicates", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [
    knowledge({ id: "k1", projectId: "p1", type: "idea", title: "Same", status: "draft" }),
    knowledge({ id: "k2", projectId: "p1", type: "goal", title: "Same", status: "draft" }),
  ] }));
  assert.equal(report.findings.filter(f => f.kind === "duplicate_candidate").length, 0);
});

test("duplicate via duplicates relationship", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [
    knowledge({ id: "ka", projectId: "p1", type: "fact", title: "A", status: "draft" }),
    knowledge({ id: "kb", projectId: "p1", type: "fact", title: "B", status: "draft" }),
  ], relationships: [rel({ id: "r1", projectId: "p1", sourceId: "ka", targetId: "kb", relationshipType: "duplicates" })] }));
  assert.equal(report.findings.filter(f => f.kind === "duplicate_candidate").length, 1);
});

test("unanswered question flagged; answered question not", () => {
  const unanswered = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [knowledge({ id: "q1", projectId: "p1", type: "question", title: "Why?", status: "draft" })] }));
  assert.equal(unanswered.findings.filter(f => f.kind === "unanswered_question").length, 1);
  const answered = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [
    knowledge({ id: "q1", projectId: "p1", type: "question", title: "Why?", status: "draft" }),
    knowledge({ id: "a1", projectId: "p1", type: "fact", title: "Because", status: "draft" }),
  ], relationships: [rel({ id: "r1", projectId: "p1", sourceId: "a1", targetId: "q1", relationshipType: "answers" })] }));
  assert.equal(answered.findings.filter(f => f.kind === "unanswered_question").length, 0);
});

test("missing relationship endpoint is broken_reference (error)", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "draft" })],
    relationships: [rel({ id: "r1", projectId: "p1", sourceId: "k1", targetId: "ghost", relationshipType: "references", targetType: "knowledge" })] }));
  const f = report.findings.find(f => f.kind === "broken_reference");
  assert.ok(f); assert.equal(f.severity, "error"); assert.deepEqual([f.subjectId, f.relatedIds[0]], ["r1", "ghost"]);
});

test("cross-project relationship endpoint is broken_reference (error)", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1",
    projects: [project("p1"), project("p2")],
    knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "draft" }), knowledge({ id: "k2", projectId: "p2", status: "draft" })],
    relationships: [rel({ id: "r1", projectId: "p1", sourceId: "k1", targetId: "k2", relationshipType: "references" })] }));
  const f = report.findings.find(f => f.kind === "broken_reference");
  assert.ok(f); assert.equal(f.severity, "error"); assert.match(f.message, /cross-project/);
});

test("archived endpoint downgrades broken_reference to warning", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1",
    knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "draft" }), knowledge({ id: "k2", projectId: "p1", status: "archived" })],
    relationships: [rel({ id: "r1", projectId: "p1", sourceId: "k1", targetId: "k2", relationshipType: "references" })] }));
  const f = report.findings.find(f => f.kind === "broken_reference");
  assert.ok(f); assert.equal(f.severity, "warning");
});

test("missing evidence-link source is broken_reference (error)", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "draft" })],
    evidenceLinks: [link({ id: "l1", knowledgeObjectId: "k1", evidenceSourceId: "ghost" })] }));
  assert.ok(report.findings.some(f => f.kind === "broken_reference" && f.relatedIds[0] === "ghost"));
});

test("cross-project evidence link is broken_reference (error)", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1",
    projects: [project("p1"), project("p2")],
    knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "draft" })],
    evidenceSources: [evidence({ id: "e2", projectId: "p2" })],
    evidenceLinks: [link({ id: "l1", knowledgeObjectId: "k1", evidenceSourceId: "e2" })] }));
  const f = report.findings.find(f => f.kind === "broken_reference" && f.relatedIds[0] === "e2");
  assert.ok(f); assert.equal(f.severity, "error");
});

test("project isolation: identical title in another project is not a duplicate here", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1",
    projects: [project("p1"), project("p2")],
    knowledgeObjects: [
      knowledge({ id: "k1", projectId: "p1", type: "fact", title: "Same", status: "draft" }),
      knowledge({ id: "k2", projectId: "p2", type: "fact", title: "Same", status: "draft" }),
    ] }));
  assert.equal(report.findings.filter(f => f.kind === "duplicate_candidate").length, 0);
});

test("finding ids are stable and version-tagged", () => {
  const input = base({ projectId: "p1", knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "approved" })] });
  const a = analyzeKnowledgeIntegrity(input), b = analyzeKnowledgeIntegrity(input);
  assert.deepEqual(a.findings.map(f => f.id), b.findings.map(f => f.id));
  assert.match(a.findings[0].id, new RegExp(`::${INTEGRITY_RULE_VERSION}::`));
});

test("ordering is deterministic: errors before warnings", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [
    knowledge({ id: "k1", projectId: "p1", status: "approved" }),        // missing_evidence -> error
    knowledge({ id: "k2", projectId: "p1", type: "question", status: "draft" }), // unanswered + orphaned -> warnings
  ] }));
  const severities = report.findings.map(f => f.severity);
  assert.deepEqual([...severities].sort((a, b) => (a === "error" ? 0 : 1) - (b === "error" ? 0 : 1)), severities);
});

test("serialized report is byte-identical for identical input", () => {
  const input = base({ projectId: "p1", knowledgeObjects: [
    knowledge({ id: "kb", projectId: "p1", type: "idea", title: "Dup", status: "draft" }),
    knowledge({ id: "ka", projectId: "p1", type: "idea", title: "Dup", status: "draft" }),
    knowledge({ id: "q1", projectId: "p1", type: "question", title: "Why", status: "approved" }),
  ] });
  assert.equal(JSON.stringify(analyzeKnowledgeIntegrity(input)), JSON.stringify(analyzeKnowledgeIntegrity(input)));
});

test("analyzer performs no mutation of its input", () => {
  const input = base({ projectId: "p1", knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "approved" })] });
  const snapshot = JSON.stringify(input);
  analyzeKnowledgeIntegrity(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test("counts summarize findings by kind and severity", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "approved" })] }));
  assert.equal(report.totalCount, report.findings.length);
  assert.equal(report.errorCount + report.warningCount, report.totalCount);
  assert.equal(report.countsByKind.missing_evidence, 1);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `analyzeKnowledgeIntegrity` is not exported from `@orbit/vault-core`.

- [ ] **Step 4: Implement `packages/vault-core/src/integrity.ts`**

```ts
import type {
  IntegrityAnalyzerInput, IntegrityFinding, IntegrityFindingKind, IntegrityReport, IntegritySeverity, KnowledgeObject,
} from "@orbit/vault-types";

export const INTEGRITY_RULE_VERSION = "1";

const KIND_ORDER: IntegrityFindingKind[] = ["broken_reference", "missing_evidence", "orphaned", "duplicate_candidate", "unanswered_question"];
const SEVERITY_ORDER: IntegritySeverity[] = ["error", "warning"];
const ACTIVE = new Set<KnowledgeObject["status"]>(["draft", "approved"]);

type EndpointState = "ok" | "missing" | "cross_project" | "archived" | "trashed";
const describeState = (state: EndpointState) => (state === "cross_project" ? "cross-project" : state);

const normalizeTitle = (title: string) =>
  title.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ").replace(/[.,;:!?]+$/g, "");

const findingId = (projectId: string, kind: IntegrityFindingKind, subjectId: string, relatedIds: string[]) =>
  `${projectId}::${INTEGRITY_RULE_VERSION}::${kind}::${subjectId}::${[...relatedIds].sort().join(",")}`;

export function analyzeKnowledgeIntegrity(input: IntegrityAnalyzerInput): IntegrityReport {
  const { projectId } = input;
  const findings: IntegrityFinding[] = [];

  const byId = new Map<string, { projectId: string; status: string }>();
  const set = (id: string, ownerProjectId: string, status: string) => byId.set(id, { projectId: ownerProjectId, status });
  for (const p of input.projects) set(p.id, p.id, p.status);
  for (const f of input.folders) set(f.id, f.projectId, f.status);
  for (const d of input.documents) set(d.id, d.projectId, d.status);
  for (const k of input.knowledgeObjects) set(k.id, k.projectId, k.status);
  for (const e of input.evidenceSources) set(e.id, e.projectId, "active");

  const resolve = (id: string): EndpointState => {
    const entity = byId.get(id);
    if (!entity) return "missing";
    if (entity.projectId !== projectId) return "cross_project";
    if (entity.status === "archived") return "archived";
    if (entity.status === "trashed") return "trashed";
    return "ok";
  };
  const severityFor = (state: EndpointState): IntegritySeverity => (state === "archived" || state === "trashed" ? "warning" : "error");

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
    findings.push({ id: findingId(projectId, kind, subjectId, relatedIds), kind, severity, subjectId, relatedIds, message });

  // Rule 1: broken_reference
  for (const r of relationships) {
    for (const [type, id] of [[r.sourceType, r.sourceId], [r.targetType, r.targetId]] as const) {
      const state = resolve(id);
      if (state === "ok") continue;
      add("broken_reference", severityFor(state), r.id, [id], `Relationship ${r.relationshipType} references a ${describeState(state)} ${type} (${id}).`);
    }
  }
  for (const l of evidenceLinks) {
    const state = resolve(l.evidenceSourceId);
    if (state === "ok") continue;
    add("broken_reference", severityFor(state), l.knowledgeObjectId, [l.evidenceSourceId], `Evidence link references a ${describeState(state)} evidence source (${l.evidenceSourceId}).`);
  }
  for (const e of evidenceSources) {
    if (!e.sourceId) continue;
    const state = resolve(e.sourceId);
    if (state === "ok") continue;
    add("broken_reference", severityFor(state), e.id, [e.sourceId], `Evidence source references a ${describeState(state)} ${e.sourceType} (${e.sourceId}).`);
  }

  // Rule 2: missing_evidence
  for (const k of knowledge) {
    if (k.status === "approved" && (evidenceCount.get(k.id) ?? 0) === 0) {
      add("missing_evidence", "error", k.id, [], `Approved knowledge "${k.title}" has no attached evidence.`);
    }
  }

  // Rule 3: orphaned
  for (const k of knowledge) {
    if (!ACTIVE.has(k.status)) continue;
    if ((evidenceCount.get(k.id) ?? 0) === 0 && !relatedKnowledge.has(k.id)) {
      add("orphaned", "warning", k.id, [], `Knowledge "${k.title}" has no evidence and no relationships.`);
    }
  }

  // Rule 4: duplicate_candidate
  const active = knowledge.filter(k => ACTIVE.has(k.status));
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
    const key = `${k.type}::${normalizeTitle(k.title)}`;
    const group = byTitle.get(key); if (group) group.push(k); else byTitle.set(key, [k]);
  }
  for (const group of byTitle.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) emitPair(group[i]!, group[j]!);
  const activeById = new Map(active.map(k => [k.id, k]));
  for (const r of relationships) {
    if (r.relationshipType !== "duplicates" || r.sourceType !== "knowledge" || r.targetType !== "knowledge") continue;
    const a = activeById.get(r.sourceId), b = activeById.get(r.targetId);
    if (a && b) emitPair(a, b);
  }

  // Rule 5: unanswered_question
  const answered = new Set<string>();
  for (const r of relationships) {
    if (r.relationshipType !== "answers" || r.targetType !== "knowledge") continue;
    const sourceState = resolve(r.sourceId);
    if (sourceState !== "missing" && sourceState !== "cross_project") answered.add(r.targetId);
  }
  for (const k of knowledge) {
    if (k.type === "question" && ACTIVE.has(k.status) && !answered.has(k.id)) {
      add("unanswered_question", "warning", k.id, [], `Question "${k.title}" has no answer.`);
    }
  }

  findings.sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    || a.subjectId.localeCompare(b.subjectId)
    || a.relatedIds.join(",").localeCompare(b.relatedIds.join(","))
    || a.id.localeCompare(b.id));

  const countsByKind = Object.fromEntries(KIND_ORDER.map(k => [k, 0])) as Record<IntegrityFindingKind, number>;
  for (const f of findings) countsByKind[f.kind]++;
  const errorCount = findings.filter(f => f.severity === "error").length;
  return { projectId, findings, totalCount: findings.length, errorCount, warningCount: findings.length - errorCount, countsByKind };
}
```

- [ ] **Step 5: Re-export from `packages/vault-core/src/index.ts`**

Add at the top of the file, after the existing imports:

```ts
export * from "./integrity";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all new integrity tests green; existing 26 still green.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/vault-types/src/index.ts packages/vault-core/src/integrity.ts packages/vault-core/src/index.ts tests/phase2-integrity.test.ts
git commit -m "feat: add deterministic knowledge integrity analyzer"
```

---

## Task 2: Read-only storage assembly

**Files:**
- Modify: `packages/vault-core/src/index.ts` (repository interface + `VaultService.integrity`)
- Modify: `packages/vault-storage/src/index.ts` (`analyzeIntegrity` implementation)
- Test: `tests/phase2-integrity.test.ts` (append integration block)

**Interfaces:**
- Consumes: `analyzeKnowledgeIntegrity` (Task 1); repository reads `listProjects()`, `listProjectFolders(id)`, `listProjectDocuments(id)`, `listKnowledgeObjects({projectId})`, `listRelationships({projectId})`, `listEvidence(knowledgeObjectId)`, `listEvidenceLinks(knowledgeObjectId)`.
- Produces: `VaultRepository.analyzeIntegrity(projectId: string): IntegrityReport`; `VaultService.integrity.analyze(projectId: string): IntegrityReport`.

- [ ] **Step 1: Extend the repository interface + service in `packages/vault-core/src/index.ts`**

Add `IntegrityReport` to the type import from `@orbit/vault-types`. In the `VaultRepository` interface add:

```ts
  analyzeIntegrity(projectId: string): IntegrityReport;
```

In `VaultService`, after the `relationships = { ... }` block add:

```ts
  integrity = {
    analyze: (projectId: string) => this.repository.analyzeIntegrity(assertIdentifier(projectId, "projectId")),
  };
```

- [ ] **Step 2: Write the failing integration tests**

Append to `tests/phase2-integrity.test.ts`. First extend the **existing** top-of-file import from `@orbit/vault-core` to also pull in `VaultService` (change `import { analyzeKnowledgeIntegrity, INTEGRITY_RULE_VERSION } from "@orbit/vault-core";` to `import { analyzeKnowledgeIntegrity, INTEGRITY_RULE_VERSION, VaultService } from "@orbit/vault-core";`). Then add these new imports once, below the existing imports (do not re-import `test`/`assert`, which are already at the top):

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { SqliteVaultRepository } from "@orbit/vault-storage";

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "orbit-vault-integrity-"));
  const service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root }));
  service.initialize();
  return { root, service, dispose: () => { service.close(); rmSync(root, { recursive: true, force: true }); } };
};

test("integration: normally-created orphan draft is flagged and analysis mutates nothing", () => {
  const ctx = fixture();
  try {
    const project = ctx.service.projects.create({ name: "Integrity project" });
    const orphan = ctx.service.knowledge.create({ projectId: project.id, type: "idea", title: "Lonely idea", body: "No links", confidence: "low" });
    const before = JSON.stringify(ctx.service.knowledge.list({ projectId: project.id }));
    const report = ctx.service.integrity.analyze(project.id);
    assert.ok(report.findings.some(f => f.kind === "orphaned" && f.subjectId === orphan.id));
    assert.equal(JSON.stringify(ctx.service.knowledge.list({ projectId: project.id })), before);
  } finally { ctx.dispose(); }
});

test("integration: injected approved-without-evidence surfaces missing_evidence", () => {
  const ctx = fixture();
  try {
    const project = ctx.service.projects.create({ name: "Integrity project" });
    const k = ctx.service.knowledge.create({ projectId: project.id, type: "fact", title: "Forced approve", body: "x", confidence: "medium" });
    const db = new DatabaseSync(join(ctx.root, "vault.db"));
    db.prepare("UPDATE knowledge_objects SET status='approved' WHERE id=?").run(k.id);
    db.close();
    const report = ctx.service.integrity.analyze(project.id);
    assert.ok(report.findings.some(f => f.kind === "missing_evidence" && f.subjectId === k.id && f.severity === "error"));
  } finally { ctx.dispose(); }
});

test("integration: analyze rejects an invalid project id", () => {
  const ctx = fixture();
  try { assert.throws(() => ctx.service.integrity.analyze("!bad")); } finally { ctx.dispose(); }
});
```

Note: confirm the knowledge status column/table name (`knowledge_objects`) against `packages/vault-storage/src/index.ts` before running; adjust the `UPDATE` if the migration names differ.

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test`
Expected: FAIL — `analyzeIntegrity` not implemented on `SqliteVaultRepository`.

- [ ] **Step 4: Implement `analyzeIntegrity` in `packages/vault-storage/src/index.ts`**

Add `analyzeKnowledgeIntegrity` to the existing `@orbit/vault-core` import. Add this method to `SqliteVaultRepository` (near `snapshot()`):

```ts
  analyzeIntegrity(projectId: string) {
    this.getProject(projectId); // existence + ownership
    const projects = this.listProjects();
    const folders = projects.flatMap(p => this.listProjectFolders(p.id));
    const documents = projects.flatMap(p => this.listProjectDocuments(p.id));
    const knowledgeObjects = projects.flatMap(p => this.listKnowledgeObjects({ projectId: p.id }));
    const relationships = projects.flatMap(p => this.listRelationships({ projectId: p.id }));
    const evidenceLinks = knowledgeObjects.flatMap(k => this.listEvidenceLinks(k.id));
    const evidenceById = new Map<string, ReturnType<typeof this.listEvidence>[number]>();
    for (const k of knowledgeObjects) for (const e of this.listEvidence(k.id)) evidenceById.set(e.id, e);
    return analyzeKnowledgeIntegrity({
      projectId, projects, folders, documents, knowledgeObjects,
      evidenceSources: [...evidenceById.values()], relationships, evidenceLinks,
    });
  }
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test`
Expected: PASS — integration tests green, existing tests green.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/vault-core/src/index.ts packages/vault-storage/src/index.ts tests/phase2-integrity.test.ts
git commit -m "feat: assemble read-only integrity analysis in storage"
```

---

## Task 3: IPC + preload surface

**Files:**
- Modify: `apps/vault-desktop/electron/main/main.ts`
- Modify: `apps/vault-desktop/electron/preload/preload.cts`
- Modify: `scripts/phase2-lifecycle-ui-regression.mjs`

**Interfaces:**
- Consumes: `VaultService.integrity.analyze` (Task 2); the `handle(channel, op, mutates=false)` helper and `call<T>(channel, ...args)` bridge.
- Produces: channel `vault:integrity:analyze`; `window.vault.integrity.analyze(projectId)`.

- [ ] **Step 1: Extend the static regression (RED)**

In `scripts/phase2-lifecycle-ui-regression.mjs`, after the existing `channels` loop area add a dedicated integrity IPC block (keep everything already there):

```js
requireContract(main, /handle\("vault:integrity:analyze", projectId => vault\.integrity\.analyze\(projectId\)\);/, "integrity analyze main handler (read-only, no mutates flag)");
assert.doesNotMatch(main, /vault:integrity:analyze"[^;]*, true\)/, "integrity analyze must not be marked as mutating");
requireContract(preload, /analyze: \(projectId\) => call\("vault:integrity:analyze", projectId\),/, "preload integrity.analyze bridge method");
requireContract(types, /integrity: \{ analyze\(projectId: string\): Promise<ApiResult<IntegrityReport>>; \};/, "VaultRendererApi integrity contract");
```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/phase2-lifecycle-ui-regression.mjs`
Expected: FAIL — integrity contracts missing.

- [ ] **Step 3: Register the IPC handler in `main.ts`**

On the line following the `vault:relationships:*` handlers, add:

```ts
  handle("vault:integrity:analyze", projectId => vault.integrity.analyze(projectId));
```

(No `true` — read-only, must not emit `vault:changed`.)

- [ ] **Step 4: Add the preload bridge method in `preload.cts`**

After the `relationships: { ... }` block:

```ts
  integrity: { analyze: (projectId) => call("vault:integrity:analyze", projectId) },
```

- [ ] **Step 5: Run regression + typecheck to verify pass**

Run: `node scripts/phase2-lifecycle-ui-regression.mjs`
Expected: PASS.
Run: `pnpm typecheck`
Expected: exit 0 (the `VaultRendererApi.integrity` contract from Task 1 is now satisfied by preload).

- [ ] **Step 6: Commit**

```bash
git add apps/vault-desktop/electron/main/main.ts apps/vault-desktop/electron/preload/preload.cts scripts/phase2-lifecycle-ui-regression.mjs
git commit -m "feat: expose read-only integrity analyze IPC"
```

---

## Task 4: Integrity review UI

**Files:**
- Create: `apps/vault-desktop/renderer/src/IntegrityView.tsx`
- Modify: `apps/vault-desktop/renderer/src/KnowledgeView.tsx`
- Modify: `apps/vault-desktop/renderer/src/styles.css`
- Modify: `scripts/phase2-lifecycle-ui-regression.mjs`

**Interfaces:**
- Consumes: `window.vault.integrity.analyze(projectId)` (Task 3); Slice 1 internals in `KnowledgeView` — the `mode` state, `openMerge(trigger)`, `setModal`, `onSelected`, `setMode`.
- Produces: `IntegrityView` component; `KnowledgeMode` extended with `"integrity"`.

**Design direction:** reuse the existing dark Orbit palette (Vault charcoal `#181922`, Inspector ink `#1a1b23`, Boundary slate `#343744`, Evidence blue `#aebfff`, Approval green `#92dfb2`, Lifecycle amber `#efc477`). Errors use a restrained red (`#efb3ba` text on `#2d2024`), warnings use amber. No new fonts or dependencies. Keep keyboard focus visible.

- [ ] **Step 1: Extend the static regression (RED)**

Add to `scripts/phase2-lifecycle-ui-regression.mjs` a new `integrity = read("apps/vault-desktop/renderer/src/IntegrityView.tsx");` read near the other `read(...)` calls, then:

```js
for (const label of ["Active", "History", "Integrity"]) {
  assert.match(renderer, new RegExp(`>${label}<`), `Missing knowledge mode switch label: ${label}`);
}
assert.match(renderer, /\.integrity\.analyze\(/, "Integrity panel must call window.vault.integrity.analyze");
assert.match(renderer, /openMerge/, "Integrity duplicate action must reuse the Slice 1 merge flow");
for (const label of ["No integrity issues detected", "Missing evidence", "Duplicate", "Unanswered", "Broken reference", "Orphaned", "Refresh"]) {
  assert.match(integrity, new RegExp(label), `Missing integrity UI copy: ${label}`);
}
for (const selector of [".integrity-view", ".integrity-summary", ".integrity-group", ".integrity-finding"]) {
  assert.match(styles, new RegExp(selector.replace(".", "\\.")), `Missing integrity UI style: ${selector}`);
}
```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/phase2-lifecycle-ui-regression.mjs`
Expected: FAIL — `IntegrityView.tsx` missing and switch labels absent.

- [ ] **Step 3: Create `IntegrityView.tsx`**

```tsx
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
```

- [ ] **Step 4: Wire `IntegrityView` into `KnowledgeView.tsx`**

1. Extend the mode type: change `type KnowledgeMode = "active" | "history";` to `"active" | "history" | "integrity"`.
2. Import at top: `import IntegrityView from "./IntegrityView";`
3. In the sidebar switch that renders the `Active | History` buttons, add a third button:

```tsx
<button className={mode === "integrity" ? "active" : ""} onClick={() => setMode("integrity")}>Integrity</button>
```

4. Build a lookup and the routing callbacks (place near `allKnowledge`):

```tsx
const knowledgeById = useMemo(() => new Map(allKnowledge.map(item => [item.id, item])), [allKnowledge]);
const inspectFromIntegrity = useCallback((id: string) => { setMode("active"); onSelected(id); }, [onSelected]);
const attachEvidenceFromIntegrity = useCallback((id: string) => { setMode("active"); onSelected(id); }, [onSelected]);
const mergePairFromIntegrity = useCallback((targetId: string, sourceId: string) => {
  setMode("active"); onSelected(targetId); setMergeSourceIds([sourceId]); setModal({ kind: "merge", targetId });
}, [onSelected]);
```

5. In the main panel, render `IntegrityView` when `mode === "integrity"` instead of the inspector:

```tsx
{mode === "integrity"
  ? <IntegrityView projectId={project.id} knowledgeById={knowledgeById} onError={onError}
      onInspect={inspectFromIntegrity} onMergePair={mergePairFromIntegrity} onAttachEvidence={attachEvidenceFromIntegrity} />
  : /* existing inspector / empty-editor JSX */}
```

Keep the existing inspector JSX as the `else` branch. Do not change Slice 1 behavior for `active`/`history`.

- [ ] **Step 5: Add styles to `styles.css`**

Append:

```css
.integrity-view{display:grid;gap:16px;padding:4px 2px}
.integrity-summary{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:12px;border-bottom:1px solid #30323e}
.integrity-summary b{font-size:16px}.integrity-summary small{margin-left:10px;color:#8c91a3}
.integrity-summary-actions{display:flex;align-items:center;gap:12px}
.integrity-summary-actions button{border:1px solid #414656;border-radius:7px;background:#292d3a;color:#d8dbe5;padding:7px 12px;cursor:pointer}
.integrity-summary-actions button:disabled{opacity:.5;cursor:not-allowed}
.integrity-empty{margin:24px 0;color:#8c91a3}
.integrity-group{display:grid;gap:8px}
.integrity-group h3{display:flex;justify-content:space-between;margin:0 0 2px;color:#cfd3dd;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
.integrity-group h3 span{color:#aebfff;font-variant-numeric:tabular-nums}
.integrity-finding{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:11px 13px;border:1px solid #343744;border-radius:8px;background:#1a1b23}
.integrity-finding.error{border-color:#75444b}
.integrity-severity{font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:3px 7px;border-radius:5px}
.integrity-severity.error{background:#2d2024;color:#efb3ba}
.integrity-severity.warning{background:#24221d;color:#efc477}
.integrity-finding-body{min-width:0}.integrity-finding-body p{margin:0;color:#e6e8ef}.integrity-finding-body small{color:#8c91a3}
.integrity-finding button.link{border:0;background:transparent;color:#aebfff;cursor:pointer;font-size:13px}
.integrity-finding button.link:hover{text-decoration:underline}
```

- [ ] **Step 6: Run the static regression to verify pass**

Run: `node scripts/phase2-lifecycle-ui-regression.mjs`
Expected: PASS — integrity + all Slice 1 assertions.

- [ ] **Step 7: Full verification**

Run: `pnpm typecheck` → exit 0.
Run: `pnpm test` → all green (26 existing + new integrity tests).
Run: `pnpm build` → electron main, preload, renderer all build.

- [ ] **Step 8: Commit**

```bash
git add apps/vault-desktop/renderer/src/IntegrityView.tsx apps/vault-desktop/renderer/src/KnowledgeView.tsx apps/vault-desktop/renderer/src/styles.css scripts/phase2-lifecycle-ui-regression.mjs
git commit -m "feat: add read-only knowledge integrity review panel"
```

---

## Self-Review

**Spec coverage:**
- Pure analyzer, no I/O / determinism — Task 1 (`integrity.ts`, determinism + no-mutation tests). ✔
- Read-only storage assembly, no tables/persistence — Task 2. ✔
- Types + one IPC + isolation — Task 1 types, Task 3 IPC (`getProject` ownership in Task 2 assembly, `assertIdentifier` in service). ✔
- Five rules with exact severities incl. archived/trashed → warning — Task 1 rules + tests. ✔
- Duplicate = duplicates-rel OR normalized title, same type, one per pair — Task 1 (`emitPair`, `normalizeTitle`) + tests. ✔
- Canonical `answers` direction — Task 1 Rule 5 + test. ✔
- Stable ids (projectId + RULE_VERSION + kind + subject + sorted related) and ordering (severity→kind→subject→related→id) — Task 1 `findingId` + `sort` + tests. ✔
- No timestamp inside report; UI "Last analyzed" separate — Task 1 report shape; Task 4 `lastAnalyzed` state. ✔
- `Active | History | Integrity`, auto-analyze, Refresh, grouped findings, per-kind routing incl. merge reuse — Task 4. ✔
- Empty / healthy / analyzer-failure states — Task 4 (`No integrity issues detected`, loading, `onError`). ✔
- All existing tests + static regression stay green — verified in Task 2/3/4 steps. ✔

**Placeholder scan:** No TBD/TODO; every code step has concrete code. The one advisory (Task 2 Step 2) tells the implementer to confirm the `knowledge_objects` table name against storage before running the injection test — that is a verification instruction, not a placeholder.

**Type consistency:** `analyzeKnowledgeIntegrity`, `IntegrityReport`, `IntegrityAnalyzerInput`, `INTEGRITY_RULE_VERSION`, `VaultService.integrity.analyze`, `VaultRepository.analyzeIntegrity`, channel `vault:integrity:analyze`, and `window.vault.integrity.analyze` are used identically across every task. `KnowledgeMode` gains exactly `"integrity"`. Fix-routing reuses the real Slice 1 symbols (`openMerge`/`setModal`/`setMode`/`onSelected`).
