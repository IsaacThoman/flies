// Getting the fly's brain to a browser: the packed connectome in its wire
// form (wire.ts), about 14 MB gzipped, cut into parts of a few MB. Each part
// comes from the browser's own cache when it is there and otherwise from the
// server, with the bytes counted as they come; each is checked against the
// digest the build recorded and kept as soon as it has arrived. So a download
// that breaks off, or a page closed halfway, carries on from the last whole
// part on any host (and from the very byte where the host serves ranges), and
// a new deploy with a new brain has new part names, the old ones let go.
//
// The parts are plain binary files, not .gz: a host can't take them for
// something to unzip on the way, and none of them is near the size limits
// static hosts put on a file.
//
// Everything here is optional in the browser: without the Cache API (a page
// served over plain http, or from an app's own URL scheme) it just fetches,
// and without crypto.subtle it relies on gzip's own check when unpacking.

export type BrainPart = { url: string; bytes: number; sha256: string };

/** The brain as the build wrote it (scripts/webBuild.ts): the gzipped wire form, in parts, in order. */
export type BrainFile = { bytes: number; parts: BrainPart[] };

export type LoadFailure = "offline" | "download" | "missing" | "damaged" | "unsupported" | "memory";

export class BrainLoadError extends Error {
  override name = "BrainLoadError";
  readonly kind: LoadFailure;
  constructor(kind: LoadFailure, message: string) {
    super(message);
    this.kind = kind;
  }
}

/**
 * The browser cache the connectome is kept in. Each file the game downloads
 * this way has a cache of its own, since each lets go of whatever in its cache
 * isn't its current parts.
 */
export const BRAIN_CACHE = "fly-brain";
/** No bytes for this long, ms, and the connection is given up and tried again. */
export const STALL_TIMEOUT_MS = 20_000;
/** Attempts in a row that bring nothing before the download is reported as failed. */
export const ATTEMPTS = 4;

type Environment = {
  fetch: typeof fetch;
  caches?: CacheStorage | null;
  subtle?: SubtleCrypto | null;
  online?: () => boolean;
  wait?: (ms: number) => Promise<void>;
};

const hex = (digest: ArrayBuffer) => Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * One brain's download. `load` may be called again after it fails, and
 * carries on from the bytes it already has.
 */
export class BrainDownload {
  readonly file: BrainFile;
  /** Each part's address, against the page. */
  readonly urls: string[];
  /** Bytes in hand, of `total`. */
  received = 0;
  readonly total: number;
  /** Where the brain came from this time: null until a part has to be fetched, "cache" if none did. */
  from: "cache" | "network" | null = null;
  /** Whether every part is kept for next time: null until known. */
  kept: boolean | null = null;
  /** A part couldn't be kept because the browser's storage for this site is full. */
  storageFull = false;
  #env: Required<Environment>;
  /** Parts already in hand, kept until the whole is put together. */
  #parts: (Uint8Array<ArrayBuffer> | null)[];
  /** The part arriving, how much of it has, and the most of it that ever had. */
  #partial: { index: number; bytes: Uint8Array<ArrayBuffer>; at: number; best: number } | null = null;
  /** Parts that arrived wrong once: asked for again past the browser's own HTTP cache, which may hold the same wrong bytes. */
  readonly #suspect = new Set<number>();
  /** Parts being put in the cache, and whether one couldn't be. */
  #storing = 0;
  #storeFailed = false;
  #loaded = false;
  readonly #cacheName: string;

