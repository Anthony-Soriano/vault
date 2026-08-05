import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = path => readFileSync(resolve(root, path), "utf8");
const main = read("apps/vault-desktop/electron/main/main.ts");
const preload = read("apps/vault-desktop/electron/preload/preload.cts");
const types = read("packages/vault-types/src/index.ts");

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

const orbitDesktopBridge = types.match(/export interface OrbitDesktopBridge \{([\s\S]*?)\n\}/)?.[1] ?? "";
for (const method of ["restore", "supersede", "previewMerge", "merge", "history"]) {
  assert.doesNotMatch(orbitDesktopBridge, new RegExp(`\\b${method}\\b`), `Lifecycle method ${method} must not be added to OrbitDesktopBridge`);
}

console.log("Lifecycle IPC/preload regression checks passed.");
