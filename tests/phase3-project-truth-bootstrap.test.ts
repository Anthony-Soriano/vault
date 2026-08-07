import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteVaultRepository } from "@orbit/vault-storage";
import {
  planProjectTruthBootstrap, PROJECT_TRUTH_BOOTSTRAP_RULE_VERSION,
  classifyEvidence, detectProjectTruthReadiness, buildProjectContextPackage,
  mapBootstrapDrafts, ProjectTruthBootstrapService, AiService, StubAiProvider, AiProviderError,
  VaultService,
} from "@orbit/vault-core";
import type { ProjectContextAnalysis, RawEvidenceFile } from "@orbit/vault-types";

const PROJECT = "project-alpha";
const fixedNow = () => "2026-08-07T12:00:00.000Z";
const file = (relativePath: string, sizeBytes = 100): RawEvidenceFile => ({ relativePath, sizeBytes });
const REQUIRED = ["PROJECT.md", "PRODUCT_SPEC.md", "ARCHITECTURE.md", "DECISIONS.md", "ROADMAP.md", "CURRENT_PHASE.md", "BACKLOG.md"];

const analysisOf = (files: RawEvidenceFile[]): ProjectContextAnalysis => {
  const inventory = classifyEvidence({ projectId: PROJECT, files });
  const readiness = detectProjectTruthReadiness(inventory);
  const contextPackage = buildProjectContextPackage({
    projectId: PROJECT, inventory, readiness,
    contents: files.map(f => ({ relativePath: f.relativePath, content: `content of ${f.relativePath}` })),
    now: fixedNow,
  });
  return { projectId: PROJECT, ruleVersion: "1", inventory, readiness, contextPackage, generatedAt: fixedNow() };
};

test("planProjectTruthBootstrap targets all required docs as create when the stack is missing", () => {
  const plan = planProjectTruthBootstrap(analysisOf([file("package.json"), file("src/index.ts")]));
  assert.equal(plan.ruleVersion, PROJECT_TRUTH_BOOTSTRAP_RULE_VERSION);
  assert.equal(plan.targets.length, REQUIRED.length);
  for (const t of plan.targets) {
    assert.equal(t.docState, "missing");
    assert.equal(t.suggestedDisposition, "create");
  }
});

test("planProjectTruthBootstrap keeps present docs and only creates missing ones (partial)", () => {
  const plan = planProjectTruthBootstrap(analysisOf([
    file(".orbit/PROJECT.md"), file(".orbit/ARCHITECTURE.md"), file("package.json"),
  ]));
  const byDoc = new Map(plan.targets.map(t => [t.targetDoc, t]));
  assert.equal(byDoc.get(".orbit/PROJECT.md")!.suggestedDisposition, "keep_existing");
  assert.equal(byDoc.get(".orbit/PROJECT.md")!.docState, "present");
  assert.equal(byDoc.get(".orbit/DECISIONS.md")!.suggestedDisposition, "create");
  assert.equal(byDoc.get(".orbit/DECISIONS.md")!.docState, "missing");
});

test("planProjectTruthBootstrap keeps ALL docs when the stack is complete (decision 4)", () => {
  const plan = planProjectTruthBootstrap(analysisOf(REQUIRED.map(d => file(`.orbit/${d}`))));
  for (const t of plan.targets) {
    assert.equal(t.suggestedDisposition, "keep_existing");
    assert.equal(t.docState, "present");
  }
  // No create-targets at all → no replacement/change recommendation.
  assert.equal(plan.targets.filter(t => t.suggestedDisposition === "create").length, 0);
});

test("planProjectTruthBootstrap is byte-deterministic for identical input", () => {
  const files = [file("package.json"), file(".orbit/PROJECT.md")];
  const a = JSON.stringify(planProjectTruthBootstrap(analysisOf(files)));
  const b = JSON.stringify(planProjectTruthBootstrap(analysisOf(files)));
  assert.equal(a, b);
});

const proposalFor = (targetDoc: string, over: Partial<import("@orbit/vault-types").AiProposal> = {}) => ({
  id: `aip_${targetDoc}`, projectId: PROJECT, kind: "project_truth" as const,
  title: `Draft ${targetDoc}`, body: "body", status: "proposed" as const,
  provenance: { provider: "stub", model: "stub-1", generatedAt: fixedNow(), evidence: [], inferred: true },
  createdAt: fixedNow(), ...over,
});

