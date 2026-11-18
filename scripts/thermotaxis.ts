// Whether the fly avoids warm and cool floors through its antennae's
// thermoreceptors (packages/brain/src/thermo.ts): the real brain, Life, its
// senses and body, headless, as scripts/ethogram.ts runs them.
//
//   node scripts/thermotaxis.ts [--part choice|spot|all] [--seeds 1,2,3] [--seconds 180]
//
// choice: Gallio et al. (2011, Cell 144:614, Fig. 1B-C)'s two-choice assay. A
// round arena on four square tiles, two opposite ones at 25 °C and the other
// two at a test temperature, for `--seconds`, then the two swapped for as
// long. Avoidance index = (time at 25 °C - time at the test temperature) /
// time on either. Their wild-type flies (groups of 15, n = 10) scored about
// 0.42 at 31 °C and 0.77 at 15 °C (read off Fig. 1C), and 0 at 25 °C; Budelli
// et al. (2019, Fig. 6) used the same two pairs, 25 against 31 and 16. Their
// arena was 2 inches across; where its tiles meet, the floor's temperature is
// taken to change over about a millimetre (`EDGE`, chosen; not stated).
//
// spot: the game's own kind of field (packages/world's ThermalSpot) on the
// ethogram's 43 mm arena: a spot 4 mm in radius, 6 °C warmer or 9 °C cooler
// at its middle, 10 mm from where the fly starts. Time within 4.7 mm of it
// (where it is at least half as warm or cool), against the same place with
// no spot.
//
// Each also gives how the fly turns while its two antennae differ by more
// than 0.05 °C on its feet (`away`, below; and for how many seconds they did),
// and, of the times its head crossed from 25 °C onto the test temperature, how
// many it turned back from within 1 s (Simões et al. 2021, Nat Commun 12:2044,
// count such U-turns against border crossings).
//
// Every run holds the clock at 06:00 as the ethogram does, with the eyes
// open on a uniform grey, after 30 s at 25 °C everywhere.

