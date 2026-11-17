// Measure the animated tarsal endpoints (claw bases), including the leg solver, separately from the
// sub-frame event report in gait.ts. Sampled contacts can alias at 30 Hz.
// DeAngelis et al. 2019 doi:10.7554/eLife.46409, Methods Eq. 1;
// Mendes 2013 doi:10.7554/eLife.00231; Wosnitza 2013 doi:10.1242/jeb.078139.
import { RESTING_POSE } from "@fly/contracts";
import { FlyRig } from "../src/rig.ts";
import { FOOT_CLEARANCE, J, LEG_SEGMENTS, LEGS, legPair } from "../src/anatomy.ts";

const arg = process.argv.indexOf("--fps"), fps = arg < 0 ? 1000 : Number(process.argv[arg + 1]);
if (!Number.isFinite(fps) || fps < 30 || fps > 1000) throw new Error("--fps must be 30 to 1000");
const dt = 1 / fps, warm = 3, seconds = 12, mm = 2.5;
const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`Solved tarsal-endpoint (claw-base) contacts at ${fps} Hz, threshold ${(FOOT_CLEARANCE + 0.002).toFixed(4)} body lengths. Excursion joins the first planted and first unplanted samples; it is not stride advance. Both endpoints are quantised, and low-rate sampling can miss whole swings. Timing is quantised to ${1000 / fps} ms. Fit applies only to forward straight walks.`);
console.log("Swing excursion uses body coordinates; stride uses successive same-foot touchdowns transported into world coordinates. Canonical fast-tripod phases R1/L2/L3 relative to L1 are 0.5/0.5/0; these are idealised offsets, not population means.");
console.log("| mm/s | turn rad/s | duty | swing ms | stance ms | stance excursion mm | swing excursion mm | footprint stride mm | R1−L1 | L2−L1 | L3−L1 | support 3/4/5+ % | fit stance ms | error % |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [speed, turn] of [[0.5, 0], [1.5, 0], [3, 0], [6, 0], [10, 0], [14, 0], [1, 2], [-1, 0]]) {
  const rig = new FlyRig(), pose = { ...RESTING_POSE, speed, turn };
  const planted = new Uint8Array(6).fill(1), touchdown = new Float64Array(18), takeoff = new Float64Array(18), worldTouchdown = new Float64Array(18), lifted = new Float64Array(6), landed = new Float64Array(6);
  const lifts: number[][] = Array.from({ length: 6 }, () => []), swings: number[] = [], stances: number[] = [], excursions: number[] = [], swingExcursions: number[] = [], strides: number[] = [], support = new Uint32Array(7);
  let contacts = 0, frames = 0, bodyX = 0, bodyZ = 0, yaw = 0;
  for (let frame = 0; frame < Math.round((warm + seconds) * fps); frame++) {
    rig.update(pose, dt);
    // Match the animation's inverse body transport, without physics or sensing.
    yaw += turn * dt;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    bodyX += speed * dt * s; bodyZ += speed * dt * c;
    const time = (frame + 1) * dt;
    let count = 0;
    for (let leg = 0; leg < 6; leg++) {
      const m = rig.joints, o = (J.leg + leg * LEG_SEGMENTS + 4) * 12, length = LEGS[legPair(leg)].tarsus;
      const x = m[o] * length + m[o + 3], y = m[o + 4] * length + m[o + 7], z = m[o + 8] * length + m[o + 11];
      const down = y <= FOOT_CLEARANCE + 0.002;
      const wx = bodyX + x * c + z * s, wz = bodyZ - x * s + z * c;
      if (down) count++;
      if (!down && planted[leg]) {
        if (time > warm && landed[leg] > warm) {
          lifts[leg].push(time); stances.push(time - landed[leg]);
          excursions.push(Math.hypot(x - touchdown[leg * 3], z - touchdown[leg * 3 + 2]) * mm);
        }
        lifted[leg] = time;
        takeoff[leg * 3] = x; takeoff[leg * 3 + 2] = z;
      } else if (down && !planted[leg]) {
        if (time > warm && lifted[leg] > warm) {
          swings.push(time - lifted[leg]);
          swingExcursions.push(Math.hypot(x - takeoff[leg * 3], z - takeoff[leg * 3 + 2]) * mm);
        }
        if (time > warm && landed[leg] > warm) strides.push(Math.hypot(wx - worldTouchdown[leg * 3], wz - worldTouchdown[leg * 3 + 2]) * mm);
        landed[leg] = time; touchdown[leg * 3] = x; touchdown[leg * 3 + 2] = z;
        worldTouchdown[leg * 3] = wx; worldTouchdown[leg * 3 + 2] = wz;
      }
      planted[leg] = Number(down);
    }
    if (time > warm) { contacts += count; support[count]++; frames++; }
  }
  const period = average(lifts[0].slice(1).map((t, i) => t - lifts[0][i]));
  const phase = (leg: number) => average(lifts[0].slice(1, -1).map(t => {
    const onset = lifts[leg].find(x => x >= t - dt / 2);
    return onset === undefined ? NaN : ((onset - t) / period + 1) % 1;
  }));
  const stance = average(stances) * 1000, fit = turn === 0 && speed > 0 ? 932.8 * (speed * mm) ** -1.025 : NaN;
  console.log(`| ${(speed * mm).toFixed(2)} | ${turn.toFixed(1)} | ${(contacts / (6 * frames)).toFixed(3)} | ${(average(swings) * 1000).toFixed(1)} | ${stance.toFixed(1)} | ${average(excursions).toFixed(3)} | ${average(swingExcursions).toFixed(3)} | ${average(strides).toFixed(3)} | ${phase(1).toFixed(3)} | ${phase(2).toFixed(3)} | ${phase(4).toFixed(3)} | ${[support[3], support[4], support[5] + support[6]].map(n => (100 * n / frames).toFixed(1)).join("/")} | ${Number.isFinite(fit) ? fit.toFixed(1) : "—"} | ${Number.isFinite(fit) ? (100 * (stance / fit - 1)).toFixed(1) : "—"} |`);
}
