// The fly's journal as it is kept: a small index of entries (its firsts and
// the player's photos, each with a date) and each one's picture, a JPEG, under
// a key of its own. Kept on this device only: nothing here is ever sent.
//
// Where it is kept depends on the host. A browser and the iPhone and iPad app
// have IndexedDB, with room for many pictures. The Apple TV has only
// localStorage, which its host keeps in NSUserDefaults, and tvOS limits what
// an app keeps there, so it keeps fewer, smaller pictures (docs/apple-tv.md).
//
// When the pictures outgrow their room the player's own photos go first,
// oldest first. A first loses its picture only once no photo is left to go,
// and never its place in the journal: a first happens once.

import type { MomentKind } from "./moments.ts";

export type EntryKind = MomentKind | "photo";

export type Entry = {
  id: string;
  kind: EntryKind;
  /** A first's key (moments.ts), or "" for a photo. */
  key: string;
  /** A word or two for it: the food, the place, what it walked onto. */
  label: string;
  /** When, ms since 1970. */
  at: number;
  /** Where it was. */
  place: string;
  /** Its picture's size, pixels; 0 by 0 without one. */
  w: number;
  h: number;
  /** What its picture takes to keep, characters. */
  size: number;
};

/** Somewhere strings are kept under keys. Every call may fail: full, blocked or gone. */
export interface Shelf {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export type Budget = {
  /** The most characters the pictures may take together. */
  chars: number;
  /** The most pictures. */
  pictures: number;
};

/** How a host keeps its journal: the room for it, how big its pictures are (pixels on their long side) and their JPEG quality. */
export type Keeping = { budget: Budget; auto: number; own: number; quality: number };

/** In localStorage: on the Apple TV, NSUserDefaults, where everything the app keeps shares 500 KB, up to three flies' records of 96 KB each among it. */
export const SMALL: Keeping = { budget: { chars: 120_000, pictures: 16 }, auto: 192, own: 256, quality: 70 };
/** In IndexedDB, in a browser or the iPhone and iPad app. */
export const LARGE: Keeping = { budget: { chars: 8_000_000, pictures: 240 }, auto: 320, own: 960, quality: 85 };

/**
 * A journal is a fly's, by the id in its record (fly-record.ts). It is kept
 * apart from the record, which is small enough to be saved every half minute
 * and has room for no pictures.
 */
export const journalKey = (fly: string) => `flies.journal.${fly}`;
const pictureKey = (journal: string, id: string) => `${journal}/${id}`;

const KINDS: readonly EntryKind[] = ["flight", "meal", "groom", "climb", "escape", "sleep", "place", "photo"];
const JPEG = "data:image/jpeg;base64,";
const ID = /^[a-z0-9]{1,24}$/;

/** An entry as saved, if it is one this build can show; anything else is dropped. */
export function readEntry(saved: unknown): Entry | null {
  if (!saved || typeof saved !== "object") return null;
  const e = saved as Record<string, unknown>;
  const { id, kind, key, label, at, place, w, h, size } = e;
  if (typeof id !== "string" || !ID.test(id) || !KINDS.includes(kind as EntryKind)) return null;
  if (typeof key !== "string" || typeof label !== "string" || typeof place !== "string" || label.length > 40 || place.length > 40) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if ((kind === "photo") !== (key === "")) return null;
  const pixels = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 4096 ? n : 0);
  const pw = pixels(w);
  const ph = pixels(h);
  const chars = typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 0;
  const pictured = pw > 0 && ph > 0 && chars > 0;
  // A photo is its picture: without one there is nothing to keep.
  if (kind === "photo" && !pictured) return null;
  return { id, kind: kind as EntryKind, key, label, at, place, w: pictured ? pw : 0, h: pictured ? ph : 0, size: pictured ? chars : 0 };
}

/**
 * What has to go to bring the pictures within `budget`: the player's photos,
 * oldest first, then (only with none left) the oldest firsts' pictures.
 * `entries` are oldest first.
 */
export function evictions(entries: readonly Entry[], budget: Budget): { photos: Entry[]; bare: Entry[] } {
  let chars = 0;
  let pictures = 0;
  for (const e of entries) {
    if (!e.size) continue;
    chars += e.size;
    pictures++;
  }
  const photos: Entry[] = [];
  const bare: Entry[] = [];
  const over = () => chars > budget.chars || pictures > budget.pictures;
  for (const pass of ["photo", "first"] as const) {
    for (const e of entries) {
      if (!over()) break;
      if (!e.size || (e.kind === "photo") !== (pass === "photo")) continue;
      (pass === "photo" ? photos : bare).push(e);
      chars -= e.size;
      pictures--;
    }
  }
  return { photos, bare };
}

