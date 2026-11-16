// Checks the Apple TV app in a tvOS simulator with its test scene (tests/scene.ts), the
// stand-in brain and the stand-in weather service: builds it (unless --no-build), boots a fresh
// simulator, launches the app with scripted remote input (the launch config's "drive"), and
// checks what the scene saw. Saves a screenshot outside the repo, then shuts the simulator down
// and deletes it.
//
// With --weatherkit it builds the real weather service instead (TVOS_WEATHERKIT=1), grants the
// app location and sets the simulator's, and checks the service locates, asks WeatherKit, and
// either answers or says plainly why not: unsigned, as simulator builds are, it can't have the
// entitlement, so "unauthorised" is the expected answer until a signed build has the capability.
//
//   node apps/tvos/tests/simulator.tvos.ts [--no-build] [--runtime tvOS-26-0] [--weatherkit]
//
// The simulator draws OpenGL ES in software, so this checks correctness, not speed.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, openSync, readSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { OutsideConditions, WeatherAttribution } from '@fly/contracts';
import { BUNDLE_ID, appPath } from '../../../scripts/tvos.ts';

const root = path.join(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const runtime = args.includes('--runtime') ? args[args.indexOf('--runtime') + 1] : 'tvOS-27-0';
const TIMEOUT_MS = 10 * 60_000;
const weatherkit = args.includes('--weatherkit');

const drive = [
  ['wait', { ready: 'true' }, 180_000],
  ['press', 'ArrowRight', 650],
  ['press', 'Enter', 100],
  ['swipe', 'ArrowUp'],
  ['touch', 0.5, -0.25, true],
  ['touch', 0.6, -0.2, true],
  ['touch', 0.6, -0.2, false],
  ['press', 'Escape', 100],
  // Play/Pause puts the scene at its root, so this Back press belongs to tvOS.
  ['press', 'MediaPlayPause', 100],
  ['sleep', 500],
  ['press', 'Escape', 100],
  ['wait', { brain: 'running' }, 180_000],
];

function xcrun(...a: string[]) {
  const r = spawnSync('xcrun', a, { encoding: 'utf8' });
  if (r.status !== 0) throw Error(`xcrun ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** The neuron and connection counts in the bundled connectome's header. */
function connectomeCounts() {
  const fd = openSync(path.join(root, 'packages/brain/data/connectome.bin'), 'r');
  const head = Buffer.alloc(4096);
  readSync(fd, head, 0, head.length, 0);
  closeSync(fd);
  const header = head.subarray(12).toString('utf8');
  const number = (key: string) => Number(new RegExp(`"${key}":(\\d+)`).exec(header)?.[1]);
  return { neurons: number('neurons'), connections: number('connections') };
}

type Report = {
  frames: number; keys: string[]; touches: number; lastTouch: { x: number; y: number; touching: boolean } | null;
  text: { width: number; inked: number } | null;
  readback: { ok: boolean; reads: number; meanMs: number; maxMs: number; frameMs: number; plainFrameMs: number } | null;
  readbackAsync: { ok: boolean; reads: number; meanMs: number; meanFrames: number; frameMs: number } | null;
  layers: { target: boolean; screen: boolean } | null;
  clipping: { renderer: string; wrong: number; pixels: number } | null;
  halfFloat: boolean | null;
  audio: { beeps: number; ended: number; decoded: { length: number; sampleRate: number } | null };
  storage: boolean | null; fetched: string | null;
  brain: { neurons?: number; connections?: number; facets?: number[]; rates?: string[]; states?: number; command?: Record<string, number>; maxSimMsAfterBurst?: number; rateCount?: number; lastRate?: number; error?: string } | null;
  weather: { error?: string; statuses: string[]; version: number; conditions: OutsideConditions | null; attribution: WeatherAttribution | null; failure: { status: string; error: string } | null; stopped: string | null } | null;
};
type Stats = { fps: number; jsMs: { mean: number }; execMs: { mean: number }; drawsPerFrame: number };
const complete = (r: Report) => !!(r.readbackAsync && r.audio.decoded && r.audio.ended && r.fetched && (r.brain?.states ?? 0) > 2 && (r.weather?.stopped || r.weather?.error));

if (!args.includes('--no-build')) {
  const r = spawnSync('node', ['scripts/tvos.ts', 'build', '--sim', '--test-scene', '--stand-in-brain', ...(weatherkit ? [] : ['--stand-in-weather'])], { cwd: root, stdio: 'inherit', env: { ...process.env, TVOS_WEATHERKIT: weatherkit ? '1' : '' } });
  assert.equal(r.status, 0, 'build the app');
}

const started = Date.now();
const udid = xcrun('simctl', 'create', 'apple-tv-fly-check', 'com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation-1080p', `com.apple.CoreSimulator.SimRuntime.${runtime}`);
console.log(`simulator ${udid} (${runtime})`);
const output: string[] = [];
let app: ReturnType<typeof spawn> | null = null;
try {
  xcrun('simctl', 'boot', udid);
  xcrun('simctl', 'bootstatus', udid, '-b');
  xcrun('simctl', 'install', udid, appPath(true));
  if (weatherkit) {
    // As if the owner had allowed it, somewhere with weather: tvOS would otherwise ask, and nobody is there to answer.
    xcrun('simctl', 'privacy', udid, 'grant', 'location', BUNDLE_ID);
    xcrun('simctl', 'location', udid, 'set', '51.5072,-0.1276');
  }
  const config = { script: 'game.js', url: 'http://fly.local/', fit: 'fill', pixelated: true, stats: 2, drive };
  app = spawn('xcrun', ['simctl', 'launch', '--console-pty', udid, BUNDLE_ID, '--config', JSON.stringify(config)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let latest: Report | null = null, lastStats: Stats | null = null, done = false;
  const handle = (line: string) => {
    if (!line.trim()) return;
    output.push(line);
    const m = /report (\{.*\})$/.exec(line);
    const stats = /stats (\{.*\})$/.exec(line);
    if (m) latest = JSON.parse(m[1]) as Report;
    else if (stats) lastStats = JSON.parse(stats[1]) as Stats;
    else console.log(line.length > 300 ? `${line.slice(0, 300)}…` : line);
    if (line.includes('drive: done')) done = true;
  };
  // A chunk can end partway through a line (the console's pseudo-terminal hands it over a
  // kilobyte or so at a time), so the rest of it waits for the next chunk.
  const reader = () => {
    let partial = '';
    return (chunk: Buffer) => {
      const lines = (partial + chunk.toString()).split(/\r?\n/);
      partial = lines.pop() ?? '';
      lines.forEach(handle);
    };
  };
  app.stdout?.on('data', reader());
  app.stderr?.on('data', reader());
  await new Promise<void>((resolve, reject) => {
    const poll = setInterval(() => {
      if (done && latest && complete(latest)) { clearInterval(poll); resolve(); }
      if (Date.now() - started > TIMEOUT_MS) { clearInterval(poll); reject(new Error(`timed out; last report ${JSON.stringify(latest)}`)); }
      if (output.some((l) => l.includes('drive: timed out'))) { clearInterval(poll); reject(new Error('the drive timed out')); }
    }, 500);
  });
  const shot = path.join(mkdtempSync(path.join(tmpdir(), 'apple-tv-fly-')), 'simulator.png');
  xcrun('simctl', 'io', udid, 'screenshot', shot);
  const r = latest as unknown as Report;
  console.log(`\nreport ${JSON.stringify(r, null, 2)}\n`);

  // The remote: a held button repeats after 400 ms then every 100 ms; Back at the root isn't the game's.
  const repeats = r.keys.filter((k) => k === 'ArrowRight+').length;
  assert.ok(repeats >= 2 && repeats <= 4, `ArrowRight held 650 ms repeated ${repeats} times (expected about 3)`);
  assert.deepEqual(r.keys.filter((k) => k !== 'ArrowRight+'), [
    'ArrowRight', 'ArrowRight^', 'Enter', 'Enter^', 'ArrowUp', 'ArrowUp^', 'Escape', 'Escape^', 'MediaPlayPause', 'MediaPlayPause^',
  ], 'the keys the scene saw');
  assert.ok(output.some((l) => l.includes('Back at the root goes to tvOS')), 'Back at the root went to tvOS');
  assert.equal(r.touches, 3, 'three remotetouch events');
  const t = r.lastTouch;
  assert.ok(t && Math.abs(t.x - 0.6) < 1e-6 && Math.abs(t.y + 0.2) < 1e-6 && !t.touching, `the finger lifted where it was: ${JSON.stringify(t)}`);
  // Text on a 2D canvas.
  assert.ok(r.text && r.text.width > 50 && r.text.inked > 100, `canvas text measured and drawn: ${JSON.stringify(r.text)}`);
  // The eye's readback, both ways.
  assert.ok(r.readback?.ok && r.readback.reads > 0, `readRenderTargetPixels: ${JSON.stringify(r.readback)}`);
  assert.ok(r.readbackAsync?.ok, `readRenderTargetPixelsAsync: ${JSON.stringify(r.readbackAsync)}`);
  // The game's two passes: the depth clear between them, on a render target and on the screen.
  assert.deepEqual(r.layers, { target: true, screen: true }, 'the table pass draws over the backdrop pass');
  assert.equal(r.halfFloat, true, 'an RGBA16F render target (reflections) renders and keeps values over 1');
  // Clipping is the GPU's. Apple's software renderer, which the simulator draws with, loses some
  // of the triangles it clips; any other renderer must get every pixel.
  const c = r.clipping;
  assert.ok(c && c.pixels > 0, 'the clipping check ran');
  const softwareClipping = /Apple Software Renderer/.test(c.renderer);
  if (!softwareClipping) assert.equal(c.wrong, 0, `clipping on ${c.renderer}: ${c.wrong} of ${c.pixels} table pixels wrong`);
  // Audio, storage, files.
  assert.equal(r.audio.beeps, 1, 'one beep');
  assert.equal(r.audio.ended, 1, 'the beep ended');
  assert.ok(r.audio.decoded && r.audio.decoded.length > 0, 'decodeAudioData');
  assert.equal(r.storage, true, 'localStorage');
  assert.equal(r.fetched, 'game.js', 'fetch of a bundled file');
  // The brain bridge, against the stand-in (tests/brain-stand-in/stand_in_brain.cpp).
  const b = r.brain ?? {};
  assert.equal(b.error, undefined, `brain error: ${b.error}`);
  assert.deepEqual({ neurons: b.neurons, connections: b.connections }, connectomeCounts(), 'the connectome arrived whole');
  assert.deepEqual(b.facets, [8, 8], 'eye facets');
  assert.deepEqual(b.rates, ['standin.ticks', 'standin.simulatedMs', 'standin.rate82'], 'rate names');
  assert.equal(b.rateCount, 83, 'as many rates as the real brain reports');
  assert.equal(b.lastRate, 82, 'the last rate arrived');
  assert.ok(Math.abs((b.command?.turn ?? 0) - 0.6) < 1e-3, `turn follows the light (right 0.8, left 0.2): ${b.command?.turn}`);
  assert.equal(b.command?.walk, 0.8, 'walk');
  assert.equal(b.command?.feed, 0.5, 'feed follows sweet');
  assert.equal(b.command?.escape, 0, 'grounded');
  assert.ok((b.maxSimMsAfterBurst ?? 0) > 0 && (b.maxSimMsAfterBurst ?? 0) <= 100, `a step simulates at most 100 ms: ${b.maxSimMsAfterBurst}`);
  // The weather bridge: only what the game needs crosses into JavaScript, and never where.
  const wx = r.weather;
  assert.ok(wx && !wx.error, `weather: ${wx?.error}`);
  assert.equal(wx.stopped, 'idle', 'stopped, it says so');
  const keys = ['cloudCover', 'condition', 'daylight', 'noon', 'observedAt', 'precipitation', 'source', 'sunrise', 'sunset', 'visibility', 'wind'];
  const outside = wx.conditions;
  if (weatherkit) {
    // The real service, unsigned: it must locate (a fix can come between two looks, but WeatherKit is only asked after one), ask WeatherKit, and answer or say why not.
    assert.ok(wx.statuses.includes('fetching'), `weather statuses ${wx.statuses.join(' > ')}`);
    if (outside) {
      assert.deepEqual(Object.keys(outside).sort(), keys, 'what crosses into JavaScript');
      assert.equal(outside.source, 'weatherkit');
      console.log(`WeatherKit answered: ${JSON.stringify(outside)}; attribution ${JSON.stringify(wx.attribution)}`);
    } else {
      assert.ok(wx.failure, 'an answer or a reason');
      console.log(`WeatherKit didn't answer: ${wx.failure.status} (${wx.failure.error}) after ${wx.statuses.join(' > ')}`);
      assert.equal(wx.failure.status, 'unauthorised', 'an unsigned build is refused for want of the capability, and says so');
    }
  } else {
    // Against the stand-in (tests/weather-stand-in/Service.swift).
    assert.ok(wx.statuses.includes('fetching') && wx.statuses.includes('ok'), `weather statuses ${wx.statuses.join(' > ')}`);
    assert.equal(wx.version, 1, 'one answer');
    assert.ok(outside, 'conditions');
    assert.deepEqual(Object.keys(outside).sort(), keys, 'what crosses into JavaScript');
    assert.deepEqual({ ...outside, observedAt: 0 }, { source: 'stand-in', observedAt: 0, cloudCover: 0.62, precipitation: 0.4, visibility: 2400, wind: 5.5, condition: 'drizzle', daylight: true, sunrise: 7.25, sunset: 16.75, noon: 12 }, 'the stand-in\'s conditions arrived as sent');
    const minutesOld = (Date.now() - outside.observedAt) / 60_000;
    assert.ok(minutesOld > 4 && minutesOld < 15, `observed ${minutesOld.toFixed(1)} min before`);
    assert.equal(wx.attribution?.service, 'Stand-in weather', 'the attribution');
  }

  if (softwareClipping) console.log(`Clipping: ${c.wrong} of ${c.pixels} table pixels wrong, as expected of ${c.renderer} (docs/apple-tv.md, "The simulator's renderer"); not checked here`);
  console.log(`All checks passed in ${Math.round((Date.now() - started) / 1000)} s (${r.frames} frames).`);
  console.log(`readPixels on a ${32}x${16} target (simulator, software GL): sync ${r.readback?.meanMs} ms mean, ${r.readback?.maxMs} ms max; ` +
    `frame ${r.readback?.frameMs} ms with it, ${r.readback?.plainFrameMs} ms without; async resolves in ${r.readbackAsync?.meanFrames} frames (${r.readbackAsync?.meanMs} ms), frame ${r.readbackAsync?.frameMs} ms`);
  const s = lastStats as Stats | null;
  assert.ok(s && s.fps > 0, 'the host logs frame stats');
  console.log(`Frame stats: ${s.fps} fps, ${s.jsMs.mean} ms JavaScript and ${s.execMs.mean} ms GL a frame, ${s.drawsPerFrame} draws`);
  console.log(`Screenshot: ${shot}`);
} finally {
  app?.kill();
  spawnSync('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'delete', udid], { stdio: 'ignore' });
}
