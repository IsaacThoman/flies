// The whole model through its contract: the budgets, the posed fly staying
// inside its bounds, feet that stay planted once the legs are solved, the
// anchors, and an update that stays finite and allocation-free whatever the
// pose does.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import type { FlyAnchor, FlyPose } from "@fly/contracts";
import { BODY_JOINTS, FOOT_CLEARANCE, J, LEG_COUNT, LEG_SEGMENTS, LEGS, WING, WING_COPIES, WING_JOINTS, legPair } from "../src/anatomy.ts";
import { createFly } from "../src/index.ts";
import { Walker, pose } from "./helpers.ts";

const DT = 1 / 60;
const ANCHORS: FlyAnchor[] = ["mouth", "head", "leftEye", "rightEye", "back"];

function meshes(object: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) found.push(o as THREE.Mesh);
  });
  return found;
}

/** Every vertex of the posed fly, in the model's space, as the vertex shaders place it (not the nervous system's panel backdrop, which the X-ray drops). */
function posedVertices(fly: ReturnType<typeof createFly>): number[][] {
  const out: number[][] = [];
  for (const mesh of meshes(fly.object)) {
    const frames = mesh.name === "fly-wings" ? fly.rig.wings : fly.rig.joints;
    const position = mesh.geometry.getAttribute("position"), joint = mesh.geometry.getAttribute("aJoint"), info = mesh.geometry.getAttribute("aInfo");
    for (let i = 0; i < position.count; i++) {
      if (info && info.getX(i) < 0) continue;
      const o = Math.round(joint.getX(i)) * 12, x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      out.push([0, 4, 8].map((r) => frames[o + r] * x + frames[o + r + 1] * y + frames[o + r + 2] * z + frames[o + r + 3]));
    }
  }
  return out;
}

const run = (fly: ReturnType<typeof createFly>, p: FlyPose, seconds: number) => {
  for (let t = 0; t < seconds; t += DT) fly.update(p, DT);
};

test("a handful of draw calls and a modest triangle count", () => {
  const fly = createFly();
  const all = meshes(fly.object);
  // One draw each: the wings are transparent and double-sided but drawn in a single pass.
  for (const mesh of all) {
    const m = mesh.material as THREE.Material;
    assert.ok(!(m.transparent && m.side === THREE.DoubleSide) || m.forceSinglePass, `${mesh.name} draws once`);
  }
  assert.ok(all.length <= 4, `${all.length} meshes`);
  // The ordinary fly, and the nervous system the X-ray adds as one more draw.
  const nerves = all.filter((m) => m.name === "fly-nerves");
  const triangles = all.filter((m) => !nerves.includes(m)).reduce((n, m) => n + m.geometry.index!.count / 3, 0);
  const nerveTriangles = nerves.reduce((n, m) => n + m.geometry.index!.count / 3, 0);
  assert.ok(triangles < 30000, `${triangles} triangles`);
  assert.ok(nerveTriangles < 18000, `${nerveTriangles} triangles in the nervous system`);
  // Every vertex names a joint the shaders have.
  for (const mesh of all) {
    const limit = mesh.name === "fly-wings" ? WING_JOINTS : BODY_JOINTS;
    const joint = mesh.geometry.getAttribute("aJoint");
    for (let i = 0; i < joint.count; i++) assert.ok(joint.getX(i) >= 0 && joint.getX(i) < limit);
    for (const name of Object.keys(mesh.geometry.attributes)) {
      const a = mesh.geometry.getAttribute(name).array;
      for (let i = 0; i < a.length; i++) assert.ok(Number.isFinite(a[i]), `${mesh.name}.${name} is finite`);
    }
  }
  assert.equal(fly.rig.joints.length, BODY_JOINTS * 12);
  assert.equal(fly.rig.wings.length, WING_JOINTS * 12);
  console.log(`  ${all.length - nerves.length} draw calls, ${triangles} triangles, ${BODY_JOINTS} body joints + ${WING_JOINTS} wing copies; the X-ray one more and ${nerveTriangles}`);
  fly.dispose();
});

test("the posed fly stays inside the bounds three culls it by", () => {
  const fly = createFly();
  const sphere = (meshes(fly.object)[0].geometry.boundingSphere)!;
  const poses: FlyPose[] = [
    pose(), pose({ speed: 8 }), pose({ groom: 1 }), pose({ feed: 1, fullness: 1 }), pose({ crouch: 1 }), pose({ wings: 1 }),
    pose({ airborne: true, wings: 1, pitch: 1.5, roll: 1.5 }), pose({ airborne: true, wings: 1, pitch: -1.5, roll: -1.5 }),
  ];
  for (const p of poses) {
    for (let k = 0; k < 20; k++) {
      run(fly, p, 0.05);
      for (const v of posedVertices(fly)) {
        const d = Math.hypot(v[0] - sphere.center.x, v[1] - sphere.center.y, v[2] - sphere.center.z);
        assert.ok(d <= sphere.radius, `vertex ${v.map((x) => x.toFixed(3))} outside the bounds in ${JSON.stringify(p)}`);
      }
    }
  }
});

