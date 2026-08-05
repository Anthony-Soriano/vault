import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { analyzeKnowledgeIntegrity, INTEGRITY_RULE_VERSION, VaultService } from "@orbit/vault-core";
import { SqliteVaultRepository } from "@orbit/vault-storage";
import type {
  DocumentFile, EvidenceSource, IntegrityAnalyzerInput, KnowledgeEvidenceLink,
  KnowledgeObject, Project, Relationship,
} from "@orbit/vault-types";

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "orbit-vault-integrity-"));
  const service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root }));
  service.initialize();
  return { root, service, dispose: () => { service.close(); rmSync(root, { recursive: true, force: true }); } };
};

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

test("evidence source with missing document endpoint is broken_reference", () => {
  const report = analyzeKnowledgeIntegrity(base({ projectId: "p1", knowledgeObjects: [knowledge({ id: "k1", projectId: "p1", status: "draft" })],
    evidenceSources: [evidence({ id: "e1", projectId: "p1", sourceType: "document", sourceId: "ghostdoc" })],
    evidenceLinks: [link({ id: "l1", knowledgeObjectId: "k1", evidenceSourceId: "e1" })] }));
  assert.ok(report.findings.some(f => f.kind === "broken_reference" && f.relatedIds[0] === "ghostdoc"));
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
    knowledge({ id: "k1", projectId: "p1", status: "approved" }),
    knowledge({ id: "k2", projectId: "p1", type: "question", status: "draft" }),
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

void doc;

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
