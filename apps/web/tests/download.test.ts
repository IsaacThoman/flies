import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ATTEMPTS, BRAIN_CACHE, BrainDownload, BrainLoadError } from "../src/brain/download.ts";
import type { BrainFile } from "../src/brain/download.ts";

const BASE = "https://fly.example/app/";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A made-up brain in parts, as the build records it, and the parts' bytes by address. */
function brainFile(seed = 1, partBytes = 20_000): { file: BrainFile; whole: Uint8Array; served: Map<string, Uint8Array> } {
  const whole = new Uint8Array(50_000);
  let x = seed;
  for (let i = 0; i < whole.length; i++) whole[i] = (x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 24;
  const served = new Map<string, Uint8Array>();
  const parts: BrainFile["parts"] = [];
  for (let at = 0, i = 0; at < whole.length; at += partBytes, i++) {
    const bytes = whole.slice(at, at + partBytes);
    const url = `brain/connectome.${i}.${sha(bytes).slice(0, 16)}.bin`;
    parts.push({ url, bytes: bytes.length, sha256: sha(bytes) });
    served.set(`${BASE}${url}`, bytes);
  }
  return { file: { bytes: whole.length, parts }, whole, served };
}

type Serve = { failAfter?: number; status?: number; ignoreRange?: boolean; swap?: Uint8Array };

/** A server for `served`, honouring Range unless told not to; `how` decides each request's fate. */
function server(served: Map<string, Uint8Array>, how: (url: string, n: number) => Serve = () => ({})) {
  const requests: { url: string; range: string | null }[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const range = new Headers(init?.headers).get("range");
    requests.push({ url, range });
    const { failAfter, status = 200, ignoreRange, swap } = how(url, requests.filter((r) => r.url === url).length);
    const body = swap ?? served.get(url);
    if (!body || status !== 200) return new Response(null, { status: body ? status : 404 });
    const from = range && !ignoreRange ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
    const part = body.subarray(from);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (failAfter !== undefined && from + sent >= failAfter) return controller.error(new TypeError("network"));
        if (sent >= part.length) return controller.close();
        const end = Math.min(part.length, sent + 4096, failAfter !== undefined ? failAfter - from : Infinity);
        controller.enqueue(part.slice(sent, end));
        sent = end;
      },
    });
    const headers = from > 0 ? { "content-range": `bytes ${from}-${body.length - 1}/${body.length}` } : undefined;
    return new Response(stream, { status: from > 0 ? 206 : 200, headers });
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

/** An in-memory Cache API, a cache for each name, with an optional quota over all of them; `entries` is the brain's. */
function cacheStorage({ quota = Infinity } = {}) {
  const caches = new Map<string, Map<string, Uint8Array>>();
  const stored = () => [...caches.values()].flatMap((c) => [...c.values()]).reduce((sum, b) => sum + b.length, 0);
  const key = (request: RequestInfo | URL) => (typeof request === "string" ? request : request instanceof URL ? request.href : request.url);
  const open = (name: string) => {
    if (!caches.has(name)) caches.set(name, new Map());
    const entries = caches.get(name)!;
    return {
      match: async (request: RequestInfo | URL) => {
        const bytes = entries.get(key(request));
        return bytes ? new Response(bytes.slice()) : undefined;
      },
      put: async (request: RequestInfo | URL, response: Response) => {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (stored() + bytes.length > quota) throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
        entries.set(key(request), bytes);
      },
      keys: async () => [...entries.keys()].map((url) => new Request(url)),
      delete: async (request: RequestInfo | URL) => entries.delete(key(request)),
    };
  };
  const opened: string[] = [];
  open(BRAIN_CACHE);
  return { entries: caches.get(BRAIN_CACHE)!, opened, storage: { open: async (name: string) => (opened.push(name), open(name)) } as unknown as CacheStorage };
}

