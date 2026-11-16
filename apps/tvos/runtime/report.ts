// The host's hooks into the page, driven by the launch config:
//
//   - the splash covers loading until the screen canvas says data-ready="true";
//   - "stats": N logs the host's frame timings (and, with "profile", the time spent in each
//     WebGL and 2D canvas method) every N seconds, as `stats {json}` lines on the console;
//   - "drive" runs remote input for unattended runs, through the same native code as the
//     remote's own, waiting on the screen canvas's data-* state between steps:
//       "drive": [["wait", {"ready": "true"}], ["press", "ArrowRight", 650], ["swipe", "ArrowUp"],
//                 ["touch", 0.5, -0.25, true], ["sleep", 500], ["log", "a mark"]]
//     A wait step takes an optional timeout in ms (default 60000). The drive logs `drive: done`
//     when it finishes, or `drive: timed out ...` and stops.
import { Q, native } from './native.ts';
import { screenCanvas } from './dom.ts';
import { commands, counters } from './webgl.ts';
import { clearTimer, setIntervalShim, setTimeoutShim } from './web.ts';

type Step =
  | ['wait', Record<string, string>, number?]
  | ['press', string, number?]
  | ['swipe', string]
  | ['touch', number, number, boolean]
  | ['sleep', number]
  | ['log', string];
type Config = { stats?: number; profile?: boolean; drive?: Step[] };

const dataset = () => (screenCanvas.current?.dataset ?? {}) as Record<string, string>;
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const sleep = (ms: number) => new Promise((r) => setTimeoutShim(r, ms));

/** Time spent in each WebGL and 2D canvas method, while "profile" is on. */
const profile = new Map<string, { calls: number; ms: number }>();
function installProfiler() {
  const g = globalThis as unknown as Record<string, { prototype: Record<string, unknown> }>;
  for (const cls of ['WebGL2RenderingContext', 'CanvasRenderingContext2D']) {
    const proto = g[cls].prototype;
    for (const key of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, key);
      if (!d || typeof d.value !== 'function' || key === 'constructor' || key.startsWith('_')) continue;
      const fn = d.value as (...a: unknown[]) => unknown;
      const entry = { calls: 0, ms: 0 };
      profile.set(`${cls === 'WebGL2RenderingContext' ? 'gl' : '2d'}.${key}`, entry);
      proto[key] = function (this: unknown, ...args: unknown[]) {
        const t = native.now();
        try { return fn.apply(this, args); } finally { entry.ms += native.now() - t; entry.calls++; }
      };
    }
  }
}
function takeProfile(frames: number) {
  const top = [...profile.entries()].filter(([, e]) => e.calls).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12)
    .map(([k, e]) => `${k} ${round(e.calls / frames, 1)}x ${round(e.ms / frames)}ms`);
  for (const e of profile.values()) { e.calls = 0; e.ms = 0; }
  return top;
}

function logStats(every: number, withProfile: boolean) {
  let lastDraws = commands();
  let last = { ...counters };
  setIntervalShim(() => {
    const stats = JSON.parse(native.query(Q.frameStats, every) as string) as { frames: number; intervalMs: { mean: number } };
    const frames = Math.max(1, stats.frames);
    const draws = commands();
    console.log(`stats ${JSON.stringify({
      ...stats, atMs: Math.round(native.now()), state: dataset(),
      fps: stats.intervalMs.mean ? round(1000 / stats.intervalMs.mean, 1) : 0,
      drawsPerFrame: Math.round((draws - lastDraws) / frames),
      perFrame: Object.fromEntries(Object.entries(counters).map(([k, v]) => [k, round((v - last[k as keyof typeof counters]) / frames, 1)])),
      ...(withProfile ? { profile: takeProfile(frames) } : {}),
    })}`);
    lastDraws = draws;
    last = { ...counters };
  }, every);
}

async function drive(steps: Step[]) {
  const t0 = performance.now();
  for (const step of steps) {
    switch (step[0]) {
      case 'press': native.input('press', step[1], step[2] ?? 100); await sleep((step[2] ?? 100) + 50); break;
      case 'swipe': native.input('swipe', step[1]); break;
      case 'touch': native.input('touch', step[1], step[2], step[3]); break;
      case 'sleep': await sleep(step[1]); break;
      case 'log': console.log(`drive: ${step[1]}`); break;
      case 'wait': {
        const [, want, timeout = 60000] = step;
        const start = performance.now();
        while (!Object.entries(want).every(([k, v]) => dataset()[k] === v)) {
          if (performance.now() - start > timeout) {
            console.warn(`drive: timed out waiting for ${JSON.stringify(want)}; state ${JSON.stringify(dataset())}`);
            return;
          }
          await sleep(100);
        }
        console.log(`drive: ${JSON.stringify(want)} after ${Math.round(performance.now() - t0)} ms`);
      }
    }
  }
  console.log('drive: done');
}

export function installHooks(config: Config) {
  if (config.profile) installProfiler();
  const ready = setIntervalShim(() => {
    if (dataset().ready !== 'true') return;
    clearTimer(ready);
    native.ready();
  }, 100);
  if (config.stats) logStats(config.stats * 1000, !!config.profile);
  if (config.drive) void drive(config.drive);
}
