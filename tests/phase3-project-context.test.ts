import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  classifyEvidence, detectProjectTruthReadiness, selectContextEvidence, buildProjectContextPackage,
  PROJECT_CONTEXT_RULE_VERSION, PROJECT_CONTEXT_LIMITS, VaultService,
} from "@orbit/vault-core";
import { SqliteVaultRepository } from "@orbit/vault-storage";
import type { ProjectEvidenceInventory, RawEvidenceFile } from "@orbit/vault-types";

const fixedNow = () => "2026-08-06T12:00:00.000Z";
const file = (relativePath: string, sizeBytes = 100): RawEvidenceFile => ({ relativePath, sizeBytes });
const inventoryOf = (files: RawEvidenceFile[], truncated = false): ProjectEvidenceInventory =>
  classifyEvidence({ projectId: "project-alpha", files, truncated });
const REQUIRED = ["PROJECT.md", "PRODUCT_SPEC.md", "ARCHITECTURE.md", "DECISIONS.md", "ROADMAP.md", "CURRENT_PHASE.md", "BACKLOG.md"];
const fullTruth = (size = 100): RawEvidenceFile[] => REQUIRED.map(doc => file(`.orbit/${doc}`, size));

// --- classifyEvidence -------------------------------------------------------

test("classifyEvidence assigns technical-fact categories deterministically", () => {
  const inv = inventoryOf([
    file("src/index.ts"), file("package.json"), file("pnpm-workspace.yaml"),
    file("tsconfig.json"), file("packages/vault-storage/migrations/001_init.sql"),
    file("tests/foo.test.ts"), file("docs/guide.md"), file(".orbit/PROJECT.md"),
    file("README.md"), file("AGENTS.md"), file("TODO.md"), file("assets/logo.png"),
    file("vite.config.ts"),
  ]);
  const category = (p: string) => inv.items.find(i => i.relativePath === p)!.category;
  assert.equal(category("src/index.ts"), "source");
  assert.equal(category("package.json"), "manifest");
  assert.equal(category("pnpm-workspace.yaml"), "manifest");
  assert.equal(category("tsconfig.json"), "config");
  assert.equal(category("vite.config.ts"), "config");
  assert.equal(category("packages/vault-storage/migrations/001_init.sql"), "schema_migration");
  assert.equal(category("tests/foo.test.ts"), "test");
  assert.equal(category("docs/guide.md"), "documentation");
  assert.equal(category(".orbit/PROJECT.md"), "project_truth");
  assert.equal(category("README.md"), "project_truth");
  assert.equal(category("AGENTS.md"), "project_truth");
  assert.equal(category("TODO.md"), "todo_marker");
  assert.equal(category("assets/logo.png"), "other");
});

test("classifyEvidence is deterministic and byte-identical for identical input (no clock)", () => {
  const files = [file("b/x.ts"), file("a/y.ts"), file(".orbit/PROJECT.md")];
  const a = JSON.stringify(inventoryOf(files));
  const b = JSON.stringify(inventoryOf([...files].reverse()));
  assert.equal(a, b); // stable sort by relativePath regardless of input order
  assert.match(a, /"a\/y.ts"[\s\S]*"b\/x.ts"/);
});

test("classifyEvidence carries totalFiles and the truncated flag; no timestamp fields", () => {
  const inv = inventoryOf([file("a.ts"), file("b.ts")], true);
  assert.equal(inv.totalFiles, 2);
  assert.equal(inv.truncated, true);
  assert.equal(JSON.stringify(inv).includes("createdAt"), false);
  assert.equal(JSON.stringify(inv).includes("generatedAt"), false);
});

// --- detectProjectTruthReadiness -------------------------------------------

test("readiness: complete when all required .orbit docs are present and non-empty", () => {
  const r = detectProjectTruthReadiness(inventoryOf([...fullTruth(), file("src/index.ts")]));
  assert.equal(r.state, "complete");
  assert.equal(r.presentDocuments.length, REQUIRED.length);
  assert.equal(r.missingDocuments.length, 0);
});

