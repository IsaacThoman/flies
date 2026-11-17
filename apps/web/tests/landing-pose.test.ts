import assert from "node:assert/strict";
import { test } from "node:test";
import { landingExtension } from "../src/fly-view.ts";

test("landing pose anticipates nearby descending contact without extending on ascent", () => {
  assert.equal(landingExtension(5, 100), 0);
  assert.equal(landingExtension(40, -100), 0);
  assert.equal(landingExtension(-1, -100), 0);
  assert.equal(landingExtension(20, -100), 0);
  assert.ok(landingExtension(10, -100) > 0);
  assert.equal(landingExtension(2, -100), 1);
  assert.ok(landingExtension(10, -200) > landingExtension(10, -100));
});
