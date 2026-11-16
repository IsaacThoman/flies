import path from "node:path";
import { defineConfig } from "vite";
import { brain, webApp } from "./scripts/webBuild.ts";

// The web build: the same game that the Apple TV app runs, in a browser, as
// plain files that work from any static host and from any folder on it
// (docs/web.md). The packed connectome and the neurons' positions
// (packages/brain/data, not in git) go with it as data files in parts; the
// Apple TV app bundles its own copy of the connectome for the native brain.
export default defineConfig({
  root: path.join(import.meta.dirname, "apps/web"),
  publicDir: path.join(import.meta.dirname, "apps/web/public"),
  base: "./",
  build: { outDir: path.join(import.meta.dirname, "dist"), emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
  plugins: [brain(), webApp()],
});
