// Optional research aid: measure the public tissue meshes, not the soma cloud.
import { anatomicalPosition, sha256 } from "../src/anatomy.ts";

const base = "https://storage.googleapis.com/flyem-male-cns/rois/malecns-major-compartments-v2/mesh/";
const get = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  return r;
};
console.log("| Tissue mesh | Left x (µm) | Dorsal y (µm) | Anterior z (µm) |\n|---|---:|---:|---:|");
for (let id = 1; id <= 5; id++) {
  const manifest = await (await get(`${base}${id}:0`)).json() as { fragments: string[] };
  const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
  for (const fragment of manifest.fragments) {
    const buffer = await (await get(base + fragment)).arrayBuffer();
    console.error(`${fragment}: sha256 ${await sha256(buffer)}`);
    const view = new DataView(buffer);
    const vertices = view.getUint32(0, true);
    if (4 + vertices * 12 > buffer.byteLength) throw new Error(`Truncated mesh ${fragment}`);
    for (let i = 0; i < vertices; i++) {
      const p = anatomicalPosition([0, 1, 2].map((k) => view.getFloat32(4 + i * 12 + k * 4, true) / 1000));
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    }
  }
  console.log(`| ${manifest.fragments.join(", ")} | ${min.map((v, k) => `${v.toFixed(1)}…${max[k].toFixed(1)}`).join(" | ")} |`);
}
