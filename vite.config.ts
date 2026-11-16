import fs from "node:fs";
import path from "node:path";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

// The packed connectome (packages/brain/data, not in git) is served at
// brain/connectome.bin by the dev and preview servers and copied into the
// production build, for the browser's brain worker. The Apple TV app bundles
// its own copy for the native brain.
const CONNECTOME = path.join(import.meta.dirname, "packages/brain/data/connectome.bin");
const CONNECTOME_PATH = "/brain/connectome.bin";

function connectome(): Plugin {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split("?")[0] !== CONNECTOME_PATH) return next();
    fs.stat(CONNECTOME, (error, stats) => {
      if (error) {
        res.statusCode = 404;
        res.end("connectome.bin is missing: npm run brain:fetch");
        return;
      }
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(stats.size));
      fs.createReadStream(CONNECTOME).pipe(res);
    });
  };
  return {
    name: "fly-connectome",
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
    writeBundle(options) {
      if (!options.dir) return;
      if (!fs.existsSync(CONNECTOME)) {
        this.warn("connectome.bin is missing (npm run brain:fetch): the build has no brain");
        return;
      }
      fs.mkdirSync(path.join(options.dir, "brain"), { recursive: true });
      fs.copyFileSync(CONNECTOME, path.join(options.dir, CONNECTOME_PATH));
    },
  };
}

// Kept independent so the optional display data does not change worker loading.
const ANATOMY = path.join(import.meta.dirname, "packages/brain/data/anatomy.bin");
function anatomy(): Plugin {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split("?")[0] !== "/brain/anatomy.bin") return next();
    fs.stat(ANATOMY, (error, stats) => {
      if (error) {
        res.statusCode = 404;
        res.end("anatomy.bin is missing: npm run brain:fetch");
        return;
      }
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(stats.size));
      fs.createReadStream(ANATOMY).pipe(res);
    });
  };
  return {
    name: "fly-anatomy",
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
    writeBundle(options) {
      if (!options.dir) return;
      if (!fs.existsSync(ANATOMY)) {
        this.warn("anatomy.bin is missing (npm run brain:fetch): the build has no anatomy sidecar");
        return;
      }
      fs.mkdirSync(path.join(options.dir, "brain"), { recursive: true });
      fs.copyFileSync(ANATOMY, path.join(options.dir, "brain/anatomy.bin"));
    },
  };
}

// The web build: the same game that the Apple TV app runs, in a browser.
export default defineConfig({
  root: path.join(import.meta.dirname, "apps/web"),
  publicDir: path.join(import.meta.dirname, "apps/web/public"),
  build: { outDir: path.join(import.meta.dirname, "dist"), emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
  plugins: [connectome(), anatomy()],
});