test("readiness: missing when no .orbit stack exists", () => {
  const r = detectProjectTruthReadiness(inventoryOf([file("src/index.ts"), file("README.md")]));
  assert.equal(r.state, "missing");
  assert.equal(r.presentDocuments.length, 0);
  assert.equal(r.missingDocuments.length, REQUIRED.length);
});

test("readiness: partial when some required docs are missing", () => {
  const r = detectProjectTruthReadiness(inventoryOf([file(".orbit/PROJECT.md"), file(".orbit/ROADMAP.md")]));
  assert.equal(r.state, "partial");
  assert.deepEqual(r.presentDocuments, [".orbit/PROJECT.md", ".orbit/ROADMAP.md"]);
  assert.ok(r.missingDocuments.includes(".orbit/CURRENT_PHASE.md"));
});

test("readiness: duplicated when a truth doc appears at more than one path", () => {
  const r = detectProjectTruthReadiness(inventoryOf([...fullTruth(), file("docs/CURRENT_PHASE.md")]));
  assert.equal(r.state, "duplicated");
  assert.deepEqual(r.duplicateDocuments, [".orbit/CURRENT_PHASE.md", "docs/CURRENT_PHASE.md"]);
});

test("readiness: potentially_stale is a labeled deterministic heuristic (present-but-empty doc)", () => {
  const files = fullTruth().map(f => (f.relativePath === ".orbit/BACKLOG.md" ? file(f.relativePath, 0) : f));
  const r = detectProjectTruthReadiness(inventoryOf(files));
  assert.equal(r.state, "potentially_stale");
  assert.deepEqual(r.stalenessSignals, [".orbit/BACKLOG.md is present but empty"]);
});

test("readiness output is byte-identical for identical input (no clock)", () => {
  const files = [...fullTruth(), file("src/a.ts")];
  assert.equal(JSON.stringify(detectProjectTruthReadiness(inventoryOf(files))), JSON.stringify(detectProjectTruthReadiness(inventoryOf(files))));
});

// --- selectContextEvidence + buildProjectContextPackage --------------------

test("selectContextEvidence is targeted and bounded, prioritizing high-signal evidence", () => {
  const many = Array.from({ length: 200 }, (_, i) => file(`src/f${String(i).padStart(3, "0")}.ts`));
  const selected = selectContextEvidence(inventoryOf([...fullTruth(), file("package.json"), ...many]));
  assert.ok(selected.length <= PROJECT_CONTEXT_LIMITS.maxItems, "selection is capped");
  assert.ok(selected.length < 200, "not the whole repository");
  assert.equal(selected[0], ".orbit/ARCHITECTURE.md"); // project_truth first, sorted by path
  assert.ok(selected.includes("package.json"), "manifest prioritized over bulk source");
});

test("buildProjectContextPackage reuses the AiContextPackage contract with source-traceable items", () => {
  const inv = inventoryOf([...fullTruth(), file("package.json")]);
  const readiness = detectProjectTruthReadiness(inv);
  const pkg = buildProjectContextPackage({
    projectId: "project-alpha", inventory: inv, readiness,
    contents: [{ relativePath: ".orbit/PROJECT.md", content: "Project truth body" }, { relativePath: "package.json", content: "{}" }],
    now: fixedNow,
  });
  assert.equal(pkg.projectId, "project-alpha");
  assert.equal(pkg.createdAt, fixedNow());
  const truthItem = pkg.items.find(i => i.sourceRef === ".orbit/PROJECT.md")!;
  assert.equal(truthItem.kind, "project_truth");
  assert.equal(pkg.items.find(i => i.sourceRef === "package.json")!.kind, "repository_file");
  assert.ok(pkg.items.some(i => i.kind === "note" && i.sourceRef === null), "carries an inspectable readiness note");
});

