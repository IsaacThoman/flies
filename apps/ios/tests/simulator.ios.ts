// Checks the iPhone and iPad app in a fresh iOS simulator: builds it with its tests (unless
// --no-build), creates and boots a simulator of its own, and runs them: the unit tests (the power
// policy, what the scheme handler serves, which links open a table) and the UI tests
// (tests/ui/AliveTests.swift, TablesTests.swift), which launch the app with the real web build and
// the real brain and drive it as a person would. For the tables it starts a room server here, on a
// port of its own, with a fake fly at each of two tables, and watches the app's fly from the room's
// side. Meanwhile it samples the memory of the app and the WebKit processes the page runs in.
// Prints what was measured, saves screenshots outside the repo, then shuts the simulator down and
// deletes it.
//
//   node apps/ios/tests/simulator.ios.ts [--no-build] [--device iPad-Pro-11-inch-M5-12GB] [--runtime iOS-27-0]
//
// The simulator runs the page's JavaScript on the Mac's cores and draws with its GPU, so this
// checks that the app works; its speeds are the Mac's, not a phone's.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { AWAY, tableCode } from '@fly/net';
import type { TableStart } from '@fly/net';
import { startServer as startRooms } from '../../server/src/server.ts';
import { BUNDLE_ID, derivedData } from '../../../scripts/ios.ts';
import { fakeFly } from '../../../scripts/tables.ts';

