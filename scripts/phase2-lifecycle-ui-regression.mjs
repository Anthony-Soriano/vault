import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = path => readFileSync(resolve(root, path), "utf8");
const main = read("apps/vault-desktop/electron/main/main.ts");
const preload = read("apps/vault-desktop/electron/preload/preload.cts");
const types = read("packages/vault-types/src/index.ts");
const renderer = read("apps/vault-desktop/renderer/src/KnowledgeView.tsx");
const integrity = read("apps/vault-desktop/renderer/src/IntegrityView.tsx");
const styles = read("apps/vault-desktop/renderer/src/styles.css");

const requireContract = (source, pattern, description) =>
  assert.match(source, pattern, `Missing lifecycle IPC contract: ${description}`);
const count = (source, pattern) => [...source.matchAll(pattern)].length;

const channels = [
  "vault:knowledge:restore",
  "vault:knowledge:supersede",
  "vault:knowledge:merge-preview",
  "vault:knowledge:merge",
  "vault:knowledge:history",
];

for (const channel of channels) {
  requireContract(main, new RegExp(`\\\"${channel}\\\"`), `main channel ${channel}`);
  requireContract(preload, new RegExp(`\\\"${channel}\\\"`), `preload channel ${channel}`);
}

const mainHandlers = [
  ["restore", /handle\("vault:knowledge:restore", \(id, reason\) => vault\.knowledge\.restore\(id, reason\), true\);/g],
  ["supersede", /handle\("vault:knowledge:supersede", input => vault\.knowledge\.supersede\(input\), true\);/g],
  ["merge preview", /handle\("vault:knowledge:merge-preview", input => vault\.knowledge\.previewMerge\(input\)\);/g],
  ["merge", /handle\("vault:knowledge:merge", input => vault\.knowledge\.merge\(input\), true\);/g],
  ["history", /handle\("vault:knowledge:history", id => vault\.knowledge\.history\(id\)\);/g],
];

for (const [name, pattern] of mainHandlers) {
  assert.equal(count(main, pattern), 1, `Missing lifecycle IPC contract: exact ${name} main handler must appear once`);
}

const preloadMethods = [
  ["restore", /restore: \(id, reason\) => call\("vault:knowledge:restore", id, reason\),/],
  ["supersede", /supersede: \(input\) => call\("vault:knowledge:supersede", input\),/],
  ["previewMerge", /previewMerge: \(input\) => call\("vault:knowledge:merge-preview", input\),/],
  ["merge", /merge: \(input\) => call\("vault:knowledge:merge", input\),/],
  ["history", /history: \(knowledgeObjectId\) => call\("vault:knowledge:history", knowledgeObjectId\),/],
];

for (const [name, pattern] of preloadMethods) {
  requireContract(preload, pattern, `preload ${name} bridge method`);
}

const typeContracts = [
  /restore\(id: string, reason\?: string \| null\): Promise<ApiResult<KnowledgeObject>>;/,
  /supersede\(input: SupersedeKnowledgeInput\): Promise<ApiResult<KnowledgeObject>>;/,
  /previewMerge\(input: MergeKnowledgeInput\): Promise<ApiResult<MergeKnowledgePreview>>;/,
  /merge\(input: MergeKnowledgeInput\): Promise<ApiResult<MergeKnowledgeResult>>;/,
  /history\(knowledgeObjectId: string\): Promise<ApiResult<KnowledgeHistoryRecord\[\]>>;/,
];

for (const contract of typeContracts) requireContract(types, contract, `VaultRendererApi knowledge method ${contract}`);

