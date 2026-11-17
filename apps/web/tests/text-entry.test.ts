import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";
import type { NativeKeyboardBridge, TextKind } from "@fly/contracts";
import { PASSWORD_MAX, ROOM_NAME_MAX, isPassword, roomName } from "@fly/net";
import { BrowserTextEntry, NativeTextEntry } from "../src/ui/text-entry.ts";

class Input extends EventTarget {
  style = { cssText: "" };
  value = "";
  selectionStart = 0;
  selectionEnd = 0;
  maxLength = -1;
  setAttribute() {}
  removeAttribute(name: string) { if (name === "maxlength") this.maxLength = -1; }
  focus() {}
  blur() { this.dispatchEvent(new Event("blur")); }
  setSelectionRange(start: number, end: number) { this.selectionStart = start; this.selectionEnd = end; }
  enterText(value: string, start = value.length, end = start) {
    this.value = this.maxLength < 0 ? value : value.slice(0, this.maxLength);
    this.setSelectionRange(Math.min(start, this.value.length), Math.min(end, this.value.length));
    this.dispatchEvent(new Event("input"));
  }
}

function browser(t: TestContext) {
  const input = new Input();
  const before = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = Object.assign(new EventTarget(), { createElement: () => input, body: { append() {} } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  t.after(() => { if (before) Object.defineProperty(globalThis, "document", before); else Reflect.deleteProperty(globalThis, "document"); });
  return { input, entry: new BrowserTextEntry() };
}

const cases: { kind: TextKind; max: number; value: string }[] = [
  { kind: "name", max: ROOM_NAME_MAX, value: "𐐀".repeat(ROOM_NAME_MAX) },
  { kind: "password", max: PASSWORD_MAX, value: "e\u0301" + "x".repeat(PASSWORD_MAX - 3) + "🪰" },
  { kind: "new-password", max: PASSWORD_MAX, value: "🪰".repeat(PASSWORD_MAX) },
];

for (const { kind, max, value } of cases) {
  test(`${kind}: native entry preserves a full code-point limit without splitting or normalising it`, () => {
    let answer: (text: string | null) => void = () => {};
    const bridge: NativeKeyboardBridge = { ask(_title, _value, _kind, done) { answer = done; }, close() {} };
    const entry = new NativeTextEntry(bridge);
    entry.begin({ id: kind, kind, max, value: "" });
    answer(value + "z");
    assert.equal(entry.value, value);
    assert.equal(entry.caret, value.length, "caret offsets remain UTF-16 for canvas slicing");
    assert.equal(entry.take(), "done");
    assert.equal(kind === "name" ? roomName(entry.value) : isPassword(entry.value), kind === "name" ? value : true);
  });

  test(`${kind}: browser entry agrees with the server and native code-point limit`, (t) => {
    const { input, entry } = browser(t);
    entry.begin({ id: kind, kind, max, value: "" });
    input.enterText(value);
    assert.equal(entry.value, value, "a valid value must not be rejected early by maxlength");
    input.enterText(value + "z");
    assert.equal(entry.value, value);
    assert.equal(input.value, value);
    assert.equal(entry.caret, value.length);
    assert.equal(kind === "name" ? roomName(entry.value) : isPassword(entry.value), kind === "name" ? value : true);
  });
}

test("composition is not truncated until commit, and selections keep their UTF-16 offsets", (t) => {
  const { input, entry } = browser(t);
  entry.begin({ id: "password", kind: "password", max: 3, value: "" });
  input.dispatchEvent(new Event("compositionstart"));
  input.enterText("🪰abc", 2, 4);
  assert.equal(input.value, "🪰abc", "an IME owns its in-progress text");
  input.dispatchEvent(new Event("compositionend"));
  assert.equal(input.value, "🪰ab");
  assert.equal(entry.value, "🪰ab");
  assert.deepEqual([input.selectionStart, input.selectionEnd, entry.caret], [2, 4, 4]);
  input.enterText("🪰z", 2);
  assert.equal(entry.caret, 2, "an interior caret stays after the supplementary character");
  input.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
  assert.equal(entry.value, "");
  assert.equal(entry.take(), "cancel");
});
