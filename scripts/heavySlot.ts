// Shared local capacity and a worktree-wide cooldown keep experiments fair across branches.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
const lock = `/tmp/flies-heavy-${key}`;
const cooldown = `${lock}.released`;
const COOLDOWN_MS = 120_000;
type Holder = { pid: number; token: string };

/** Only a proven-dead holder's own slots may be reclaimed; never another agent's lease. */
export function recoverOwnLease(file: string, slots = "/tmp/flies-heavy"): boolean {
  let holder: Holder;
  try { holder = JSON.parse(readlinkSync(file)); } catch { return false; }
  if (!Number.isSafeInteger(holder.pid) || holder.pid <= 0 || !holder.token) return false;
  try { process.kill(holder.pid, 0); return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false; }
  for (let n = 1; n <= 8; n++) {
    const slot = `${slots}/slot-${n}`;
    try {
      const lease: Holder = JSON.parse(readFileSync(`${slot}/holder.json`, "utf8"));
      if (lease.pid === holder.pid && lease.token === holder.token) rmSync(slot, { recursive: true, force: true });
    } catch { /* An absent or differently owned slot is not ours to remove. */ }
  }
  rmSync(file, { force: true });
  writeFileSync(`${file}.released`, String(Date.now()));
  return true;
}

export async function withHeavySlot<T>(work: () => Promise<T>): Promise<T> {
  mkdirSync("/tmp/flies-heavy", { recursive: true });
  const holder: Holder = { pid: process.pid, token: randomUUID() };
  const waiting = Date.now();
  const wait = async () => {
    if (Date.now() - waiting > 30 * 60_000) throw Error(`No measurement capacity after 30 minutes: ${lock}`);
    await setTimeout(1000 + Math.random() * 1000);
  };
  for (;;) {
    try { symlinkSync(JSON.stringify(holder), lock); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    recoverOwnLease(lock);
    await wait();
  }
  let slot = "", released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (slot) {
      try {
        if (JSON.parse(readFileSync(`${slot}/holder.json`, "utf8")).token === holder.token) rmSync(slot, { recursive: true, force: true });
      } catch { /* Do not remove a slot whose ownership changed. */ }
      writeFileSync(cooldown, String(Date.now()));
    }
    rmSync(lock, { force: true });
  };
  process.once("exit", release);
  let deadline: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    let last = 0;
    try { last = Number(readFileSync(cooldown, "utf8")); } catch { /* First batch. */ }
    while (Date.now() - last < COOLDOWN_MS) await setTimeout(Math.min(30_000, COOLDOWN_MS - (Date.now() - last)));
    while (!slot) {
      for (let n = 1; n <= 8; n++) {
        const candidate = `/tmp/flies-heavy/slot-${n}`;
        try { mkdirSync(candidate); slot = candidate; break; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      }
      if (!slot) await wait();
    }
    writeFileSync(`${slot}/holder.json`, JSON.stringify(holder));
    writeFileSync(`${slot}/owner`, branch + "\n");
    // Leave thirty seconds for a browser's termination handler to close its owned children.
    deadline = globalThis.setTimeout(() => { console.error("Heavy batch exceeded 9m30s; split it into smaller batches."); process.kill(process.pid, "SIGTERM"); }, 570_000);
    return await work();
  } finally { if (deadline) clearTimeout(deadline); process.off("exit", release); release(); }
}
