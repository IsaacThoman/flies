// Shared with other local experiments: acquire only for CPU-heavy work, never reviews.
import { mkdir, rmdir } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

export async function withHeavySlot<T>(work: () => Promise<T>): Promise<T> {
  await mkdir("/tmp/flies-heavy", { recursive: true });
  let slot = "";
  while (!slot) {
    for (let n = 1; n <= 4; n++) {
      const candidate = `/tmp/flies-heavy/slot-${n}`;
      try { await mkdir(candidate); slot = candidate; break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    if (!slot) await setTimeout(5000);
  }
  try { return await work(); }
  finally { await rmdir(slot); }
}
