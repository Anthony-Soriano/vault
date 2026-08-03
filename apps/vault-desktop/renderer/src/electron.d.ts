import type { OrbitDesktopBridge, VaultRendererApi } from "@orbit/vault-types";
export {};

declare global {
  interface Window {
    orbit: { desktop: OrbitDesktopBridge };
    vault: VaultRendererApi;
  }
}
