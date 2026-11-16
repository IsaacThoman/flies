// Checks the iPhone and iPad app in a fresh iOS simulator: builds it with its tests (unless
// --no-build), creates and boots a simulator of its own, and runs them: the unit tests (the power
// policy, what the scheme handler serves) and the UI test (tests/ui/AliveTests.swift), which
// launches the app with the real web build and the real brain and drives it as a person would.
// Meanwhile it samples the memory of the app and the WebKit processes the page runs in. Prints what
// was measured, saves a screenshot outside the repo, then shuts the simulator down and deletes it.
//
//   node apps/ios/tests/simulator.ios.ts [--no-build] [--device iPad-Pro-11-inch-M5-12GB] [--runtime iOS-27-0]
//
// The simulator runs the page's JavaScript on the Mac's cores and draws with its GPU, so this
// checks that the app works; its speeds are the Mac's, not a phone's.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BUNDLE_ID, derivedData } from '../../../scripts/ios.ts';

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
    const name = /\/(AppleTVFly|com\.apple\.WebKit\.\w+)(\s|$)/.exec(line)?.[1];
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

const started = Date.now();
const udid = xcrun('simctl', 'create', 'apple-tv-fly-ios-check', `com.apple.CoreSimulator.SimDeviceType.${device}`, `com.apple.CoreSimulator.SimRuntime.${runtime}`);
console.log(`simulator ${udid} (${device}, ${runtime})`);
const evidence = mkdtempSync(path.join(tmpdir(), 'apple-tv-fly-ios-'));
const screenshot = path.join(evidence, 'simulator.png');
const output: string[] = [];
let sampler: ReturnType<typeof setInterval> | null = null;
try {
  xcrun('simctl', 'boot', udid);
  xcrun('simctl', 'bootstatus', udid, '-b');
  sampler = setInterval(() => sampleMemory(udid), 3000);
  const test = spawn('xcodebuild', [
    'test-without-building', '-project', 'apps/ios/AppleTVFlyiOS.xcodeproj', '-scheme', 'AppleTVFly', '-configuration', 'Debug',
    '-destination', `id=${udid}`, '-derivedDataPath', derivedData, '-resultBundlePath', path.join(evidence, 'result.xcresult'),
  ], { cwd: root, env: { ...process.env, TEST_RUNNER_FLY_SCREENSHOT: screenshot }, stdio: ['ignore', 'pipe', 'pipe'] });
  const read = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      output.push(line);
      if (/^(Test Case|Test Suite|check:|\s*\S+\.swift:\d+: error)|error:|\*\* TEST/.test(line)) console.log(line.length > 400 ? `${line.slice(0, 400)}…` : line);
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
  assert.equal(status, 0, 'the tests passed (their failures are above)');

  const passed = output.filter((l) => /^Test Case .* passed/.test(l)).length;
  const check = output.map((l) => /check: (\{.*\})$/.exec(l)?.[1]).find(Boolean);
  assert.ok(check, 'the UI test reported its measurements');
  const m = JSON.parse(check) as { awakeS: number; fps: number; speed: number; brainLoad: number; spikesPerSecond: number; frameMs: number };
  // The relaunch's own log: how soon it drew its first screen.
  const container = xcrun('simctl', 'get_app_container', udid, BUNDLE_ID, 'data');
  const log = path.join(container, 'Library/Caches/report.log');
  const firstScreen = existsSync(log) ? /host: first screen at (\d+) ms/.exec(readFileSync(log, 'utf8'))?.[1] : undefined;

  console.log(`\nAll ${passed} tests passed in ${Math.round((Date.now() - started) / 1000)} s.`);
  console.log(`First launch: the brain awake and the title up ${m.awakeS.toFixed(1)} s after launch; the relaunch drew its first screen ${firstScreen ?? '?'} ms after the app started.`);
  console.log(`On the title: ${m.fps.toFixed(0)} fps, ${m.frameMs} ms JavaScript a frame; the brain at ${m.speed.toFixed(2)}x real time, ${m.spikesPerSecond} spikes a second, its steps taking ${(m.brainLoad * 100).toFixed(0)}% of the time they simulate (of one of this Mac's cores).`);
  console.log(`Peak memory: ${[...peaks].map(([name, mb]) => `${name.replace('com.apple.WebKit.', 'WebKit ')} ${mb.toFixed(0)} MB`).join(', ') || 'not sampled'}.`);
  console.log(`Screenshot: ${existsSync(screenshot) ? screenshot : 'none'}; test results: ${path.join(evidence, 'result.xcresult')}`);
} finally {
  if (sampler) clearInterval(sampler);
  spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'delete', udid], { stdio: 'ignore' });
}