const root = path.join(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const runtime = option('--runtime', 'iOS-27-0');
const device = option('--device', 'iPhone-18-Pro');
const TIMEOUT_MS = 15 * 60_000;

function xcrun(...a: string[]) {
  const r = spawnSync('xcrun', a, { encoding: 'utf8' });
  if (r.status !== 0) throw Error(`xcrun ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** The largest footprint seen of the app and each of WebKit's processes in this simulator, MB. */
const peaks = new Map<string, number>();
function sampleMemory(udid: string) {
  const ps = spawnSync('ps', ['-Ao', 'pid=,ppid=,command='], { encoding: 'utf8' }).stdout.split('\n');
  const launchd = ps.find((l) => l.includes('launchd_sim') && l.includes(udid))?.trim().split(/\s+/)[0];
  if (!launchd) return;
  for (const line of ps) {
    const [pid, ppid] = line.trim().split(/\s+/);
    const name = /\/(Flies|com\.apple\.WebKit\.\w+)(\s|$)/.exec(line)?.[1];
    if (ppid !== launchd || !name) continue;
    const out = spawnSync('footprint', ['-p', pid], { encoding: 'utf8' }).stdout ?? '';
    const m = /phys_footprint:\s*([\d.]+)\s*(KB|MB|GB)/.exec(out);
    if (!m) continue;
    const mb = Number(m[1]) * (m[2] === 'GB' ? 1024 : m[2] === 'KB' ? 1 / 1024 : 1);
    peaks.set(name, Math.max(peaks.get(name) ?? 0, mb));
  }
}

if (!args.includes('--no-build')) {
  const r = spawnSync('node', ['scripts/ios.ts', 'build', '--sim', '--for-testing'], { cwd: root, stdio: 'inherit' });
  assert.equal(r.status, 0, 'build the app and its tests');
}

/**
 * What the room saw of the app's fly at a table, sampled every 100 ms: when its line was open, and
 * when it was resting there (its device said it had stopped, or went quiet). With `drop`, the room
 * drops its line 2 s into its first rest, as it does to a phone that iOS has suspended for longer
 * than the room waits for an answer (apps/server/src/server.ts, HEARTBEAT); the simulator keeps
 * WebKit's networking process, and so the line, alive while the app is suspended.
 */
type Watched = { connected: [number, number][]; resting: [number, number][]; dropped: boolean };
function watch(rooms: Awaited<ReturnType<typeof startRooms>>, table: string, fakes: Set<number>, drop = false): { seen: Watched; stop(): void } {
  const seen: Watched = { connected: [], resting: [], dropped: false };
  const open = { connected: -1, resting: -1 };
  const timer = setInterval(() => {
    const now = performance.now();
    const seat = [...(rooms.tables.get(table)?.seats.values() ?? [])].find((s) => !fakes.has(s.id));
    if (!seat) return;
    if (drop && !seen.dropped && open.resting >= 0 && now - open.resting > 2000 && seat.link) {
      seen.dropped = true;
      seat.link.close(1001, 'dropped by the check');
    }
    for (const [key, on] of [['connected', !!seat.link], ['resting', seat.away || !!(seat.flies[0].state.flags & AWAY)]] as const) {
      if (on && open[key] < 0) open[key] = now;
      if (!on && open[key] >= 0) {
        seen[key].push([open[key], now]);
        open[key] = -1;
      }
    }
  }, 100);
  return {
    seen,
    stop() {
      clearInterval(timer);
      const now = performance.now();
      for (const key of ['connected', 'resting'] as const) if (open[key] >= 0) seen[key].push([open[key], now]);
    },
  };
}

// A room server for the tables, and a fake fly starting each of two (scripts/tables.ts).
const joined: { table: string; player: number; returning: boolean }[] = [];
const rooms = await startRooms({ port: 0, dataDir: null, log: (_level, event, fields) => {
  if (event === 'joined') joined.push(fields as (typeof joined)[number]);
} });
const roomsUrl = `ws://127.0.0.1:${rooms.port}/rooms`;
const tables = [0, 1].map(() => tableCode((bytes) => crypto.getRandomValues(bytes)));
const start: TableStart = { place: 'picnic', light: 'noon', weather: 'clear', zone: 'UTC', offset: 0 };
const fakes = new Set<number>();
const fakeFlies = await Promise.all(tables.map((table, k) => fakeFly(roomsUrl, table, k, fakes, start)));
const watching = tables.map((table, i) => watch(rooms, table, fakes, i === 0));

const started = Date.now();
const udid = xcrun('simctl', 'create', 'flies-ios-check', `com.apple.CoreSimulator.SimDeviceType.${device}`, `com.apple.CoreSimulator.SimRuntime.${runtime}`);
console.log(`simulator ${udid} (${device}, ${runtime})`);
const evidence = mkdtempSync(path.join(tmpdir(), 'flies-ios-'));
const screenshot = path.join(evidence, 'simulator.png');
const tableScreenshot = path.join(evidence, 'table.png');
const output: string[] = [];
let sampler: ReturnType<typeof setInterval> | null = null;
try {
  xcrun('simctl', 'boot', udid);
  xcrun('simctl', 'bootstatus', udid, '-b');
  sampler = setInterval(() => sampleMemory(udid), 3000);
  const test = spawn('xcodebuild', [
    'test-without-building', '-project', 'apps/ios/Flies.xcodeproj', '-scheme', 'Flies', '-configuration', 'Debug',
    '-destination', `id=${udid}`, '-derivedDataPath', derivedData, '-resultBundlePath', path.join(evidence, 'result.xcresult'),
  ], { cwd: root, env: {
      ...process.env, TEST_RUNNER_FLY_SCREENSHOT: screenshot, TEST_RUNNER_FLY_TABLE_SCREENSHOT: tableScreenshot,
      TEST_RUNNER_FLY_ROOMS: roomsUrl, TEST_RUNNER_FLY_TABLE: tables[0], TEST_RUNNER_FLY_NEXT_TABLE: tables[1],
    }, stdio: ['ignore', 'pipe', 'pipe'] });
  const read = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      output.push(line);
      if (/^(Test Case|Test Suite|check(-tables)?:|\s*\S+\.swift:\d+: error)|error:|\*\* TEST/.test(line)) console.log(line.length > 400 ? `${line.slice(0, 400)}…` : line);
    }
  };
  test.stdout.on('data', read);
  test.stderr.on('data', read);
  const status = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => { test.kill(); reject(new Error('timed out')); }, TIMEOUT_MS);
    test.on('exit', (code) => { clearTimeout(timer); resolve(code); });
  });
  clearInterval(sampler);
  sampler = null;
  for (const w of watching) w.stop();
  // The last launch's own log, kept with the evidence, pass or fail.
  const container = xcrun('simctl', 'get_app_container', udid, BUNDLE_ID, 'data');
  const log = path.join(container, 'Library/Caches/report.log');
  if (existsSync(log)) copyFileSync(log, path.join(evidence, 'report.log'));
  assert.equal(status, 0, 'the tests passed (their failures are above)');

  const passed = output.filter((l) => /^Test Case .* passed/.test(l)).length;
  const check = output.map((l) => /check: (\{.*\})$/.exec(l)?.[1]).find(Boolean);
  assert.ok(check, 'the UI test reported its measurements');
  const m = JSON.parse(check) as { awakeS: number; fps: number; speed: number; brainLoad: number; spikesPerSecond: number; frameMs: number; engine: string };
  // At a table: the app's own account, and the room's.
  const atTable = output.map((l) => /check-tables: (\{.*\})$/.exec(l)?.[1]).find(Boolean);
  assert.ok(atTable, 'the tables test reported its measurements');
  const t = JSON.parse(atTable) as { joinS: number; player: number; colour: string; rejoinS: number; reconnectsAway: number; inviteS: number };
  const [first, second] = watching.map((w) => w.seen);
  const span = ([a, b]: [number, number]) => (b - a) / 1000;
  const longestRest = Math.max(0, ...first.resting.map(span));
  assert.ok(longestRest >= 6, `the room had the app's fly resting while it was away (${longestRest.toFixed(1)} s at most)`);
  const sat = joined.filter((j) => j.table === tables[0] && j.player === t.player);
  assert.ok(first.dropped, 'the room dropped its line while it was away');
  assert.equal(sat.filter((j) => !j.returning).length, 1, 'it sat down at the first table once');
  assert.ok(sat.some((j) => j.returning), 'and came back to its seat on a new line');
  assert.ok(t.reconnectsAway >= 1 && t.reconnectsAway >= first.connected.length - 1, `the game counted each new line (${first.connected.length} lines, ${t.reconnectsAway} reconnects)`);
  assert.ok(second.connected.length >= 1, 'the app sat down at the second table, from the link');

  // The last launch's own log (the tables test's, a relaunch): how soon it drew its first screen.
  const firstScreen = existsSync(log) ? /host: first screen at (\d+) ms/.exec(readFileSync(log, 'utf8'))?.[1] : undefined;

  console.log(`\nAll ${passed} tests passed in ${Math.round((Date.now() - started) / 1000)} s.`);
  console.log(`First launch: the brain awake and the title up ${m.awakeS.toFixed(1)} s after launch; the relaunch drew its first screen ${firstScreen ?? '?'} ms after the app started.`);
  console.log(`On the title: ${m.fps.toFixed(0)} fps, ${m.frameMs} ms JavaScript a frame; the brain (${m.engine}) at ${m.speed.toFixed(2)}x real time, ${m.spikesPerSecond} spikes a second, its steps taking ${(m.brainLoad * 100).toFixed(0)}% of the time they simulate (of one of this Mac's cores).`);
  console.log(`At a table: seated ${t.joinS.toFixed(1)} s after a cold launch by its link (player ${t.player}, ${t.colour}); away 10 s, the room had its fly resting for ${longestRest.toFixed(1)} s and dropped its line; back at the table in the same seat, ${t.reconnectsAway} reconnect later, ${t.rejoinS.toFixed(1)} s after it was in front again; a second table's link, handed to it while running, seated it there ${t.inviteS.toFixed(1)} s later. The room heard it sit down there ${sat.length} times.`);
  console.log(`Peak memory: ${[...peaks].map(([name, mb]) => `${name.replace('com.apple.WebKit.', 'WebKit ')} ${mb.toFixed(0)} MB`).join(', ') || 'not sampled'}.`);
  console.log(`Screenshots: ${[screenshot, tableScreenshot].filter(existsSync).join(', ') || 'none'}; test results and the app's log: ${evidence}`);
} finally {
  if (sampler) clearInterval(sampler);
  for (const w of watching) w.stop();
  for (const fake of fakeFlies) fake.close();
  await rooms.stop();
  spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'delete', udid], { stdio: 'ignore' });
}
