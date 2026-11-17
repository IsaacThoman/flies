// The legs' proprioceptors by organ and side, from FlyEM's annotations: which
// leg nerve each enters the cord by and on which side (the packed wiring
// carries neither), and checks io.ts's lists (LEG_PROPRIOCEPTORS) against them.
//
//   node packages/brain/scripts/leg-sensors.ts [--write] [--path connectome.bin] [--anatomy anatomy.bin]
//
// It needs the anatomy sidecar (`npm run brain:fetch`). It counts every
// proprioceptive neuron entering by a leg nerve, by sub class and type, nerve
// and side, then each organ's lists. --write rewrites src/leg-sensors.ts, and
// packages/brain-native's src/leg_sensors.hpp, from the annotations.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadAnatomy } from "../src/anatomy.ts";
import { loadConnectome } from "../src/format.ts";
import { LEG_ORGANS, LEG_PROPRIOCEPTORS } from "../src/leg-sensors.ts";
import type { LegOrgan } from "../src/leg-sensors.ts";
import { DEFAULT_CONNECTOME_PATH } from "../src/node.ts";

const { values } = parseArgs({
  options: {
    write: { type: "boolean", default: false },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
    anatomy: {
      type: "string",
      default: fileURLToPath(new URL("../data/anatomy.bin", import.meta.url)),
    },
  },
});
const bytes = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const data = bytes(values.path);
const connectome = loadConnectome(data);
const anatomy = await loadAnatomy(bytes(values.anatomy), data);
const { type, subClass, class: klass } = connectome.columns;
const nerveOf = (i: number) => anatomy.columns.entryNerve.value(i);
const LEG_NERVE = /^(Pro|Meso|Meta)LN/;

const census = new Map<string, Record<string, number>>();
for (let i = 0; i < connectome.rootId.length; i++) {
  const nerve = nerveOf(i);
  if (!LEG_NERVE.test(nerve) || klass.value(i) !== "mechanosensory_proprioceptive") continue;
  const key = `${subClass.value(i) || "-"} ${type.value(i) || "-"}`;
  const row = census.get(key) ?? {};
  const where = `${nerve.replace(/_[LR]$/, "")} ${anatomy.columns.rootSide.value(i) || "?"}`;
  row[where] = (row[where] ?? 0) + 1;
  census.set(key, row);
}
console.log("Proprioceptive neurons entering by a leg nerve, by sub class and type, nerve and root side:");
for (const [key, row] of [...census].sort())
  console.log(
    `  ${key.padEnd(34)}${Object.entries(row)
      .sort()
      .map(([w, n]) => `${w} ${n}`)
      .join(", ")}`,
  );

const found = {} as Record<LegOrgan, { left: number[]; right: number[] }>;
let wrong = 0;
for (const organ of Object.keys(LEG_ORGANS) as LegOrgan[]) {
  const types = new Set<string>(LEG_ORGANS[organ]);
  const lists = { left: [] as number[], right: [] as number[] };
  for (let i = 0; i < connectome.rootId.length; i++) {
    if (!types.has(type.value(i)) || !LEG_NERVE.test(nerveOf(i))) continue;
    const side = anatomy.columns.rootSide.value(i);
    if (side === "left") lists.left.push(connectome.rootId[i]);
    else if (side === "right") lists.right.push(connectome.rootId[i]);
  }
  found[organ] = lists;
  for (const side of ["left", "right"] as const) {
    const listed = LEG_PROPRIOCEPTORS[organ]?.[side] ?? [];
    const same = listed.length === lists[side].length && listed.every((id, k) => id === lists[side][k]);
    if (!same) wrong++;
    console.log(`${organ} ${side}: ${lists[side].length} by the leg nerves${same ? "" : `, NOT as src/leg-sensors.ts lists (${listed.length})`}`);
  }
}

if (values.write) {
  const list = (ids: number[]) => ids.join(", ");
  const body = (Object.keys(found) as LegOrgan[])
    .map((organ) => `  ${organ}: {\n    left: [${list(found[organ].left)}],\n    right: [${list(found[organ].right)}],\n  },`)
    .join("\n");
  const path = fileURLToPath(new URL("../src/leg-sensors.ts", import.meta.url));
  const source = readFileSync(path, "utf8");
  const start = source.indexOf("export const LEG_PROPRIOCEPTORS");
  const end = source.indexOf("\n};", start) + "\n};".length;
  writeFileSync(
    path,
    `${source.slice(0, start)}export const LEG_PROPRIOCEPTORS: Record<LegOrgan, { left: readonly number[]; right: readonly number[] }> = {\n${body}\n};${source.slice(end)}`,
  );
  console.log(`wrote ${path}`);
  // The same lists for packages/brain-native, whose io.cpp builds the same inputs from them.
  const cpp = (Object.keys(found) as LegOrgan[])
    .flatMap((organ) =>
      (["left", "right"] as const).map((side) => {
        const name = `k${organ[0].toUpperCase()}${organ.slice(1)}${side === "left" ? "Left" : "Right"}`;
        return `inline const std::vector<uint32_t> ${name} = {${list(found[organ][side])}};`;
      }),
    )
    .join("\n");
  const native = fileURLToPath(new URL("../../brain-native/src/leg_sensors.hpp", import.meta.url));
  writeFileSync(
    native,
    `// The legs' proprioceptors by organ and side, by root ID: packages/brain's\n// src/leg-sensors.ts (which says why), written with it by its\n// scripts/leg-sensors.ts --write.\n\n#ifndef FLY_LEG_SENSORS_HPP\n#define FLY_LEG_SENSORS_HPP\n\n#include <cstdint>\n#include <vector>\n\nnamespace fly::io {\n\n${cpp}\n\n}  // namespace fly::io\n\n#endif\n`,
  );
  console.log(`wrote ${native}`);
} else if (wrong > 0) process.exitCode = 1;
