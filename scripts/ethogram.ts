// Offline audit only: uses the game's Life, brain, senses and body without rendering.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { World, WORLDS } from '@fly/world';
import type { Place } from '@fly/world';
import { Life } from '../apps/web/src/life.ts';
import { InProcessBrain } from './fuzz/brain.ts';
import { DEFAULT_CONNECTOME_PATH } from '../packages/brain/src/node.ts';
import { Ethogram } from './ethogram/metrics.ts';
import { comparisons, scorecard } from './ethogram/scoring.ts';
export { comparisons } from './ethogram/scoring.ts';
import { HeavyLease } from './ethogram/lease.ts';
import { Rhythm } from '@fly/body';
import { escapeBattery, summarizeEscape, validateEscapeOptions } from './ethogram/escape.ts';

export const ARENA: Place = { floor: { kind: 'circle', r: 21.5 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 30 };
const DT = 0.01;
export const STAND_INS = [
  'InternalState uses stochastic arousal and per-eye scene backgrounds, outside the connectome, to drive spontaneous activity.',
  'The body supplies edge avoidance and wall escape, tarsal flight support, grooming-pose persistence, and alignment to food after a neural feeding command.',
  'Airborne duration and grooming display occupancy include those body mechanisms; this audit does not attribute them to additional neural decisions.',
] as const;
const PLACES: Readonly<Record<string, Place>> = { ...WORLDS, arena: ARENA };
export type RunOptions = { hours: number; burnSeconds: number; seeds: number[]; place: string; hour?: number };

export function validateOptions(o: RunOptions) {
  if (!Number.isFinite(o.hours) || o.hours <= 0 || o.hours > 24) throw new Error('hours must be >0 and ≤24 per seed');
  if (!Number.isFinite(o.burnSeconds) || o.burnSeconds < 0 || o.burnSeconds > 3600) throw new Error('burn seconds must be in [0,3600]');
  if (!Object.hasOwn(PLACES, o.place)) throw new Error(`unknown place ${o.place}`);
  if (!Number.isFinite(o.hour ?? 6) || (o.hour ?? 6) < 0 || (o.hour ?? 6) >= 24) throw new Error('hour must be in [0,24)');
  if (!o.seeds.length || o.seeds.some(s => !Number.isInteger(s) || s < 0 || s > 0xffffffff) || new Set(o.seeds).size !== o.seeds.length) throw new Error('seeds must be distinct uint32 integers');
  if ([o.hours * 3600, o.burnSeconds].some(s => Math.abs(s / DT - Math.round(s / DT)) > 1e-7)) throw new Error('duration must be an integer number of 10 ms frames');
}

export async function measure(data: ArrayBuffer, options: RunOptions, checkpoint?: () => Promise<void>) {
  validateOptions(options);
  const results = [];
  for (const seed of options.seeds) {
    await checkpoint?.();
    const driver = new InProcessBrain(data, seed);
    const life = new Life(new World(PLACES[options.place]), driver);
    life.rhythm = new Rhythm(options.hour ?? 6, { sunrise: 6, sunset: 18 });
    // A uniform adapted field is reproducible without a renderer. It is not the game's visual world.
    if (driver.eyes) life.light = { left: new Float32Array(driver.eyes.left.directions.length / 3).fill(0.5), right: new Float32Array(driver.eyes.right.directions.length / 3).fill(0.5) };
    const ethogram = new Ethogram(DT);
    const burn = Math.round(options.burnSeconds / DT);
    const recorded = Math.round(options.hours * 3600 / DT);
    let yaw = life.body.yaw;
    let previousYaw = yaw;
    let nextReport = 6000;
    const attribution = { bumpSeconds: 0, neuralGroomSeconds: 0, poseGroomWithoutCurrentCommandSeconds: 0, groundYawDifferentFromIntentSeconds: 0, sleepingSeconds: 0 };
    const cpu = process.cpuUsage();
    const start = performance.now();
    try {
      for (let frame = 0; frame < burn + recorded; frame++) {
        if (frame % 100 === 0) await checkpoint?.();
        const p = life.body.position;
        const { x, y, z } = p;
        const onFeet = life.body.onFeet;
        // Hold Zeitgeber time, as scripts/sleep.ts does; sleep pressure still evolves normally.
        life.rhythm.setTime(options.hour ?? 6);
        life.step(DT, performance.now());
        const deltaYaw = Math.atan2(Math.sin(life.body.yaw - previousYaw), Math.cos(life.body.yaw - previousYaw));
        yaw += deltaYaw;
        previousYaw = life.body.yaw;
        if (frame >= burn) {
          if (Math.max(life.sensed.bumpLeft, life.sensed.bumpRight) > 0.05) attribution.bumpSeconds += DT;
          if ((driver.state?.command.groom ?? 0) > 0.05) attribution.neuralGroomSeconds += DT;
          else if (life.activity === 'grooming') attribution.poseGroomWithoutCurrentCommandSeconds += DT;
          if (onFeet && life.body.onFeet && Math.abs(deltaYaw / DT - life.intent.yawRate) > 1e-3) attribution.groundYawDifferentFromIntentSeconds += DT;
          if (life.activity === 'sleeping') attribution.sleepingSeconds += DT;
          const floor = life.world.floor;
          const edge = floor.kind === 'circle' ? Math.hypot(p.x, p.z) >= floor.r / Math.sqrt(2) : Math.abs(p.x) >= floor.hx / Math.sqrt(2) || Math.abs(p.z) >= floor.hz / Math.sqrt(2);
          ethogram.add({ dt: DT, speed: onFeet && life.body.onFeet ? Math.hypot(p.x - x, p.y - y, p.z - z) / DT : 0, yawRate: deltaYaw / DT, yaw, onFeet: onFeet && life.body.onFeet, grooming: life.activity === 'grooming', eating: life.eating, edge, jumped: life.body.events.jumped });
        }
        if (frame + 1 >= nextReport) {
          process.stderr.write(`seed ${seed}: ${((frame + 1) * DT).toFixed(0)} simulated seconds\n`);
          nextReport += 6000;
        }
      }
    } finally { driver.dispose(); }
    const measured = ethogram.result();
    const rows = comparisons(measured);
    const usedCpu = process.cpuUsage(cpu);
    results.push({ seed, hour: options.hour ?? 6, measured, attribution, comparisons: rows, cpuSeconds: (usedCpu.user + usedCpu.system) / 1e6, wallSeconds: (performance.now() - start) / 1000 });
  }
  return results;
}

export function markdown(results: Awaited<ReturnType<typeof measure>>, escape: Awaited<ReturnType<typeof escapeBattery>> | null = null) {
  const latest = results.at(-1)?.measured ?? {};
  const card = scorecard(latest, escape);
  const text = ['# Behaviour audit', '', `Clock held at ${escape?.protocol.hour ?? results[0]?.hour ?? 'see recording'} h; sunrise 06:00, sunset 18:00. No validated whole-animal point score is identified. Optical scores are limited engineering comparisons; unmatched and unsupported metrics remain N/A.`, '', ...STAND_INS, '', '| Metric | Literature value (reported spread) | Measured | Benchmark /10 | Source |', '|---|---:|---|---|---|'];
  for (const row of card.rows) {
    const free = results.map(r => r.comparisons.find(c => c.id === row.id)?.measured).filter(v => v !== null && v !== undefined);
    const value = row.observable?.startsWith('escape') ? row.measured?.toFixed(4) ?? 'N/A' : free.length ? free.map(v => v!.toFixed(4)).join(', ') : 'N/A';
    text.push(`| ${row.label} (${row.unit}) | ${row.value}${row.tolerance === null ? '' : ` (±${row.tolerance})`} | ${value} | ${row.score?.toFixed(2) ?? 'N/A'} | [${row.paper.split(',')[0]}](${row.url}), ${row.location} |`);
  }
  if (escape) for (const [label, group] of [['Black square', escape.summary.black], ['Checkerboard', escape.summary.checkerboard], ['Flash surrogate', escape.summary.flash], ['Blank', escape.summary.blank]] as const) {
    text.push('', `${label}: ${group.successes}/${group.n} eligible responses; ${group.readinessFailures}/${group.attempted} readiness failures; model Wilson 95% interval ${group.probabilityCI95?.map(v => v.toFixed(3)).join('–') ?? 'N/A'}; timing fit ${group.fit ? `${group.fit.n} successes across ${group.fit.ratios} l/v values, slope SE ${group.fit.slopeSE.toFixed(3)}, intercept SE ${group.fit.interceptSE.toFixed(3)} ms` : 'N/A'}.`);
  }
  text.push('', `Optical probability mean: **${card.opticalProbabilityMean?.toFixed(2) ?? 'N/A'}/10**; timing mean **${card.opticalTimingMean?.toFixed(2) ?? 'N/A'}/10**; equal probability/timing composite **${card.opticalComposite?.toFixed(2) ?? 'N/A'}/10**. ${card.scored}/${card.registered} registered comparisons estimable. Whole-animal score: **N/A**. Registry-average bounds **${card.registeredComparisonBounds.map(v => v.toFixed(2)).join('–')}/10** describe only these rows, not biological fidelity or confidence intervals.`, '', ...results.map(r => `Seed ${r.seed}: ${(r.measured.seconds / 3600).toFixed(4)} recorded hours; ${r.cpuSeconds.toFixed(1)} CPU seconds.`), '', 'Full sample counts, trial denominators, readiness failures, censoring, assay blockers and uncertainty labels are in JSON.', '', 'FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0).');
  return text.join('\n');
}

async function main() {
  const { values } = parseArgs({ options: { hours: { type: 'string', default: '1' }, 'burn-seconds': { type: 'string', default: '60' }, seeds: { type: 'string', default: '1,2,3' }, place: { type: 'string', default: 'arena' }, hour: { type: 'string', default: '6' }, assay: { type: 'string', default: 'all' }, trials: { type: 'string', default: '8' }, 'seed-base': { type: 'string', default: '20000' }, data: { type: 'string', default: DEFAULT_CONNECTOME_PATH }, out: { type: 'string' }, analyse: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('node scripts/ethogram.ts [--hours 1] [--seeds 1,2,3] [--place arena|lab|picnic|bar|restaurant|windowsill] [--burn-seconds 60] [--hour 6] [--assay free|escape|all] [--trials 8] [--data path] [--out report.json] [--analyse recording.json]\nAutomatically leases one of eight heavy-work slots, yielding after 9.5 min and cooling down 2 min. No rendering, no sound.');
    return;
  }
  if (values.analyse) {
    const input = JSON.parse(readFileSync(values.analyse, 'utf8'));
    if (input.schema !== 3 || !Array.isArray(input.results)) throw new Error('analyse requires schema 3 continuous-flight recording; schema 2 is historical and must be rerun');
    const results: Awaited<ReturnType<typeof measure>> = input.results.map((r: Awaited<ReturnType<typeof measure>>[number]) => ({ ...r, hour: r.hour ?? input.clock?.heldHour ?? input.options?.hour, comparisons: comparisons(r.measured) }));
    const escape: Awaited<ReturnType<typeof escapeBattery>> | null = input.escape ? { ...input.escape, summary: summarizeEscape(input.escape.trials) } : null;
    const report = { ...input, results, escape, scorecard: scorecard(results.at(-1)?.measured ?? {}, escape), analysis: { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0, sourceRecording: values.analyse } };
    if (values.out) writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
    console.log(markdown(results, escape));
    return;
  }
  const options: RunOptions = { hours: Number(values.hours), burnSeconds: Number(values['burn-seconds']), seeds: values.seeds.split(',').map(Number), place: values.place, hour: Number(values.hour) };
  validateOptions(options);
  if (!['free', 'escape', 'all'].includes(values.assay)) throw new Error('assay must be free, escape or all');
  if (values.assay !== 'free') validateEscapeOptions(Number(values.trials), options.hour!, Number(values['seed-base']));
  const data = Uint8Array.from(readFileSync(values.data)).buffer;
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
  const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  const lease = new HeavyLease(branch);
  const stop = () => { lease.release(); process.exit(130); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let results: Awaited<ReturnType<typeof measure>> = [];
  let escape: Awaited<ReturnType<typeof escapeBattery>> | null = null;
  try {
    if (values.assay !== 'escape') results = await measure(data, options, () => lease.checkpoint());
    if (values.assay !== 'free') escape = await escapeBattery(data, Number(values.trials), options.hour!, () => lease.checkpoint(), Number(values['seed-base']));
  }
  finally { lease.release(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  const report = {
    schema: 3, options, assay: values.assay, dtSeconds: DT, clock: { heldHour: options.hour, sunrise: 6, sunset: 18, initialPressure: 'Rhythm default usualPressure(hour); subsequent homeostasis evolves' },
    commit, dirty,
    connectomeSha256: createHash('sha256').update(new Uint8Array(data)).digest('hex'),
    attribution: 'FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0)',
    standIns: STAND_INS,
    protocol: 'Unstimulated free behaviour; uniform facet luminance 0.5, natural Life hunger (its metabolism clock runs 60× faster than motion); no imposed commands, no teleportation, no sensory overrides. Arena is a 43 mm disc with the existing edge reflex, not a walled chamber. Free behaviour has no food or dust; the optional optical battery presents physical visual fields, never direct loom inputs. No air-puff or optomotor trial battery.',
    scheduling: 'At most 9.5 min per lease with 2 min cooldown; wall time includes fairness pauses and slot waits, CPU time excludes waits.',
    definitions: '10 ms frames; walking = actual ground displacement >0.5 mm/s; activity = speed >0.5 mm/s OR |yaw|>20 deg/s, no paper-specific bout filtering; edge = outer half of floor area, only while on feet; speed histogram 0.1 mm/s bins, yaw histogram 1 deg/s bins; complete bout durations only, both window endpoints censored; saccades = contiguous ground |yaw|>200 deg/s; angle = ±50 ms around maximum |yaw| in each event; grooming = Life head-groom display state, not body-part-resolved grooming; airborne time includes jumps and falls; it is not sustained flight duration.',
    results, escape, scorecard: scorecard(results.at(-1)?.measured ?? {}, escape),
  };
  if (values.out) writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
  console.log(markdown(results, escape));
  if (escape) console.log(JSON.stringify(escape.summary, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
}
