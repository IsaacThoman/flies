// Serves the built site the way docs/web.md asks a static host to: from a
// folder under any path, with the right types, a long cache life for files
// whose names carry their contents and none for the rest, and byte ranges so
// a broken download can carry on. For trying the build, and for the
// end-to-end run (apps/web/e2e/web.e2e.ts).
//
//   npm run build && node scripts/serve.ts [--dir dist] [--port 8080] [--base /fly/]

import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { parseArgs } from "node:util";
import { SITE_ASSOCIATION } from "./webBuild.ts";

export const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

/** A built file's type: by its extension, and the site's association with the app, which has none, as JSON (Apple's devices ask for that). */
export const contentType = (file: string) => TYPES[path.extname(file)] ?? (file === SITE_ASSOCIATION ? "application/json" : "application/octet-stream");

/** Files named for their contents (assets/, brain/) can be kept for a year; the page, its manifest and the service worker must be asked for again each time. */
export const cacheControl = (file: string) => (/^(assets|brain)\//.test(file) ? "public, max-age=31536000, immutable" : "no-cache");

export type Hit = { path: string; range: string | null };

export type SiteOptions = {
  dir: string;
  /** The folder on the host the site lives in, with slashes at both ends. */
  base?: string;
  port?: number;
  /** For trying a broken download: drop the connection after this many bytes of the response for `file`. */
  cut?: (file: string, hit: Hit) => number | null;
};

export async function serveSite({ dir, base = "/", port = 0, cut }: SiteOptions) {
  dir = path.resolve(dir);
  const requests: Hit[] = [];
  const server = http.createServer((req, res) => {
    let url: URL;
    let suffix: string;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
      suffix = decodeURIComponent(url.pathname.slice(base.length));
    } catch {
      res.writeHead(400).end();
      return;
    }
    const request: Hit = { path: url.pathname, range: req.headers.range ?? null };
    requests.push(request);
    if (url.pathname === base.slice(0, -1)) {
      res.writeHead(301, { Location: base }).end();
      return;
    }
    if (!url.pathname.startsWith(base)) {
      res.writeHead(404).end();
      return;
    }
    let file = suffix || "index.html";
    if (file.endsWith("/")) file += "index.html";
    const full = path.resolve(dir, file);
    const relative = path.relative(dir, full);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(full).size;
    const headers: Record<string, string> = {
      "Content-Type": contentType(file),
      "Cache-Control": cacheControl(file),
      "Accept-Ranges": "bytes",
    };
    let start = 0;
    let end = size - 1;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
        return;
      }
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
    headers["Content-Length"] = String(end - start + 1);
    res.writeHead(range && (range[1] || range[2]) ? 206 : 200, headers);
    if (req.method === "HEAD" || size === 0) {
      res.end();
      return;
    }
    const stop = cut?.(file, request);
    const stream = fs.createReadStream(full, { start, end: stop != null ? Math.min(end, start + stop - 1) : end });
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res, { end: stop == null });
    if (stop != null) stream.on("end", () => res.destroy());
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${base}`;
  return { url, requests, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { dir: { type: "string", default: path.join(import.meta.dirname, "../dist") }, port: { type: "string", default: "8080" }, base: { type: "string", default: "/" } } });
  const base = `/${values.base.replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");
  const { url } = await serveSite({ dir: values.dir, port: Number(values.port), base });
  console.log(`Serving ${values.dir} at ${url}`);
}
