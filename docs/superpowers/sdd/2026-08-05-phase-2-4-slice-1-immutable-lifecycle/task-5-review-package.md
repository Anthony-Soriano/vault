# Task 5 review package
## Commits
```
a4c937d feat: expose knowledge lifecycle IPC
```
## Stat
```
 apps/vault-desktop/electron/main/main.ts        |  2 +-
 apps/vault-desktop/electron/preload/preload.cts |  5 +-
 packages/vault-types/src/index.ts               |  5 ++
 scripts/phase2-lifecycle-ui-regression.mjs      | 68 +++++++++++++++++++++++++
 4 files changed, 78 insertions(+), 2 deletions(-)
```
## Diff
```diff
diff --git a/apps/vault-desktop/electron/main/main.ts b/apps/vault-desktop/electron/main/main.ts
index 1279501..225393e 100644
--- a/apps/vault-desktop/electron/main/main.ts
+++ b/apps/vault-desktop/electron/main/main.ts
@@ -76,21 +76,21 @@ const registerVaultIpc = () => {
   ipcMain.handle("vault:lifecycle:open", () => asyncSafe(openVault));
   ipcMain.handle("vault:lifecycle:switch", (_event, path: string) => asyncSafe(async () => { const known = recentVaults.find(item => resolve(item.path) === resolve(String(path))); if (!known) throw new VaultDomainError("VALIDATION_ERROR", "That Vault is not in the recent Vault list."); await activateVault(known.path); return lifecycleState(); }));
   handle("vault:snapshot", () => vault.snapshot());
   handle("vault:filesystem:reconcile",()=>vault.filesystem.reconcile(),true);
   ipcMain.handle("vault:filesystem:open-projects-folder",()=>asyncSafe(async()=>{const path=join(activeVault.path,"projects");mkdirSync(path,{recursive:true});const error=await shell.openPath(path);if(error)throw new VaultDomainError("VALIDATION_ERROR",error);return path;}));
   handle("vault:projects:list", filters => vault.projects.list(filters)); handle("vault:projects:create", input => vault.projects.create(input), true); handle("vault:projects:update", (id, changes) => vault.projects.update(id, changes), true); handle("vault:projects:archive", id => vault.projects.archive(id), true); handle("vault:projects:restore", id => vault.projects.restore(id), true); handle("vault:projects:trash", id => vault.projects.trash(id), true);
   handle("vault:folders:list", id => vault.folders.list(id)); handle("vault:folders:create", input => vault.folders.create(input), true); handle("vault:folders:rename", (id, name) => vault.folders.rename(id, name), true); handle("vault:folders:move", (id, parent) => vault.folders.move(id, parent), true); handle("vault:folders:archive", id => vault.folders.archive(id), true); handle("vault:folders:restore", id => vault.folders.restore(id), true); handle("vault:folders:trash", id => vault.folders.trash(id), true);
   handle("vault:documents:list", id => vault.documents.list(id)); handle("vault:documents:create-markdown", input => vault.documents.createMarkdown(input), true); handle("vault:documents:import-files", input => vault.documents.importFiles(input), true); handle("vault:documents:read", id => vault.documents.read(id)); handle("vault:documents:update-content", (id, content) => vault.documents.updateContent(id, content), true); handle("vault:documents:rename", (id, title) => vault.documents.rename(id, title), true); handle("vault:documents:move", (id, parent) => vault.documents.move(id, parent), true); handle("vault:documents:archive", id => vault.documents.archive(id), true); handle("vault:documents:restore", id => vault.documents.restore(id), true); handle("vault:documents:trash", id => vault.documents.trash(id), true);
   ipcMain.handle("vault:documents:open",(_event,id:string)=>asyncSafe(async()=>{const path=vault.documents.resolvePath(id),error=await shell.openPath(path);if(error)throw new VaultDomainError("VALIDATION_ERROR",error);return{id};}));
   ipcMain.handle("vault:documents:reveal",(_event,id:string)=>asyncSafe(async()=>{shell.showItemInFolder(vault.documents.resolvePath(id));return{id};}));
-  handle("vault:knowledge:list", filters => vault.knowledge.list(filters)); handle("vault:knowledge:create", input => vault.knowledge.create(input), true); handle("vault:knowledge:update", (id, changes) => vault.knowledge.update(id, changes), true); handle("vault:knowledge:approve", id => vault.knowledge.approve(id), true); handle("vault:knowledge:archive", id => vault.knowledge.archive(id), true); handle("vault:knowledge:search", input => vault.knowledge.search(input));
+  handle("vault:knowledge:list", filters => vault.knowledge.list(filters)); handle("vault:knowledge:create", input => vault.knowledge.create(input), true); handle("vault:knowledge:update", (id, changes) => vault.knowledge.update(id, changes), true); handle("vault:knowledge:approve", id => vault.knowledge.approve(id), true); handle("vault:knowledge:archive", id => vault.knowledge.archive(id), true); handle("vault:knowledge:restore", (id, reason) => vault.knowledge.restore(id, reason), true); handle("vault:knowledge:supersede", input => vault.knowledge.supersede(input), true); handle("vault:knowledge:merge-preview", input => vault.knowledge.previewMerge(input)); handle("vault:knowledge:merge", input => vault.knowledge.merge(input), true); handle("vault:knowledge:history", id => vault.knowledge.history(id)); handle("vault:knowledge:search", input => vault.knowledge.search(input));
   handle("vault:evidence:list", id => vault.evidence.list(id)); handle("vault:evidence:attach", input => vault.evidence.attach(input), true);
   handle("vault:relationships:list", filters => vault.relationships.list(filters)); handle("vault:relationships:create", input => vault.relationships.create(input), true); handle("vault:relationships:remove", id => vault.relationships.remove(id), true);
   handle("vault:search", input => vault.search(input)); handle("vault:development:seed", () => vault.development.seed(), true); handle("vault:development:reset", () => vault.development.reset(), true);
 };
 
 const openFileDialog = async () => { const options: Electron.OpenDialogOptions = { title: "Open files in Orbit Vault", properties: ["openFile", "multiSelections"] }; const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options); return result.canceled ? [] : result.filePaths; };
 const createMenu = () => Menu.buildFromTemplate([
   { label: "File", submenu: [
     { label: "Create Vault…", accelerator: "CmdOrCtrl+Shift+N", click: () => mainWindow?.webContents.send("vault:lifecycle-request", "create") },
     { label: "Open Vault…", accelerator: "CmdOrCtrl+Shift+O", click: () => mainWindow?.webContents.send("vault:lifecycle-request", "open") },
diff --git a/apps/vault-desktop/electron/preload/preload.cts b/apps/vault-desktop/electron/preload/preload.cts
index 57fa0da..564e7ef 100644
--- a/apps/vault-desktop/electron/preload/preload.cts
+++ b/apps/vault-desktop/electron/preload/preload.cts
@@ -31,21 +31,24 @@ const vaultApi: VaultRendererApi = {
     list: (projectId) => call("vault:documents:list", projectId), createMarkdown: (input) => call("vault:documents:create-markdown", input),
     importFiles: (input) => call("vault:documents:import-files", input),
     read: (id) => call("vault:documents:read", id), updateContent: (id, content) => call("vault:documents:update-content", id, content),
     rename: (id, title) => call("vault:documents:rename", id, title), move: (id, parentId) => call("vault:documents:move", id, parentId),
     archive: (id) => call("vault:documents:archive", id), restore: (id) => call("vault:documents:restore", id), trash: (id) => call("vault:documents:trash", id),
     open: (id) => call("vault:documents:open", id), reveal: (id) => call("vault:documents:reveal", id),
   },
   knowledge: {
     list: (filters) => call("vault:knowledge:list", filters), create: (input) => call("vault:knowledge:create", input),
     update: (id, changes) => call("vault:knowledge:update", id, changes), approve: (id) => call("vault:knowledge:approve", id),
-    archive: (id) => call("vault:knowledge:archive", id), search: (input) => call("vault:knowledge:search", input),
+    archive: (id) => call("vault:knowledge:archive", id), restore: (id, reason) => call("vault:knowledge:restore", id, reason),
+    supersede: (input) => call("vault:knowledge:supersede", input), previewMerge: (input) => call("vault:knowledge:merge-preview", input),
+    merge: (input) => call("vault:knowledge:merge", input), history: (knowledgeObjectId) => call("vault:knowledge:history", knowledgeObjectId),
+    search: (input) => call("vault:knowledge:search", input),
   },
   evidence: {
     list: (knowledgeObjectId) => call("vault:evidence:list", knowledgeObjectId), attach: (input) => call("vault:evidence:attach", input),
   },
   relationships: {
     list: (filters) => call("vault:relationships:list", filters), create: (input) => call("vault:relationships:create", input),
     remove: (id) => call("vault:relationships:remove", id),
   },
   search: { query: (input) => call("vault:search", input) },
   development: { seed: () => call("vault:development:seed"), reset: () => call("vault:development:reset") },
diff --git a/packages/vault-types/src/index.ts b/packages/vault-types/src/index.ts
index 3c47495..459f445 100644
--- a/packages/vault-types/src/index.ts
+++ b/packages/vault-types/src/index.ts
@@ -224,20 +224,25 @@ export interface VaultRendererApi {
     trash(id: string): Promise<ApiResult<DocumentFile>>;
     open(id: string): Promise<ApiResult<{ id: string }>>;
     reveal(id: string): Promise<ApiResult<{ id: string }>>;
   };
   knowledge: {
     list(filters: KnowledgeFilters): Promise<ApiResult<KnowledgeObject[]>>;
     create(input: CreateKnowledgeObjectInput): Promise<ApiResult<KnowledgeObject>>;
     update(id: string, changes: UpdateKnowledgeObjectInput): Promise<ApiResult<KnowledgeObject>>;
     approve(id: string): Promise<ApiResult<KnowledgeObject>>;
     archive(id: string): Promise<ApiResult<KnowledgeObject>>;
+    restore(id: string, reason?: string | null): Promise<ApiResult<KnowledgeObject>>;
+    supersede(input: SupersedeKnowledgeInput): Promise<ApiResult<KnowledgeObject>>;
+    previewMerge(input: MergeKnowledgeInput): Promise<ApiResult<MergeKnowledgePreview>>;
+    merge(input: MergeKnowledgeInput): Promise<ApiResult<MergeKnowledgeResult>>;
+    history(knowledgeObjectId: string): Promise<ApiResult<KnowledgeHistoryRecord[]>>;
     search(input: KnowledgeSearchInput): Promise<ApiResult<KnowledgeObject[]>>;
   };
   evidence: {
     list(knowledgeObjectId: string): Promise<ApiResult<EvidenceSource[]>>;
     attach(input: CreateEvidenceSourceInput): Promise<ApiResult<EvidenceSource>>;
   };
   relationships: {
     list(filters: RelationshipFilters): Promise<ApiResult<Relationship[]>>;
     create(input: CreateRelationshipInput): Promise<ApiResult<Relationship>>;
     remove(id: string): Promise<ApiResult<{ id: string }>>;
diff --git a/scripts/phase2-lifecycle-ui-regression.mjs b/scripts/phase2-lifecycle-ui-regression.mjs
new file mode 100644
index 0000000..474f410
--- /dev/null
+++ b/scripts/phase2-lifecycle-ui-regression.mjs
@@ -0,0 +1,68 @@
+import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
+import { resolve } from "node:path";
+import { fileURLToPath } from "node:url";
+
+const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
+const read = path => readFileSync(resolve(root, path), "utf8");
+const main = read("apps/vault-desktop/electron/main/main.ts");
+const preload = read("apps/vault-desktop/electron/preload/preload.cts");
+const types = read("packages/vault-types/src/index.ts");
+
+const requireContract = (source, pattern, description) =>
+  assert.match(source, pattern, `Missing lifecycle IPC contract: ${description}`);
+const count = (source, pattern) => [...source.matchAll(pattern)].length;
+
+const channels = [
+  "vault:knowledge:restore",
+  "vault:knowledge:supersede",
+  "vault:knowledge:merge-preview",
+  "vault:knowledge:merge",
+  "vault:knowledge:history",
+];
+
+for (const channel of channels) {
+  requireContract(main, new RegExp(`\\\"${channel}\\\"`), `main channel ${channel}`);
+  requireContract(preload, new RegExp(`\\\"${channel}\\\"`), `preload channel ${channel}`);
+}
+
+const mainHandlers = [
+  ["restore", /handle\("vault:knowledge:restore", \(id, reason\) => vault\.knowledge\.restore\(id, reason\), true\);/g],
+  ["supersede", /handle\("vault:knowledge:supersede", input => vault\.knowledge\.supersede\(input\), true\);/g],
+  ["merge preview", /handle\("vault:knowledge:merge-preview", input => vault\.knowledge\.previewMerge\(input\)\);/g],
+  ["merge", /handle\("vault:knowledge:merge", input => vault\.knowledge\.merge\(input\), true\);/g],
+  ["history", /handle\("vault:knowledge:history", id => vault\.knowledge\.history\(id\)\);/g],
+];
+
+for (const [name, pattern] of mainHandlers) {
+  assert.equal(count(main, pattern), 1, `Missing lifecycle IPC contract: exact ${name} main handler must appear once`);
+}
+
+const preloadMethods = [
+  ["restore", /restore: \(id, reason\) => call\("vault:knowledge:restore", id, reason\),/],
+  ["supersede", /supersede: \(input\) => call\("vault:knowledge:supersede", input\),/],
+  ["previewMerge", /previewMerge: \(input\) => call\("vault:knowledge:merge-preview", input\),/],
+  ["merge", /merge: \(input\) => call\("vault:knowledge:merge", input\),/],
+  ["history", /history: \(knowledgeObjectId\) => call\("vault:knowledge:history", knowledgeObjectId\),/],
+];
+
+for (const [name, pattern] of preloadMethods) {
+  requireContract(preload, pattern, `preload ${name} bridge method`);
+}
+
+const typeContracts = [
+  /restore\(id: string, reason\?: string \| null\): Promise<ApiResult<KnowledgeObject>>;/,
+  /supersede\(input: SupersedeKnowledgeInput\): Promise<ApiResult<KnowledgeObject>>;/,
+  /previewMerge\(input: MergeKnowledgeInput\): Promise<ApiResult<MergeKnowledgePreview>>;/,
+  /merge\(input: MergeKnowledgeInput\): Promise<ApiResult<MergeKnowledgeResult>>;/,
+  /history\(knowledgeObjectId: string\): Promise<ApiResult<KnowledgeHistoryRecord\[\]>>;/,
+];
+
+for (const contract of typeContracts) requireContract(types, contract, `VaultRendererApi knowledge method ${contract}`);
+
+const orbitDesktopBridge = types.match(/export interface OrbitDesktopBridge \{([\s\S]*?)\n\}/)?.[1] ?? "";
+for (const method of ["restore", "supersede", "previewMerge", "merge", "history"]) {
+  assert.doesNotMatch(orbitDesktopBridge, new RegExp(`\\b${method}\\b`), `Lifecycle method ${method} must not be added to OrbitDesktopBridge`);
+}
+
+console.log("Lifecycle IPC/preload regression checks passed.");
```
