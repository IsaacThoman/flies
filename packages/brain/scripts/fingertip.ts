// How a fingertip slid along the table at the fly looms in its eyes, by its
// contrast with the table: a disc of the skin's light on the table's, coming
// straight at the fly's head and stopping short of it, fast and slowly. For
// the README's Seeing (the colours the eyes take in).
//
//   node packages/brain/scripts/fingertip.ts [--seeds 1,2,3] [--skins 0.69,0.05] [--speeds 600,15] [--azimuth 0]
//
// `--skins` are the skin's light as a fraction of the table's. The fingertip
// is a disc `HALF` mm in radius at the head's height (a fingertip lying on the
// table is 15 mm wide and 9 thick), from `FROM` mm away to `TO` mm, at each
// speed in mm/s, from `--azimuth` degrees to the right of straight ahead;
// then it stays. Each run starts with 1 s of the disc where the
// approach begins, the eyes adapted to it. Printed: the looming detectors'
// (LC4, LPLC2) highest population rate over 100 ms, the giant fiber's mean
// rate over the approach, the escape command's peak, and how many seeds pass
// the body's take-off threshold (ESCAPE_ON, packages/body/src/behavior.ts).

import { parseArgs } from "node:util";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { facetAngles, render, separation } from "../src/stimuli.ts";
import type { Scene } from "../src/stimuli.ts";
import { RESTING_SENSES } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "1,2,3" },
    skins: { type: "string", default: "0.69,0.05" },
    speeds: { type: "string", default: "600,15" },
    azimuth: { type: "string", default: "0" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});

const HALF = 6;
const FROM = 60;
const TO = 4;
const TICK = 10;
const ESCAPE_ON = 0.4;
const WINDOW = 100;
const AZIMUTH = Number(values.azimuth);

const connectome = readConnectomeFile(values.path);
const groups = { LC4: connectome.find({ type: "LC4" }), LPLC2: connectome.find({ type: "LPLC2" }), GF: connectome.find({ type: "DNp01" }) };

function run(skin: number, speed: number, seed: number) {
  const brain = new FlyBrain(connectome, { seed });
  const angles = facetAngles(brain.eyes!);
  const light = { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) };
  let distance = FROM;
  const scene: Scene = (_t, az, el) => (separation(az, el, AZIMUTH, 0) <= (Math.atan(HALF / distance) * 180) / Math.PI ? skin : 1);
  for (let t = 0; t < 1000; t += TICK) {
    render(scene, 0, angles, light);
    brain.tick(TICK, { ...RESTING_SENSES, light });
  }
  brain.sim.setRecording(true);
  const recording = brain.sim.recording!;
  const seconds = (FROM - TO) / speed + 0.3;
  const sum = (ids: Uint32Array) => ids.reduce((s, i) => s + recording[i], 0);
  let escape = 0;
  const peak = { LC4: 0, LPLC2: 0 };
  const last = { LC4: 0, LPLC2: 0 };
  for (let t = 0; t < seconds * 1000; t += TICK) {
    distance = Math.max(TO, FROM - (speed * t) / 1000);
    render(scene, 0, angles, light);
    escape = Math.max(escape, brain.tick(TICK, { ...RESTING_SENSES, light }).command.escape);
    if ((t + TICK) % WINDOW === 0) {
      for (const k of ["LC4", "LPLC2"] as const) {
        const now = sum(groups[k]);
        peak[k] = Math.max(peak[k], ((now - last[k]) / groups[k].length) * (1000 / WINDOW));
        last[k] = now;
      }
    }
  }
  return { ...peak, GF: sum(groups.GF) / groups.GF.length / seconds, escape };
}

const seeds = values.seeds.split(",").map(Number);
console.log(`Fingertip: a ${HALF * 2} mm disc from ${FROM} to ${TO} mm at azimuth ${AZIMUTH}°, seeds ${seeds.join(", ")}; highest 100 ms rate (Hz), min to max over seeds`);
const range = (xs: number[], d = 1) => `${Math.min(...xs).toFixed(d)}-${Math.max(...xs).toFixed(d)}`;
for (const speed of values.speeds.split(",").map(Number)) {
  for (const skin of values.skins.split(",").map(Number)) {
    const r = seeds.map((seed) => run(skin, speed, seed));
    console.log(
      `${String(speed).padStart(4)} mm/s, skin ${skin.toFixed(2)} (contrast ${(1 - skin).toFixed(2)}): LC4 ${range(r.map((x) => x.LC4))}, LPLC2 ${range(r.map((x) => x.LPLC2))}, giant fiber ${range(r.map((x) => x.GF))}, escape ${range(r.map((x) => x.escape), 2)}, take-offs ${r.filter((x) => x.escape >= ESCAPE_ON).length}/${r.length}`,
    );
  }
}
