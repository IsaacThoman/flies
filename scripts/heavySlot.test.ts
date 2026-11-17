import assert from "node:assert/strict";
import { mkdtempSync, readlinkSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertLiveLease } from "./heavySlot.ts";

test("a dead holder produces a diagnostic without removing its lease", () => {
  const dir = mkdtempSync(join(tmpdir(), "fly-lease-test-")), lock = join(dir, "lock");
  const holder = JSON.stringify({ pid: 2147483647, token: "dead-holder" });
  try {
    symlinkSync(holder, lock);
    assert.throws(() => assertLiveLease(lock), /Abandoned measurement lease/);
    assert.equal(readlinkSync(lock), holder);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a live process's lease remains intact", () => {
  const dir = mkdtempSync(join(tmpdir(), "fly-lease-test-")), lock = join(dir, "lock");
  const holder = JSON.stringify({ pid: process.pid, token: "live" });
  try {
    symlinkSync(holder, lock);
    assertLiveLease(lock);
    assert.equal(readlinkSync(lock), holder);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
