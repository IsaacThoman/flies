// Shared local capacity and a branch-wide cooldown keep long experiments fair.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
const lock = `/tmp/flies-heavy-${key}`;
const cooldown = `${lock}.released`;
const COOLDOWN_MS = 120_000;

function claim(dir: string) {
  try { mkdirSync(dir); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; return false; }
}

export async function withHeavySlot<T>(work: () => Promise<T>): Promise<T> {
  mkdirSync("/tmp/flies-heavy", { recursive: true });
  while (!claim(lock)) await setTimeout(1000 + Math.random() * 1000);
  let slot = "";
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (slot) { rmSync(slot, { recursive: true, force: true }); writeFileSync(cooldown, String(Date.now())); }
    rmSync(lock, { recursive: true, force: true });
  };
  process.once("exit", release);
  let deadline: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    let last = 0;
    try { last = Number(readFileSync(cooldown, "utf8")); } catch { /* First batch. */ }
    while (Date.now() - last < COOLDOWN_MS) await setTimeout(Math.min(30_000, COOLDOWN_MS - (Date.now() - last)));
    while (!slot) {
      for (let n = 1; n <= 8; n++) if (claim(`/tmp/flies-heavy/slot-${n}`)) { slot = `/tmp/flies-heavy/slot-${n}`; break; }
      if (!slot) await setTimeout(1000 + Math.random() * 2000);
    }
    writeFileSync(`${slot}/owner`, branch + "\n");
    // Browser processes handle SIGTERM and close their owned children. Leave time for cleanup.
    deadline = globalThis.setTimeout(() => { console.error("Heavy batch exceeded 9m50s; split it into smaller batches."); process.kill(process.pid, "SIGTERM"); }, 590_000);
    return await work();
  } finally { if (deadline) clearTimeout(deadline); process.off("exit", release); release(); }
}