test("the fly stands on the ground: feet at y = 0, body above it, about one long", () => {
  const fly = createFly();
  run(fly, pose(), 1);
  const v = posedVertices(fly);
  const min = [0, 1, 2].map((r) => Math.min(...v.map((p) => p[r]))), max = [0, 1, 2].map((r) => Math.max(...v.map((p) => p[r])));
  assert.ok(min[1] > -0.004 && min[1] < 0.004, `lowest point ${min[1]}`);
  // Head front to abdomen tip: one body length (antennae and wings aside).
  const body = meshes(fly.object).find((m) => m.name === "fly-body")!;
  const joint = body.geometry.getAttribute("aJoint");
  const along = v.slice(0, joint.count).filter((_, i) => ([J.head, J.abdomen, J.abdomenTip, J.thorax] as number[]).includes(Math.round(joint.getX(i))));
  const front = Math.max(...along.map((p) => p[2])), back = Math.min(...along.map((p) => p[2]));
  assert.ok(Math.abs(front - back - 1) < 0.06, `body length ${front - back}`);
  assert.ok(max[1] < 0.6);
});

test("solved claws stay planted while the fly walks", () => {
  for (const [speed, turn] of [[0.7, 0], [2.5, 0], [6, 0], [12, 0], [-1, 0], [-3, 0], [1.5, 1.5], [0, 3], [4, -3]]) {
    const fly = createFly();
    const walker = new Walker();
    const planted: ([number, number] | null)[] = Array(LEG_COUNT).fill(null);
    let worst = 0;
    const p = pose({ speed, turn });
    for (let f = 0; f < 240; f++) {
      walker.advance(speed, turn, DT);
      fly.update(p, DT);
      if (f < 60) continue; // let the smoothed speed settle onto the pose's
      for (let leg = 0; leg < LEG_COUNT; leg++) {
        if (fly.rig.gait.swinging[leg]) {
          planted[leg] = null;
          continue;
        }
        assert.ok(fly.rig.footError[leg] < 1e-6, `leg ${leg} reaches its foot at speed ${speed} (error ${fly.rig.footError[leg]})`);
        const o = (J.leg + leg * LEG_SEGMENTS + 4) * 12, length = LEGS[legPair(leg)].tarsus, j = fly.rig.joints;
        const claw = walker.toWorld(j[o] * length + j[o + 3], j[o + 8] * length + j[o + 11]);
        assert.ok(Math.abs(j[o + 4] * length + j[o + 7] - FOOT_CLEARANCE) < 1e-6, "the claw rests on the ground");
        if (planted[leg]) worst = Math.max(worst, Math.hypot(claw[0] - planted[leg]![0], claw[1] - planted[leg]![1]));
        else planted[leg] = claw;
      }
    }
    // The smoothed speed lags the pose's by well under a percent once settled.
    assert.ok(worst < 0.004, `speed ${speed}, turn ${turn}: claws slid ${worst.toFixed(5)} body lengths`);
  }
});

test("anchors sit where they should and follow the object", () => {
  const fly = createFly();
  run(fly, pose(), 1);
  const a = Object.fromEntries(ANCHORS.map((name) => [name, fly.anchor(name, new THREE.Vector3())]));
  // The head glances about at rest, so compare the eyes with the head rather than the axes.
  assert.ok(Math.abs(a.leftEye.distanceTo(a.head) - a.rightEye.distanceTo(a.head)) < 1e-9, "the eyes mirror each other");
  assert.ok(a.leftEye.x - a.rightEye.x > 0.25, "left on +x, a head's width apart");
  assert.ok(a.head.z > 0.35 && a.mouth.z > 0.35 && a.back.z < a.head.z, "head and mouth at the front");
  assert.ok(a.mouth.y > 0.12 && a.mouth.y < a.head.y, "at rest the mouth is tucked under the head");
  assert.ok(a.back.y > a.head.y);

  run(fly, pose({ feed: 1 }), 1.5);
  const mouth = fly.anchor("mouth", new THREE.Vector3());
  const head = fly.anchor("head", new THREE.Vector3());
  assert.ok(mouth.y < 0.012 && mouth.y > -0.005, `feeding, the mouth is on the surface (${mouth.y})`);
  assert.ok(Math.abs(mouth.z - head.z) < 0.12, "under the head");

  // Moved, turned and scaled by the game.
  const local = Object.fromEntries(ANCHORS.map((name) => [name, fly.anchor(name, new THREE.Vector3())]));
  fly.object.position.set(3, 1, -2);
  fly.object.rotation.set(0, 1.1, 0);
  fly.object.scale.setScalar(0.25);
  const m = new THREE.Matrix4().compose(fly.object.position, fly.object.quaternion, fly.object.scale);
  for (const name of ANCHORS) {
    const got = fly.anchor(name, new THREE.Vector3());
    const want = local[name].clone().applyMatrix4(m);
    assert.ok(got.distanceTo(want) < 1e-9, `${name} follows the object`);
  }
  // Inside a moved parent too.
  const parent = new THREE.Group();
  parent.position.set(0, 5, 0);
  parent.add(fly.object);
  assert.ok(Math.abs(fly.anchor("head", new THREE.Vector3()).y - (5 + local.head.clone().applyMatrix4(m).y)) < 1e-9);
});

