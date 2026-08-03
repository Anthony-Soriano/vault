import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
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

const notifyChanged = () => mainWindow?.webContents.send("vault:changed");
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
  next.initialize(); vault?.close(); vault = next; rememberVault(normalized); updateWindowForVault();
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
  next.initialize(); vault?.close(); vault = next; rememberVault(path); updateWindowForVault(); return lifecycleState();
};
const openVault = async (): Promise<VaultLifecycleState | null> => { const path = await chooseVaultDirectory("Open an Orbit Vault"); if (!path) return null; await activateVault(path); return lifecycleState(); };

const registerVaultIpc = () => {
  ipcMain.handle("vault:lifecycle:state", () => safe(lifecycleState));
  ipcMain.handle("vault:lifecycle:create", () => asyncSafe(createVault));
  ipcMain.handle("vault:lifecycle:open", () => asyncSafe(openVault));
  ipcMain.handle("vault:lifecycle:switch", (_event, path: string) => asyncSafe(async () => { const known = recentVaults.find(item => resolve(item.path) === resolve(String(path))); if (!known) throw new VaultDomainError("VALIDATION_ERROR", "That Vault is not in the recent Vault list."); await activateVault(known.path); return lifecycleState(); }));
  handle("vault:snapshot", () => vault.snapshot());
  handle("vault:projects:list", filters => vault.projects.list(filters)); handle("vault:projects:create", input => vault.projects.create(input), true); handle("vault:projects:update", (id, changes) => vault.projects.update(id, changes), true); handle("vault:projects:archive", id => vault.projects.archive(id), true); handle("vault:projects:restore", id => vault.projects.restore(id), true); handle("vault:projects:trash", id => vault.projects.trash(id), true);
  handle("vault:folders:list", id => vault.folders.list(id)); handle("vault:folders:create", input => vault.folders.create(input), true); handle("vault:folders:rename", (id, name) => vault.folders.rename(id, name), true); handle("vault:folders:move", (id, parent) => vault.folders.move(id, parent), true); handle("vault:folders:archive", id => vault.folders.archive(id), true); handle("vault:folders:restore", id => vault.folders.restore(id), true); handle("vault:folders:trash", id => vault.folders.trash(id), true);
  handle("vault:documents:list", id => vault.documents.list(id)); handle("vault:documents:create-markdown", input => vault.documents.createMarkdown(input), true); handle("vault:documents:read", id => vault.documents.read(id)); handle("vault:documents:update-content", (id, content) => vault.documents.updateContent(id, content), true); handle("vault:documents:rename", (id, title) => vault.documents.rename(id, title), true); handle("vault:documents:move", (id, parent) => vault.documents.move(id, parent), true); handle("vault:documents:archive", id => vault.documents.archive(id), true); handle("vault:documents:restore", id => vault.documents.restore(id), true); handle("vault:documents:trash", id => vault.documents.trash(id), true);
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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith("https://")) void shell.openExternal(url); return { action: "deny" }; });
  if (isDevelopment && process.env.ORBIT_RENDERER_URL) await mainWindow.loadURL(process.env.ORBIT_RENDERER_URL); else await mainWindow.loadFile(join(currentDir, "../../renderer/index.html"));
};

app.whenReady().then(async () => {
  developmentRoot = join(app.getPath("userData"), "orbit-vault", "development-vault"); registryPath = join(app.getPath("userData"), "orbit-vault", "vaults.json");
  const legacyRoot = join(app.getPath("userData"), "orbit-vault", isDevelopment ? "development-vault" : "vault"); let vaultRoot = legacyRoot;
  if (existsSync(registryPath)) try { const stored = JSON.parse(readFileSync(registryPath, "utf8")) as { activePath?: string; recent?: VaultDescriptor[] }; if (stored.activePath && existsSync(join(stored.activePath, "vault.db"))) vaultRoot = stored.activePath; recentVaults = (stored.recent ?? []).filter(item => existsSync(join(item.path, "vault.db"))); } catch (error) { console.warn("Could not read Vault registry", error); }
  vault = new VaultService(new SqliteVaultRepository({ vaultRoot, developmentMode: isDevelopment, developmentRoot })); vault.initialize(); rememberVault(vaultRoot); registerVaultIpc();
  ipcMain.handle("desktop:get-info", () => ({ platform: process.platform, version: app.getVersion(), development: isDevelopment })); ipcMain.handle("dialog:open-files", openFileDialog);
  Menu.setApplicationMenu(createMenu()); await createWindow(); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => vault?.close());
