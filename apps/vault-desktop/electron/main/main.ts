import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VaultDomainError, VaultService } from "@orbit/vault-core";
import { SqliteVaultRepository } from "@orbit/vault-storage";
import type { ApiResult, VaultApiError, VaultDescriptor, VaultLifecycleState } from "@orbit/vault-types";

const currentDir = dirname(fileURLToPath(import.meta.url));
const isDevelopment = Boolean(process.env.ORBIT_RENDERER_URL);
let mainWindow: BrowserWindow | null = null;
let vault: VaultService;
let activeVault!: VaultDescriptor;
let recentVaults: VaultDescriptor[] = [];
let registryPath = "";
let developmentRoot = "";
let projectsWatcher:FSWatcher|null=null;
let reconcileTimer:NodeJS.Timeout|null=null;
const reconcileOnOpen=(service:VaultService)=>{try{service.filesystem.reconcile();}catch(error){console.warn("Vault filesystem reconciliation could not complete",error);}};

const notifyChanged = () => mainWindow?.webContents.send("vault:changed");
const stopProjectsWatcher=()=>{if(reconcileTimer)clearTimeout(reconcileTimer);reconcileTimer=null;projectsWatcher?.close();projectsWatcher=null;};
const startProjectsWatcher=()=>{
  stopProjectsWatcher();const projectsPath=join(activeVault.path,"projects");mkdirSync(projectsPath,{recursive:true});
  try{projectsWatcher=watch(projectsPath,{recursive:true,persistent:false},()=>{if(reconcileTimer)clearTimeout(reconcileTimer);reconcileTimer=setTimeout(()=>{reconcileTimer=null;const result=safe(()=>vault.filesystem.reconcile());if(result.ok&&(result.value.projectsAdded>0||result.value.projectsArchived>0||result.value.foldersAdded>0||result.value.documentsAdded>0))notifyChanged();},750);});}
  catch(error){console.warn("Vault projects watcher could not start",error);}
};
// Defensive barrier around a snapshot capture: pause the projects watcher (so an
// external-change reconcile cannot race the capture) and guarantee it restarts,
// even on failure. Capture itself is synchronous, so accepted IPC cannot interleave.
const withWriteBarrier = <T>(operation: () => T): T => { stopProjectsWatcher(); try { return operation(); } finally { startProjectsWatcher(); } };
const apiError = (error: unknown): VaultApiError => {
  console.error("Vault operation failed", error);
  if (error instanceof VaultDomainError) return { code: error.code, message: error.message, field: error.field };
  const database = error instanceof Error && /SQLITE/i.test(error.message);
  return { code: database ? "DATABASE_ERROR" : "INTERNAL_ERROR", message: database ? "The local Vault database could not complete that operation." : "Orbit Vault could not complete that operation." };
};
const safe = <T>(operation: () => T): ApiResult<T> => { try { return { ok: true, value: operation() }; } catch (error) { return { ok: false, error: apiError(error) }; } };
const asyncSafe = async <T>(operation: () => Promise<T>): Promise<ApiResult<T>> => { try { return { ok: true, value: await operation() }; } catch (error) { return { ok: false, error: apiError(error) }; } };
const handle = (channel: string, operation: (...args: any[]) => unknown, mutates = false) => ipcMain.handle(channel, (_event, ...args) => { const result = safe(() => operation(...args)); if (mutates && result.ok) notifyChanged(); return result; });

