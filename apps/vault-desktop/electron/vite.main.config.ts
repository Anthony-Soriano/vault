import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({ build: { target: "node22", outDir: resolve(import.meta.dirname, "../dist/electron/main"), emptyOutDir: true, lib: { entry: resolve(import.meta.dirname, "main/main.ts"), formats: ["es"], fileName: () => "main.js" }, rollupOptions: { external: ["electron", /^node:/] } } });
