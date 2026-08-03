import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({ build: { target: "node22", outDir: resolve(import.meta.dirname, "../dist/electron/preload"), emptyOutDir: true, lib: { entry: resolve(import.meta.dirname, "preload/preload.cts"), formats: ["cjs"], fileName: () => "preload.cjs" }, rollupOptions: { external: ["electron", /^node:/] } } });
