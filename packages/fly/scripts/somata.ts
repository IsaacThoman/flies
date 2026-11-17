// The nine command readouts' true somata, joined to the pinned anatomy by
// neuron index. No fibre fallbacks, mirroring, sampling or invented axons.
import { readFileSync, writeFileSync } from "node:fs";
import { loadAnatomy, loadConnectome } from "@fly/brain";
import { READOUTS, SCALES } from "../../brain/src/io.ts";
import { BRAIN_FRAME, CORD_FRAME, registeredPoint } from "../src/nerves/registration.ts";

const read = (name: string) => Uint8Array.from(readFileSync(new URL(`../../brain/data/${name}`, import.meta.url))).buffer;
const wiring = read("connectome.bin");
const c = loadConnectome(wiring);
const a = await loadAnatomy(read("anatomy.bin"), wiring);
const scales = [SCALES.walk, SCALES.turn, SCALES.turn, SCALES.back, SCALES.escape, SCALES.wings, SCALES.groom, SCALES.feed, SCALES.sing];
const groups = READOUTS.map((r, k) => {
  const neurons = Array.from(c.find(r.select), (i) => {
    if (a.positionKind[i] !== 1) throw new Error(`${r.name}: ${c.rootId[i]} has no measured soma`);
    const cord = c.columns.superClass.value(i) === "vnc_motor";
    const p = registeredPoint(cord ? CORD_FRAME : BRAIN_FRAME, a.position(i)!);
    return { root: c.rootId[i], cord, p: p.map((v) => Math.round(v * 10) / 10) };
  });
  return { id: `somata-${r.name.toLowerCase().replaceAll(" ", "-")}`, rate: r.name, fullHz: scales[k], role: r.name === "flight" || r.name === "MN9" ? "motor" : "central", neurons };
});
writeFileSync(new URL("../src/nerves/somata.ts", import.meta.url), `// Measured by scripts/somata.ts from FlyEM male CNS v1.0 (CC-BY 4.0).\n// True soma locations only, micrometres in the shared neuropil frames.\n// Connectome SHA-256: ${a.header.connectomeSha256}\n// Annotation SHA-256: ${a.header.source.sha256}\n// Each group shares its measured mean firing rate, not individual spikes.\nexport const SOMA_GROUPS = [\n${groups.map((g) => "  " + JSON.stringify(g)).join(",\n")}\n] as const;\n`);