// Identity comes from the Map KEY (the planner-selected target), never from array position.
test("mapBootstrapDrafts keeps only citations that resolve to a real inventory path (decision 3)", () => {
  const files = [file("package.json")];
  const analysis = analysisOf(files);
  const plan = planProjectTruthBootstrap(analysis);
  const good = proposalFor(".orbit/ARCHITECTURE.md", {
    provenance: { provider: "stub", model: "stub-1", generatedAt: fixedNow(),
      evidence: [{ kind: "repository_file", ref: "package.json", locator: null, excerpt: "deps" }], inferred: false },
  });
  const fabricated = proposalFor(".orbit/PROJECT.md", {
    provenance: { provider: "stub", model: "stub-1", generatedAt: fixedNow(),
      evidence: [{ kind: "repository_file", ref: "does/not/exist.ts", locator: null, excerpt: "x" }], inferred: false },
  });
  const proposalsByDoc = new Map([
    [".orbit/ARCHITECTURE.md", [good]],
    [".orbit/PROJECT.md", [fabricated]],
  ]);
  const { drafts } = mapBootstrapDrafts({ plan, proposalsByDoc, inventory: analysis.inventory });
  const arch = drafts.find(d => d.targetDoc === ".orbit/ARCHITECTURE.md")!;
  const proj = drafts.find(d => d.targetDoc === ".orbit/PROJECT.md")!;
  assert.equal(arch.verifiedEvidence.length, 1);
  assert.equal(arch.verifiedEvidence[0].ref, "package.json");
  assert.equal(proj.verifiedEvidence.length, 0);
  assert.ok(proj.ownerInputNeeded.some(s => s.includes("does/not/exist.ts")));
});

test("mapBootstrapDrafts leaves keep_existing targets with a null proposal and no generation", () => {
  const analysis = analysisOf(REQUIRED.map(d => file(`.orbit/${d}`)));
  const plan = planProjectTruthBootstrap(analysis);
  const { drafts } = mapBootstrapDrafts({ plan, proposalsByDoc: new Map(), inventory: analysis.inventory });
  assert.equal(drafts.length, REQUIRED.length);
  for (const d of drafts) { assert.equal(d.proposal, null); assert.equal(d.suggestedDisposition, "keep_existing"); }
});

// Planner authority: a proposal keyed to a NON-planner document must never create a draft.
test("mapBootstrapDrafts never creates a draft for a document the planner did not select", () => {
  const analysis = analysisOf([file("package.json")]); // missing stack → 7 create-targets
  const plan = planProjectTruthBootstrap(analysis);
  const rogue = proposalFor(".orbit/NONSENSE.md");
  const dup = [proposalFor(".orbit/PROJECT.md"), proposalFor(".orbit/PROJECT.md")]; // duplicates for one target
  const proposalsByDoc = new Map([[".orbit/NONSENSE.md", [rogue]], [".orbit/PROJECT.md", dup]]);
  const { drafts } = mapBootstrapDrafts({ plan, proposalsByDoc, inventory: analysis.inventory });
  assert.equal(drafts.length, plan.targets.length); // exactly the planner's targets, no more
  assert.ok(!drafts.some(d => d.targetDoc === ".orbit/NONSENSE.md")); // rogue discarded
  assert.equal(drafts.filter(d => d.targetDoc === ".orbit/PROJECT.md").length, 1); // duplicates collapse to one draft
});

test("ProjectTruthBootstrapService drafts EVERY planner create-target (per-target calls)", async () => {
  const svc = new ProjectTruthBootstrapService(new AiService(new StubAiProvider(), { now: fixedNow }), { now: fixedNow });
  const analysis = analysisOf([file("package.json"), file("src/index.ts")]); // missing → 7 create-targets
  const res = await svc.bootstrap(analysis);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.value.projectId, PROJECT);
  assert.equal(res.value.ruleVersion, PROJECT_TRUTH_BOOTSTRAP_RULE_VERSION);
  assert.equal(res.value.drafts.length, REQUIRED.length); // one draft per planner target
  const created = res.value.drafts.filter(d => d.suggestedDisposition === "create");
  assert.equal(created.length, REQUIRED.length);
  for (const d of created) { assert.ok(d.proposal, `expected a proposal for ${d.targetDoc}`); assert.equal(d.proposal!.status, "proposed"); }
});

