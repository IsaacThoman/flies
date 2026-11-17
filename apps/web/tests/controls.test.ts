import assert from "node:assert/strict";
import { test } from "node:test";
import type { Hit } from "@fly/ui";
import { DRAG_ROUND, DRAG_UP, NOTCH_ZOOM, PlayControls } from "../src/controls.ts";
import type { PlayTarget, ToolUse } from "../src/controls.ts";
import type { Gesture } from "../src/input.ts";
import { HUD_HITS } from "../src/ui/hud.ts";

/**
 * A stand-in for the game: the bottom fifth of the screen is the shelf, the
 * top third is the air, the rest the table. It writes down what it is asked.
 */
function rig(tool: ToolUse = "once") {
  const asked: string[] = [];
  const shelf: Hit = { kind: HUD_HITS.tool, index: 2, value: 0, x: 0, y: 0, w: 0, h: 0 };
  const target: PlayTarget = {
    tool: () => tool,
    hudAt: (_x, y) => (y > 0.8 ? shelf : null),
    aim: (_x, y, follow) => {
      asked.push(`aim${follow ? "" : " (hover)"}`);
      return y > 1 / 3;
    },
    unaim: () => asked.push("unaim"),
    use: () => asked.push("use"),
    pressHud: (hit) => asked.push(`press ${hit.kind}`),
    stepKind: (dir) => asked.push(`kind ${dir}`),
    stepTool: (dir) => asked.push(`tool ${dir}`),
    turn: (yaw, pitch) => asked.push(`turn ${yaw.toFixed(2)} ${pitch.toFixed(2)}`),
    zoom: (factor) => asked.push(`zoom ${factor.toFixed(3)}`),
    holdCamera: (held) => asked.push(held ? "hold" : "let go"),
    home: () => asked.push("home"),
  };
  let now = 0;
  const controls = new PlayControls(() => ({ width: 800, height: 450 }), () => now);
  const send = (mouse: boolean, ...gestures: Gesture[]) => {
    for (const g of gestures) controls.gesture(g, target, mouse);
  };
  return { asked, target, controls, send, tick: (ms: number) => (now += ms) };
}
const down = (x: number, y: number, button = 0, touch = false): Gesture => ({ type: "down", x, y, button, touch });
const drag = (x: number, y: number, far = true): Gesture => ({ type: "drag", x, y, far });
const up = (x: number, y: number, tap = true, double = false): Gesture => ({ type: "up", x, y, tap, double });
const wheel = (dy: number, notch: boolean, zoom = false, dx = 0): Gesture => ({ type: "wheel", x: 0.5, y: 0.5, dx, dy, notch, zoom });

test("a click on the table uses the tool there when it lifts; a drag from the table turns the camera instead", () => {
  const { asked, send } = rig("once");
  send(true, down(0.5, 0.6), drag(0.501, 0.6, false), up(0.501, 0.6));
  assert.deepEqual(asked, ["aim", "aim", "use"], "a click that wobbled a little is still a click");
  asked.length = 0;
  send(true, down(0.5, 0.6), drag(0.6, 0.6), drag(0.7, 0.65), up(0.7, 0.65, false));
  assert.deepEqual(asked.slice(0, 3), ["aim", "unaim", "hold"]);
  assert.ok(!asked.includes("use"), "no food dropped by a drag");
  const turns = asked.filter((a) => a.startsWith("turn")).map((a) => Number(a.split(" ")[1]));
  assert.ok(Math.abs(turns.reduce((a, b) => a + b, 0) + 0.2 * DRAG_ROUND) < 1e-9, "round by the whole drag, from where it went down");
  assert.ok(asked.includes("let go"));
});

test("a held tool (the feather, the air) is carried by a drag over the table, and turns the camera from the air", () => {
  const { asked, send, controls } = rig("hold");
  send(true, down(0.5, 0.6));
  assert.equal(controls.holding, true);
  send(true, drag(0.6, 0.6), up(0.6, 0.6, false));
  assert.deepEqual(asked, ["aim", "aim"]);
  assert.equal(controls.holding, false);
  asked.length = 0;
  send(true, down(0.5, 0.2), drag(0.6, 0.2), up(0.6, 0.2, false));
  assert.deepEqual(asked.slice(0, 3), ["aim", "unaim", "hold"]);
  assert.equal(controls.turning, false);
});

