// Extract actual contact transitions, rather than infer duty from the oscillator.
// References and the distinction between measured data and animation targets:
// Mendes 2013 doi:10.7554/eLife.00231; Wosnitza 2013 doi:10.1242/jeb.078139;
// DeAngelis 2019 doi:10.7554/eLife.46409 (stance fit, Methods equation 1).
import { Gait } from "../src/gait.ts";
import { LEG_COUNT, LEGS, legPair, legSide } from "../src/anatomy.ts";

const home = new Float64Array(18);
for (let l = 0; l < LEG_COUNT; l++) {
  home[3 * l] = LEGS[legPair(l)].foot[0] * legSide(l);
  home[3 * l + 2] = LEGS[legPair(l)].foot[2];
}
const fpsArg = process.argv.indexOf("--fps");
const fps = fpsArg < 0 ? 1000 : Number(process.argv[fpsArg + 1]);
if (!Number.isFinite(fps) || fps < 30 || fps > 1000) throw new Error("--fps must be 30 to 1000");
const dt = 1 / fps, warmup = 3, seconds = 12;
console.log("| mm/s | duty | swing ms | stance ms | step mm | R1−L1 phase | L2−L1 phase | L3−L1 phase | support 3/4/5+ % | fit stance ms | stance error % |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const speed of [0.5, 1.5, 3, 6, 10, 14]) {
  const gait = new Gait(home), lifts: number[][] = Array.from({ length: 6 }, () => []);
  const swings: number[] = [], stances: number[] = [], steps: number[] = [];
  const lastLift = new Float64Array(6), lastLand = new Float64Array(6), landZ = new Float64Array(6);
  const support = new Uint32Array(7);
  let planted = 0;
  for (let f = 0; f < (warmup + seconds) / dt; f++) {
    const t = f * dt, prev = gait.swinging.slice();
    const previousLift = gait.lastLift?.slice(), previousLand = gait.lastLand?.slice();
    gait.update(speed, 0, dt, home);
    let n = 0;
    for (let l = 0; l < 6; l++) {
      if (!gait.swinging[l]) n++;
      if (previousLift && previousLand) {
        const lift = gait.lastLift[l], land = gait.lastLand[l];
        if (lift !== previousLift[l] && lift >= warmup) {
          const stance = lift - (land < lift ? land : previousLand[l]);
          lifts[l].push(lift); stances.push(stance); steps.push(stance * speed * 2.5);
        }
        if (land !== previousLand[l] && land >= warmup) swings.push(land - (lift < land ? lift : previousLift[l]));
      } else {
        // A rig without event timestamps can only be sampled at frame boundaries.
        if (!prev[l] && gait.swinging[l]) {
          if (t >= warmup) { lifts[l].push(t); stances.push(t - lastLand[l]); steps.push(Math.abs(landZ[l] - gait.feet[l * 3 + 2]) * 2.5); }
          lastLift[l] = t;
        }
        if (prev[l] && !gait.swinging[l]) {
          if (t >= warmup) swings.push(t - lastLift[l]);
          lastLand[l] = t; landZ[l] = gait.feet[l * 3 + 2];
        }
      }
    }
    if (t >= warmup) { support[n]++; planted += n; }
  }
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const period = mean(lifts[0].slice(1).map((t, i) => t - lifts[0][i]));
  // Phase uses the first lift on/after each L1 lift, with rounding tolerance.
  const onset = (l: number) => mean(lifts[0].slice(1, -1).map(t => {
    const x = lifts[l].find(x => x >= t - dt / 2)!;
    return ((x - t) / period + 1) % 1;
  }));
  const total = seconds / dt;
  console.log(`| ${(speed * 2.5).toFixed(2)} | ${(planted / (total * 6)).toFixed(3)} | ${(mean(swings) * 1000).toFixed(1)} | ${(mean(stances) * 1000).toFixed(1)} | ${mean(steps).toFixed(3)} | ${onset(1).toFixed(3)} | ${onset(2).toFixed(3)} | ${onset(4).toFixed(3)} | ${[support[3], support[4], support[5] + support[6]].map(n => (100 * n / total).toFixed(1)).join("/")} | ${(932.8 * (speed * 2.5) ** -1.025).toFixed(1)} | ${(100 * (mean(stances) * 1000 / (932.8 * (speed * 2.5) ** -1.025) - 1)).toFixed(1)} |`);
}