test("asleep it settles lower and holds its head still, and is up at once when it wakes", () => {
  const fly = createFly();
  run(fly, pose(), 1);
  const back = (v = new THREE.Vector3()) => fly.anchor("back", v).y;
  const awake = back();
  run(fly, pose({ sleep: 1 }), 0.5);
  assert.ok(back() > awake - 0.03, "it settles over seconds, not at once");
  run(fly, pose({ sleep: 1 }), 12);
  const asleep = back();
  assert.ok(asleep < awake - 0.03, `lower asleep (${asleep} against ${awake})`);
  // No glances: the head stays where it is.
  const head = fly.anchor("head", new THREE.Vector3());
  run(fly, pose({ sleep: 1 }), 5);
  assert.ok(fly.anchor("head", new THREE.Vector3()).distanceTo(head) < 0.002, "the head holds still");
  run(fly, pose(), 0.8);
  assert.ok(back() > awake - 0.005, "awake again within a second");
});

test("every pose value across its range, extremes and rapid changes, stays finite", () => {
  const fly = createFly();
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const wild = [NaN, Infinity, -Infinity, 1e9, -1e9, 0, -0, 1, -1];
  const pick = (lo: number, hi: number) => (rand() < 0.1 ? wild[Math.floor(rand() * wild.length)] : lo + (hi - lo) * rand());
  const check = () => {
    for (const v of fly.rig.joints) assert.ok(Number.isFinite(v));
    for (const v of fly.rig.wings) assert.ok(Number.isFinite(v));
    for (const v of fly.rig.wingAlpha) assert.ok(v >= 0 && v <= 1);
    for (const name of ANCHORS) {
      const a = fly.anchor(name, new THREE.Vector3());
      assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z));
    }
  };
  for (let f = 0; f < 4000; f++) {
    // Hold a pose for a while, or change everything every frame.
    const p: FlyPose = {
      speed: pick(-5, 15), turn: pick(-10, 10), airborne: rand() < 0.3, wings: pick(0, 1), groom: pick(0, 1),
      feed: pick(0, 1), crouch: pick(0, 1), pitch: pick(-2, 2), roll: pick(-2, 2), sing: pick(-1, 1), fullness: pick(0, 1),
    };
    const hold = rand() < 0.5 ? 1 : 1 + Math.floor(rand() * 40);
    const dt = rand() < 0.05 ? wild[Math.floor(rand() * wild.length)] : rand() * 0.05;
    for (let h = 0; h < hold; h++) fly.update(p, dt);
    check();
  }
  // Each value alone at its extremes, flipping every frame.
  for (const key of ["speed", "turn", "wings", "groom", "feed", "crouch", "pitch", "roll", "fullness"] as const) {
    for (let f = 0; f < 120; f++) fly.update(pose({ [key]: f % 2 ? 1e6 : -1e6, airborne: f % 3 === 0 }), DT);
    check();
  }
});

test("a full crop swells the abdomen, and only the abdomen", () => {
  const empty = createFly();
  const full = createFly();
  run(empty, pose(), 3);
  run(full, pose({ fullness: 1 }), 3);
  const column = (joints: Float32Array, joint: number, axis: number) => Math.hypot(joints[joint * 12 + axis], joints[joint * 12 + 4 + axis], joints[joint * 12 + 8 + axis]);
  for (const [axis, swell] of [[0, 1.12], [1, 1.12], [2, 1.05]]) {
    const ratio = column(full.rig.joints, J.abdomen, axis) / column(empty.rig.joints, J.abdomen, axis);
    assert.ok(Math.abs(ratio - swell) < 0.005, `axis ${axis}: ${ratio}`);
  }
  for (const joint of [0, J.head, J.thorax]) {
    for (let k = 0; k < 12; k++) assert.equal(full.rig.joints[joint * 12 + k], empty.rig.joints[joint * 12 + k]);
  }
});

