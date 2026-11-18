// Measures whether a hungry fly eats each food it finds, on the real
// connectome: its life frame by frame (apps/web/src/life.ts), the brain in
// process. For docs/world.md's Food.
//
//   node scripts/foods.ts [--part feed|places|all] [--place picnic,...] [--seeds 1,2,3] [--hunger 0.7,1] [--seconds 10] [--no-smell]
//
// Each food is found the same way: the fly stood with its mouth on the food's
// middle, facing away from the world's middle, at the hunger given, and left
// to itself for --seconds, its hunger going down as it eats. The Feed tool's
// foods are dropped on a bare table (`Pantry.drop`), and each place's own are
// its patches where they lie (one of each name and taste). Per food: its tastes,
// the most `sweet` and `bitter` its brain was sent, and per hunger how many flies ate
// it, for how long each, and how soon after it was set down. Eating another
// food it walked to doesn't count. What it does is the brain's choice:
// nothing here helps it. With --no-smell the brain isn't told what the food
// smells of (Life.smells), as before food smelled.

import { parseArgs } from "node:util";
import { FLY_LENGTH, MOUTH_AHEAD } from "@fly/body";
import { FOODS, WORLDS, World } from "@fly/world";
import type { Food, FoodKind, Place } from "@fly/world";
import { Life } from "../apps/web/src/life.ts";
import { InProcessBrain, brainData } from "./fuzz/brain.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string", default: "all" },
    place: { type: "string", default: Object.keys(WORLDS).join(",") },
    seeds: { type: "string", default: "1,2,3" },
    hunger: { type: "string", default: "0.7,1" },
    seconds: { type: "string", default: "10" },
    "no-smell": { type: "boolean", default: false },
  },
});
const DT = 1 / 60;
const seconds = Number(values.seconds);
const seeds = values.seeds.split(",").map(Number);
const hungers = values.hunger.split(",").map(Number);
const data = brainData();
const BARE: Place = { floor: { kind: "circle", r: 200 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };

type Trial = { ate: boolean; first: number; fed: number; sweet: number; bitter: number };

/** One fly, set down with its mouth on `pick(life)`'s food at `hunger`, for `seconds`. */
function trial(place: Place, seed: number, hunger: number, pick: (life: Life) => Food): Trial {
  const life = new Life(new World(place), new InProcessBrain(data, seed));
  life.smells = !values["no-smell"];
  const food = pick(life);
  // Facing out from the middle of the world, so its body lies over the food and the place, not off its edge.
  const yaw = Math.hypot(food.x, food.z) > 1 ? Math.atan2(food.x, food.z) : 0;
  const back = MOUTH_AHEAD * FLY_LENGTH;
  life.setDown(food.x - Math.sin(yaw) * back, food.z - Math.cos(yaw) * back, yaw, food.y + 0.5);
  life.hunger.level = hunger;
  const out: Trial = { ate: false, first: Number.NaN, fed: 0, sweet: 0, bitter: 0 };
  while (life.time < seconds - 1e-9) {
    life.step(DT, performance.now());
    out.sweet = Math.max(out.sweet, life.sensed.sweet);
    out.bitter = Math.max(out.bitter, life.sensed.bitter);
    // Only this food: a fly that walks to another and eats that hasn't eaten this.
    if (life.eating && life.senses.tasting.food === food) {
      if (!out.ate) out.first = life.time;
      out.ate = true;
      out.fed += DT;
    }
  }
  life.brain.dispose();
  return out;
}

function report(label: string, sweet: number, water: number, bitter: number, run: (seed: number, hunger: number) => Trial) {
  const cells: string[] = [];
  let tasted = 0;
  let tastedBitter = 0;
  for (const hunger of hungers) {
    const trials = seeds.map((seed) => run(seed, hunger));
    for (const t of trials) {
      tasted = Math.max(tasted, t.sweet);
      tastedBitter = Math.max(tastedBitter, t.bitter);
    }
    const first = trials.filter((t) => t.ate).map((t) => t.first.toFixed(1));
    cells.push(`${trials.filter((t) => t.ate).length}/${trials.length}; fed ${trials.map((t) => t.fed.toFixed(1)).join(", ")} s${first.length ? `; first bite at ${first.join(", ")} s` : ""}`);
  }
  console.log(`| ${label} | ${sweet} | ${water} | ${bitter} | ${tasted.toFixed(2)} / ${tastedBitter.toFixed(2)} | ${cells.join(" | ")} |`);
}

console.log(`| Food | sweet | water | bitter | most sweet / bitter sent | ${hungers.map((h) => `ate at hunger ${h}`).join(" | ")} |`);
console.log(`|---|---|---|---|---|${hungers.map(() => "---").join("|")}|`);
if (values.part === "feed" || values.part === "all") {
  for (const kind of Object.keys(FOODS) as FoodKind[]) {
    const spec = FOODS[kind];
    report(`Feed: ${spec.name}`, spec.sweet, spec.water, spec.bitter, (seed, hunger) => trial(BARE, seed, hunger, (life) => life.pantry.drop(kind, 20, 20)));
  }
}
if (values.part === "places" || values.part === "all") {
  for (const id of values.place.split(",")) {
    const place = WORLDS[id];
    const seen = new Set<string>();
    place.patches.forEach((patch, i) => {
      const key = `${patch.name} ${patch.sweet} ${patch.bitter ?? 0} ${patch.water ?? 0}`;
      if (seen.has(key)) return;
      seen.add(key);
      report(`${id}: ${patch.name}`, patch.sweet, patch.water ?? 0, patch.bitter ?? 0, (seed, hunger) => trial(place, seed, hunger, (life) => life.pantry.foods[i]));
    });
  }
}
