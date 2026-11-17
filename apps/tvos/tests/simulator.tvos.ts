// Checks the Apple TV app in a tvOS simulator with its test scene (tests/scene.ts), the
// stand-in brain and the stand-in weather service: builds it (unless --no-build), boots a fresh
// simulator, launches the app with scripted remote input (the launch config's "drive"), and
// checks what the scene saw, its socket against an echo server run here and its keyboard
// answered by the launch config. Then the real game: its readiness signal, and a table of eight
// in a room server run here (seven fake flies and the game, which joins by typing the table's
// code), what a frame costs there, and coming back after the room server restarts. Saves
// screenshots outside the repo, then shuts the simulator down and deletes it.
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
import { mkdtempSync, openSync, readSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import type { OutsideConditions, WeatherAttribution } from '@fly/contracts';
import { MAX_FLIES, tableCode } from '@fly/net';
import { startServer as startRooms } from '../../server/src/server.ts';
import type { RoomServer } from '../../server/src/server.ts';
import { BUNDLE_ID, appPath } from '../../../scripts/tvos.ts';
import { fakeFly } from '../../../scripts/tables.ts';
import type { FakeFly } from '../../../scripts/tables.ts';

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
  // Left asks twice; Down comes while the keyboard is up, so it is the keyboard's; Up after it.
  ['press', 'ArrowLeft', 100],
  ['sleep', 1000],
  ['press', 'ArrowDown', 100],
  ['wait', { keyboard: 'answered' }, 20_000],
  ['press', 'ArrowUp', 100],
  // Until the scene has reported the last key.
  ['sleep', 2500],
];
/** What the scene's keyboard is answered with, as if typed. */
const TYPED = 'k2m3n4p5q6';
/** The frame's budget on the Apple TV, as apps/web/e2e/play.e2e.ts and tables.e2e.ts hold it to. */
const MAX_CALLS = 150;

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
  storage: boolean | null; fetched: string | null;
  brain: { neurons?: number; connections?: number; facets?: number[]; rates?: string[]; states?: number; command?: Record<string, number>; maxSimMsAfterBurst?: number; rateCount?: number; lastRate?: number; error?: string } | null;
  weather: { error?: string; statuses: string[]; version: number; conditions: OutsideConditions | null; attribution: WeatherAttribution | null; failure: { status: string; error: string } | null; stopped: string | null } | null;
  socket: { error?: string; notASocket?: unknown[]; nowhere?: unknown[]; text?: string; bytes?: number[]; idleFrameUs?: number; tooBig?: unknown[]; forgotten?: boolean; fellBehind?: unknown[]; serverClosed?: unknown[] } | null;
  keyboard: { answers: (string | null)[]; framesWhileUp: number } | null;
};
type Stats = { fps: number; frames: number; jsMs: { mean: number; p95: number }; execMs: { mean: number }; drawsPerFrame: number; memMB: number; state: Record<string, string> };
const complete = (r: Report) => !!(r.readbackAsync && r.fetched && (r.brain?.states ?? 0) > 2 && (r.weather?.stopped || r.weather?.error) &&
  (r.socket?.serverClosed || r.socket?.error) && r.keyboard?.answers.length === 2);

/**
 * A WebSocket server for the scene's socket checks: it echoes what it is sent, and answers "big"
 * with more bytes than the game's buffer holds, "flood" with more messages than a line keeps
 * waiting, and "bye" with some last words and a close of its own.
 */
async function echoServer() {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => wss.once('listening', resolve));
  wss.on('connection', (ws) => ws.on('message', (data, binary) => {
    const said = binary ? '' : data.toString();
    if (said === 'big') ws.send(new Uint8Array(70_000));
    else if (said === 'flood') for (let i = 0; i < 300; i++) ws.send(`flood ${i}`);
    else if (said === 'bye') {
      ws.send('last words');
      ws.close(4321, 'server says');
    } else ws.send(data, { binary });
  }));
  return { url: `ws://127.0.0.1:${(wss.address() as { port: number }).port}/`, close: () => new Promise((resolve) => wss.close(resolve)) };
}