const lifecycleState = (): VaultLifecycleState => ({ active: activeVault, recent: recentVaults });
const writeRegistry = () => { const temporary = `${registryPath}.tmp`; writeFileSync(temporary, JSON.stringify({ activePath: activeVault.path, recent: recentVaults }, null, 2), "utf8"); renameSync(temporary, registryPath); };
const rememberVault = (path: string) => {
  const normalized = resolve(path), descriptor: VaultDescriptor = { path: normalized, name: basename(normalized), lastOpenedAt: new Date().toISOString() };
  activeVault = descriptor; recentVaults = [descriptor, ...recentVaults.filter(item => resolve(item.path) !== normalized)].slice(0, 10); writeRegistry();
};
const updateWindowForVault = () => { mainWindow?.setTitle(`Orbit Vault — ${activeVault.name}`); notifyChanged(); };
const activateVault = async (path: string) => {
  const normalized = resolve(path);
  if (!existsSync(join(normalized, "vault.db"))) throw new VaultDomainError("VALIDATION_ERROR", "This folder is not an Orbit Vault. Choose a folder containing vault.db.");
  if (activeVault && resolve(activeVault.path) === normalized) return;
  const next = new VaultService(new SqliteVaultRepository({ vaultRoot: normalized, developmentMode: isDevelopment, developmentRoot }));
  next.initialize();reconcileOnOpen(next); vault?.close(); vault = next; rememberVault(normalized);startProjectsWatcher();updateWindowForVault();
};
const chooseVaultDirectory = async (title: string) => {
  const options: Electron.OpenDialogOptions = { title, properties: ["openDirectory", "createDirectory"] };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
};
const createVault = async (): Promise<VaultLifecycleState | null> => {
  const path = await chooseVaultDirectory("Create an Orbit Vault in an empty folder"); if (!path) return null;
  if (readdirSync(path).length > 0) throw new VaultDomainError("VALIDATION_ERROR", "Create Vault requires an empty folder.");
  const next = new VaultService(new SqliteVaultRepository({ vaultRoot: resolve(path), developmentMode: isDevelopment, developmentRoot }));
  next.initialize();reconcileOnOpen(next); vault?.close(); vault = next; rememberVault(path);startProjectsWatcher();updateWindowForVault(); return lifecycleState();
};
const initializeVaultAt = (path:string) => { const next=new VaultService(new SqliteVaultRepository({vaultRoot:resolve(path),developmentMode:isDevelopment,developmentRoot})); next.initialize();reconcileOnOpen(next); vault?.close(); vault=next; rememberVault(path);startProjectsWatcher();updateWindowForVault(); return lifecycleState(); };
const openVault = async (): Promise<VaultLifecycleState | null> => {
  const path=await chooseVaultDirectory("Open an Orbit Vault");if(!path)return null;
  if(existsSync(join(path,"vault.db"))){await activateVault(path);return lifecycleState();}
  const entries=readdirSync(path);
  if(entries.length===0)return initializeVaultAt(path);
  const choice=await dialog.showMessageBox(mainWindow!,{type:"question",buttons:["Cancel","Create Vault here"],defaultId:1,cancelId:0,title:"Create an Orbit Vault?",message:"This folder is not currently an Orbit Vault.",detail:`Orbit will add vault.db, projects, and backups to:\n${path}\n\nExisting files will remain untouched and will not be imported automatically.`});
  return choice.response===1?initializeVaultAt(path):null;
};

const registerVaultIpc = () => {
  ipcMain.handle("vault:lifecycle:state", () => safe(lifecycleState));
  ipcMain.handle("vault:lifecycle:create", () => asyncSafe(createVault));
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
  handle("vault:knowledge:list", filters => vault.knowledge.list(filters)); handle("vault:knowledge:create", input => vault.knowledge.create(input), true); handle("vault:knowledge:update", (id, changes) => vault.knowledge.update(id, changes), true); handle("vault:knowledge:approve", id => vault.knowledge.approve(id), true); handle("vault:knowledge:archive", id => vault.knowledge.archive(id), true); handle("vault:knowledge:restore", (id, reason) => vault.knowledge.restore(id, reason), true); handle("vault:knowledge:supersede", input => vault.knowledge.supersede(input), true); handle("vault:knowledge:merge-preview", input => vault.knowledge.previewMerge(input)); handle("vault:knowledge:merge", input => vault.knowledge.merge(input), true); handle("vault:knowledge:history", id => vault.knowledge.history(id)); handle("vault:knowledge:search", input => vault.knowledge.search(input));
  handle("vault:evidence:list", id => vault.evidence.list(id)); handle("vault:evidence:attach", input => vault.evidence.attach(input), true);
  handle("vault:relationships:list", filters => vault.relationships.list(filters)); handle("vault:relationships:create", input => vault.relationships.create(input), true); handle("vault:relationships:remove", id => vault.relationships.remove(id), true);
  handle("vault:integrity:analyze", projectId => vault.integrity.analyze(projectId));
  handle("vault:context:analyze", projectId => vault.context.analyze(projectId));
  handle("vault:backup:create", () => withWriteBarrier(() => vault.backup.create({ appVersion: app.getVersion() })), true);
  handle("vault:backup:list", () => vault.backup.list());
  handle("vault:backup:inspect", (snapshotId: string) => vault.backup.inspect(snapshotId));
  handle("vault:backup:delete", (snapshotId: string) => vault.backup.delete(snapshotId), true);
  handle("vault:backup:disk-usage", () => vault.backup.diskUsage());
  ipcMain.handle("vault:backup:restore", (_event, input: { snapshotId: string; folderName: string }) => asyncSafe(async () => {
    const parent = await chooseVaultDirectory("Choose where to create the restored Vault");
    if (!parent) throw new VaultDomainError("VALIDATION_ERROR", "Restore cancelled.");
    return vault.backup.restoreToNewVault({ snapshotId: input.snapshotId, parentPath: parent, folderName: input.folderName });
  }));
  handle("vault:search", input => vault.search(input)); handle("vault:development:seed", () => vault.development.seed(), true); handle("vault:development:reset", () => vault.development.reset(), true);
};

