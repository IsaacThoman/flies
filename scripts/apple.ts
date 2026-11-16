// Archiving the Apple TV app (scripts/tvos.ts) and the iPhone and iPad app (scripts/ios.ts) for
// App Store Connect, where they appear in TestFlight: docs/release.md.
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const ARCHIVE_USAGE = `Archive options:
  --version <x.y.z>     the version (CFBundleShortVersionString), required
  --build-number <n>    the build number (CFBundleVersion; default the Unix time, which keeps
                        increasing)
  --upload              upload the build to App Store Connect for TestFlight, instead of
                        exporting it into build/export/

Archiving signs in to App Store Connect with an API key when APP_STORE_CONNECT_API_KEY_PATH
(the .p8 file), APP_STORE_CONNECT_API_KEY_ID and APP_STORE_CONNECT_API_ISSUER_ID are set, and
otherwise with the account signed in to Xcode.`;

export type ArchiveOptions = { version: string; buildNumber: string; upload: boolean };

/** The archive command's options, checked. */
export function archiveOptions(version: string | undefined, buildNumber: string | undefined, upload: boolean): ArchiveOptions {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw Error(`archive needs --version <major.minor.patch>${version ? `, not ${version}` : ''}`);
  buildNumber ??= String(Math.floor(Date.now() / 1000));
  if (!/^\d+$/.test(buildNumber)) throw Error(`--build-number takes a number, not ${buildNumber}`);
  return { version, buildNumber, upload };
}

// xcodebuild's flags for an App Store Connect API key, or none for the account signed in to Xcode.
function authFlags() {
  const { APP_STORE_CONNECT_API_KEY_PATH: key, APP_STORE_CONNECT_API_KEY_ID: id, APP_STORE_CONNECT_API_ISSUER_ID: issuer } = process.env;
  if (!key && !id && !issuer) return [];
  if (!key || !id || !issuer) throw Error('An API key needs all of APP_STORE_CONNECT_API_KEY_PATH, APP_STORE_CONNECT_API_KEY_ID and APP_STORE_CONNECT_API_ISSUER_ID');
  return ['-authenticationKeyPath', key, '-authenticationKeyID', id, '-authenticationKeyIssuerID', issuer];
}

function xcodebuild(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync('xcodebuild', args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`xcodebuild ${args.at(-1)} failed (exit ${result.status})`);
}

type Project = { appDir: string; platform: 'iOS' | 'tvOS'; teamId: string; env: NodeJS.ProcessEnv };

/**
 * Archives an app whose Xcode project (Flies.xcodeproj) is generated and ready, at the version
 * and build number given, then exports it for App Store Connect: uploaded with --upload, else
 * signed into build/export/. Xcode signs the export with the team's cloud-managed distribution
 * certificate.
 */
export function archive({ appDir, platform, teamId, env }: Project, { version, buildNumber, upload }: ArchiveOptions) {
  const build = path.join(appDir, 'build');
  const archivePath = path.join(build, 'Flies.xcarchive');
  const exportPath = path.join(build, 'export');
  rmSync(archivePath, { recursive: true, force: true });
  rmSync(exportPath, { recursive: true, force: true });
  const auth = authFlags();
  console.log(`Archiving ${platform} ${version} (${buildNumber})…`);
  xcodebuild([
    '-project', 'Flies.xcodeproj', '-scheme', 'Flies', '-configuration', 'Release', '-destination', `generic/platform=${platform}`,
    '-derivedDataPath', 'build', '-archivePath', archivePath, '-allowProvisioningUpdates', ...auth,
    `MARKETING_VERSION=${version}`, `CURRENT_PROJECT_VERSION=${buildNumber}`, '-quiet', 'archive',
  ], appDir, env);
  // The archive carries the version and build number; Xcode isn't to change them.
  const exportOptions = path.join(build, 'ExportOptions.plist');
  writeFileSync(exportOptions, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>${upload ? 'upload' : 'export'}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>${teamId}</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>testFlightInternalTestingOnly</key><false/>
</dict>
</plist>
`);
  xcodebuild([
    '-archivePath', archivePath, '-exportOptionsPlist', exportOptions, '-exportPath', exportPath,
    '-allowProvisioningUpdates', ...auth, '-exportArchive',
  ], appDir, env);
  console.log(upload
    ? `Uploaded ${platform} ${version} (${buildNumber}) to App Store Connect; it appears in TestFlight once processed`
    : `Exported ${platform} ${version} (${buildNumber}) to ${exportPath}`);
}
