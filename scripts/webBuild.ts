// The web build's own steps (vite.config.ts): the brain file, the service
// worker and the web app manifest. docs/web.md says what the build is and how
// to host it.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { Connect, Plugin } from "vite";
import { DEFAULT_TEAM_ID } from "./appleConfig.ts";
import type { BrainFile } from "../apps/web/src/brain/download.ts";
import { encodeWire } from "../apps/web/src/brain/wire.ts";
import { CODE_LENGTH } from "../packages/net/src/protocol.ts";

const root = path.join(import.meta.dirname, "..");
const CONNECTOME = path.join(root, "packages/brain/data/connectome.bin");
const ANATOMY = path.join(root, "packages/brain/data/anatomy.bin");
const MODULE = path.join(root, "packages/brain-native/wasm/fly-brain.wasm");
const WIRE_SOURCE = path.join(root, "apps/web/src/brain/wire.ts");
/** Encoding takes a few seconds, so the result is kept here between runs, by what it was made from. */
const CACHE = path.join(root, "node_modules/.cache/fly-brain");

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

/** The name the app is installed under: what the title screen's wordmark says. */
export const APP_NAME = "flies";
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
 * Or, for a file a host should serve as what it is, not gzipped and named
 * with its own extension.
 */
export function dataFile(name: string, key: string, make: () => Uint8Array, { gzip = true, extension = "bin" } = {}): Built {
  const dir = path.join(CACHE, `${name}-${sha256(key + PART_BYTES + gzip + extension)}`);
  const meta = path.join(dir, "parts.json");
  if (!fs.existsSync(meta)) {
    const zipped = gzip ? gzipSync(make(), { level: 9 }) : make();
    const parts: BrainFile["parts"] = [];
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (let at = 0, i = 0; at < zipped.length; at += PART_BYTES, i++) {
      const bytes = zipped.subarray(at, at + PART_BYTES);
      const digest = sha256(bytes);
      const url = `brain/${name}.${i}.${digest.slice(0, 16)}.${extension}`;
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

/**
 * The brain built as WebAssembly (packages/brain-native/wasm/fly-brain.wasm,
 * committed), as a data file of one part: not gzipped, so a host serves it as
 * application/wasm and may compress it on the way as it does any other.
 */
export function moduleFile(): Built {
  const raw = fs.readFileSync(MODULE);
  return dataFile("fly-brain", sha256(raw), () => new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), { gzip: false, extension: "wasm" });
}

/** Where each neuron is (packages/brain/src/anatomy.ts), as a data file, when brain:fetch has built it. */
export function anatomyFile(): Built | null {
  if (!fs.existsSync(ANATOMY)) return null;
  const raw = fs.readFileSync(ANATOMY);
  return dataFile("anatomy", sha256(raw), () => new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

/**
 * Tells the game where its data files are (`__FLY_BRAIN__` and
 * `__FLY_BRAIN_MODULE__`, read by apps/web/src/brain/create.ts, and
 * `__FLY_ANATOMY__`, which nothing reads
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
      res.setHeader("Content-Type", part.url.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
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
    config(_config, { command }) {
      if (command === "build" && !fs.existsSync(CONNECTOME)) throw new Error("connectome.bin is missing: npm run brain:fetch before building");
      const connectome = brainFile();
      const module = moduleFile();
      const anatomy = anatomyFile();
      if (!connectome) console.warn("connectome.bin is missing (npm run brain:fetch): the game will have no brain");
      files = [connectome, module, anatomy].filter((f) => f !== null);
      return {
        define: { __FLY_BRAIN__: JSON.stringify(info(connectome)), __FLY_BRAIN_MODULE__: JSON.stringify(info(module)), __FLY_ANATOMY__: JSON.stringify(info(anatomy)) },
      };
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
 * Where the apps (the Apple TV's, the iPhone and iPad's) find the room server and which site their
 * invitations open, read by apps/web/src/online/invite.ts: `ROOMS_URL` (a room server for
 * development, such as ws://192.168.1.20:8787/rooms) and `FLY_SITE_URL`, else Flies' own site.
 * A browser at a site uses that site's.
 */
export function appSite(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return { __FLY_ROOMS__: JSON.stringify(env.ROOMS_URL ?? ""), __FLY_SITE__: JSON.stringify(env.FLY_SITE_URL ?? "") };
}

/** Where Apple's devices look for the apps a site vouches for: always at the site's root, whatever folder the game is in. */
export const SITE_ASSOCIATION = ".well-known/apple-app-site-association";
/** The iPhone and iPad app's bundle ID (scripts/ios.ts), which is the Apple TV app's. */
const APP_BUNDLE_ID = "com.isaacthoman.flies";

/**
 * The site's side of the iPhone and iPad app's Associated Domains (docs/ios.md, "Universal links"):
 * a table's link (the site's page with ?table= and a code) opens the app where it is installed, and
 * password AutoFill offers the site's passwords in it. APPLE_TEAM_ID overrides the Apple apps'
 * default team; 0 leaves out the file, so the host answers 404 and phones open links in Safari.
 * A team that can't be one stops the build rather than publish an association that names nobody.
 */
export function siteAssociation(teamId = process.env.APPLE_TEAM_ID): string | null {
  if (teamId === "0") return null;
  teamId ||= DEFAULT_TEAM_ID;
  if (!/^[A-Z0-9]{10}$/.test(teamId)) throw new Error(`APPLE_TEAM_ID must be a Team ID, ten capital letters and digits, not ${JSON.stringify(teamId)}`);
  const app = `${teamId}.${APP_BUNDLE_ID}`;
  const association = {
    applinks: { details: [{ appIDs: [app], components: [{ "/": "/", "?": { table: "?".repeat(CODE_LENGTH) }, comment: "A table's link" }] }] },
    webcredentials: { apps: [app] },
  };
  return `${JSON.stringify(association, null, 2)}\n`;
}

/**
 * The parts that make the page an app: the manifest with its icons, the
 * service worker that keeps the page for opening offline (it leaves the brain
 * to the page, download.ts), given FLY_SITE_URL, absolute links for link
 * previews, and the site's association with the iPhone
 * and iPad app. Build only: the dev server has none of them.
 */
export function webApp({ siteUrl = process.env.FLY_SITE_URL, teamId = process.env.APPLE_TEAM_ID }: { siteUrl?: string; teamId?: string } = {}): Plugin {
  const association = siteAssociation(teamId);
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
      if (association) this.emitFile({ type: "asset", fileName: SITE_ASSOCIATION, source: association });
      // Everything the page needs to open, kept by the service worker: not the brain, which the page keeps
      // itself, nor the link preview's picture or the site's association, which only other sites look at.
      const page = bundle["index.html"];
      if (page?.type !== "asset") throw new Error("The page must be written before the service worker's list");
      const files = ["./", ...[...Object.keys(bundle), ...emitted].filter((name) => name !== "sw.js" && name !== "index.html" && name !== SITE_ASSOCIATION && !/\.map$|\/preview-/.test(name))];
      const unique = [...new Set(files)].sort();
      const version = sha256(unique.join("\n") + String(page.source)).slice(0, 16);
      const sw = bundle["sw.js"];
      if (sw?.type !== "chunk") throw new Error("The service worker wasn't built");
      sw.code = sw.code.replace("__FLY_PRECACHE__", JSON.stringify(unique)).replace("__FLY_VERSION__", JSON.stringify(version));
    },
  };
}
