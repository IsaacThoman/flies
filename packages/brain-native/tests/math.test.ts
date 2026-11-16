// The native brain's exp, log, log1p, expm1, sin and cos (src/fdlibm.cpp),
// built natively and as WebAssembly (where wasm.sh makes each contracted
// multiply-add a correctly rounded fma), against V8's Math functions, bit for bit, on the arguments the brain gives
// them and on a spread of others: the whole saturation table, step and chunk
// decays, smoothing, Poisson probabilities and gaps, Box-Muller and the
// logistic, then random doubles of every magnitude and the special values.

import assert from "node:assert/strict";
import { test } from "node:test";
import { mulberry32 } from "../../brain/src/sim.ts";
import { BUILDS, harness, hex64 } from "./compare.ts";

function inputs(): number[] {
  const random = mulberry32(77);
  const xs: number[] = [];
  // Saturation (params.ts): -n / 75 for every count.
  for (let n = 0; n < 65536; n++) xs.push(-n / 75);
  // Decays: -dt / tau for steps, chunks and ticks of every length the runtime makes.
  for (const tau of [5, 20, 40, 100, 150, 1000, 4, 10]) {
    for (let k = 0; k < 4000; k++) xs.push(-(k / 4) / tau, -(random() * 1000) / tau, -(random() * 10) / 1000 / tau);
  }
  // Poisson: log1p(-p) for rates up to a few hundred Hz, and log(1 - u) for uniform u.
  for (let k = 0; k < 20000; k++) xs.push(-((random() * 300 * 1) / 1000), -random(), 1 - random(), random());
  // Box-Muller and the logistic.
  for (let k = 0; k < 20000; k++) xs.push(2 * Math.PI * random(), -(random() * 20 - 10));
  // Random doubles of every magnitude and sign, and the edges.
  const view = new DataView(new ArrayBuffer(8));
  for (let k = 0; k < 50000; k++) {
    view.setUint32(0, Math.floor(random() * 2 ** 32), true);
    view.setUint32(4, Math.floor(random() * 2 ** 32), true);
    xs.push(view.getFloat64(0, true));
  }
  for (let e = -1080; e <= 1030; e++) xs.push(2 ** e, -(2 ** e), 1.5 * 2 ** e);
  xs.push(0, -0, 1, -1, 0.5, Math.PI / 4, Math.PI / 2, Math.PI, 1e300, -1e300, 709.78, 709.79, -745.13, -745.2, 5e-324, -5e-324);
  xs.push(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE);
  return xs;
}

for (const target of BUILDS) test(`exp, log, log1p, expm1, sin and cos are V8's to the bit (${target.name})`, { skip: target.skip }, () => {
  const xs = inputs();
  const lines = harness(target.dir(), ["math"], xs.map(hex64).join("\n") + "\n");
  assert.equal(lines.length, xs.length);
  const functions = [Math.exp, Math.log, Math.log1p, Math.expm1, Math.sin, Math.cos];
  const names = ["exp", "log", "log1p", "expm1", "sin", "cos"];
  let differences = 0;
  const examples: string[] = [];
  xs.forEach((x, k) => {
    const got = lines[k].split(" ");
    functions.forEach((f, m) => {
      const expected = f(x);
      // NaN's bits are not something JavaScript lets a program see.
      const same = Number.isNaN(expected) ? got[m].startsWith("7ff") || got[m].startsWith("fff") : got[m] === hex64(expected);
      if (!same) {
        differences++;
        if (examples.length < 10) examples.push(`${names[m]}(${x}) is ${hex64(expected)} in V8, ${got[m]} here`);
      }
    });
  });
  assert.equal(differences, 0, examples.join("\n"));
});
