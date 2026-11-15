import path from "node:path";
import { defineConfig } from "vite";

// The web build: the same game that the Apple TV app runs, in a browser.
export default defineConfig({
  root: path.join(import.meta.dirname, "apps/web"),
  publicDir: path.join(import.meta.dirname, "apps/web/public"),
  build: { outDir: path.join(import.meta.dirname, "dist"), emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
});
