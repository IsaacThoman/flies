// The web build's own steps (vite.config.ts): the brain file, the service
// worker and the web app manifest. docs/web.md says what the build is and how
// to host it.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { Connect, Plugin } from "vite";
import type { BrainFile } from "../apps/web/src/brain/download.ts";
import { encodeWire } from "../apps/web/src/brain/wire.ts";

const root = path.join(import.meta.dirname, "..");
const CONNECTOME = path.join(root, "packages/brain/data/connectome.bin");
const ANATOMY = path.join(root, "packages/brain/data/anatomy.bin");
const WIRE_SOURCE = path.join(root, "apps/web/src/brain/wire.ts");
/** Encoding takes a few seconds, so the result is kept here between runs, by what it was made from. */
const CACHE = path.join(root, "node_modules/.cache/fly-brain");

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

/** The name the app is installed under: what the title screen's wordmark says. */
export const APP_NAME = "Flies";
export const DESCRIPTION =
  "A fruit fly that lives on your screen. Nothing it does is scripted: a simulation of its whole nervous system, 166,700 neurons wired from the FlyEM male CNS connectome (Janelia Research Campus, CC-BY 4.0), decides what it does.";
/** The colour round the picture and behind the loading screen (apps/web/index.html). */
export const BACKGROUND = "#04122b";

/** The most a part of a data file holds: well under what any static host takes in one file, and little to fetch again when one breaks off. */
export const PART_BYTES = 4 * 1024 * 1024;

type Built = BrainFile & { dir: string };

/**
 * A data file for the browser (apps/web/src/brain/download.ts): gzipped, cut
 * into parts named `<name>.<n>.<hash>.bin` for their contents, and kept in
 * node_modules/.cache under `key` (what it was made from), so it is made once.
 */
export function dataFile(name: string, key: string, make: () => Uint8Array): Built {
  const dir = path.join(CACHE, `${name}-${sha256(key + PART_BYTES)}`);
  const meta = path.join(dir, "parts.json");
  if (!fs.existsSync(meta)) {
    const zipped = gzipSync(make(), { level: 9 });
    const parts: BrainFile["parts"] = [];
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (let at = 0, i = 0; at < zipped.length; at += PART_BYTES, i++) {
      const bytes = zipped.subarray(at, at + PART_BYTES);
      const digest = sha256(bytes);
      const url = `brain/${name}.${i}.${digest.slice(0, 16)}.bin`;
      fs.writeFileSync(path.join(dir, path.basename(url)), bytes);
      parts.push({ url, bytes: bytes.length, sha256: digest });
    }
    fs.writeFileSync(meta, JSON.stringify({ bytes: zipped.length, parts } satisfies BrainFile));
  }
  return { ...(JSON.parse(fs.readFileSync(meta, "utf8")) as BrainFile), dir };
}

/** The connectome in its wire form (apps/web/src/brain/wire.ts), as a data file. */
export function brainFile(): Built | null {
  if (!fs.existsSync(CONNECTOME)) return null;
  const raw = fs.readFileSync(CONNECTOME);
  return dataFile("connectome", sha256(raw) + fs.readFileSync(WIRE_SOURCE, "utf8"), () => encodeWire(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)));
}