let made = 0;
/** A short id, unique on this device. */
function newId(at: number) {
  made = (made + 1) % 1296;
  return `${Math.max(0, Math.floor(at)).toString(36)}${made.toString(36).padStart(2, "0")}`;
}

/** What is added: a first, or a photo (no key), and its picture (a JPEG data URL), if it has one. */
export type Adding = { kind: EntryKind; key: string; label: string; at: number; place: string; picture: { url: string; w: number; h: number } | null };

export class Journal {
  /** Oldest first. */
  readonly entries: Entry[];
  readonly budget: Budget;
  readonly #shelf: Shelf;
  readonly #key: string;
  /** Writes in the order they were asked for. */
  #queue: Promise<unknown> = Promise.resolve();
  /** Moves on each time the entries change, for whoever draws or publishes them. */
  changes = 0;

  private constructor(shelf: Shelf, key: string, budget: Budget, entries: Entry[]) {
    this.#shelf = shelf;
    this.#key = key;
    this.budget = budget;
    this.entries = entries;
  }

  /** The journal kept on `shelf` for `fly`. Whatever of it can't be read is left out, and pictures nothing refers to are cleared away. */
  static async open(shelf: Shelf, fly: string, budget: Budget): Promise<Journal> {
    const key = journalKey(fly);
    let saved: unknown;
    try {
      saved = JSON.parse((await shelf.get(key)) ?? "null");
    } catch {
      saved = null;
    }
    const entries: Entry[] = [];
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const item of Array.isArray(saved) ? saved : []) {
      const entry = readEntry(item);
      if (!entry || ids.has(entry.id) || (entry.key && keys.has(entry.key))) continue;
      ids.add(entry.id);
      if (entry.key) keys.add(entry.key);
      entries.push(entry);
    }
    entries.sort((a, b) => a.at - b.at);
    const journal = new Journal(shelf, key, budget, entries);
    try {
      const prefix = pictureKey(key, "");
      for (const k of await shelf.keys(prefix)) {
        const id = k.slice(prefix.length);
        if (!entries.some((e) => e.id === id && e.size > 0)) await shelf.remove(k);
      }
    } catch {
      // Left for the next time it opens.
    }
    // A save from a build with more room than this one is brought within it.
    await journal.#fit(null);
    return journal;
  }

  /** Whether a first with this key is in it. */
  has(key: string) {
    return this.entries.some((e) => e.key === key);
  }

  /**
   * Adds a first or a photo, with its picture, making room as it must. The
   * entry as kept, or null for a photo there was no room for.
   */
  add(adding: Adding): Promise<Entry | null> {
    return this.#then(async () => {
      if (adding.key && this.has(adding.key)) return null;
      const p = adding.picture;
      const pictured = !!p && p.url.startsWith(JPEG) && p.w > 0 && p.h > 0;
      if (adding.kind === "photo" && !pictured) return null;
      const entry: Entry = { id: newId(adding.at), kind: adding.kind, key: adding.key, label: adding.label.slice(0, 40), at: adding.at, place: adding.place.slice(0, 40), w: pictured ? p!.w : 0, h: pictured ? p!.h : 0, size: pictured ? p!.url.length : 0 };
      this.entries.push(entry);
      this.entries.sort((a, b) => a.at - b.at);
      if (pictured) {
        await this.#fit(entry);
        // Full all the same (the device's room is shared with everything else): photos go, one at a time, until it fits.
        for (let tries = 0; entry.size > 0; tries++) {
          try {
            await this.#shelf.set(pictureKey(this.#key, entry.id), p!.url);
            break;
          } catch {
            const photo = this.entries.find((e) => e.kind === "photo" && e !== entry && e.size > 0);
            if (photo && tries < 8) await this.#drop(photo);
            else this.#unpicture(entry);
          }
        }
      }
      if (entry.kind === "photo" && !entry.size) {
        this.entries.splice(this.entries.indexOf(entry), 1);
        return null;
      }
      await this.#save();
      this.changes++;
      return entry;
    });
  }

  /** An entry's picture, as a JPEG data URL, or null without one (or one that can't be read, which is then let go). */
  async picture(entry: Entry): Promise<string | null> {
    if (!entry.size) return null;
    let url: string | null;
    try {
      url = await this.#shelf.get(pictureKey(this.#key, entry.id));
    } catch {
      return null;
    }
    if (url && url.startsWith(JPEG)) return url;
    await this.#then(async () => {
      if (!entry.size || !this.entries.includes(entry)) return;
      if (entry.kind === "photo") this.entries.splice(this.entries.indexOf(entry), 1);
      else this.#unpicture(entry);
      await this.#save();
      await this.#shelf.remove(pictureKey(this.#key, entry.id)).catch(() => {});
      this.changes++;
    });
    return null;
  }

  /** Takes a photo out (the player's own; a first stays). */
  remove(entry: Entry): Promise<void> {
    return this.#then(async () => {
      if (entry.kind !== "photo" || !this.entries.includes(entry)) return;
      await this.#drop(entry);
      await this.#save();
      this.changes++;
    });
  }

  /** Everything this journal keeps, gone: for tests and a fly that is no more. */
  clear(): Promise<void> {
    return this.#then(async () => {
      for (const e of this.entries.splice(0)) if (e.size) await this.#shelf.remove(pictureKey(this.#key, e.id)).catch(() => {});
      await this.#shelf.remove(this.#key).catch(() => {});
      this.changes++;
    });
  }

  /** Brings the pictures within the budget, keeping `adding` (just added) if it can. */
  async #fit(adding: Entry | null) {
    const { photos, bare } = evictions(this.entries, this.budget);
    if (!photos.length && !bare.length) return;
    for (const e of photos) {
      if (e === adding) this.#unpicture(e);
      else await this.#drop(e);
    }
    for (const e of bare) {
      this.#unpicture(e);
      if (e !== adding) await this.#shelf.remove(pictureKey(this.#key, e.id)).catch(() => {});
    }
    if (!adding) await this.#save();
    this.changes++;
  }

  /** A photo, gone: the index first, so a picture is never referred to after it has gone. */
  async #drop(photo: Entry) {
    const i = this.entries.indexOf(photo);
    if (i >= 0) this.entries.splice(i, 1);
    await this.#save();
    await this.#shelf.remove(pictureKey(this.#key, photo.id)).catch(() => {});
  }

  #unpicture(entry: Entry) {
    entry.w = entry.h = entry.size = 0;
  }

  async #save() {
    try {
      await this.#shelf.set(this.#key, JSON.stringify(this.entries));
    } catch {
      // Full: the index is small, and is tried again at the next change; until then it lasts as long as the app.
    }
  }

  #then<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(work, work);
    this.#queue = next.catch(() => {});
    return next;
  }
}