const quick = { subtle: crypto.subtle, wait: async () => {} };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the first load downloads every part, counting the bytes, and keeps them; the next takes them from the cache", async () => {
  const { file, whole, served } = brainFile();
  const net = server(served);
  const caches = cacheStorage();
  caches.entries.set(`${BASE}brain/connectome.0.0000000000000000.bin`, new Uint8Array(10));
  const first = new BrainDownload(file, BASE, { fetch: net.fetch, caches: caches.storage, ...quick });
  const seen: number[] = [];
  const data = await first.load(() => seen.push(first.received));
  assert.deepEqual(new Uint8Array(data), whole);
  assert.equal(first.from, "network");
  assert.ok(seen.length > 10 && seen.at(-1) === whole.length, "progress as the bytes came");
  assert.ok(seen.every((n, i) => i === 0 || n >= seen[i - 1]), "never backwards");
  await settle();
  assert.equal(first.kept, true);
  assert.deepEqual([...caches.entries.keys()].sort(), first.urls.slice().sort(), "the older brain was let go");
  assert.deepEqual([...new Set(caches.opened)], [BRAIN_CACHE]);

  const second = new BrainDownload(file, BASE, { fetch: net.fetch, caches: caches.storage, ...quick });
  assert.deepEqual(new Uint8Array(await second.load()), whole);
  assert.equal(second.from, "cache");
  assert.equal(net.requests.length, file.parts.length, "no request the second time");
});

test("a part that breaks off carries on from the byte where it stopped", async () => {
  const { file, whole, served } = brainFile();
  const net = server(served, (url, n) => ({ failAfter: url.endsWith(file.parts[1].url) && n === 1 ? 7_000 : undefined }));
  const download = new BrainDownload(file, BASE, { fetch: net.fetch, ...quick });
  assert.deepEqual(new Uint8Array(await download.load()), whole);
  assert.deepEqual(
    net.requests.map((r) => r.range),
    [null, null, "bytes=7000-", null],
  );
});

test("a host that doesn't serve ranges sends the part again, and that works too", async () => {
  const { file, whole, served } = brainFile();
  const net = server(served, (url, n) => ({ ignoreRange: true, failAfter: url.endsWith(file.parts[0].url) && n === 1 ? 9_000 : undefined }));
  const download = new BrainDownload(file, BASE, { fetch: net.fetch, ...quick });
  assert.deepEqual(new Uint8Array(await download.load()), whole);
});

test("a connection that keeps breaking off near the same place, on a host without ranges, is reported, not tried for ever", async () => {
  const { file, served } = brainFile();
  const net = server(served, (url, n) => ({ ignoreRange: true, failAfter: url.endsWith(file.parts[0].url) ? 9_000 + (n % 2) * 500 : undefined }));
  const download = new BrainDownload(file, BASE, { fetch: net.fetch, ...quick });
  await assert.rejects(download.load(), (e: BrainLoadError) => e.kind === "download");
  assert.ok(net.requests.length < 10, `${net.requests.length} requests`);
});

test("a part that arrived wrong is asked for again past the browser's HTTP cache", async () => {
  const { file, whole, served } = brainFile();
  const modes: (RequestCache | undefined)[] = [];
  let bad = true;
  const net = server(served, () => ({ swap: bad ? brainFile(2).whole.slice(0, file.parts[0].bytes) : undefined }));
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) => (modes.push(init?.cache), net.fetch(input, init))) as typeof globalThis.fetch;
  const download = new BrainDownload(file, BASE, { fetch, ...quick });
  await assert.rejects(download.load(), (e: BrainLoadError) => e.kind === "damaged");
  bad = false;
  assert.deepEqual(new Uint8Array(await download.load()), whole);
  assert.deepEqual(modes, ["default", "reload", "default", "default"]);
});

test("a page closed halfway: the next visit fetches only the parts it didn't have", async () => {
  const { file, whole, served } = brainFile();
  const caches = cacheStorage();
  let down = true;
  const net = server(served, (url) => (down && url.endsWith(file.parts[2].url) ? { status: 503 } : {}));
  const first = new BrainDownload(file, BASE, { fetch: net.fetch, caches: caches.storage, ...quick });
  await assert.rejects(first.load(), (e: BrainLoadError) => e.kind === "download");
  await settle();
  down = false;
  const before = net.requests.length;
  const second = new BrainDownload(file, BASE, { fetch: net.fetch, caches: caches.storage, ...quick });
  assert.deepEqual(new Uint8Array(await second.load()), whole);
  assert.deepEqual(
    net.requests.slice(before).map((r) => r.url),
    [`${BASE}${file.parts[2].url}`],
  );
});

