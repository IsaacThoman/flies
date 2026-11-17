// Every table the server has, by code: opening one (starting it, or finding
// it for someone with its invitation), the beat that moves them all on, and
// keeping them across restarts. A deploy restarts the server; the tables,
// who sat where and what is left of the food are written to a file as it
// stops (and every half minute, in case it doesn't stop cleanly), and read
// back as it starts, so everyone's devices find their tables as they left
// them when they reconnect. And the list of rooms anyone may browse: the
// listed ones with someone there.

import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { LISTED_MAX } from "@fly/net";
import type { ClientMessage, Refusal, RoomWire } from "@fly/net";
import type { Lock } from "./lock.ts";
import { Table, isTableRecord } from "./table.ts";
import type { TableOptions, TableRecord } from "./table.ts";

/** A table nobody has sat at for this long (ms) is forgotten, and its invitation leads nowhere. */
export const TABLE_IDLE = 30 * 24 * 3_600_000;
/**
 * A listed room, sooner: its name is only for finding it, and it drops out
 * of the list once nobody is there, so after a day its invitations are all
 * that is left of it, and the people who had them have moved on.
 */
export const LISTED_IDLE = 24 * 3_600_000;
/** At most this many tables at once: past it, starting one forgets the one nobody has been at for longest. */
export const MAX_TABLES = 10_000;

export class Tables {
  readonly #tables = new Map<string, Table>();
  readonly #options: TableOptions;
  readonly #max: number;
  #changed = false;

  constructor(options: TableOptions, max = MAX_TABLES) {
    this.#options = options;
    this.#max = max;
  }

  get size() {
    return this.#tables.size;
  }

  get(code: string): Table | null {
    return this.#tables.get(code) ?? null;
  }

  values() {
    return this.#tables.values();
  }

  /** The table a hello is for: found, or started if the hello starts it (with `lock`, if it is to have a password). */
  open(key: string, hello: Extract<ClientMessage, { type: "hello" }>, seed: number, lock: Lock | null = null): Table | Refusal {
    const known = this.#tables.get(hello.table);
    if (known) return known;
    if (!hello.start) return "unknown";
    if (this.#tables.size >= this.#max && !this.#forgetOne()) return "busy";
    const table = new Table(hello.table, hello.start, key, seed, this.#options, undefined, lock);
    this.#tables.set(hello.table, table);
    this.#changed = true;
    // Its name, as it is shown to strangers, for whoever looks after the server; never its password.
    this.#options.log?.("started", { table: table.code, place: table.place, name: table.name, listed: table.listed, locked: !!lock, tables: this.#tables.size });
    return table;
  }

  /** Forgets the table nobody has been at for longest, so that tables nobody comes back to can't keep new ones from being started; false if every table has someone there. */
  #forgetOne(): boolean {
    let oldest: Table | null = null;
    let oldestAt = Infinity;
    for (const table of this.#tables.values()) {
      if (table.connected > 0 || table.present > 0) continue;
      const at = lastAt(table);
      if (at < oldestAt) {
        oldest = table;
        oldestAt = at;
      }
    }
    if (!oldest) return false;
    this.#tables.delete(oldest.code);
    this.#options.log?.("forgotten", { table: oldest.code, reason: "full" });
    return true;
  }

  /** The rooms anyone may see: listed, with someone there, fullest first (then by name), at most LISTED_MAX. */
  listed(): RoomWire[] {
    const rooms: RoomWire[] = [];
    for (const table of this.#tables.values()) if (table.listed && table.present > 0) rooms.push(table.room());
    rooms.sort((a, b) => b.flies - a.flies || a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
    return rooms.slice(0, LISTED_MAX);
  }

  /**
   * Every table's beat, for those with a fly there: one with nobody waits
   * (its food comes back when someone does, and its bubbles start afresh), so
   * that thousands of tables kept for their invitations cost nothing.
   * Tables nobody has come to for TABLE_IDLE go.
   */
  tick() {
    const wall = this.#options.wall();
    for (const table of this.#tables.values()) {
      if (table.connected > 0 || table.present > 0) table.tick();
      if (table.connected > 0) {
        this.#changed = true;
        continue;
      }
      if (wall - lastAt(table) > (table.listed ? LISTED_IDLE : TABLE_IDLE)) {
        this.#tables.delete(table.code);
        this.#changed = true;
        this.#options.log?.("forgotten", { table: table.code });
      }
    }
  }

  /**
   * Writes every table to `file`, if anything has changed: atomically (a
   * crash halfway, or the power going, leaves the last good copy whole,
   * since the new one is on the disk before it takes the old one's name).
   */
  async save(file: string, force = false) {
    if (!this.#changed && !force) return;
    this.#changed = false;
    const records = [...this.#tables.values()].map((t) => t.record());
    await mkdir(path.dirname(file), { recursive: true });
    const partial = `${file}.${process.pid}.partial`;
    const handle = await open(partial, "w");
    try {
      await handle.writeFile(JSON.stringify({ v: 1, tables: records }));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(partial, file);
  }

  /**
   * Reads the tables kept in `file`, if there is one. Returns how many. A
   * table that isn't one as `record()` keeps it is left out (and logged); a
   * file that can't be read at all is moved aside, kept for whoever looks
   * after the server, and the server starts with none rather than not at all.
   */
  async load(file: string): Promise<number> {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      return 0;
    }
    let kept: { v?: unknown; tables?: unknown };
    try {
      kept = JSON.parse(text) as typeof kept;
    } catch {
      kept = {};
    }
    if (!kept || typeof kept !== "object" || kept.v !== 1 || !Array.isArray(kept.tables)) {
      const aside = `${file}.unreadable-${this.#options.wall()}`;
      await rename(file, aside);
      this.#options.log?.("unreadable", { file: aside });
      return 0;
    }
    let skipped = 0;
    for (const record of kept.tables as unknown[]) {
      if (this.#tables.size >= this.#max || !isTableRecord(record) || this.#tables.has(record.code)) {
        skipped++;
        continue;
      }
      this.#tables.set(record.code, Table.restore(record as TableRecord, this.#options));
    }
    if (skipped) this.#options.log?.("skipped", { tables: skipped });
    return this.#tables.size;
  }

  /** Lets every device go (the server is stopping); they reconnect when it is back. */
  close(code: number, reason: string) {
    for (const table of this.#tables.values()) table.close(code, reason);
  }
}

/** When someone was last at a table (wall clock, ms): its start, or the latest any seat was seen. */
function lastAt(table: Table) {
  let last = table.created;
  for (const seat of table.seats.values()) last = Math.max(last, seat.lastSeen);
  return last;
}