test("buildProjectContextPackage truncates oversized content and is byte-identical for a fixed clock", () => {
  const inv = inventoryOf([file("big.ts")]);
  const readiness = detectProjectTruthReadiness(inv);
  const args = { projectId: "project-alpha", inventory: inv, readiness, contents: [{ relativePath: "big.ts", content: "x".repeat(PROJECT_CONTEXT_LIMITS.maxChars + 500) }], now: fixedNow };
  const a = buildProjectContextPackage(args), b = buildProjectContextPackage(args);
  assert.equal(a.items.find(i => i.sourceRef === "big.ts")!.content.length, PROJECT_CONTEXT_LIMITS.maxChars);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// --- storage integration: analyzeProjectContext ----------------------------

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "orbit-vault-context-"));
  const service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root }));
  service.initialize();
  return { root, service, dispose: () => { service.close(); rmSync(root, { recursive: true, force: true }); } };
};
const writeProjectFile = (root: string, storagePath: string, rel: string, content: string) => {
  const abs = join(root, "projects", storagePath, ...rel.split("/"));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
};

test("analyzeProjectContext discovers evidence, detects readiness, and builds a targeted package", () => {
  const fx = fixture();
  try {
    const project = fx.service.projects.create({ name: "Repo" });
    writeProjectFile(fx.root, project.storagePath, ".orbit/PROJECT.md", "# Project");
    writeProjectFile(fx.root, project.storagePath, ".orbit/ROADMAP.md", "# Roadmap");
    writeProjectFile(fx.root, project.storagePath, "package.json", "{}");
    writeProjectFile(fx.root, project.storagePath, "src/index.ts", "export const x = 1;");
    const result = fx.service.context.analyze(project.id);
    assert.equal(result.projectId, project.id);
    assert.equal(result.ruleVersion, PROJECT_CONTEXT_RULE_VERSION);
    assert.equal(result.readiness.state, "partial");
    assert.ok(result.inventory.items.some(i => i.relativePath === "package.json" && i.category === "manifest"));
    assert.ok(result.contextPackage.items.some(i => i.sourceRef === ".orbit/PROJECT.md"));
    assert.equal(result.contextPackage.projectId, project.id);
  } finally { fx.dispose(); }
});

test("analyzeProjectContext ignores node_modules/.git/vault artifacts and stays project-isolated", () => {
  const fx = fixture();
  try {
    const a = fx.service.projects.create({ name: "Alpha" });
    const b = fx.service.projects.create({ name: "Beta" });
    writeProjectFile(fx.root, a.storagePath, "src/keep.ts", "1");
    writeProjectFile(fx.root, a.storagePath, "node_modules/dep/index.js", "junk");
    writeProjectFile(fx.root, a.storagePath, ".git/config", "junk");
    writeProjectFile(fx.root, b.storagePath, "src/other.ts", "2");
    const result = fx.service.context.analyze(a.id);
    const paths = result.inventory.items.map(i => i.relativePath);
    assert.ok(paths.includes("src/keep.ts"));
    assert.ok(!paths.some(p => p.startsWith("node_modules/")), "node_modules excluded");
    assert.ok(!paths.some(p => p.startsWith(".git/")), ".git excluded");
    assert.ok(!paths.includes("src/other.ts"), "another project's files never appear");
  } finally { fx.dispose(); }
});

test("analyzeProjectContext performs no mutation and rejects an invalid project id", () => {
  const fx = fixture();
  try {
    const project = fx.service.projects.create({ name: "Repo" });
    writeProjectFile(fx.root, project.storagePath, "src/index.ts", "1");
    const before = JSON.stringify(fx.service.snapshot());
    fx.service.context.analyze(project.id);
    assert.equal(JSON.stringify(fx.service.snapshot()), before, "analysis mutates nothing");
    assert.throws(() => fx.service.context.analyze("bad id!"), /Invalid identifier/);
  } finally { fx.dispose(); }
});
