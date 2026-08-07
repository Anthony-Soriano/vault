import test from "node:test";
import assert from "node:assert/strict";
import {
  planProjectTruthBootstrap, PROJECT_TRUTH_BOOTSTRAP_RULE_VERSION,
  classifyEvidence, detectProjectTruthReadiness, buildProjectContextPackage,
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