if (!args.includes('--no-build')) {
  // Its room servers are on this Mac, over plain ws://.
  const r = spawnSync('node', ['scripts/tvos.ts', 'build', '--sim', '--test-scene', '--stand-in-brain', '--local-rooms', ...(weatherkit ? [] : ['--stand-in-weather'])], { cwd: root, stdio: 'inherit', env: { ...process.env, TVOS_WEATHERKIT: weatherkit ? '1' : '' } });
  assert.equal(r.status, 0, 'build the app');
}

const started = Date.now();
const udid = xcrun('simctl', 'create', 'flies-check', 'com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation-1080p', `com.apple.CoreSimulator.SimRuntime.${runtime}`);
console.log(`simulator ${udid} (${runtime})`);
const output: string[] = [];
let app: ReturnType<typeof spawn> | null = null;
const echo = await echoServer();
const dataDir = mkdtempSync(path.join(tmpdir(), 'flies-rooms-'));
let rooms: RoomServer | null = null;
const fakeFlies: FakeFly[] = [];
const shots = mkdtempSync(path.join(tmpdir(), 'flies-'));
try {
  xcrun('simctl', 'boot', udid);
  xcrun('simctl', 'bootstatus', udid, '-b');
  xcrun('simctl', 'install', udid, appPath(true));
  if (weatherkit) {
    // As if the owner had allowed it, somewhere with weather: tvOS would otherwise ask, and nobody is there to answer.
    xcrun('simctl', 'privacy', udid, 'grant', 'location', BUNDLE_ID);
    xcrun('simctl', 'location', udid, 'set', '51.5072,-0.1276');
  }
  // The test scene reads back through the device's deferred path (docs/apple-tv.md, "Reading pixels back"), which the simulator otherwise leaves off.
  const config = { script: 'game.js', url: `http://fly.local/?echo=${echo.url}&alone`, fit: 'fill', pixelated: true, stats: 2, drive, typed: [TYPED], deferReads: true };
  app = spawn('xcrun', ['simctl', 'launch', '--console-pty', udid, BUNDLE_ID, '--config', JSON.stringify(config)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let latest: Report | null = null, lastStats: Stats | null = null, done = false;
  const allStats: Stats[] = [];
  const handle = (line: string) => {
    if (!line.trim()) return;
    output.push(line);
    const m = /report (\{.*\})$/.exec(line);
    const stats = /stats (\{.*\})$/.exec(line);
    if (m) latest = JSON.parse(m[1]) as Report;
    else if (stats) {
      const s = JSON.parse(stats[1]) as Stats;
      allStats.push((lastStats = s));
      // In a room, a line a window: how the frame and the room are doing.
      if (s.state.online) console.log(`  ${s.fps} fps, JavaScript ${s.jsMs.mean} ms (p95 ${s.jsMs.p95}), ${s.state.calls} draws; ${s.state.online}, ${s.state.screen}; others ${s.state.others}`);
    }
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
  const waitUntil = (complete: () => boolean) => new Promise<void>((resolve, reject) => {
    const waiting = Date.now();
    const poll = setInterval(() => {
      if (complete()) { clearInterval(poll); resolve(); }
      if (Date.now() - waiting > TIMEOUT_MS) { clearInterval(poll); reject(new Error(`timed out; last report ${JSON.stringify(latest)}`)); }
      if (output.some((l) => l.includes('drive: timed out'))) { clearInterval(poll); reject(new Error('the drive timed out')); }
    }, 500);
  });
  await waitUntil(() => !!(done && latest && complete(latest)));
  const shot = path.join(shots, 'simulator.png');
  xcrun('simctl', 'io', udid, 'screenshot', shot);
  const r = latest as unknown as Report;
  console.log(`\nreport ${JSON.stringify(r, null, 2)}\n`);

  // The remote: a held button repeats after 400 ms then every 100 ms; Back at the root isn't the game's.
  const repeats = r.keys.filter((k) => k === 'ArrowRight+').length;
  assert.ok(repeats >= 2 && repeats <= 4, `ArrowRight held 650 ms repeated ${repeats} times (expected about 3)`);
  assert.deepEqual(r.keys.filter((k) => k !== 'ArrowRight+'), [
    'ArrowRight', 'ArrowRight^', 'Enter', 'Enter^', 'ArrowUp', 'ArrowUp^', 'Escape', 'Escape^', 'MediaPlayPause', 'MediaPlayPause^',
    // Left let go as the keyboard came up; Down went to the keyboard; Up came after it.
    'ArrowLeft', 'ArrowLeft^', 'ArrowUp', 'ArrowUp^',
  ], 'the keys the scene saw');
  assert.ok(output.some((l) => l.includes('input: ArrowDown goes to the keyboard, not the game')), 'a press while the keyboard was up went to it');
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
  // Storage and files.
  assert.equal(r.storage, true, 'localStorage');
  assert.equal(r.fetched, 'game.js', 'fetch of a bundled file');
  // The brain bridge, against the stand-in (tests/brain-stand-in/stand_in_brain.cpp).
  const b = r.brain ?? {};
  assert.equal(b.error, undefined, `brain error: ${b.error}`);
  assert.deepEqual({ neurons: b.neurons, connections: b.connections }, connectomeCounts(), 'the connectome arrived whole');
  assert.deepEqual(b.facets, [8, 8], 'eye facets');
  assert.deepEqual(b.rates, ['standin.ticks', 'standin.simulatedMs', 'standin.rate83'], 'rate names');
  assert.equal(b.rateCount, 84, 'as many rates as the real brain reports');
  assert.equal(b.lastRate, 83, 'the last rate arrived');
  assert.ok(Math.abs((b.command?.turn ?? 0) - 0.6) < 1e-3, `turn follows the light (right 0.8, left 0.2): ${b.command?.turn}`);
  assert.equal(b.command?.walk, 0.8, 'walk');
  assert.equal(b.command?.feed, 0.5, 'feed follows sweet');
  assert.equal(b.command?.sing, 0.25, 'sing follows the taste of a male, the last sense');
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

  // The keyboard: the first question answered with null by the second, which is answered as typed; frames went on meanwhile.
  const k = r.keyboard;
  assert.deepEqual(k?.answers, [null, TYPED], 'the keyboard\'s answers');
  assert.ok((k?.framesWhileUp ?? 0) > 30, `frames went on while the keyboard was up: ${k?.framesWhileUp}`);
  // The socket, against the echo server.
  const sk = r.socket ?? {};
  assert.equal(sk.error, undefined, `socket: ${sk.error}`);
  assert.deepEqual(sk.notASocket, [2, 1006, ''], 'a URL that is no WebSocket\'s gives a line already closed, as a browser\'s fails');
  assert.deepEqual(sk.nowhere, [1006, ''], 'a line that can\'t connect closes with 1006 and no reason');
  assert.equal(sk.text, 'hello', 'a text both ways');
  assert.deepEqual(sk.bytes, [4, 1, 2, 3, 250], 'the bytes of a view both ways, copied into the game\'s buffer');
  assert.deepEqual(sk.tooBig, [1009, ''], 'a message bigger than the game\'s buffer closes the line');
  assert.equal(sk.forgotten, true, 'a line the game closed is forgotten');
  assert.deepEqual(sk.fellBehind, [1000, 'line fell behind', 0], 'a line too far behind closes, its backlog dropped');
  assert.deepEqual(sk.serverClosed, ['last words', 4321, 'server says'], 'what came before the server\'s close, then its code and reason');
  if (softwareClipping) console.log(`Clipping: ${c.wrong} of ${c.pixels} table pixels wrong, as expected of ${c.renderer} (docs/apple-tv.md, "The simulator's renderer"); not checked here`);
  console.log(`All checks passed in ${Math.round((Date.now() - started) / 1000)} s (${r.frames} frames).`);
  console.log(`readPixels on a ${32}x${16} target (simulator, software GL): sync ${r.readback?.meanMs} ms mean, ${r.readback?.maxMs} ms max; ` +
    `frame ${r.readback?.frameMs} ms with it, ${r.readback?.plainFrameMs} ms without; async resolves in ${r.readbackAsync?.meanFrames} frames (${r.readbackAsync?.meanMs} ms), frame ${r.readbackAsync?.frameMs} ms`);
  const s = lastStats as Stats | null;
  assert.ok(s && s.fps > 0, 'the host logs frame stats');
  console.log(`Frame stats: ${s.fps} fps, ${s.jsMs.mean} ms JavaScript and ${s.execMs.mean} ms GL a frame, ${s.drawsPerFrame} draws`);
  console.log(`The socket bridge: a frame with nothing new costs ${sk.idleFrameUs} µs of native calls`);
  console.log(`Screenshot: ${shot}`);

  app.kill();
  output.length = 0;
  allStats.length = 0;
  done = false;

  // The real game in a room of eight: a room server here (keeping its rooms, so they outlast its
  // restart), seven fake flies in an unlisted room one of them started at midday in clear weather,
  // and the game, which joins from Online by typing the room's code into the Code field on tvOS's
  // keyboard (as a player might, in capitals).
  rooms = await startRooms({ port: 0, dataDir, log: () => {} });
  const port = rooms.port;
  const roomsUrl = `ws://127.0.0.1:${port}/rooms`;
  const code = tableCode((bytes) => crypto.getRandomValues(bytes));
  const start = { place: 'picnic', light: 'noon', weather: 'clear', zone: 'UTC', offset: 0, name: 'Check', listed: false };
  const fakes = new Set<number>();
  for (let k = 0; k < MAX_FLIES - 1; k++) fakeFlies.push(await fakeFly(roomsUrl, code, k, fakes, k === 0 ? start : undefined));
  const press = (key: string) => ['press', key, 100];
  const gameDrive = [
    ['wait', { ready: 'true', brain: 'running', screen: 'title' }, 180_000],
    // A step at a time, each seen to land: the simulator's software renderer can be slow enough
    // that the title is already the wallpaper, and that presses close together share a frame.
    // Left wakes it and does nothing more on the title, whose Up and Down wrap round.
    press('ArrowLeft'),
    ['wait', { wallpaper: 'false', focus: 'play' }, 60_000],
    // Exercise the title's Play action itself; Play/Pause later bypasses menu navigation.
    press('Enter'),
    ['wait', { screen: 'play', wallpaper: 'false' }, 60_000],
    press('Escape'),
    ['wait', { screen: 'title', focus: 'play', wallpaper: 'false' }, 60_000],
    ...['watch', 'settings'].flatMap((focus) => [press('ArrowDown'), ['wait', { focus }, 60_000]]),
    // Two flies, the second a brain of its own from the host's spawn(), on a thread of its own.
    press('Enter'),
    ['wait', { screen: 'settings', tab: 'wallpaper', focus: 'page' }, 60_000],
    ...['wallpaperAfter', 'wallpaperCamera', 'place', 'flies'].flatMap((focus) => [press('ArrowDown'), ['wait', { focus }, 60_000]]),
    press('ArrowRight'),
    ['wait', { flies: '2' }, 180_000],
    ['sleep', 6000],
    ['log', 'two flies'],
    press('Escape'),
    ['wait', { screen: 'title', focus: 'settings' }, 60_000],
    press('ArrowDown'),
    ['wait', { focus: 'online' }, 60_000],
    press('Enter'),
    ['wait', { screen: 'online', focus: 'new' }, 60_000],
    press('ArrowDown'),
    ['wait', { focus: 'code' }, 60_000],
    press('Enter'),
    ['wait', { screen: 'online', onlineView: 'room', online: 'joined' }, 60_000],
    // Time to photograph the table's code.
    ['sleep', 5000],
    press('MediaPlayPause'),
    ['wait', { screen: 'play' }, 60_000],
    ['log', 'playing in the room'],
  ];
  // The real game reads as the simulator does by default, at once.
  const gameConfig = { ...config, deferReads: false, script: 'real-game.js', url: `http://fly.local/?rooms=${roomsUrl}&alone`, typed: [code.toUpperCase()], drive: gameDrive };
  app = spawn('xcrun', ['simctl', 'launch', '--console-pty', '--terminate-running-process', udid, BUNDLE_ID, '--config', JSON.stringify(gameConfig)], { stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout?.on('data', reader());
  app.stderr?.on('data', reader());
  const state = () => lastStats?.state ?? {};
  // Each other fly there (drawn), and whether it is resting. The simulator's renderer can stall the
  // frame for seconds; what arrived meanwhile is taken as heard at the frame before, so the others
  // may read as resting just after one. A TV that keeps its frame rate never stalls so.
  const others = (st: Record<string, string>) => (st.others ?? '').split(';').filter(Boolean).map((o) => o.split(':'));
  const there = (st: Record<string, string>) => others(st).filter((o) => o[1] === '1').length;
  const resting = (st: Record<string, string>) => others(st).filter((o) => o[2] === '1').length;
  await waitUntil(() => state().onlineView === 'room' && state().online === 'joined');
  assert.ok(output.some((l) => l.includes('drive: {"ready":"true"')), 'the real game publishes readiness without the test scene');
  const room = path.join(shots, 'room.png');
  xcrun('simctl', 'io', udid, 'screenshot', room);
  console.log(`Joined the room by its code; its QR code and code: ${room}`);

  // Alone it lived two flies, the other's brain native and running; the room had one seat left, so it brought one.
  const two = allStats.find((w) => w.state.flies === '2' && /:running:/.test(w.state.company ?? ''));
  assert.ok(two, `a second fly with a running brain of its own: ${JSON.stringify(allStats.map((w) => w.state.company))}`);
  console.log(`Two flies alone, the second's brain native: ${two.state.company}`);

  // Ten seconds in play with the seven others walking round the game's fly: the frame's cost.
  await waitUntil(() => output.some((l) => l.includes('drive: playing in the room')) && there(state()) === MAX_FLIES - 1);
  assert.equal(state().flies, '1', 'one seat left at the table: it brings one of its two flies');
  assert.equal((state().mine ?? '').split(';').filter(Boolean).length, 1);
  const player = state().player;
  const from = allStats.length;
  await waitUntil(() => allStats.length >= from + 5);
  const windows = allStats.slice(from, from + 5);
  // A stall long enough for more than a line keeps to arrive closes it ("line fell behind") and it
  // opens again, as a browser's does: in the room, every other fly is there.
  const joined = windows.filter((w) => w.state.online === 'joined');
  assert.ok(joined.length > 0, 'in the room');
  for (const w of joined) assert.equal(there(w.state), MAX_FLIES - 1, `all ${MAX_FLIES - 1} others there: ${w.state.others}`);
  await waitUntil(() => state().online === 'joined');
  const drawn = windows.filter((w) => w.frames > 0);
  const calls = Math.max(...windows.map((w) => Number(w.state.calls)));
  const frames = drawn.reduce((sum, w) => sum + w.frames, 0);
  assert.ok(frames > 0, 'frames drawn in the room');
  // The host's draws a frame over the five windows together. A window counts the draws made in it
  // but only the frames that began in it, so one that a starved simulator presented no frame in
  // holds a long frame's draws over none (the host's figure divides by one).
  const draws = Math.round(windows.reduce((sum, w) => sum + w.drawsPerFrame * Math.max(1, w.frames), 0) / frames);
  const jsMean = drawn.reduce((sum, w) => sum + w.jsMs.mean * w.frames, 0) / Math.max(1, frames);
  const jsP95 = Math.max(...drawn.map((w) => w.jsMs.p95));
  const restingAtWorst = Math.max(...windows.map((w) => resting(w.state)));
  assert.ok(calls > 0 && calls < MAX_CALLS && draws < MAX_CALLS, `a frame in a room of eight: ${calls} draws by the game's count, ${draws} by the host's`);
  const playing = path.join(shots, 'playing.png');
  xcrun('simctl', 'io', udid, 'screenshot', playing);
  console.log(`In a room of ${MAX_FLIES} (simulator, software GL): at most ${calls} draws a frame by the game's count (${draws} by the host's, budget ${MAX_CALLS}); ` +
    `JavaScript ${jsMean.toFixed(2)} ms a frame on average over ${frames} frames in 10 s, ${jsP95} ms p95 at worst; at most ${restingAtWorst} of the others read as resting after a stall; in the room ${joined.length} of ${windows.length} windows; ` +
    `${windows[windows.length - 1].memMB} MB. Screenshot: ${playing}`);

  // The room server restarts (as a deploy does): the game's line drops and fails while it is down, then it is back in its seat.
  await rooms.stop();
  rooms = null;
  await waitUntil(() => state().online === 'lost');
  for (let tries = 0; !rooms; tries++) {
    try {
      rooms = await startRooms({ port, dataDir, log: () => {} });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || tries >= 40) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  await waitUntil(() => state().online === 'joined' && Number(state().reconnects) > 0);
  assert.equal(state().player, player, 'back in its own seat');
  console.log(`The room server restarted: the game was back in the room after ${state().reconnects} tries, in its own seat.`);
} finally {
  app?.kill();
  for (const fake of fakeFlies) fake.close();
  await rooms?.stop();
  await echo.close();
  rmSync(dataDir, { recursive: true, force: true });
  spawnSync('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'delete', udid], { stdio: 'ignore' });
}