  constructor(file: BrainFile, base: string, env: Environment, cacheName = BRAIN_CACHE) {
    this.file = file;
    this.#cacheName = cacheName;
    this.urls = file.parts.map((part) => new URL(part.url, base).href);
    this.total = file.bytes;
    this.#parts = file.parts.map(() => null);
    this.#env = {
      fetch: env.fetch,
      caches: env.caches ?? null,
      subtle: env.subtle ?? null,
      online: env.online ?? (() => true),
      wait: env.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    };
  }

  /** The brain's bytes: the gzipped wire form, whole (wire.ts unpacks it). */
  async load(onProgress: () => void = () => {}): Promise<ArrayBuffer> {
    this.#loaded = false;
    this.kept = null;
    const cache = await this.#openCache();
    if (cache) await this.#letGoOfOthers(cache);
    for (let i = 0; i < this.#parts.length; i++) {
      const part = this.file.parts[i];
      this.#parts[i] ??= cache ? await this.#fromCache(cache, i) : null;
      this.#count(onProgress);
      if (this.#parts[i]) continue;
      this.from = "network";
      const bytes = await this.#download(i, onProgress);
      if (!(await this.#intact(bytes, part))) {
        this.#suspect.add(i);
        throw new BrainLoadError("damaged", "The fly's brain arrived damaged.");
      }
      this.#parts[i] = bytes;
      this.#count(onProgress);
      if (cache) this.#keep(cache, i, bytes);
    }
    this.from ??= "cache";
    this.#loaded = true;
    if (cache) this.#settle();
    else this.kept = false;
    let whole: Uint8Array<ArrayBuffer>;
    try {
      whole = new Uint8Array(this.total);
    } catch {
      throw new BrainLoadError("memory", "There isn't the memory here for the fly's brain.");
    }
    let at = 0;
    for (const bytes of this.#parts) {
      whole.set(bytes!, at);
      at += bytes!.length;
    }
    this.#parts.fill(null);
    return whole.buffer;
  }

  /** Forgets the kept parts: they passed every check here but the brain couldn't be built from them. */
  async discard() {
    // So a put still under way can't call it kept after all.
    this.#loaded = false;
    this.kept = false;
    this.#parts.fill(null);
    try {
      const cache = await this.#openCache();
      for (const url of this.urls) await cache?.delete(url);
    } catch {
      // Nothing kept, or nothing to be done about it.
    }
  }

  #count(onProgress: () => void) {
    let received = this.#partial?.at ?? 0;
    for (let i = 0; i < this.#parts.length; i++) received += this.#parts[i] ? this.file.parts[i].bytes : 0;
    this.received = received;
    onProgress();
  }

  async #openCache(): Promise<Cache | null> {
    try {
      return (await this.#env.caches?.open(this.#cacheName)) ?? null;
    } catch {
      return null;
    }
  }

  /** Anything else in the cache is an older brain. */
  async #letGoOfOthers(cache: Cache) {
    try {
      for (const request of await cache.keys()) if (!this.urls.includes(request.url)) await cache.delete(request);
    } catch {
      // Unreadable: it will be overwritten or evicted in time.
    }
  }

  /** A kept part, if it is there and intact. */
  async #fromCache(cache: Cache, i: number): Promise<Uint8Array<ArrayBuffer> | null> {
    try {
      const hit = await cache.match(this.urls[i]);
      if (!hit) return null;
      const bytes = new Uint8Array(await hit.arrayBuffer());
      if (await this.#intact(bytes, this.file.parts[i])) return bytes;
      await cache.delete(this.urls[i]);
    } catch {
      // Unreadable: fetch it instead.
    }
    return null;
  }

  #keep(cache: Cache, i: number, bytes: Uint8Array<ArrayBuffer>) {
    this.#storing++;
    // The Response holds its own copy.
    cache.put(this.urls[i], new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } })).then(
      () => {
        this.#storing--;
        this.#settle();
      },
      (error: unknown) => {
        this.#storing--;
        this.#storeFailed = true;
        this.storageFull ||= (error as { name?: string } | null)?.name === "QuotaExceededError";
        this.#settle();
      },
    );
  }

  /** Once every part is in hand and every one has been put away: whether all of them are kept. */
  #settle() {
    if (this.#loaded && this.#storing === 0) this.kept = !this.#storeFailed;
  }

  async #intact(bytes: Uint8Array<ArrayBuffer>, part: BrainPart): Promise<boolean> {
    if (bytes.length !== part.bytes) return false;
    const subtle = this.#env.subtle;
    if (!subtle) return true;
    try {
      return hex(await subtle.digest("SHA-256", bytes)) === part.sha256;
    } catch {
      return true;
    }
  }

  async #download(i: number, onProgress: () => void): Promise<Uint8Array<ArrayBuffer>> {
    if (this.#partial?.index !== i) {
      try {
        this.#partial = { index: i, bytes: new Uint8Array(this.file.parts[i].bytes), at: 0, best: 0 };
      } catch {
        throw new BrainLoadError("memory", "There isn't the memory here for the fly's brain.");
      }
    }
    const partial = this.#partial;
    let idle = 0;
    try {
      for (;;) {
        try {
          await this.#attempt(i, partial, onProgress);
          return partial.bytes;
        } catch (error) {
          if (error instanceof BrainLoadError && error.kind === "damaged") this.#suspect.add(i);
          if (error instanceof BrainLoadError && error.kind !== "download") throw error;
          // Progress is more of the part than ever before: a host without ranges starts it again each time, and a
          // connection that always breaks off near the same place mustn't count as getting anywhere.
          if (partial.at > partial.best) {
            partial.best = partial.at;
            idle = 0;
          } else if (++idle >= ATTEMPTS) {
            throw this.#env.online() ? new BrainLoadError("download", "The fly's brain stopped downloading.") : new BrainLoadError("offline", "You're offline.");
          }
          await this.#env.wait(1000 * 2 ** Math.max(0, idle - 1));
        }
      }
    } finally {
      if (partial.at === partial.bytes.length || this.#partial !== partial) this.#partial = null;
    }
  }

  /** One request for a part, from where the last one stopped. */
  async #attempt(i: number, partial: { bytes: Uint8Array<ArrayBuffer>; at: number }, onProgress: () => void) {
    const resuming = partial.at > 0;
    const abort = new AbortController();
    let timer = setTimeout(() => abort.abort(), STALL_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await this.#env.fetch(this.urls[i], {
          signal: abort.signal,
          headers: resuming ? { Range: `bytes=${partial.at}-` } : {},
          cache: this.#suspect.has(i) ? "reload" : "default",
        });
      } catch {
        throw new BrainLoadError("download", "The fly's brain couldn't be reached.");
      }
      if (response.status === 404 || response.status === 410) throw new BrainLoadError("missing", "The fly's brain isn't on this server.");
      if (!response.ok) throw new BrainLoadError("download", `The server answered ${response.status}.`);
      // A host that doesn't serve ranges sends the whole part again.
      if (resuming && (response.status !== 206 || !response.headers.get("content-range")?.startsWith(`bytes ${partial.at}-`))) partial.at = 0;
      const reader = response.body?.getReader();
      if (!reader) {
        this.#take(partial, new Uint8Array(await response.arrayBuffer()));
        this.#count(onProgress);
      } else {
        for (;;) {
          let next: ReadableStreamReadResult<Uint8Array>;
          try {
            next = await reader.read();
          } catch {
            throw new BrainLoadError("download", "The fly's brain stopped downloading.");
          }
          if (next.done) break;
          clearTimeout(timer);
          timer = setTimeout(() => abort.abort(), STALL_TIMEOUT_MS);
          this.#take(partial, next.value);
          this.#count(onProgress);
        }
      }
      if (partial.at !== partial.bytes.length) throw new BrainLoadError("download", "The fly's brain arrived incomplete.");
    } finally {
      clearTimeout(timer);
      // Lets go of the connection on every way out, not only a stall: a refused or overlong answer included.
      abort.abort();
    }
  }

  #take(partial: { bytes: Uint8Array; at: number }, chunk: Uint8Array) {
    if (partial.at + chunk.length > partial.bytes.length) {
      partial.at = 0;
      throw new BrainLoadError("damaged", "The fly's brain arrived longer than it should be.");
    }
    partial.bytes.set(chunk, partial.at);
    partial.at += chunk.length;
  }
}