requireContract(main, /handle\("vault:integrity:analyze", projectId => vault\.integrity\.analyze\(projectId\)\);/, "integrity analyze main handler (read-only, no mutates flag)");
assert.doesNotMatch(main, /vault:integrity:analyze"[^;]*, true\)/, "integrity analyze must not be marked as mutating");
requireContract(preload, /integrity: \{ analyze: \(projectId\) => call\("vault:integrity:analyze", projectId\) \},/, "preload integrity.analyze bridge method");
requireContract(types, /integrity: \{ analyze\(projectId: string\): Promise<ApiResult<IntegrityReport>> \};/, "VaultRendererApi integrity contract");

// --- BL-03 Recovery & Backup contract ---
const backups = read("apps/vault-desktop/renderer/src/BackupsView.tsx");
const app = read("apps/vault-desktop/renderer/src/App.tsx");
const backupChannels = ["vault:backup:create", "vault:backup:list", "vault:backup:inspect", "vault:backup:delete", "vault:backup:disk-usage", "vault:backup:restore"];
for (const channel of backupChannels) {
  requireContract(main, new RegExp(`\\"${channel}\\"`), `main channel ${channel}`);
  requireContract(preload, new RegExp(`\\"${channel}\\"`), `preload channel ${channel}`);
}
requireContract(main, /handle\("vault:backup:create", \(\) => withWriteBarrier\(\(\) => vault\.backup\.create\(\{ appVersion: app\.getVersion\(\) \}\)\), true\);/, "backup create must run under withWriteBarrier and be marked mutating");
requireContract(main, /handle\("vault:backup:delete", \(snapshotId: string\) => vault\.backup\.delete\(snapshotId\), true\);/, "backup delete main handler (mutating)");
assert.doesNotMatch(main, /vault:backup:inspect"[^;]*, true\)/, "backup inspect must not be marked mutating");
assert.doesNotMatch(main, /vault:backup:list"[^;]*, true\)/, "backup list must not be marked mutating");
requireContract(types, /backup: \{\s*create\(\): Promise<ApiResult<SnapshotSummary>>;/, "VaultRendererApi backup contract");
for (const method of ["create", "list", "inspect", "delete", "restoreToNewVault", "diskUsage"]) {
  requireContract(backups, new RegExp(`window\\.vault\\.backup\\.${method}\\(`), `BackupsView must call backup.${method}`);
}
for (const label of ["Create snapshot", "Inspect", "Restore…", "Delete", "on disk"]) {
  requireContract(backups, new RegExp(label), `Missing Backups UI label: ${label}`);
}
requireContract(app, /view==="backups"/, "App must mount the Backups view");
requireContract(app, /<BackupsView /, "App must render BackupsView");
for (const selector of [".backups-view", ".backups-list", ".backups-item", ".backups-inspection"]) {
  assert.match(styles, new RegExp(selector.replace(/\./g, "\\.")), `Missing Backups UI style: ${selector}`);
}

const orbitDesktopBridge = types.match(/export interface OrbitDesktopBridge \{([\s\S]*?)\n\}/)?.[1] ?? "";
for (const method of ["restore", "supersede", "previewMerge", "merge", "history"]) {
  assert.doesNotMatch(orbitDesktopBridge, new RegExp(`\\b${method}\\b`), `Lifecycle method ${method} must not be added to OrbitDesktopBridge`);
}

const visibleLabels = [
  "History",
  "Restore",
  "Supersede",
  "Merge knowledge",
  "Evidence transferred",
  "Relationships redirected",
  "Duplicate links collapsed",
  "Self-links removed",
];

for (const label of visibleLabels) {
  assert.match(renderer, new RegExp(label), `Missing lifecycle UI label: ${label}`);
}

for (const method of ["history", "restore", "supersede", "previewMerge", "merge"]) {
  assert.match(renderer, new RegExp(`\\.${method}\\(`), `Missing lifecycle UI API call: knowledge.${method}`);
}

assert.match(renderer, /role="dialog"/, "Lifecycle application modal must use role=dialog");
assert.match(renderer, /aria-modal="true"/, "Lifecycle application modal must be aria-modal");
assert.doesNotMatch(renderer, /window\.confirm/, "Lifecycle actions must not use window.confirm");

const raceGuards = [
  [/const historicalRequest = useRef\(0\);/, "historical request generation"],
  [/const projectIdRef = useRef<string \| null>\(project\?\.id \?\? null\);/, "current project identity ref"],
  [/const requestId = \+\+historicalRequest\.current;/, "historical request token capture"],
  [/historicalRequest\.current === requestId && projectIdRef\.current === projectId/, "historical commit project/request guard"],
  [/historicalKnowledge\.filter\(item => item\.projectId === project\?\.id\)/, "defensive historical project filter"],
  [/historicalRequest\.current \+= 1;/, "historical request invalidation"],
  [/const evidenceRequest = useRef\(0\);/, "Evidence request generation"],
  [/const selectedKnowledgeIdRef = useRef<string \| null>\(selected\?\.id \?\? null\);/, "selected Knowledge identity ref"],
  [/setEvidenceState\(\{ knowledgeObjectId: null, items: \[\] \}\);/, "immediate Evidence clear"],
  [/evidenceRequest\.current === requestId && selectedKnowledgeIdRef\.current === knowledgeObjectId/, "Evidence commit selection/request guard"],
  [/const evidence = selected && evidenceState\.knowledgeObjectId === selected\.id \? evidenceState\.items : \[\];/, "selection-owned Evidence gate"],
];

for (const [pattern, description] of raceGuards) {
  assert.match(renderer, pattern, `Missing lifecycle UI race guard: ${description}`);
}

const previewParity = [
  [/mergePreview\.target\.id === mergePreviewInput\.targetId/, "rendered preview target parity"],
  [/sameIdSet\(mergePreview\.sources\.map\(item => item\.id\), mergePreviewInput\.sourceIds\)/, "rendered preview source parity"],
  [/mergePreviewSnapshotKey === mergeSnapshotKey/, "preview snapshot parity"],
  [/if \(mergePreviewInput && mergePreviewSnapshotKey !== mergeSnapshotKey\) clearMergePreview\(\);/, "preview invalidation on snapshot change"],
];

for (const [pattern, description] of previewParity) {
  assert.match(renderer, pattern, `Missing merge preview safety contract: ${description}`);
}

const modalSafety = [
  [/import \{ createPortal \} from "react-dom";/, "React body portal"],
  [/createPortal\([\s\S]*document\.body\)/, "modal rendered at document body"],
  [/const dialogRef = useRef<HTMLFormElement \| null>\(null\);/, "dialog focus boundary ref"],
  [/const modalTriggerRef = useRef<HTMLElement \| null>\(null\);/, "modal trigger focus ref"],
  [/appRoot\.inert = true;/, "background interaction inert"],
  [/event\.key === "Tab"/, "Tab focus containment"],
  [/document\.addEventListener\("focusin", onFocusIn\);/, "focus escape containment"],
  [/previouslyFocused\?\.focus\(\);/, "trigger focus restoration"],
  [/className="dialog-backdrop lifecycle-backdrop"/, "dedicated top-level modal backdrop"],
];

for (const [pattern, description] of modalSafety) {
  assert.match(renderer, pattern, `Missing lifecycle modal safety contract: ${description}`);
}

for (const selector of [".knowledge-history", ".history-operation", ".lifecycle-modal", ".merge-preview", ".merge-conflicts"]) {
  assert.match(styles, new RegExp(selector.replace(".", "\\.")), `Missing lifecycle UI style: ${selector}`);
}
assert.match(styles, /body>\.lifecycle-backdrop\{[^}]*z-index:1000/, "Lifecycle portal backdrop must sit above the application shell");

for (const label of ["Active", "History", "Integrity"]) {
  assert.match(renderer, new RegExp(`>${label}</button>`), `Missing knowledge mode switch label: ${label}`);
}
assert.match(renderer, /<IntegrityView/, "KnowledgeView must mount the IntegrityView panel");
assert.match(renderer, /onMergePair={mergePairFromIntegrity}/, "Integrity duplicate action must reuse the Slice 1 merge flow");
assert.match(integrity, /\.integrity\.analyze\(/, "IntegrityView must call window.vault.integrity.analyze");
for (const copy of ["No integrity issues detected", "Missing evidence", "Duplicate candidate", "Unanswered question", "Broken reference", "Orphaned knowledge", "Refresh"]) {
  assert.match(integrity, new RegExp(copy), `Missing integrity UI copy: ${copy}`);
}
for (const selector of [".integrity-view", ".integrity-summary", ".integrity-group", ".integrity-finding"]) {
  assert.match(styles, new RegExp(selector.replace(".", "\\.")), `Missing integrity UI style: ${selector}`);
}

// --- v0.3.1 Project Context & Repository Analysis contract (read-only) ---
const projectContext = read("apps/vault-desktop/renderer/src/ProjectContextView.tsx");
requireContract(main, /handle\("vault:context:analyze", projectId => vault\.context\.analyze\(projectId\)\);/, "context analyze main handler (read-only, no mutates flag)");
assert.doesNotMatch(main, /vault:context:analyze"[^;]*, true\)/, "context analyze must not be marked as mutating");
requireContract(preload, /context: \{ analyze: \(projectId\) => call\("vault:context:analyze", projectId\) \},/, "preload context.analyze bridge method");
requireContract(types, /context: \{ analyze\(projectId: string\): Promise<ApiResult<ProjectContextAnalysis>> \};/, "VaultRendererApi context contract");
requireContract(projectContext, /window\.vault\.context\.analyze\(/, "ProjectContextView must call window.vault.context.analyze");
assert.doesNotMatch(projectContext, /window\.vault\.(?!context\.analyze)\w+\.(create|update|approve|archive|restore|supersede|merge|attach|remove|trash|delete|reconcile)/, "ProjectContextView must remain read-only (no mutating vault calls)");
requireContract(app, /view==="context"/, "App must mount the Project Context view");
requireContract(app, /<ProjectContextView /, "App must render ProjectContextView");
for (const label of ["Project Truth readiness", "Evidence inventory", "Context package", "Read-only analysis"]) {
  requireContract(projectContext, new RegExp(label), `Missing Project Context UI label: ${label}`);
}
for (const selector of [".context-view", ".context-readiness", ".context-inventory", ".context-package", ".context-overlay"]) {
  assert.match(styles, new RegExp(selector.replace(/\./g, "\\.")), `Missing Project Context UI style: ${selector}`);
}

// --- v0.3.2 Project Truth Bootstrap contract (read-only, user-triggered) ---
const projectTruth = read("apps/vault-desktop/renderer/src/ProjectTruthBootstrapView.tsx");
requireContract(main, /handle\("vault:project-truth:bootstrap", projectId => vault\.projectTruth\.bootstrap\(projectId\)\);/, "project-truth bootstrap main handler (non-mutating, no mutates flag)");
assert.doesNotMatch(main, /vault:project-truth:bootstrap"[^;]*, true\)/, "project-truth bootstrap must not be marked as mutating");
requireContract(preload, /projectTruth: \{ bootstrap: \(projectId\) => call\("vault:project-truth:bootstrap", projectId\) \},/, "preload projectTruth.bootstrap bridge method");
requireContract(types, /projectTruth: \{ bootstrap\(projectId: string\): Promise<ApiResult<ProjectTruthBootstrapResult>> \};/, "VaultRendererApi projectTruth contract");
requireContract(projectTruth, /window\.vault\.projectTruth\.bootstrap\(/, "ProjectTruthBootstrapView must call window.vault.projectTruth.bootstrap");
assert.doesNotMatch(projectTruth, /window\.vault\.(?!projectTruth\.bootstrap)\w+\.(create|update|approve|archive|restore|supersede|merge|attach|remove|trash|delete|reconcile)/, "ProjectTruthBootstrapView must remain read-only (no mutating vault calls)");
requireContract(projectTruth, /Generate Project Truth drafts/, "ProjectTruthBootstrapView must expose an explicit generate trigger");
assert.doesNotMatch(projectTruth, /useEffect\([^)]*\bbootstrap\b/, "ProjectTruthBootstrapView must not auto-run bootstrap on mount");
requireContract(app, /view==="project-truth"/, "App must mount the Project Truth view");
requireContract(app, /<ProjectTruthBootstrapView /, "App must render ProjectTruthBootstrapView");
for (const selector of [".project-truth-view", ".project-truth-overlay"]) {
  assert.match(styles, new RegExp(selector.replace(/\./g, "\\.")), `Missing Project Truth UI style: ${selector}`);
}

console.log("Lifecycle IPC/preload/UI regression checks passed.");
