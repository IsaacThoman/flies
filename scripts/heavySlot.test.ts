import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { recoverOwnLease } from "./heavySlot.ts";

test("a dead holder's lease is recovered without deleting a reassigned slot", () => {
  const dir = mkdtempSync(join(tmpdir(), "fly-lease-test-"));
  const lock = join(dir, "lock"), slots = join(dir, "slots");
  const holder = { pid: 2147483647, token: "dead-holder" };
  try {
    symlinkSync(JSON.stringify(holder), lock);
    for (let n = 1; n <= 2; n++) mkdirSync(join(slots, `slot-${n}`), { recursive: true });
    writeFileSync(join(slots, "slot-1/holder.json"), JSON.stringify(holder));
    writeFileSync(join(slots, "slot-2/holder.json"), JSON.stringify({ ...holder, token: "another-holder" }));
    assert.equal(recoverOwnLease(lock, slots), true);
    assert.equal(existsSync(join(slots, "slot-1")), false);
    assert.equal(existsSync(join(slots, "slot-2")), true);
    assert.equal(existsSync(lock + ".released"), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a live process's lease remains intact", () => {
  const dir = mkdtempSync(join(tmpdir(), "fly-lease-test-")), lock = join(dir, "lock");
  try {
    symlinkSync(JSON.stringify({ pid: process.pid, token: "live" }), lock);
    assert.equal(recoverOwnLease(lock, dir), false);
    assert.equal(recoverOwnLease(lock, dir), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