test("ProjectTruthBootstrapService stamps the requested projectId on every proposal (isolation, criterion 6)", async () => {
  const svc = new ProjectTruthBootstrapService(new AiService(new StubAiProvider(), { now: fixedNow }), { now: fixedNow });
  const res = await svc.bootstrap(analysisOf([file("package.json")]));
  assert.ok(res.ok);
  if (!res.ok) return;
  for (const d of res.value.drafts) if (d.proposal) assert.equal(d.proposal.projectId, PROJECT);
});

test("ProjectTruthBootstrapService generates nothing for a complete stack (keep_existing)", async () => {
  const svc = new ProjectTruthBootstrapService(new AiService(new StubAiProvider(), { now: fixedNow }), { now: fixedNow });
  const res = await svc.bootstrap(analysisOf(REQUIRED.map(d => file(`.orbit/${d}`))));
  assert.ok(res.ok);
  if (!res.ok) return;
  for (const d of res.value.drafts) { assert.equal(d.suggestedDisposition, "keep_existing"); assert.equal(d.proposal, null); }
  assert.equal(res.value.provider, null); // no propose call was made
});

test("ProjectTruthBootstrapService surfaces the FIRST provider failure as a typed error, mutating nothing", async () => {
  const failing = { id: "boom", model: null, async generate(): Promise<never> { throw new AiProviderError("down"); } };
  const svc = new ProjectTruthBootstrapService(new AiService(failing, { now: fixedNow }), { now: fixedNow });
  const res = await svc.bootstrap(analysisOf([file("package.json")]));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, "AI_PROVIDER_ERROR");
});

test("ProjectTruthBootstrapService holds no repository (structural)", () => {
  const svc = new ProjectTruthBootstrapService(new AiService(new StubAiProvider()));
  assert.equal((svc as unknown as { repository?: unknown }).repository, undefined);
});

// Mirror phase3-project-context.test.ts: the repo takes a StorageOptions object,
// and createProject takes CreateProjectInput ({ name } + optional fields).
const openRepo = (dir: string) => {
  const repo = new SqliteVaultRepository({ vaultRoot: dir, developmentMode: true, developmentRoot: dir });
  repo.initialize();
  return repo;
};

test("VaultService.projectTruth.bootstrap returns AI_NOT_CONFIGURED when no AI is wired", async () => {
  const dir = mkdtempSync(join(tmpdir(), "orbit-ptb-"));
  try {
    const repo = openRepo(dir);
    const project = repo.createProject({ name: "Alpha" });
    const vault = new VaultService(repo); // no AI
    const res = await vault.projectTruth.bootstrap(project.id);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.code, "AI_NOT_CONFIGURED");
    repo.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("VaultService.projectTruth.bootstrap returns ephemeral drafts and writes nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "orbit-ptb-"));
  try {
    const repo = openRepo(dir);
    const project = repo.createProject({ name: "Alpha" });
    const before = JSON.stringify(repo.snapshot());
    const vault = new VaultService(repo, { ai: new ProjectTruthBootstrapService(new AiService(new StubAiProvider(), { now: fixedNow }), { now: fixedNow }) });
    const res = await vault.projectTruth.bootstrap(project.id);
    assert.ok(res.ok);
    if (res.ok) assert.equal(res.value.projectId, project.id);
    assert.equal(JSON.stringify(repo.snapshot()), before); // no mutation
    repo.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("VaultService.projectTruth.bootstrap rejects an invalid id", async () => {
  const dir = mkdtempSync(join(tmpdir(), "orbit-ptb-"));
  try {
    const repo = openRepo(dir);
    const vault = new VaultService(repo, { ai: new ProjectTruthBootstrapService(new AiService(new StubAiProvider())) });
    const res = await vault.projectTruth.bootstrap("../etc/passwd");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.code, "AI_VALIDATION_ERROR");
    repo.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("VaultService.projectTruth.bootstrap returns a typed error when context analysis throws (no unhandled rejection)", async () => {
  const throwingRepo = { analyzeProjectContext() { throw new Error("context failed"); } } as unknown as Parameters<typeof VaultService.prototype.constructor>[0];
  const vault = new VaultService(throwingRepo as any, { ai: new ProjectTruthBootstrapService(new AiService(new StubAiProvider())) });
  const res = await vault.projectTruth.bootstrap("valid-project-id");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, "AI_VALIDATION_ERROR");
});
