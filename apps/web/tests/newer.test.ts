import assert from "node:assert/strict";
import { test } from "node:test";
import { NEWER_WAIT, NEWER_WAIT_MAX, reloadForNewer } from "../src/online/newer.ts";

test("a page behind the room's protocol reloads at once, at each protocol it speaks, and again later, longer each time, if the reload brought it back", () => {
  const first = reloadForNewer(null, 4, 1000);
  assert.ok(first, "the first time, at once");
  assert.equal(reloadForNewer(first, 4, 1000 + NEWER_WAIT - 1), null, "the same page back: not every frame");
  const second = reloadForNewer(first, 4, 1000 + NEWER_WAIT);
  assert.ok(second, "but again after a while");
  assert.equal(reloadForNewer(second, 4, 1000 + NEWER_WAIT * 2.5), null);
  assert.ok(reloadForNewer(second, 4, 1000 + NEWER_WAIT * 3), "the wait doubles");
  // Reloaded into protocol 5, left open, and behind again at the next deploy: at once, whatever the last wait was.
  assert.ok(reloadForNewer(second, 5, 1000 + NEWER_WAIT + 1));
  // Never longer than the longest wait, and never stuck behind a clock set back or a broken memory.
  let kept = first;
  let at = 1000;
  for (let i = 0; i < 20; i++) {
    at += NEWER_WAIT_MAX;
    kept = reloadForNewer(kept, 4, at) ?? assert.fail(`waited past the longest at ${i}`);
  }
  assert.ok(reloadForNewer(first, 4, 0));
  for (const broken of ["1", "{", "null", '{"v":4,"at":"x","n":0}', '{"v":4,"at":0,"n":-1}']) assert.ok(reloadForNewer(broken, 4, 0), broken);
});
