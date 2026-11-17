// Builds the iPhone and iPad app (apps/ios/) and runs it in an iOS simulator or on a device.
// See docs/ios.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { archive, ARCHIVE_USAGE, archiveOptions } from './apple.ts';
import { writeIosAssetCatalog } from './iosAssets.ts';
import { BUNDLE_ID as TVOS_BUNDLE_ID, TEAM_ID as TVOS_TEAM_ID } from './tvos.ts';

const root = path.join(import.meta.dirname, '..');
const appDir = path.join(root, 'apps/ios');
const www = path.join(appDir, 'www');
// The Apple TV app's, unless told otherwise: the two are one app in the App Store (universal purchase).
export const BUNDLE_ID = process.env.IOS_BUNDLE_ID || TVOS_BUNDLE_ID;
const TEAM_ID = process.env.IOS_TEAM_ID || TVOS_TEAM_ID;
const CONNECTOME = path.join(root, 'packages/brain/data/connectome.bin');
/** Table links open the app, and AutoFill offers the site's passwords: off unless the App ID has Associated Domains (docs/ios.md). */
const LINKS = /^(1|true|yes|on)$/i.test(process.env.IOS_LINKS ?? '');

const USAGE = `Usage: npm run ios -- [<command>] [options]

  (no command) [--sim <udid>] [--report <seconds>] [--rooms <url>]
        build for the simulator, then run it in the given simulator, or the one iOS simulator
        that is booted
  build [--sim] [--debug] [--for-testing] [--no-sign]
        build the web app (apps/web) with the brain into apps/ios/www/, generate the Xcode
        project and build the app for an iPhone or iPad (or, with --sim, the iOS simulator).
        --for-testing (implies --debug) also builds the tests that npm run ios:check runs
        --no-sign compiles for the simulator without signing, for CI; cannot run tests
  run (--sim <udid> | --device <udid>) [--debug] [--report <seconds>] [--rooms <url>]
        install the built app and launch it, printing its console. --report prints the game's
        state that often (docs/ios.md, "Reports"); --rooms points its tables at another room
        server, such as ws://127.0.0.1:8787/rooms (npm run rooms)
  archive --version <x.y.z> [--build-number <n>] [--upload]
        build the web app as build does and archive the app for the App Store (see Archive
        options and docs/release.md)

Signing uses IOS_TEAM_ID and IOS_BUNDLE_ID, which default to the Apple TV app's
(TVOS_TEAM_ID, TVOS_BUNDLE_ID: now ${TEAM_ID} and ${BUNDLE_ID}). IOS_LINKS=1 builds in universal
links and the site's passwords (the Associated Domains entitlement), which signing for a device
needs the App ID to have the capability for first: see docs/ios.md, "Universal links".
ROOMS_URL=<url> builds in another room server than the site's.

${ARCHIVE_USAGE}`;

function run(command: string, args: string[], cwd = root, env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} ${args.slice(0, 3).join(' ')} failed (exit ${result.status})`);
}

type BuildOptions = { sim: boolean; debug: boolean; forTesting: boolean; noSign?: boolean };

/** Builds www/ and generates the Xcode project; returns xcodebuild's environment. */
function prepare() {
  if (!existsSync(CONNECTOME)) throw Error(`The connectome isn't there (${path.relative(root, CONNECTOME)}): npm run brain:fetch`);
  if (spawnSync('xcodegen', ['--version']).error) throw Error('XcodeGen is needed to generate the Xcode project: brew install xcodegen');
  writeIosAssetCatalog(path.join(root, 'assets/ios'), path.join(appDir, 'src/generated/Assets.xcassets'));
  rmSync(www, { recursive: true, force: true });
  // The web build as a browser gets it, the brain's parts included (vite.config.ts, docs/web.md).
  run('npx', ['vite', 'build', '--outDir', www, '--emptyOutDir', '--logLevel', 'warn']);
  const brain = path.join(www, 'brain');
  if (!existsSync(brain) || !readdirSync(brain).some((f) => f.startsWith('connectome.'))) throw Error('The web build has no brain in it');
  const env = { ...process.env, IOS_TEAM_ID: TEAM_ID, IOS_BUNDLE_ID: BUNDLE_ID, IOS_LINKS: String(LINKS) };
  run('xcodegen', ['generate', '--quiet'], appDir, env);
  return env;
}