/** A shelf in localStorage (or anything shaped like it). */
export function storageShelf(store: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">): Shelf {
  return {
    get: async (key) => store.getItem(key),
    set: async (key, value) => store.setItem(key, value),
    remove: async (key) => store.removeItem(key),
    keys: async (prefix) => {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k !== null && k.startsWith(prefix)) keys.push(k);
      }
      return keys;
    },
  };
}

/** A shelf in IndexedDB, or null where it can't be opened. */
export async function indexedShelf(name = "flies-journal"): Promise<Shelf | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    try {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kept");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
      open.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  if (!db) return null;
  const run = <T>(mode: IDBTransactionMode, ask: (store: IDBObjectStore) => IDBRequest) =>
    new Promise<T>((resolve, reject) => {
      const tx = db.transaction("kept", mode);
      const request = ask(tx.objectStore("kept"));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = tx.onabort = () => reject(tx.error ?? request.error);
    });
  return {
    get: async (key) => {
      const value = await run<unknown>("readonly", (s) => s.get(key));
      return typeof value === "string" ? value : null;
    },
    set: (key, value) => run("readwrite", (s) => s.put(value, key)),
    remove: (key) => run("readwrite", (s) => s.delete(key)),
    keys: async (prefix) => (await run<IDBValidKey[]>("readonly", (s) => s.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)))).map(String),
  };
}

/** Where this host keeps the journal, and how: IndexedDB where it can be opened, else localStorage, else nowhere (it lasts as long as the app). */
export async function journalShelf(): Promise<{ shelf: Shelf; keeping: Keeping }> {
  const indexed = await indexedShelf().catch(() => null);
  if (indexed) return { shelf: indexed, keeping: LARGE };
  try {
    if (typeof localStorage !== "undefined") return { shelf: storageShelf(localStorage), keeping: SMALL };
  } catch {
    // Blocked.
  }
  return { shelf: memoryShelf(), keeping: SMALL };
}

/** A shelf that lasts as long as the app: for tests, and hosts that keep nothing. */
export function memoryShelf(map = new Map<string, string>()): Shelf {
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    remove: async (key) => void map.delete(key),
    keys: async (prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)),
  };
}
