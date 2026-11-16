// What each other fly at a shared table costs this device's JavaScript per
// frame, without drawing (a spike's measurement, see docs/online.md): its
// track sampled, its model posed, its body in the crowd, its state decoded.
// In V8's interpreter alone it is as near as Node gets to the Apple TV, which
// has no JIT (docs/apple-tv.md; packages/fly measures its model the same way).
//
//   node --no-opt --no-sparkplug --no-maglev scripts/online-bench.ts [others]

import { performance } from "node:perf_hooks";
import { Crowd, FlyBody } from "@fly/body";
import { createFly } from "@fly/fly";
import { FlyTrack, createFlyState, decodeFlies, encodeFlies } from "@fly/net";
import { createPicnic } from "@fly/world";

const N = Number(process.argv[2] ?? 8);
const world = createPicnic();
const body = new FlyBody(world, world.place.start);
const crowd = new Crowd(world);
const tracks = Array.from({ length: N }, () => new FlyTrack());
const models = Array.from({ length: N }, () => createFly());
const out = createFlyState();
const states = Array.from({ length: N }, (_, i) => {
  const s = createFlyState();
  s.id = i + 2;
  return s;
});
const batch = new DataView(new ArrayBuffer(2 + N * 48));
const scratch = createFlyState();
const pose = { speed: 2, turn: 0.4, airborne: false, wings: 0, groom: 0, feed: 0, crouch: 0, pitch: 0, roll: 0 };

function frame(t: number) {
  // A batch arrives every third frame (20 a second at 60).
  if (Math.round(t / 16.67) % 3 === 0) {
    for (let i = 0; i < N; i++) {
      const s = states[i];
      s.t = t;
      s.x = Math.cos(i + t / 1000) * 8;
      s.z = Math.sin(i + t / 1000) * 8;
      s.yaw = t / 1000 + i;
      s.pose.speed = 2;
    }
    const n = encodeFlies(batch, states, N);
    decodeFlies(new DataView(batch.buffer, 0, n), scratch, (s) => tracks[s.id - 2].push(s, t + 40));
  }
  crowd.clear();
  for (let i = 0; i < N; i++) {
    tracks[i].sample(t - 120, out);
    pose.speed = out.pose.speed;
    pose.turn = out.pose.turn;
    models[i].update(pose, 1 / 60);
    const nb = crowd.add()!;
    nb.x = out.x;
    nb.y = out.y;
    nb.z = out.z;
    nb.yaw = out.yaw;
  }
  crowd.resolve(body, 1 / 60);
  crowd.inside(0, 0.75, 1.5, 0);
  crowd.inside(0.3, 0.75, 1.5, 0);
}

let t = 0;
for (let i = 0; i < 120; i++) frame((t += 16.67));
const frames = 600;
const started = performance.now();
for (let i = 0; i < frames; i++) frame((t += 16.67));
const per = (performance.now() - started) / frames;
const interpreted = process.execArgv.includes("--no-opt");
console.log(`${N} others: ${(per * 1000).toFixed(0)} µs a frame, ${((per * 1000) / N).toFixed(0)} µs each${interpreted ? " (interpreter only)" : ""}`);
