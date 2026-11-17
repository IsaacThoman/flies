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
import { Ethogram, distanceScore, mean } from './ethogram/metrics.ts';
import { REFERENCES } from './ethogram/references.ts';

export const ARENA: Place = { floor: { kind: 'circle', r: 21.5 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 30 };
const DT = 0.01;
const PLACES: Readonly<Record<string, Place>> = { ...WORLDS, arena: ARENA };
export type RunOptions = { hours: number; burnSeconds: number; seeds: number[]; place: string };

export function validateOptions(o: RunOptions) {
  if (!Number.isFinite(o.hours) || o.hours <= 0 || o.hours > 24) throw new Error('hours must be >0 and ≤24 per seed');
  if (!Number.isFinite(o.burnSeconds) || o.burnSeconds < 0 || o.burnSeconds > 3600) throw new Error('burn seconds must be in [0,3600]');
  if (!Object.hasOwn(PLACES, o.place)) throw new Error(`unknown place ${o.place}`);
  if (!o.seeds.length || o.seeds.some(s => !Number.isInteger(s) || s < 0 || s > 0xffffffff) || new Set(o.seeds).size !== o.seeds.length) throw new Error('seeds must be distinct uint32 integers');
  if ([o.hours * 3600, o.burnSeconds].some(s => Math.abs(s / DT - Math.round(s / DT)) > 1e-7)) throw new Error('duration must be an integer number of 10 ms frames');
}

/** Six comparisons are exploratory. None have a validated, condition-matched assay yet. */
export function comparisons(measured: ReturnType<Ethogram['result']>) {
  return REFERENCES.map(reference => {
    const raw = reference.observable ? measured[reference.observable as keyof typeof measured] : null;
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    return { ...reference, measured: value, exploratoryScore: value === null ? null : distanceScore(value, reference.value, reference.tolerance), validatedScore: null, status: reference.observable === null ? 'unsupported-assay' : value === null ? 'no-events' : 'exploratory-assay-mismatch' };
  });
}

export function measure(data: ArrayBuffer, options: RunOptions) {
  validateOptions(options);
  const results = [];
  for (const seed of options.seeds) {
    const driver = new InProcessBrain(data, seed);
    const life = new Life(new World(PLACES[options.place]), driver);
    // A uniform adapted field is reproducible without a renderer. It is not the game's visual world.
    if (driver.eyes) life.light = { left: new Float32Array(driver.eyes.left.directions.length / 3).fill(0.5), right: new Float32Array(driver.eyes.right.directions.length / 3).fill(0.5) };
    const ethogram = new Ethogram(DT);
    const burn = Math.round(options.burnSeconds / DT);
    const recorded = Math.round(options.hours * 3600 / DT);
    let yaw = life.body.yaw;
    let previousYaw = yaw;
    let nextReport = 6000;
    const cpu = process.cpuUsage();
    const start = performance.now();
    try {
      for (let frame = 0; frame < burn + recorded; frame++) {
        const p = life.body.position;
        const { x, y, z } = p;
        const onFeet = life.body.onFeet;
        life.step(DT, performance.now());
        const deltaYaw = Math.atan2(Math.sin(life.body.yaw - previousYaw), Math.cos(life.body.yaw - previousYaw));
        yaw += deltaYaw;
        previousYaw = life.body.yaw;
        if (frame >= burn) {
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
    const scores = rows.flatMap(r => r.exploratoryScore === null ? [] : [r.exploratoryScore]);
    const usedCpu = process.cpuUsage(cpu);
    results.push({ seed, measured, comparisons: rows, exploratoryMean: mean(scores), observedReferences: scores.length, registeredReferences: REFERENCES.length, validatedOverall: null, cpuSeconds: (usedCpu.user + usedCpu.system) / 1e6, wallSeconds: (performance.now() - start) / 1000 });
  }
  return results;
}

export function markdown(results: ReturnType<typeof measure>) {
  const text = ['# Behaviour audit', '', 'Exploratory scores are descriptive distances, not validated biological agreement. Unsupported assays and absent events are N/A, never zero-valued observations.', '', '| Metric | Literature value ± comparison scale | Measured per seed | Exploratory /10 per seed | Source |', '|---|---:|---|---|---|'];
  for (let i = 0; i < REFERENCES.length; i++) {
    const ref = REFERENCES[i];
    const values = results.map(r => r.comparisons[i].measured?.toFixed(4) ?? 'N/A').join(', ');
    const scores = results.map(r => r.comparisons[i].exploratoryScore?.toFixed(2) ?? 'N/A').join(', ');
    text.push(`| ${ref.label} (${ref.unit}) | ${ref.value} ± ${ref.tolerance} | ${values} | ${scores} | [${ref.paper.split(',')[0]}](${ref.url}), ${ref.location} |`);
  }
  text.push('', 'Validated overall behaviour score: **N/A** (no condition-matched assays).', '', ...results.map(r => `Seed ${r.seed}: exploratory mean ${r.exploratoryMean?.toFixed(2) ?? 'N/A'}/10 over ${r.observedReferences}/${r.registeredReferences} references; ${(r.measured.seconds / 3600).toFixed(4)} recorded hours; ${r.cpuSeconds.toFixed(1)} CPU seconds.`), '', 'Full diagnostics, sample counts, censoring, assay caveats and tolerance provenance are in the JSON report.', '', 'FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0).' );
  return text.join('\n');
}

function main() {
  const { values } = parseArgs({ options: { hours: { type: 'string', default: '1' }, 'burn-seconds': { type: 'string', default: '60' }, seeds: { type: 'string', default: '1,2,3' }, place: { type: 'string', default: 'arena' }, data: { type: 'string', default: DEFAULT_CONNECTOME_PATH }, out: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('node scripts/ethogram.ts [--hours 1] [--seeds 1,2,3] [--place arena|lab|picnic|bar|restaurant|windowsill] [--burn-seconds 60] [--data path] [--out report.json]\nReserve a /tmp/flies-heavy/slot-N before a long run. No rendering, no sound.');
    return;
  }
  const options: RunOptions = { hours: Number(values.hours), burnSeconds: Number(values['burn-seconds']), seeds: values.seeds.split(',').map(Number), place: values.place };
  validateOptions(options);
  const data = Uint8Array.from(readFileSync(values.data)).buffer;
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
  const results = measure(data, options);
  const report = {
    schema: 1, options, dtSeconds: DT,
    commit, dirty,
    connectomeSha256: createHash('sha256').update(new Uint8Array(data)).digest('hex'),
    attribution: 'FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0)',
    protocol: 'Unstimulated free behaviour; uniform facet luminance 0.5, natural Life hunger (its metabolism clock runs 60× faster than motion); no imposed commands, no teleportation, no sensory overrides. Arena is a 43 mm disc with the existing edge reflex, not a walled chamber. No feeding, dust, loom, air-puff or optomotor trial battery.',
    definitions: '10 ms frames; walking = actual ground displacement >0.5 mm/s; activity = speed >0.5 mm/s OR |yaw|>20 deg/s, no paper-specific bout filtering; edge = outer half of floor area, only while on feet; speed histogram 0.1 mm/s bins, yaw histogram 1 deg/s bins; complete bout durations only, both window endpoints censored; saccades = contiguous ground |yaw|>200 deg/s; angle = ±50 ms around maximum |yaw| in each event; grooming = Life head-groom display state, not body-part-resolved grooming; flight includes falls.',
    results,
  };
  if (values.out) writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
  console.log(markdown(results));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