test("failures say what they are: missing, offline, unreachable, damaged; a damaged part is fetched again from its start", async () => {
  const { file, whole, served } = brainFile();
  const missing = new BrainDownload(file, BASE, { fetch: server(new Map()).fetch, ...quick });
  await assert.rejects(missing.load(), (e: BrainLoadError) => e.kind === "missing");

  let tries = 0;
  const offlineFetch = (async () => {
    tries++;
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  const offline = new BrainDownload(file, BASE, { fetch: offlineFetch, online: () => false, ...quick });
  await assert.rejects(offline.load(), (e: BrainLoadError) => e.kind === "offline");
  assert.equal(tries, ATTEMPTS);
  const unreachable = new BrainDownload(file, BASE, { fetch: offlineFetch, online: () => true, ...quick });
  await assert.rejects(unreachable.load(), (e: BrainLoadError) => e.kind === "download");

  const wrong = brainFile(2).whole.slice(0, file.parts[0].bytes);
  let bad = true;
  const net = server(served, () => ({ swap: bad ? wrong : undefined }));
  const damaged = new BrainDownload(file, BASE, { fetch: net.fetch, ...quick });
  await assert.rejects(damaged.load(), (e: BrainLoadError) => e.kind === "damaged");
  bad = false;
  assert.deepEqual(new Uint8Array(await damaged.load()), whole);
  assert.equal(net.requests[1].range, null, "from the start, not resumed");
});

test("a full storage doesn't stop the brain, and is noticed; a damaged kept part is fetched again", async () => {
  const { file, whole, served } = brainFile();
  const full = cacheStorage({ quota: 30_000 });
  const download = new BrainDownload(file, BASE, { fetch: server(served).fetch, caches: full.storage, ...quick });
  assert.deepEqual(new Uint8Array(await download.load()), whole);
  await settle();
  assert.equal(download.kept, false);
  assert.equal(download.storageFull, true);

  const kept = cacheStorage();
  for (const [url, bytes] of served) kept.entries.set(url, bytes.slice());
  kept.entries.get(`${BASE}${file.parts[1].url}`)![100] ^= 1;
  const net = server(served);
  const fresh = new BrainDownload(file, BASE, { fetch: net.fetch, caches: kept.storage, ...quick });
  assert.deepEqual(new Uint8Array(await fresh.load()), whole);
  assert.equal(fresh.from, "network");
  assert.deepEqual(
    net.requests.map((r) => r.url),
    [`${BASE}${file.parts[1].url}`],
  );
  await fresh.discard();
  assert.equal(kept.entries.size, 0, "discarding forgets every part");
});

test("without the Cache API or crypto.subtle (an app's own URL scheme, plain http) it still loads", async () => {
  const { file, whole } = brainFile();
  const served = new Map(file.parts.map((p, i) => [`app://bundle/${p.url}`, whole.slice(i * 20_000, i * 20_000 + p.bytes)]));
  const download = new BrainDownload(file, "app://bundle/index.html", { fetch: server(served).fetch, caches: null, subtle: null, wait: async () => {} });
  assert.equal(download.urls[0], `app://bundle/${file.parts[0].url}`);
  assert.deepEqual(new Uint8Array(await download.load()), whole);
  assert.equal(download.kept, false);
  assert.equal(download.storageFull, false);
});

test("a second data file in a cache of its own leaves the brain's parts alone", async () => {
  const brain = brainFile(1);
  const other = brainFile(3, 30_000);
  const caches = cacheStorage();
  const served = new Map([...brain.served, ...other.served]);
  await new BrainDownload(brain.file, BASE, { fetch: server(served).fetch, caches: caches.storage, ...quick }).load();
  await settle();
  const net = server(served);
  await new BrainDownload(other.file, BASE, { fetch: net.fetch, caches: caches.storage, ...quick }, "fly-anatomy").load();
  await settle();
  assert.deepEqual(caches.opened.slice(-1), ["fly-anatomy"]);
  const again = new BrainDownload(brain.file, BASE, { fetch: net.fetch, caches: caches.storage, ...quick });
  await again.load();
  assert.equal(again.from, "cache");
});