test("the right and middle buttons turn the camera wherever they go down, even over the table, and use nothing", () => {
  for (const button of [1, 2]) {
    const { asked, send, controls } = rig("once");
    send(true, down(0.5, 0.6, button));
    assert.equal(controls.turning, true);
    send(true, drag(0.55, 0.5), up(0.55, 0.5, false));
    assert.ok(!asked.includes("use") && asked.includes("hold") && asked.includes("let go"));
  }
});

test("a double click or tap in the air takes the camera back to Follow", () => {
  const { asked, send } = rig();
  send(true, down(0.5, 0.2), up(0.5, 0.2), down(0.5, 0.2), up(0.5, 0.2, true, true));
  assert.equal(asked.filter((a) => a === "home").length, 1);
  asked.length = 0;
  send(false, down(0.5, 0.2, 0, true), up(0.5, 0.2), down(0.5, 0.2, 0, true), up(0.5, 0.2, true, true));
  assert.ok(asked.includes("home"));
});

test("a trackpad: a scroll and a pinch bring the camera in or out, and a sideways scroll turns it; over the shelf the wheel and the trackpad step the tools", () => {
  const { asked, send, tick } = rig();
  send(true, wheel(-20, false), wheel(-6, false, true), wheel(0, false, false, 30));
  assert.ok(asked[0].startsWith("zoom 0.9") && Number(asked[1].split(" ")[1]) < 1, `a trackpad's scroll up and its pinch both bring it in: ${asked}`);
  assert.deepEqual(asked.slice(2), ["turn 0.18 0.00"], "across: round, and only round");
  asked.length = 0;
  const overShelf: Gesture = { type: "wheel", x: 0.5, y: 0.9, dx: 0, dy: 100, notch: true, zoom: false };
  send(true, overShelf);
  assert.deepEqual(asked, ["tool 1"]);
  asked.length = 0;
  // A trackpad's small steps over the shelf add up to a tool; left alone, they start again.
  for (let i = 0; i < 5; i++) send(true, { ...overShelf, dy: 20, notch: false });
  assert.deepEqual(asked, []);
  tick(400);
  for (let i = 0; i < 7; i++) send(true, { ...overShelf, dy: 20, notch: false });
  assert.deepEqual(asked, ["tool 1"]);
});

test("each click of a mouse wheel is the same step in or out, and nothing else", () => {
  const { asked, send } = rig();
  send(true, wheel(100, true), wheel(-100, true), wheel(-100, true));
  assert.deepEqual(asked, [`zoom ${NOTCH_ZOOM.toFixed(3)}`, `zoom ${(1 / NOTCH_ZOOM).toFixed(3)}`, `zoom ${(1 / NOTCH_ZOOM).toFixed(3)}`]);
});

test("a finger's drag turns the camera just as far as a mouse's, round and up", () => {
  for (const mouse of [true, false]) {
    const { asked, send } = rig();
    send(mouse, down(0.5, 0.2, 0, !mouse), drag(0.6, 0.15), up(0.6, 0.15, false));
    assert.ok(asked.includes(`turn ${(-0.1 * DRAG_ROUND).toFixed(2)} ${(-0.05 * DRAG_UP).toFixed(2)}`), `${mouse ? "a mouse" : "a finger"}: ${asked}`);
  }
});

test("two fingers: spread brings the camera in, moved together they turn it; a finger already down lets go", () => {
  const { asked, send } = rig();
  send(false, down(0.5, 0.2, 0, true), { type: "cancel" }, { type: "pinch", scale: 2, dx: 0.1, dy: 0 }, { type: "pinchEnd" });
  assert.deepEqual(asked, ["aim", "unaim", "hold", "let go", "unaim", "zoom 0.500", `turn ${(-0.1 * DRAG_ROUND).toFixed(2)} 0.00`]);
});

test("a tap on the shelf presses it; a press the game spent does nothing more until it lifts", () => {
  const { asked, send, controls } = rig();
  send(false, down(0.5, 0.9, 0, true), up(0.5, 0.9));
  assert.deepEqual(asked, ["press tool"]);
  asked.length = 0;
  send(false, down(0.5, 0.6, 0, true));
  controls.spend();
  send(false, drag(0.7, 0.6), up(0.7, 0.6));
  assert.deepEqual(asked, ["aim"]);
  assert.equal(controls.pressed, false);
});