const openFileDialog = async () => { const options: Electron.OpenDialogOptions = { title: "Open files in Orbit Vault", properties: ["openFile", "multiSelections"] }; const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options); return result.canceled ? [] : result.filePaths; };
const createMenu = () => Menu.buildFromTemplate([
  { label: "File", submenu: [
    { label: "Create Vault…", accelerator: "CmdOrCtrl+Shift+N", click: () => mainWindow?.webContents.send("vault:lifecycle-request", "create") },
    { label: "Open Vault…", accelerator: "CmdOrCtrl+Shift+O", click: () => mainWindow?.webContents.send("vault:lifecycle-request", "open") },
    { type: "separator" }, { label: "Open Files…", accelerator: "CmdOrCtrl+O", click: () => void openFileDialog() }, { type: "separator" }, process.platform === "darwin" ? { role: "close" } : { role: "quit" },
  ] },
  { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
  { label: "View", submenu: [{ role: "reload" }, { role: "forceReload" }, ...(isDevelopment ? [{ role: "toggleDevTools" as const }] : []), { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
  { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }] },
  ...(isDevelopment ? [{ label: "Developer", submenu: [{ label: "Seed Development Vault", click: () => { safe(() => vault.development.seed()); notifyChanged(); } }, { label: "Reset Development Vault…", click: async () => { const choice = await dialog.showMessageBox(mainWindow!, { type: "warning", buttons: ["Cancel", "Reset"], defaultId: 0, cancelId: 0, title: "Reset Development Vault", message: "Delete only the disposable development Vault and recreate an empty one?" }); if (choice.response === 1) { safe(() => vault.development.reset()); notifyChanged(); } } }] }] : []),
  { label: "Help", submenu: [{ label: "About Orbit Vault", click: () => void dialog.showMessageBox({ type: "info", title: "Orbit Vault", message: "Orbit Vault", detail: `Local-first AI knowledge system\nVersion ${app.getVersion()}\n${activeVault.path}` }) }] },
]);

const createWindow = async () => {
  mainWindow = new BrowserWindow({ width: 1360, height: 860, minWidth: 760, minHeight: 560, title: `Orbit Vault — ${activeVault.name}`, backgroundColor: "#14151c", show: false, webPreferences: { preload: join(currentDir, "../preload/preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  const showFallback=setTimeout(()=>{if(mainWindow&&!mainWindow.isVisible())mainWindow.show();},1500);mainWindow.once("closed",()=>clearTimeout(showFallback));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith("https://")) void shell.openExternal(url); return { action: "deny" }; });
  if (isDevelopment && process.env.ORBIT_RENDERER_URL) await mainWindow.loadURL(process.env.ORBIT_RENDERER_URL); else await mainWindow.loadFile(join(currentDir, "../../renderer/index.html"));
};

app.whenReady().then(async () => {
  developmentRoot = join(app.getPath("userData"), "orbit-vault", "development-vault"); registryPath = join(app.getPath("userData"), "orbit-vault", "vaults.json");
  const legacyRoot = join(app.getPath("userData"), "orbit-vault", isDevelopment ? "development-vault" : "vault"); let vaultRoot = legacyRoot;
  if (existsSync(registryPath)) try { const stored = JSON.parse(readFileSync(registryPath, "utf8")) as { activePath?: string; recent?: VaultDescriptor[] }; if (stored.activePath && existsSync(join(stored.activePath, "vault.db"))) vaultRoot = stored.activePath; recentVaults = (stored.recent ?? []).filter(item => existsSync(join(item.path, "vault.db"))); } catch (error) { console.warn("Could not read Vault registry", error); }
  vault = new VaultService(new SqliteVaultRepository({ vaultRoot, developmentMode: isDevelopment, developmentRoot })); vault.initialize();reconcileOnOpen(vault); rememberVault(vaultRoot);startProjectsWatcher();registerVaultIpc();
  ipcMain.handle("desktop:get-info", () => ({ platform: process.platform, version: app.getVersion(), development: isDevelopment })); ipcMain.handle("dialog:open-files", openFileDialog);
  Menu.setApplicationMenu(createMenu()); await createWindow(); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => {stopProjectsWatcher();vault?.close();});
