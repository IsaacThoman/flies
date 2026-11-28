import assert from "node:assert/strict";
import { test } from "node:test";
import type { Hit } from "@fly/ui";
import { DRAG_ROUND, DRAG_UP, LONG_PRESS, NOTCH_ZOOM, PlayControls } from "../src/controls.ts";
import type { PlayTarget, ToolUse, Under } from "../src/controls.ts";
import type { Gesture } from "../src/input.ts";
import { HUD_HITS } from "../src/ui/hud.ts";

/**
 * A stand-in for the game: the bottom fifth of the screen is the button for
 * what is in hand, the top third is the air, the rest the table; what the
 * hand is on there is `under`. It writes down what it is asked.
 */
function rig(tool: ToolUse = "once", under: Under = "world") {
  const asked: string[] = [];
  const held: Hit = { kind: HUD_HITS.held, index: 0, value: 0, x: 0, y: 0, w: 0, h: 0 };
  let trayOpen = false;
  const target: PlayTarget = {
    tool: () => tool,
    hudAt: (_x, y) => (y > 0.8 ? held : null),
    aim: (_x, y, follow) => {
      asked.push(`aim${follow ? "" : " (hover)"}`);
      return y > 1 / 3;
    },
    unaim: () => asked.push("unaim"),
    under: () => under,
    use: () => asked.push("use"),
    grab: () => {
      asked.push("grab");
      return true;
    },
    offerFinger: () => asked.push("finger"),
    putAway: () => asked.push("put away"),
    pressHud: (hit) => asked.push(`press ${hit.kind}`),
    trayOpen: () => trayOpen,
    closeTray: () => {
      trayOpen = false;
      asked.push("close tray");
    },
    hoverHud: (hit) => {
      if (hit) asked.push(`over ${hit.kind}`);
    },
    turn: (yaw, pitch) => asked.push(`turn ${yaw.toFixed(2)} ${pitch.toFixed(2)}`),
    zoom: (factor) => asked.push(`zoom ${factor.toFixed(3)}`),
    holdCamera: (held) => asked.push(held ? "hold" : "let go"),
    home: () => asked.push("home"),
  };
  let now = 0;
  const controls = new PlayControls(() => now);
  const send = (mouse: boolean, ...gestures: Gesture[]) => {
    for (const g of gestures) controls.gesture(g, target, mouse);
  };
  return { asked, target, controls, send, tick: (ms: number) => (now += ms), open: () => (trayOpen = true) };
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

test("a placed tool (the fingertip) goes where a press goes and is carried by a drag; a tap puts it down or lifts it, a drag doesn't", () => {
  const { asked, send } = rig("place");
  send(true, down(0.5, 0.6), up(0.5, 0.6));
  assert.deepEqual(asked, ["aim", "use"]);
  asked.length = 0;
  send(false, down(0.5, 0.6, 0, true), drag(0.6, 0.6), drag(0.7, 0.65), up(0.7, 0.65, false));
  assert.deepEqual(asked, ["aim", "aim", "aim", "unaim"], "a finger's drag carries it, and lifting the finger leaves it there");
  asked.length = 0;
  // From the air, a drag still turns the camera.
  send(true, down(0.5, 0.2), drag(0.6, 0.2), up(0.6, 0.2, false));
  assert.deepEqual(asked.slice(0, 3), ["aim", "unaim", "hold"]);
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

test("a trackpad: a pinch brings the camera in or out, and a scroll turns it round and up as a drag would; over the HUD or the open tray the wheel does nothing", () => {
  const { asked, send, open } = rig();
  send(true, wheel(-6, false, true), wheel(0, false, false, 30), wheel(-30, false), wheel(20, false));
  assert.ok(asked[0].startsWith("zoom 0.9"), `a pinch out brings it in: ${asked}`);
  assert.deepEqual(asked.slice(1), ["turn 0.18 0.00", "turn 0.00 0.10", "turn 0.00 -0.06"], "across: round; fingers down (the content scrolled up): higher, as a drag down; and back");
  asked.length = 0;
  send(true, { type: "wheel", x: 0.5, y: 0.9, dx: 0, dy: 100, notch: true, zoom: false });
  open();
  send(true, wheel(100, true));
  assert.deepEqual(asked, []);
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

test("a tap on the button at the foot presses it; a press the game spent does nothing more until it lifts", () => {
  const { asked, send, controls } = rig();
  send(false, down(0.5, 0.9, 0, true), up(0.5, 0.9));
  assert.deepEqual(asked, ["press held"]);
  asked.length = 0;
  send(false, down(0.5, 0.6, 0, true));
  controls.spend();
  send(false, drag(0.7, 0.6), up(0.7, 0.6));
  assert.deepEqual(asked, ["aim"]);
  assert.equal(controls.pressed, false);
});

test("a mouse hovering puts the hand under it, but not over the HUD, which it lights", () => {
  const { asked, send } = rig();
  send(true, { type: "hover", x: 0.5, y: 0.5 }, { type: "hover", x: 0.5, y: 0.9 });
  assert.deepEqual(asked, ["aim", "over held", "aim (hover)"]);
  asked.length = 0;
  send(false, { type: "hover", x: 0.5, y: 0.5 });
  assert.deepEqual(asked, [], "a finger doesn't hover");
});


test("a release over another HUD target cancels, including a boundary crossed within tap slop", () => {
  const { target, send, asked } = rig();
  target.hudAt = (x) => ({ kind: HUD_HITS.slot, index: x < 0.5 ? 0 : 1, value: 0, x: 0, y: 0, w: 1, h: 1 });
  send(false, down(0.499, 0.9, 0, true), up(0.501, 0.9));
  assert.deepEqual(asked, []);
  send(false, down(0.4, 0.9, 0, true), up(0.4, 0.9));
  assert.deepEqual(asked, ["press slot"]);
});

test("a non-tap release cannot use a one-shot tool when its final move was lost", () => {
  const { send, asked } = rig();
  send(false, down(0.5, 0.6, 0, true), up(0.7, 0.6, false));
  assert.deepEqual(asked, ["aim", "unaim"]);
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
  assert.equal(preview(), HUD_HITS.held);
  assert.equal(asked.length, 0);
  send(false, drag(0.5, 0.799, false));
  assert.equal(preview(), null, "outside the target clears its preview");
  send(false, drag(0.5, 0.81, false));
  assert.equal(preview(), HUD_HITS.held, "returning within tap slop can re-arm it");
  send(false, drag(0.5, 0.7, true), drag(0.5, 0.81, true));
  assert.equal(preview(), null, "a drag stays cancelled on returning");
  send(false, up(0.5, 0.81, false));
  assert.equal(asked.length, 0);
  send(false, down(0.5, 0.9, 0, true), { type: "cancel" });
  assert.equal(preview(), null);
  assert.ok(!asked.some(a => a.startsWith("press")));
  controls.gesture(down(0.5, 0.9), target, true);
  assert.equal(preview(), HUD_HITS.held, "mouse has the same feedback");
  controls.spend();
  assert.equal(preview(), null);
});

test("the empty hand on the fly strokes it while it is held, and a drag keeps stroking where it goes", () => {
  const { asked, send, controls } = rig("hand", "fly");
  send(false, down(0.5, 0.6, 0, true));
  assert.equal(controls.holding, true);
  send(false, drag(0.52, 0.6), up(0.52, 0.6, false));
  assert.deepEqual(asked, ["aim", "aim", "unaim"]);
  assert.equal(controls.holding, false);
});

test("the empty hand on a piece takes it up: a drag carries it, and where it is let go it goes down; let go over the foot, it is put away; a tap only takes it up", () => {
  const carried = rig("hand", "piece");
  carried.send(true, down(0.5, 0.6), drag(0.6, 0.6), drag(0.7, 0.6), up(0.7, 0.6, false));
  assert.deepEqual(carried.asked, ["aim", "grab", "aim", "aim", "aim", "use"]);
  const away = rig("hand", "piece");
  away.send(false, down(0.5, 0.6, 0, true), drag(0.5, 0.9), up(0.5, 0.9, false));
  assert.ok(away.asked.includes("put away") && !away.asked.includes("use"), String(away.asked));
  const tapped = rig("hand", "piece");
  tapped.send(true, down(0.5, 0.6), up(0.5, 0.6));
  assert.deepEqual(tapped.asked, ["aim", "grab"]);
});

test("the empty hand held still on the table puts the fingertip down there; moved, it turns the camera, and a tap does nothing", () => {
  const still = rig("hand");
  still.send(false, down(0.5, 0.6, 0, true));
  still.tick(LONG_PRESS - 10);
  still.controls.tick(still.target);
  assert.deepEqual(still.asked, ["aim"]);
  still.tick(20);
  still.controls.tick(still.target);
  assert.deepEqual(still.asked, ["aim", "finger"]);
  // Now the fingertip, a drag carries it.
  still.send(false, drag(0.6, 0.6), up(0.6, 0.6, false));
  assert.deepEqual(still.asked.slice(2), ["aim", "unaim"]);
  const moved = rig("hand");
  moved.send(false, down(0.5, 0.6, 0, true), drag(0.6, 0.6));
  moved.tick(LONG_PRESS * 2);
  moved.controls.tick(moved.target);
  assert.ok(!moved.asked.includes("finger") && moved.asked.includes("hold"));
  const tapped = rig("hand");
  tapped.send(true, down(0.5, 0.6), up(0.5, 0.6));
  assert.deepEqual(tapped.asked, ["aim"]);
});

test("with the tray open a press anywhere but on it closes it and does nothing more until it lifts", () => {
  const { asked, send, open, controls } = rig("once");
  open();
  send(false, down(0.5, 0.6, 0, true), drag(0.7, 0.6), up(0.7, 0.6, false));
  assert.deepEqual(asked, ["close tray"]);
  assert.equal(controls.pressed, false);
});