test("a mouse hovering puts the hand under it, but not over the shelf", () => {
  const { asked, send } = rig();
  send(true, { type: "hover", x: 0.5, y: 0.5 }, { type: "hover", x: 0.5, y: 0.9 });
  assert.deepEqual(asked, ["aim", "aim (hover)"]);
  asked.length = 0;
  send(false, { type: "hover", x: 0.5, y: 0.5 });
  assert.deepEqual(asked, [], "a finger doesn't hover");
});


test("tool names preview on hover or touch without selecting until a tap completes", () => {
  const { controls, send, asked } = rig();
  send(true, { type: "hover", x: 0.5, y: 0.9 });
  assert.equal(controls.previewTool, 2);
  assert.ok(!asked.includes("press tool"));
  send(true, { type: "leave" });
  assert.equal(controls.previewTool, -1);
  asked.length = 0;
  send(false, down(0.5, 0.9, 0, true));
  assert.equal(controls.previewTool, 2);
  assert.deepEqual(asked, []);
  send(false, up(0.5, 0.9));
  assert.deepEqual(asked, ["press tool"]);
  assert.equal(controls.previewTool, -1);
  send(false, down(0.5, 0.9, 0, true), { type: "cancel" });
  assert.equal(controls.previewTool, -1);
});

test("a release over another HUD target cancels, including a boundary crossed within tap slop", () => {
  const { target, send, asked } = rig();
  target.hudAt = (x) => ({ kind: HUD_HITS.tool, index: x < 0.5 ? 0 : 1, value: 0, x: 0, y: 0, w: 1, h: 1 });
  send(false, down(0.499, 0.9, 0, true), up(0.501, 0.9));
  assert.deepEqual(asked, []);
  send(false, down(0.4, 0.9, 0, true), up(0.4, 0.9));
  assert.deepEqual(asked, ["press tool"]);
});

test("a non-tap release cannot use a one-shot tool when its final move was lost", () => {
  const { send, asked } = rig();
  send(false, down(0.5, 0.6, 0, true), up(0.7, 0.6, false));
  assert.deepEqual(asked, ["aim", "unaim"]);
});

test("a predominantly vertical drag across a label cannot step its kind", () => {
  const { target, send, asked } = rig();
  target.hudAt = () => ({ kind: HUD_HITS.label, index: 0, value: 1, x: 0, y: 0, w: 1, h: 1 });
  send(false, down(0.4, 0.7, 0, true), drag(0.46, 0.9), up(0.46, 0.9, false));
  assert.deepEqual(asked, []);
});

test("a world press released over the HUD cannot drop food underneath it", () => {
  const { send, asked } = rig();
  send(false, down(0.5, 0.79, 0, true), up(0.5, 0.801));
  assert.deepEqual(asked, ["aim", "unaim"]);
});

test("HUD press feedback previews an eligible target and clears without acting on drag or cancellation", () => {
  const { controls, target, send, asked } = rig();
  const preview = () => controls.preview?.kind ?? null;
  send(false, down(0.5, 0.81, 0, true));
  assert.equal(preview(), HUD_HITS.tool);
  assert.equal(asked.length, 0);
  send(false, drag(0.5, 0.799, false));
  assert.equal(preview(), null, "outside the target clears its preview");
  send(false, drag(0.5, 0.81, false));
  assert.equal(preview(), HUD_HITS.tool, "returning within tap slop can re-arm it");
  send(false, drag(0.5, 0.7, true), drag(0.5, 0.81, true));
  assert.equal(preview(), null, "a drag stays cancelled on returning");
  send(false, up(0.5, 0.81, false));
  assert.equal(asked.length, 0);
  send(false, down(0.5, 0.9, 0, true), { type: "cancel" });
  assert.equal(preview(), null);
  assert.ok(!asked.some(a => a.startsWith("press")));
  controls.gesture(down(0.5, 0.9), target, true);
  assert.equal(preview(), HUD_HITS.tool, "mouse has the same feedback");
  controls.spend();
  assert.equal(preview(), null);
});
