// The web build as it would be uploaded (docs/web.md): built into a scratch
// folder, then read like a host and a visitor's browser would.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { gunzipSync } from "node:zlib";
import { build } from "vite";

const root = path.join(import.meta.dirname, "../../..");
const out = mkdtempSync(path.join(tmpdir(), "fly-web-build-"));

before(async () => {
  await build({ configFile: path.join(root, "vite.config.ts"), logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
});
after(() => rmSync(out, { recursive: true, force: true }));

function files(dir = out): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [path.relative(out, full)];
  });
}
const read = (file: string) => readFileSync(path.join(out, file), "utf8");
const TEXT = /\.(html|js|css|webmanifest|json)$/;

/**
 * Web addresses that are in the code but never fetched: an XML namespace
 * three.js names when it makes an element, and a paper cited in a comment in
 * one of its shaders. Anything else is a request to somebody else's server
 * until shown otherwise.
 */
const NOT_REQUESTS = new Set(["http://www.w3.org/1999/xhtml", "https://jcgt.org/published/0007/04/01/"]);

test("nothing in the build asks another site for anything: no fonts, scripts, analytics or CDNs", () => {
  const html = read("index.html");
  for (const [, attribute, value] of html.matchAll(/\b(src|href|srcset|action|poster|data)="([^"]*)"/g)) {
    assert.doesNotMatch(value, /^(https?:)?\/\//, `index.html ${attribute}="${value}"`);
  }
  for (const file of files().filter((f) => TEXT.test(f))) {
    const source = read(file);
    assert.doesNotMatch(source, /@import\s+(url\()?["']?(https?:)?\/\//, `${file} imports a stylesheet from elsewhere`);
    assert.doesNotMatch(source, /url\(\s*["']?(https?:)?\/\//, `${file} loads something from elsewhere in CSS`);
    for (const [url] of source.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
      assert.ok(NOT_REQUESTS.has(url), `${file} names ${url}`);
    }
  }
  const manifest = JSON.parse(read("manifest.webmanifest")) as { icons: { src: string }[] };
  for (const icon of manifest.icons) assert.doesNotMatch(icon.src, /^(https?:)?\/\//);
});

test("every path is relative, so the site works from any folder", () => {
  const html = read("index.html");
  for (const [, value] of html.matchAll(/\b(?:src|href|content)="(\.?\/?(?:assets|brain)\/[^"]*|\/[^"]*)"/g)) {
    assert.doesNotMatch(value, /^\//, `index.html refers to ${value} from the host's root`);
  }
  for (const file of files().filter((f) => f.endsWith(".js"))) assert.doesNotMatch(read(file), /["'`]\/(assets|brain)\/[^"'`]/, `${file} refers to a file from the host's root`);
  const manifest = JSON.parse(read("manifest.webmanifest")) as Record<string, string>;
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
});

test("what may be kept forever has its contents in its name; the few that may not are small", () => {
  const unhashed = files().filter((f) => !/[.-][A-Za-z0-9_-]{8,}\.[a-z]+$/.test(f));
  assert.deepEqual(unhashed.sort(), ["index.html", "manifest.webmanifest", "sw.js"]);
  for (const file of unhashed) assert.ok(statSync(path.join(out, file)).size < 8_000, `${file} is small`);
});

test("the page is an installable app, credits the connectome, and its service worker keeps every file but the brain", () => {
  const html = read("index.html");
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest"/);
  assert.match(html, /<meta name="description" content="[^"]*FlyEM male CNS connectome \(Janelia Research Campus, CC-BY 4\.0\)/);
  assert.match(html, /<meta property="og:image" content="\.\/assets\/preview-[^"]+\.png"/);
  const manifest = JSON.parse(read("manifest.webmanifest")) as { name: string; display: string; icons: { src: string; sizes: string; purpose: string }[]; description: string };
  assert.equal(manifest.display, "fullscreen");
  assert.match(manifest.description, /CC-BY 4\.0/);
  assert.deepEqual(manifest.icons.map((i) => `${i.sizes} ${i.purpose}`), ["192x192 any", "512x512 any", "512x512 maskable"]);
  for (const icon of manifest.icons) assert.ok(existsSync(path.join(out, icon.src)), icon.src);
  const sw = read("sw.js");
  const kept = JSON.parse(/addAll\((\[[^\]]*\])\)/.exec(sw)![1]) as string[];
  const expected = files().filter((f) => !["index.html", "sw.js"].includes(f) && !f.startsWith("brain/") && !/preview-/.test(f));
  assert.deepEqual(kept.filter((f) => f !== "./").sort(), expected.sort());
  assert.ok(kept.includes("./"));
});

test("the brain is beside the page in its wire form, in parts named for their contents, each a few MB (and the neurons' positions, if built, the same way)", { skip: !existsSync(path.join(root, "packages/brain/data/connectome.bin")) && "no connectome (npm run brain:fetch)" }, () => {
  for (const part of files().filter((f) => f.startsWith("brain/"))) assert.match(part, /^brain\/(connectome|anatomy)\.\d+\.[0-9a-f]{16}\.bin$/);
  const parts = files()
    .filter((f) => f.startsWith("brain/connectome."))
    .sort((a, b) => Number(a.split(".")[1]) - Number(b.split(".")[1]));
  assert.ok(parts.length >= 3, `${parts.length} parts`);
  for (const part of parts) {
    const bytes = readFileSync(path.join(out, part));
    assert.ok(bytes.length <= 4 * 1024 * 1024, `${part}: ${bytes.length} bytes`);
    assert.equal(createHash("sha256").update(bytes).digest("hex").slice(0, 16), part.split(".")[2], `${part} is named for its contents`);
  }
  const whole = Buffer.concat(parts.map((part) => readFileSync(path.join(out, part))));
  assert.deepEqual([whole[0], whole[1]], [0x1f, 0x8b], "together they are gzip");
  assert.equal(gunzipSync(whole).subarray(0, 4).toString(), "FLYW", "of the wire form");
  const js = files().filter((f) => f.startsWith("assets/index-") && f.endsWith(".js")).map(read).join("");
  for (const part of parts) assert.ok(js.includes(part), `the page knows ${part}`);
});
