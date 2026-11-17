import { parseArgs } from "node:util";
import { fuzzBody, places } from "./fuzz/body.ts";
import type { PlaceId } from "./fuzz/body.ts";
import { brainData } from "./fuzz/brain.ts";
import { fuzzLife } from "./fuzz/life.ts";

const { values } = parseArgs({ options: {
  kind: { type: "string", default: "both" },
  place: { type: "string", default: "all" },
  seeds: { type: "string", default: "1,2,3" },
  duration: { type: "string", default: "3600" },
  "high-starts": { type: "boolean", default: false },
  help: { type: "boolean", default: false },
} });
if (values.help) {
  console.log("npm run fuzz -- [--kind body|life|both] [--place all|picnic|windowsill|lab|bar|restaurant|greenhouse] [--seeds 1,2,3] [--duration 3600] [--high-starts]\nDuration is simulated seconds per seed per place. Reports are JSON lines; failures stop at the first violation with a replay command and checkpoint. Life progress goes to stderr every simulated minute.");
} else {
  const ids = values.place === "all" ? Object.keys(places) as PlaceId[] : [values.place as PlaceId];
  const seeds = values.seeds.split(",").map(Number);
  const duration = Number(values.duration);
  if (!ids.every(id => id in places) || !["body", "life", "both"].includes(values.kind) || !seeds.every(s => Number.isSafeInteger(s) && s >= 0 && s <= 0xffffffff) || !Number.isFinite(duration) || duration <= 0) throw new Error("Invalid fuzz options; use --help");
  const data = values.kind === "body" ? null : brainData();
  for (const id of ids) {
    for (const seed of seeds) {
      if (values.kind !== "life") console.log(JSON.stringify(fuzzBody(id, seed, duration, values["high-starts"])));
      if (data) console.log(JSON.stringify(fuzzLife(id, seed, duration, data, seconds => console.error(`${id} life seed=${seed}: ${seconds.toFixed(0)}s`))));
    }
  }
}
