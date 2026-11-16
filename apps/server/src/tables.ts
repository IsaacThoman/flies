// Every table the server has, by code: opening one (starting it, or finding
// it for someone with its invitation), the beat that moves them all on, and
// keeping them across restarts. A deploy restarts the server; the tables,
// who sat where and what is left of the food are written to a file as it
// stops (and every half minute, in case it doesn't stop cleanly), and read
// back as it starts, so everyone's devices find their tables as they left
// them when they reconnect.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientMessage, Refusal } from "@fly/net";
import { Table } from "./table.ts";
import type { TableOptions, TableRecord } from "./table.ts";

/** A table nobody has sat at for this long (ms) is forgotten, and its invitation leads nowhere. */
export const TABLE_IDLE = 30 * 24 * 3_600_000;
/** At most this many tables at once. */
export const MAX_TABLES = 10_000;

export class Tables {
  readonly #tables = new Map<string, Table>();
  readonly #options: TableOptions;
  #changed = false;

  constructor(options: TableOptions) {
    this.#options = options;
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

  /** The table a hello is for: found, or started if the hello starts it. */
  open(key: string, hello: Extract<ClientMessage, { type: "hello" }>, seed: number): Table | Refusal {
    const known = this.#tables.get(hello.table);
    if (known) return known;
    if (!hello.start) return "unknown";
    if (this.#tables.size >= MAX_TABLES) return "busy";
    const table = new Table(hello.table, hello.start, key, seed, this.#options);
    this.#tables.set(hello.table, table);
    this.#changed = true;
    this.#options.log?.("started", { table: table.code, place: table.place, tables: this.#tables.size });
    return table;
  }

  /** Every table's beat; tables nobody has come to for TABLE_IDLE go. */
  tick() {
    const wall = this.#options.wall();
    for (const table of this.#tables.values()) {
      table.tick();
      if (table.connected > 0) {
        this.#changed = true;
        continue;
      }
      let last = table.created;
      for (const seat of table.seats.values()) last = Math.max(last, seat.lastSeen);
      if (wall - last > TABLE_IDLE) {
        this.#tables.delete(table.code);
        this.#changed = true;
        this.#options.log?.("forgotten", { table: table.code });
      }
    }
  }

  /** Writes every table to `file` (atomically: a crash halfway leaves the last good copy), if anything has changed. */
  async save(file: string, force = false) {
    if (!this.#changed && !force) return;
    this.#changed = false;
    const records = [...this.#tables.values()].map((t) => t.record());
    await mkdir(path.dirname(file), { recursive: true });
    const partial = `${file}.${process.pid}.partial`;
    await writeFile(partial, JSON.stringify({ v: 1, tables: records }));
    await rename(partial, file);
  }

  /** Reads the tables kept in `file`, if there is one. Returns how many. */
  async load(file: string): Promise<number> {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      return 0;
    }
    const kept = JSON.parse(text) as { v: number; tables: TableRecord[] };
    if (kept.v !== 1) return 0;
    for (const record of kept.tables) this.#tables.set(record.code, Table.restore(record, this.#options));
    return kept.tables.length;
  }

  /** Lets every device go (the server is stopping); they reconnect when it is back. */
  close(code: number, reason: string) {
    for (const table of this.#tables.values()) table.close(code, reason);
  }
}