test("a pose change never makes a joint jump", () => {
  const fly = createFly();
  run(fly, pose(), 1);
  /** Largest move of any joint origin in one frame, over the first `joints` joints. */
  const largest = (changes: FlyPose[], joints: number) => {
    let previous = new Float32Array(fly.rig.joints), worst = 0;
    for (const p of changes) {
      for (let f = 0; f < 50; f++) {
        fly.update(p, DT);
        const now = fly.rig.joints;
        for (let j = 0; j < joints; j++) worst = Math.max(worst, Math.hypot(now[j * 12 + 3] - previous[j * 12 + 3], now[j * 12 + 7] - previous[j * 12 + 7], now[j * 12 + 11] - previous[j * 12 + 11]));
        previous = new Float32Array(now);
      }
    }
    return worst;
  };
  // Switching between behaviours moves everything, legs included, smoothly.
  // The quickest real movement, the legs folding up at take-off, covers about
  // an eighth of a body length in a frame at 60 fps; a knee flipping over or
  // a limb snapping to a new pose covers twice that.
  const behaviours = [pose({ groom: 1 }), pose(), pose({ feed: 1 }), pose({ crouch: 1 }), pose({ airborne: true, wings: 1, pitch: 0.6 }), pose({ wings: 1 }), pose(), pose({ groom: 1, feed: 1 }), pose({ airborne: true }), pose({ groom: 1 })];
  const all = largest(behaviours, BODY_JOINTS);
  assert.ok(all < 0.14, `largest jump in a frame ${all}`);
  // Walking feet swing fast by nature (the gait tests check they are continuous); the body does not lurch.
  const walks = [pose({ speed: 8 }), pose({ speed: -2, turn: 4 }), pose(), pose({ speed: 3 }), pose({ turn: -5 })];
  const body = largest(walks, J.leg);
  assert.ok(body < 0.03, `largest body jump in a frame ${body}`);
});

// The TV runs the game's JavaScript with no JIT, so this runs the update in
// V8's interpreter alone (in a child process), which is also as close as Node
// gets to the TV's cost. The interpreter boxes every double it computes in a
// HeapNumber (JSC does not), so the allocations sampled there must all be
// HeapNumbers: an object, array, iterator or closure shows up as some other size.
test("update allocates nothing but boxed numbers, even without a JIT", () => {
  const probe = fileURLToPath(new URL("allocation-probe.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--no-opt", "--no-maglev", "--no-sparkplug", probe], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const { micros, numberSize, sizes } = JSON.parse(result.stdout) as { micros: number; numberSize: number; sizes: Record<string, string[]> };
  console.log(`  update: ${micros.toFixed(0)} µs in V8's interpreter (no JIT)`);
  const others = Object.entries(sizes).filter(([size]) => Number(size) !== numberSize);
  assert.deepEqual(others, [], `allocations other than ${numberSize}-byte numbers`);
});

test("singing holds one wing out to its side, the other folded", () => {
  // Where a wing copy's tip is, from its hinge, in the model's space (+x the fly's left, +z ahead).
  const tip = (fly: ReturnType<typeof createFly>, copy: number) => {
    const f = fly.rig.wings, o = copy * 12, l = WING.length;
    return { x: f[o] * l, z: f[o + 8] * l };
  };
  const out = (fly: ReturnType<typeof createFly>, side: 0 | 1) => (side === 0 ? 1 : -1) * tip(fly, side * WING_COPIES).x;
  const rest = createFly();
  run(rest, pose(), 2);
  for (const side of [0, 1] as const) assert.ok(out(rest, side) < 0.3 * WING.length && tip(rest, side * WING_COPIES).z < 0, `folded back at rest (${side})`);
  for (const [sing, singing] of [[1, 0], [-1, 1]] as const) {
    const fly = createFly();
    run(fly, pose({ sing }), 2);
    assert.ok(out(fly, singing) > 0.85 * WING.length, `sing ${sing}: the singing wing is out (${out(fly, singing).toFixed(2)})`);
    assert.ok(out(fly, (1 - singing) as 0 | 1) < 0.3 * WING.length, `sing ${sing}: the other stays folded`);
  }
  // Not in the air: there both wings beat alike.
  const flying = createFly();
  run(flying, pose({ sing: 1, airborne: true, wings: 1 }), 2);
  assert.ok(Math.abs(out(flying, 0) - out(flying, 1)) < 1e-6);
});