/** Where each neuron is (packages/brain/src/anatomy.ts), as a data file, when brain:fetch has built it. */
export function anatomyFile(): Built | null {
  if (!fs.existsSync(ANATOMY)) return null;
  const raw = fs.readFileSync(ANATOMY);
  return dataFile("anatomy", sha256(raw), () => new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

/**
 * Tells the game where its data files are (`__FLY_BRAIN__`, read by
 * apps/web/src/brain/create.ts, and `__FLY_ANATOMY__`, which nothing reads
 * yet: the neurons' positions, to be loaded the same way with a cache of their
 * own), serves their parts from the dev and preview servers, and puts them in
 * the build.
 */
export function brain(): Plugin {
  let files: Built[] = [];
  let base = "/";
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split("?")[0];
    for (const file of files) {
      const part = file.parts.find((p) => url === `${base}${p.url}`);
      if (!part) continue;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(part.bytes));
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      fs.createReadStream(path.join(file.dir, path.basename(part.url))).pipe(res);
      return;
    }
    next();
  };
  const info = (file: Built | null): BrainFile | null => file && { bytes: file.bytes, parts: file.parts };
  return {
    name: "fly-brain",
    config() {
      const connectome = brainFile();
      const anatomy = anatomyFile();
      if (!connectome) console.warn("connectome.bin is missing (npm run brain:fetch): the game will have no brain");
      files = [connectome, anatomy].filter((f) => f !== null);
      return { define: { __FLY_BRAIN__: JSON.stringify(info(connectome)), __FLY_ANATOMY__: JSON.stringify(info(anatomy)) } };
    },
    configResolved(config) {
      base = config.base.startsWith("/") ? config.base : "/";
    },
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
    writeBundle(options) {
      if (!options.dir) return;
      fs.mkdirSync(path.join(options.dir, "brain"), { recursive: true });
      for (const file of files) for (const part of file.parts) fs.copyFileSync(path.join(file.dir, path.basename(part.url)), path.join(options.dir, part.url));
    },
  };
}

const SERVICE_WORKER = path.join(root, "apps/web/src/offline/sw.ts");
const ICONS = path.join(root, "assets/web");

/**
 * The parts that make the page an app: the manifest with its icons, the
 * service worker that keeps the page for opening offline (it leaves the brain
 * to the page, download.ts), and, given FLY_SITE_URL, absolute links for
 * link previews. Build only: the dev server has neither.
 */
export function webApp({ siteUrl = process.env.FLY_SITE_URL }: { siteUrl?: string } = {}): Plugin {
  return {
    name: "fly-web-app",
    apply: "build",
    // After the page itself is written, so the service worker's version covers it.
    enforce: "post",
    buildStart() {
      this.emitFile({ type: "chunk", id: SERVICE_WORKER, fileName: "sw.js" });
    },
    transformIndexHtml: {
      order: "post",
      handler(html) {
        html = html.replace("</head>", `  <link rel="manifest" href="manifest.webmanifest" />\n  </head>`);
        if (siteUrl) {
          const site = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
          html = html.replace(/(<meta property="og:image" content=")\.?\/?([^"]+)"/, (_m, start: string, file: string) => `${start}${new URL(file, site).href}"`);
          html = html.replace("</head>", `  <meta property="og:url" content="${site}" />\n  </head>`);
        }
        return html;
      },
    },
    generateBundle(_options, bundle) {
      const emitted: string[] = [];
      const icon = (name: string) => {
        const file = this.getFileName(this.emitFile({ type: "asset", name, source: fs.readFileSync(path.join(ICONS, name)) }));
        emitted.push(file);
        return file;
      };
      const manifest = {
        id: "./",
        name: APP_NAME,
        short_name: APP_NAME,
        description: DESCRIPTION,
        start_url: "./",
        scope: "./",
        display: "fullscreen",
        display_override: ["fullscreen", "standalone"],
        background_color: BACKGROUND,
        theme_color: BACKGROUND,
        categories: ["entertainment", "education"],
        icons: [
          { src: icon("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
          { src: icon("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
          { src: icon("icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      };
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: `${JSON.stringify(manifest, null, 2)}\n` });
      emitted.push("manifest.webmanifest");
      // Everything the page needs to open, kept by the service worker: not the brain, which the page keeps
      // itself, nor the link preview's picture, which only other sites look at.
      const page = bundle["index.html"];
      if (page?.type !== "asset") throw new Error("The page must be written before the service worker's list");
      const files = ["./", ...[...Object.keys(bundle), ...emitted].filter((name) => name !== "sw.js" && name !== "index.html" && !/\.map$|\/preview-/.test(name))];
      const unique = [...new Set(files)].sort();
      const version = sha256(unique.join("\n") + String(page.source)).slice(0, 16);
      const sw = bundle["sw.js"];
      if (sw?.type !== "chunk") throw new Error("The service worker wasn't built");
      sw.code = sw.code.replace("__FLY_PRECACHE__", JSON.stringify(unique)).replace("__FLY_VERSION__", JSON.stringify(version));
    },
  };
}
