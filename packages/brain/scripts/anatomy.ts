// Manual route: node packages/brain/scripts/anatomy.ts --annotations <feather> [--connectome <bin>] [--out <bin>]
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_CONNECTOME_PATH } from "../src/node.ts";
import { packAnatomy } from "../src/pack-anatomy.ts";

const { values } = parseArgs({ options: { annotations: { type: "string" }, connectome: { type: "string", default: DEFAULT_CONNECTOME_PATH }, out: { type: "string" } } });
try {
  if (!values.annotations) throw new Error("Usage: node packages/brain/scripts/anatomy.ts --annotations <feather> [--connectome <bin>] [--out <bin>]");
  const read = (path: string) => Uint8Array.from(readFileSync(path)).buffer;
  const bytes = await packAnatomy(read(values.annotations), read(values.connectome));
  const out = values.out ?? join(dirname(values.connectome), "anatomy.bin");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.part`, bytes);
  renameSync(`${out}.part`, out);
  console.log(`wrote ${out} (${bytes.length.toLocaleString("en-US")} bytes)`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
