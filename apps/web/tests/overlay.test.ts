import assert from "node:assert/strict";
import { test } from "node:test";
import { Overlay } from "../src/ui/overlay.ts";
import { blankCanvas } from "./canvas.ts";

test("provisional feedback can draw at once while ordinary overlay updates keep their upload cap", () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, "document");
  const canvas = { width: 0, height: 0, getContext: () => blankCanvas() };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
  try {
    const overlay = new Overlay();
    const draw = () => {};
    assert.equal(overlay.redraw(1 / 60, "play", draw), true);
    overlay.dirty = true;
    assert.equal(overlay.redraw(1 / 60, "play", draw), false);
    assert.equal(overlay.redraw(0, "play", draw, true), true, "an input preview need not wait another frame");
    assert.equal(overlay.redraw(0, "play", draw, true), false, "unchanged feedback does not upload");
    overlay.dirty = true;
    assert.equal(overlay.redraw(1 / 60, "play", draw), false, "the normal cap resumes afterward");
    assert.equal(overlay.redraw(1 / 60, "play", draw), true);
    overlay.texture.dispose();
    overlay.material.dispose();
  } finally {
    if (before) Object.defineProperty(globalThis, "document", before);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
