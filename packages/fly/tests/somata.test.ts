import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { loadAnatomy, loadConnectome } from "@fly/brain";
import { READOUTS } from "../../brain/src/io.ts";
import { BRAIN_FRAME, CORD_FRAME, registeredPoint } from "../src/nerves/registration.ts";
import { SOMA_GROUPS } from "../src/nerves/somata.ts";
import { SOMA_RATE_REFERENCE } from "../src/nerves/soma-rates.ts";

const data = new URL("../../brain/data/", import.meta.url);
const read = (name: string) => Uint8Array.from(readFileSync(new URL(name, data))).buffer;
const skip = !existsSync(new URL("anatomy.bin", data)) || !existsSync(new URL("connectome.bin", data));

test("the command somata are the exact readout neurons, registered from true dataset somata", { skip }, async () => {
  const wiring = read("connectome.bin"), c = loadConnectome(wiring);
  const anatomy = await loadAnatomy(read("anatomy.bin"), wiring);
  assert.equal(SOMA_GROUPS.reduce((n, g) => n + g.neurons.length, 0), 64);
  assert.equal(SOMA_RATE_REFERENCE.connectomeSha256, anatomy.header.connectomeSha256);
  assert.equal(SOMA_GROUPS[1].fullHz, SOMA_GROUPS[2].fullHz, "steering sides share a display scale");
  for (let k = 0; k < READOUTS.length; k++) {
    const r = READOUTS[k], g = SOMA_GROUPS[k];
    assert.equal(g.rate, r.name);
    assert.equal(SOMA_RATE_REFERENCE.rows[k].name, r.name);
    assert.ok(Number.isFinite(g.fullHz) && g.fullHz >= 5, "a finite display reference keeps rare firing from looking busy");
    assert.deepEqual(g.neurons.map((n) => n.root), Array.from(c.find(r.select), (i) => c.rootId[i]));
    for (const n of g.neurons) {
      const i = c.indexOf(n.root);
      assert.equal(anatomy.positionKind[i], 1, "never mistake a fibre fallback for a soma");
      assert.equal(n.cord, c.columns.superClass.value(i) === "vnc_motor");
      const p = registeredPoint(n.cord ? CORD_FRAME : BRAIN_FRAME, anatomy.position(i)!);
      for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(p[axis] - n.p[axis]) <= 0.051);
    }
  }
});

test("both neuropil registrations preserve scale and the specimen's handedness", () => {
  for (const f of [BRAIN_FRAME, CORD_FRAME]) {
    assert.deepEqual(registeredPoint(f, f.origin), [0, 0, 0]);
    for (const [i, axis] of [f.x, f.y, f.z].entries()) {
      const p = registeredPoint(f, axis.map((v, k) => f.origin[k] + 100 * v));
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(p[k] - (i === k ? 100 : 0)) < 1e-9);
    }
    assert.ok(f.x[0] > 0.99, "+x is the fly's measured left");
    assert.ok(f.y[1] < -0.99, "+y is dorsal");
    assert.ok(f.z[2] < -0.99, "+z is anterior");
  }
});