const configuration = (debug: boolean) => (debug ? 'Debug' : 'Release');
export const derivedData = path.join(appDir, 'build');
export const appPath = (sim: boolean, debug = false) =>
  path.join(derivedData, `Build/Products/${configuration(debug)}-${sim ? 'iphonesimulator' : 'iphoneos'}/Flies.app`);

export function build(options: BuildOptions) {
  if (options.noSign && (!options.sim || options.forTesting)) throw Error('--no-sign requires --sim and cannot be used with --for-testing');
  const env = prepare();
  const debug = options.debug || options.forTesting;
  run('xcodebuild', [
    '-project', 'Flies.xcodeproj', '-scheme', 'Flies', '-configuration', configuration(debug),
    '-destination', options.sim ? 'generic/platform=iOS Simulator' : 'generic/platform=iOS', '-derivedDataPath', derivedData,
    // Signed to run locally in the simulator, as test runners must be.
    ...(options.sim ? [...(options.noSign ? ['CODE_SIGNING_ALLOWED=NO'] : ['CODE_SIGN_IDENTITY=-', 'CODE_SIGN_STYLE=Manual']), 'DEVELOPMENT_TEAM=', 'ARCHS=arm64'] : ['-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration']),
    '-quiet', options.forTesting ? 'build-for-testing' : 'build',
  ], appDir, env);
  console.log(`Built ${path.relative(root, appPath(options.sim, debug))}${options.forTesting ? ' and its tests' : ''}${LINKS ? ' with universal links' : ''}`);
}

function launch(target: { sim?: string; device?: string }, debug: boolean, report: string | undefined, rooms: string | undefined) {
  const args = [...(report ? ['-FlyReport', report] : []), ...(rooms ? ['-FlyRooms', rooms] : [])];
  if (target.sim) {
    // Already booted is fine.
    spawnSync('xcrun', ['simctl', 'boot', target.sim], { stdio: 'ignore' });
    run('xcrun', ['simctl', 'install', target.sim, appPath(true, debug)]);
    run('xcrun', ['simctl', 'launch', '--console-pty', '--terminate-running-process', target.sim, BUNDLE_ID, ...args]);
  } else {
    const device = target.device ?? '';
    run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device, '--quiet', appPath(false, debug)]);
    run('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', device, '--terminate-existing', '--console', BUNDLE_ID, ...args]);
  }
}

/** The one booted iOS simulator, for running without --sim. */
function bootedSimulator(): string {
  const list = spawnSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], { encoding: 'utf8' });
  const devices = Object.entries(JSON.parse(list.stdout).devices as Record<string, { udid: string; name: string }[]>)
    .filter(([runtime]) => runtime.includes('.iOS-')).flatMap(([, d]) => d);
  if (devices.length === 1) return devices[0].udid;
  throw Error(devices.length
    ? `More than one iOS simulator is booted (${devices.map((d) => `${d.name} ${d.udid}`).join(', ')}): choose one with --sim <udid>`
    : 'No iOS simulator is booted: boot one (xcrun simctl boot <udid>) or choose one with --sim <udid>');
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1] ?? ''; };
  const has = (name: string) => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
  const cmd = args[0]?.startsWith('--') ? undefined : args.shift();
  if (cmd === 'help' || has('--help')) return console.log(USAGE);
  if (!cmd) {
    const sim = flag('--sim') ?? bootedSimulator();
    const report = flag('--report'), rooms = flag('--rooms');
    build({ sim: true, debug: false, forTesting: false });
    return launch({ sim }, false, report, rooms);
  }
  if (cmd === 'build') return build({ sim: has('--sim'), debug: has('--debug'), forTesting: has('--for-testing'), noSign: has('--no-sign') });
  if (cmd === 'archive') {
    // A release reaches the site's room server; ROOMS_URL is for development builds.
    if (process.env.ROOMS_URL) throw Error('An archive is a release: unset ROOMS_URL, which points a development build at another room server.');
    const options = archiveOptions(flag('--version'), flag('--build-number'), has('--upload'));
    return archive({ appDir, platform: 'iOS', teamId: TEAM_ID, env: prepare() }, options);
  }
  if (cmd === 'run') {
    const sim = flag('--sim'), device = flag('--device'), report = flag('--report'), rooms = flag('--rooms');
    if (!sim && !device) throw Error('run needs --sim <udid> or --device <udid>');
    return launch({ sim, device }, has('--debug'), report, rooms);
  }
  throw Error(`Unknown command ${cmd}\n\n${USAGE}`);
}

if (import.meta.main) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