import { parseArgs } from "node:util";
import { Rhythm } from "@fly/body";
import { World } from "@fly/world";
import type { Place } from "@fly/world";
import { HEAD_AHEAD } from "../packages/body/src/motion.ts";
import { Life } from "../apps/web/src/life.ts";
import { InProcessBrain, brainData } from "./fuzz/brain.ts";
import { ARENA } from "./ethogram.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string", default: "all" },
    seeds: { type: "string", default: "1,2,3" },
    seconds: { type: "string", default: "180" },
  },
});
const seeds = values.seeds.split(",").map(Number);
const SECONDS = Number(values.seconds);
const DT = 0.01;
const BURN = 30;
const REFERENCE = 25;
/** Inches to mm: Gallio et al.'s arena sits on four 1-inch tiles. */
const CHOICE_ARENA: Place = { floor: { kind: "circle", r: 25.4 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 30 };
const EDGE = 1;
const data = brainData();
const probe = { x: 0, y: 0, z: 0 };

type Field = (x: number, y: number, z: number) => number;
type Run = { onTest: number; onReference: number; turn: { left: number; leftN: number; right: number; rightN: number }; crossings: number; turnedBack: number; walking: number; total: number };

/** Lives one fly through `phases`, each a field for some seconds, scoring which floor it is on by `isTest`. */
function live(place: Place, seed: number, phases: { field: Field; isTest: (x: number, z: number) => boolean | null; seconds: number }[]): Run {
  const driver = new InProcessBrain(data, seed);
  const life = new Life(new World(place), driver);
  life.feelsTemperature = true;
  life.rhythm = new Rhythm(6, { sunrise: 6, sunset: 18 });
  if (driver.eyes) life.light = { left: new Float32Array(driver.eyes.left.directions.length / 3).fill(0.5), right: new Float32Array(driver.eyes.right.directions.length / 3).fill(0.5) };
  const temperature = life.world.temperature;
  const run: Run = { onTest: 0, onReference: 0, turn: { left: 0, leftN: 0, right: 0, rightN: 0 }, crossings: 0, turnedBack: 0, walking: 0, total: 0 };
  const step = () => {
    life.rhythm!.setTime(6);
    life.step(DT, performance.now());
  };
  temperature.at = () => REFERENCE;
  for (let t = 0; t < BURN; t += DT) step();
  for (const phase of phases) {
    temperature.at = phase.field;
    let wasTest: boolean | null = null;
    let crossedAt = -1;
    let time = 0;
    for (let t = 0; t < phase.seconds; t += DT) {
      step();
      time += DT;
      const body = life.body;
      const p = body.position;
      const at = phase.isTest(p.x, p.z);
      if (at === true) run.onTest += DT;
      else if (at === false) run.onReference += DT;
      run.total += DT;
      const command = driver.state?.command;
      if (!command) continue;
      if (body.onFeet && command.walk > 0.05) run.walking += DT;
      const sensed = life.sensed;
      const d = Math.abs((sensed.temperatureLeft ?? REFERENCE) - REFERENCE) - Math.abs((sensed.temperatureRight ?? REFERENCE) - REFERENCE);
      if (body.onFeet && d > 0.05) {
        run.turn.left += command.turn;
        run.turn.leftN++;
      } else if (body.onFeet && d < -0.05) {
        run.turn.right += command.turn;
        run.turn.rightN++;
      }
      const head = body.point(HEAD_AHEAD, 0, 0, probe);
      const headTest = phase.isTest(head.x, head.z);
      if (wasTest === false && headTest === true && body.onFeet) {
        run.crossings++;
        crossedAt = time;
      }
      if (crossedAt >= 0 && headTest === false && at === false) {
        if (time - crossedAt <= 1) run.turnedBack++;
        crossedAt = -1;
      }
      if (crossedAt >= 0 && time - crossedAt > 1) crossedAt = -1;
      if (headTest !== null) wasTest = headTest;
    }
  }
  driver.dispose();
  return run;
}

const fmt = (x: number, digits = 2) => (Number.isFinite(x) ? x.toFixed(digits) : "–");
/**
 * Half the difference between its mean turn while its left antenna is the one
 * further from 25 °C and while its right is: away from that side is positive,
 * and its spontaneous lean, the same either way, cancels.
 */
const away = (r: Run) => (r.turn.left / r.turn.leftN - r.turn.right / r.turn.rightN) / 2;
function report(label: string, runs: Run[]) {
  const ai = runs.map((r) => (r.onReference - r.onTest) / (r.onReference + r.onTest));
  const mean = ai.reduce((a, b) => a + b, 0) / ai.length;
  console.log(
    `  ${label.padEnd(26)} index ${ai.map((x) => fmt(x)).join(" / ")} (mean ${fmt(mean)})   ` +
      `turn away ${runs.map((r) => fmt(away(r), 3)).join(" / ")} (s ${runs.map((r) => fmt((r.turn.leftN + r.turn.rightN) / 100, 0)).join("/")})   ` +
      `turned back ${runs.map((r) => `${r.turnedBack}/${r.crossings}`).join(" ")}   walking ${runs.map((r) => fmt(r.walking / r.total)).join(" / ")}`,
  );
}

function choice() {
  console.log(`Two-choice quadrants (Gallio et al. 2011), ${SECONDS} s each way, seeds ${seeds.join(", ")}; index > 0 avoids the test temperature`);
  // Opposite tiles: the test ones are where x and z have the same sign, then the others.
  const share = (x: number, z: number, flip: number) => (1 + flip * Math.tanh((2 * x) / EDGE) * Math.tanh((2 * z) / EDGE)) / 2;
  const isTest = (flip: number) => (x: number, z: number) => (x * z === 0 ? null : flip * x * z > 0);
  for (const test of [25, 31, 15]) {
    const phases = [1, -1].map((flip) => ({
      field: (x: number, _y: number, z: number) => REFERENCE + (test - REFERENCE) * share(x, z, flip),
      isTest: isTest(flip),
      seconds: SECONDS,
    }));
    report(`25 against ${test} °C`, seeds.map((seed) => live(CHOICE_ARENA, seed, phases)));
  }
}

function spot() {
  console.log(`A spot 10 mm from the start on the 43 mm arena, ${SECONDS} s, seeds ${seeds.join(", ")}; index > 0 avoids within 4.7 mm of it`);
  const s = { x: 10, y: 0, z: 0, radius: 4 };
  const within = 1.1774 * s.radius;
  for (const delta of [0, 6, -9]) {
    const field = (x: number, y: number, z: number) => REFERENCE + delta * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2 + (z - s.z) ** 2) / (2 * s.radius ** 2));
    // Time near the spot against time on an equal area elsewhere, as two choices: the spot's disc, and the mirrored disc.
    const isTest = (x: number, z: number) => (Math.hypot(x - s.x, z - s.z) < within ? true : Math.hypot(x + s.x, z - s.z) < within ? false : null);
    report(delta === 0 ? "no spot" : `${delta > 0 ? "+" : ""}${delta} °C spot`, seeds.map((seed) => live(ARENA, seed, [{ field, isTest, seconds: SECONDS }])));
  }
}

if (values.part === "choice" || values.part === "all") choice();
if (values.part === "spot" || values.part === "all") spot();
