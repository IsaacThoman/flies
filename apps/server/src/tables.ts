// Every table the server has, by code: opening one (starting it, or finding
// it for someone with its invitation), the beat that moves them all on, and
// keeping them across restarts. A deploy restarts the server; the tables,
// who sat where and what is left of the food are written to a file as it
// stops (and every half minute, in case it doesn't stop cleanly), and read
// back as it starts, so everyone's devices find their tables as they left
// them when they reconnect. And the list of rooms anyone may browse: the
// listed ones with someone there. And the rooms open to everyone, which the
// server keeps itself: the first always, the next ones as the ones before
// fill, none ever forgotten.

import { randomInt } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { EVERYONE_ROOMS, LISTED_MAX, everyoneCode, everyoneIndex } from "@fly/net";
import type { ClientMessage, Refusal, RoomWire } from "@fly/net";
import type { Lock } from "./lock.ts";
import { Table, everyonePlace, isTableRecord } from "./table.ts";
import type { TableOptions, TableRecord } from "./table.ts";

/** A table nobody has sat at for this long (ms) is forgotten, and its invitation leads nowhere. */
export const TABLE_IDLE = 30 * 24 * 3_600_000;
/**
 * A listed room, sooner: its name is only for finding it, and it drops out
 * of the list once nobody is there, so after a day its invitations are all
 * that is left of it, and the people who had them have moved on.
 */
export const LISTED_IDLE = 24 * 3_600_000;
/** What the tables are kept with: the file system's, or a test's that fails when asked to. */
export type Files = Pick<typeof fs, "mkdir" | "open" | "readFile" | "rename">;

/** At most this many tables at once: past it, starting one forgets the one nobody has been at for longest. */
export const MAX_TABLES = 10_000;

export class Tables {
  readonly #tables = new Map<string, Table>();
  readonly #options: TableOptions;
  readonly #max: number;
  readonly #files: Files;
  #changed = false;

  constructor(options: TableOptions, max = MAX_TABLES, files: Files = fs) {
    this.#options = options;
    this.#max = max;
    this.#files = files;
    this.#everyone(0);
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

  /** The table a hello is for: found, or started if the hello starts it (with `lock`, if it is to have a password); for a room open to everyone, whichever has room. */
  open(key: string, hello: Extract<ClientMessage, { type: "hello" }>, seed: number, lock: Lock | null = null): Table | Refusal {
    // Nobody starts a room open to everyone, nor one with any of their codes.
    if (everyoneIndex(hello.table) >= 0) return this.everyone(key, hello.table);
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

  /** Forgets the table nobody has been at for longest, so that tables nobody comes back to can't keep new ones from being started; false if every table has someone there. Never a room open to everyone. */
  #forgetOne(): boolean {
    let oldest: Table | null = null;
    let oldestAt = Infinity;
    for (const table of this.#tables.values()) {
      if (table.everyone || table.connected > 0 || table.present > 0) continue;
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

  /** The `i`th room open to everyone, opened now if it hasn't been. */
  #everyone(i: number): Table {
    const code = everyoneCode(i);
    const known = this.#tables.get(code);
    if (known) return known;
    const start = { place: everyonePlace(this.#options.wall()), light: "clock", weather: "now", zone: "", offset: 0 };
    const table = new Table(code, start, "", randomInt(2 ** 31), this.#options);
    this.#tables.set(code, table);
    this.#changed = true;
    this.#options.log?.("started", { table: table.code, place: table.place, name: table.name, everyone: true, tables: this.#tables.size });
    return table;
  }

  /**
   * The room open to everyone a device (its key, hashed) is to sit in, asking
   * for `wanted`: that one if its fly is still there (coming back after a
   * moment away), otherwise the first with room for it, opening the next
   * when every one before is full. A refusal when all of them are. Where it
   * sits, it is in the place the clock has it now: a room nobody was in
   * hasn't been keeping time.
   */
  everyone(key: string, wanted: string): Table | Refusal {
    const there = this.#tables.get(wanted);
    if (there?.everyone && there.seated(key)) return there.keepTurn();
    for (let i = 0; i < EVERYONE_ROOMS; i++) {
      const table = this.#everyone(i);
      if (table.hasRoomFor(key)) return table.keepTurn();
    }
    return "full";
  }

  /**
   * The rooms anyone may see: those open to everyone first, in order (the
   * first always, so there is always somewhere to go; the others while
   * someone is there), then the listed ones with someone there, fullest
   * first (then by name), at most LISTED_MAX in all.
   */
  listed(): RoomWire[] {
    const everyone: Table[] = [];
    const rooms: RoomWire[] = [];
    for (const table of this.#tables.values()) {
      if (table.everyone) {
        if (table.present > 0 || table.code === everyoneCode(0)) everyone.push(table);
      } else if (table.listed && table.present > 0) rooms.push(table.room());
    }
    everyone.sort((a, b) => everyoneIndex(a.code) - everyoneIndex(b.code));
    rooms.sort((a, b) => b.flies - a.flies || a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
    return [...everyone.map((t) => t.room()), ...rooms].slice(0, LISTED_MAX);
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
      if (table.everyone) continue;
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
   * A save that fails at any step leaves the tables changed, so the next
   * one writes them, however little has happened since.
   */
  async save(file: string, force = false) {
    if (!this.#changed && !force) return;
    // Cleared before the tables are read, so a change while the file is written is saved next time.
    this.#changed = false;
    try {
      const records = [...this.#tables.values()].map((t) => t.record());
      const files = this.#files;
      await files.mkdir(path.dirname(file), { recursive: true });
      const partial = `${file}.${process.pid}.partial`;
      const handle = await files.open(partial, "w");
      try {
        await handle.writeFile(JSON.stringify({ v: 1, tables: records }));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await files.rename(partial, file);
    } catch (error) {
      this.#changed = true;
      throw error;
    }
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
      text = await this.#files.readFile(file, "utf8");
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
      await this.#files.rename(file, aside);
      this.#options.log?.("unreadable", { file: aside });
      return 0;
    }
    let skipped = 0;
    for (const record of kept.tables as unknown[]) {
      // The room open to everyone opened as the server started is empty: the one kept takes its place.
      const known = isTableRecord(record) ? this.#tables.get(record.code) : undefined;
      const fresh = !!known?.everyone && known.seats.size === 0;
      if (this.#tables.size >= this.#max || !isTableRecord(record) || (known && !fresh)) {
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
