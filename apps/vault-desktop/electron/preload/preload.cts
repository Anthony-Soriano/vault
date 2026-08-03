import { contextBridge, ipcRenderer } from "electron";
import type { OrbitDesktopBridge, VaultRendererApi } from "@orbit/vault-types";

const desktopApi: OrbitDesktopBridge = Object.freeze({
  getInfo: () => ipcRenderer.invoke("desktop:get-info"),
  openFiles: () => ipcRenderer.invoke("dialog:open-files") as Promise<string[]>,
  openFolder: () => ipcRenderer.invoke("dialog:open-folder") as Promise<string | null>,
});

const call = <T,>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>;
const vaultApi: VaultRendererApi = {
  snapshot: () => call("vault:snapshot"),
  onChanged: (callback) => { const listener = () => callback(); ipcRenderer.on("vault:changed", listener); return () => { ipcRenderer.removeListener("vault:changed", listener); }; },
  onLifecycleRequest: (callback) => { const listener = (_event: Electron.IpcRendererEvent, action: "create" | "open") => callback(action); ipcRenderer.on("vault:lifecycle-request", listener); return () => { ipcRenderer.removeListener("vault:lifecycle-request", listener); }; },
  lifecycle: {
    state: () => call("vault:lifecycle:state"), create: () => call("vault:lifecycle:create"),
    open: () => call("vault:lifecycle:open"), switch: (path) => call("vault:lifecycle:switch", path),
  },
  projects: {
    list: (filters) => call("vault:projects:list", filters), create: (input) => call("vault:projects:create", input),
    update: (id, changes) => call("vault:projects:update", id, changes), archive: (id) => call("vault:projects:archive", id),
    restore: (id) => call("vault:projects:restore", id), trash: (id) => call("vault:projects:trash", id),
  },
  folders: {
    list: (projectId) => call("vault:folders:list", projectId), create: (input) => call("vault:folders:create", input),
    rename: (id, name) => call("vault:folders:rename", id, name), move: (id, parentId) => call("vault:folders:move", id, parentId),
    archive: (id) => call("vault:folders:archive", id), restore: (id) => call("vault:folders:restore", id), trash: (id) => call("vault:folders:trash", id),
  },
  documents: {
    list: (projectId) => call("vault:documents:list", projectId), createMarkdown: (input) => call("vault:documents:create-markdown", input),
    read: (id) => call("vault:documents:read", id), updateContent: (id, content) => call("vault:documents:update-content", id, content),
    rename: (id, title) => call("vault:documents:rename", id, title), move: (id, parentId) => call("vault:documents:move", id, parentId),
    archive: (id) => call("vault:documents:archive", id), restore: (id) => call("vault:documents:restore", id), trash: (id) => call("vault:documents:trash", id),
  },
  search: { query: (input) => call("vault:search", input) },
  development: { seed: () => call("vault:development:seed"), reset: () => call("vault:development:reset") },
};

contextBridge.exposeInMainWorld("orbit", Object.freeze({ desktop: desktopApi }));
contextBridge.exposeInMainWorld("vault", Object.freeze(vaultApi));
