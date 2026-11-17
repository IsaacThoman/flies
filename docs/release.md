# Releasing

Merging `dev` into `main` releases the Apple apps to TestFlight. The Apple TV app (`apps/tvos`)
and the iPhone and iPad app (`apps/ios`) go together, as one app, "Flies", at one version.

## How a release happens

1. Pull requests land in `dev` with merge commits (squash merging is disabled
   in the repository settings checked on 16 November 2026). Plain-English
   commit titles are supported by the release analyzer.
2. To release, open a pull request from `dev` into `main` and merge it with a **merge commit**,
   not a squash, so `main` keeps `dev`'s history and the two don't drift apart.
3. CI (`.github/workflows/ci.yml`) runs the checks on `main`, as it does on every pull request
   and push to `dev`:
   - lint, both typechecks and the web build, on Linux;
   - the unit tests, on a macOS arm64 runner, where the brain's bit-for-bit tests hold;
   - `npm run e2e`, which reports without blocking.

   Each job restores the connectome cache, fetching on a miss (`.github/actions/brain`).

   When the checks pass, the `release` job runs
   [semantic-release](https://semantic-release.org) (`release.config.mjs`). It works out the next
   version from the commits since the last `v*` tag, tags the release `v<version>`, and creates a
   GitHub Release whose notes list non-merge commit titles. Merge commits
   can affect the version without appearing in those notes.
4. The `testflight` job then calls `.github/workflows/testflight.yml` with that version. On the
   `xcode-27` runner, it archives both apps from the tag with `npm run ios -- archive` and
   `npm run tvos -- archive` (`scripts/apple.ts`) and uploads them to App Store Connect. They
   appear in TestFlight once Apple has processed them.

The version is set at build time: `MARKETING_VERSION` is the release (`1.2.3`) and
`CURRENT_PROJECT_VERSION` defaults to whole-second Unix time. Later reruns normally get a larger
number, but calls in one second can match, and a build number may be supplied
explicitly; strict monotonicity is not enforced. Generated release values are not committed; `apps/version.yml` contains the fallback values for local builds.

### What decides the version

Ordinary nonempty commit titles default to a patch. Empty messages and
matched change/revert pairs can be filtered by the analyzer; publishing also
requires passing blocking checks and an eligible current `main` head. The
dev-to-main pull request's title can ask for more, because GitHub puts it in the merge commit
under "Merge pull request #n from ...":

| Pull request title | Release |
| --- | --- |
| `dev to main`, or anything plain | patch: 0.1.0 → 0.1.1 |
| `feat: rooms online` | minor: 0.1.1 → 0.2.0 |
| `feat!: a new kind of save` | major: 0.2.0 → 1.0.0 |

A commit on `dev` with a conventional title (`feat: ...`, `fix(tvos): ...`) is read the same
way. The repository's merge-commit message must stay at GitHub's default, the pull request's
title (Settings → General → Pull Requests).

Version decisions start at the last published `v*` tag, not at the local
`apps/version.yml` default. That file numbers local builds only.

### By hand

**Actions → TestFlight → Run workflow**, with a version, from `main` or a `v*` tag (the only
refs the `testflight` environment, and so its secrets, lets in):

- **Upload off** only archives and signs both apps, to check the setup.
- **Upload on**, from `main` or the tag `v<version>`, builds the selected dispatch SHA and uploads it under the supplied version.
  Dispatch on `v<version>` to use that exact tagged source; dispatch on
  `main` uses its selected SHA, without checking that it matches the version
  of an existing tag.

Locally, with an App Store Connect API key in the environment, or else the account signed in to
Xcode:

```sh
npm run tvos -- archive --version 0.1.1             # signs into apps/tvos/build/export/
npm run ios -- archive --version 0.1.1 --upload     # and uploads to TestFlight
```

Ready pull requests and pushes to `dev` or `main` that change `packages/brain-native/**`
(the build script and its pinned SDK version and digests included) or
`.github/workflows/wasm-repro.yml` run that workflow on macOS. Draft pull requests skip it.
It caches the pinned, digest-verified wasi-sdk and runs `wasm.sh --check` unconditionally,
rebuilding both WebAssembly modules and their manifest and comparing them byte for byte
with the committed files. This check cannot skip when the SDK is missing.

## The weather outside

The Apple TV app has WeatherKit when enabled, normally with `TVOS_WEATHERKIT=1`
([apple-tv.md](apple-tv.md#turning-it-on-for-the-owner)). Its entitlement needs the WeatherKit capability on the App ID, without
which signing fails. Releases build it in when the repository variable `TVOS_WEATHERKIT` is enabled (`1`, `true`,
`yes` or `on`, case-insensitive)
(Settings → Secrets and variables → Actions → Variables), and leave it out otherwise.

Turn it on once the capability is registered (below). Without it, the Apple TV's sky is the
game's own weather and clock rather than the weather outside. The iPhone and iPad app has no
WeatherKit.

## Invite links

TestFlight releases build the iPhone and iPad app with `IOS_LINKS=1` by default, adding
Associated Domains so table links open the app and password AutoFill offers the site's
passwords. The capability must be enabled on `com.isaacthoman.flies`; confirm the
Apple account state before a signed release. To leave it out of
releases, set the repository variable `IOS_LINKS` to `0` (Settings → Secrets and variables →
Actions → Variables); unset or empty defaults to `1`.

Local iOS builds and archives enable links explicitly with `IOS_LINKS=1`
(or `true`, `yes`, `on`). See [the iOS link setup](ios.md#universal-links)
for the app entitlement and [the site's association](deploy.md#the-iphone-and-ipad-apps-links)
for team overrides and the server file.

## One-time setup

Done once, by the account holder, before the first release:

1. **App ID and capabilities** ([Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)):
   - register an explicit App ID for `com.isaacthoman.flies`, if a signed build hasn't already;
   - tick **WeatherKit** under both **Capabilities** and **App Services**
     ([apple-tv.md](apple-tv.md#turning-it-on-for-the-owner), steps 1 and 2), then set the
     `TVOS_WEATHERKIT` variable to `1`. Recommended: it's what gives the Apple TV the real sky;
   - Enable **Associated Domains** on the App ID before releasing with links on; confirm it for the current account as well as any replacement App ID.

   Both apps use the one App ID.
2. **App Store Connect record**: create one app, **Flies**, with bundle ID
   `com.isaacthoman.flies`, and give it both **iOS** and **tvOS** as platforms (Add Platform;
   if an Apple TV record already exists, add iOS to it).
   Sharing one bundle ID makes it a universal purchase: one listing, bought once for the
   iPhone, iPad and Apple TV, with one TestFlight group for all of them. Then add a TestFlight
   group and privacy answers for the current app. Empty collected-data arrays
   in the privacy manifests do not by themselves settle the disclosure:
   online room state and server logs are persisted.
3. **The `testflight` environment** in this repository (Settings → Environments → New
   environment, `testflight`):
   - under **Deployment branches and tags**, choose "Selected branches and tags" and add the
     branch `main` and the tag pattern `v*`;
   - add the environment secrets from the signing configuration:

   | Secret | What it is |
   | --- | --- |
   | `APP_STORE_CONNECT_API_ISSUER_ID` | the API key's issuer ID (App Store Connect → Users and Access → Integrations) |
   | `APP_STORE_CONNECT_API_KEY_ID` | the key's ID |
   | `APP_STORE_CONNECT_API_PRIVATE_KEY` | the `.p8` file's contents. An **Admin** key, so Xcode can use the team's cloud-managed distribution certificate |
   | `IOS_DEVELOPMENT_CERTIFICATE_P12_BASE64` | an Apple Development certificate and its private key, exported as `.p12`, base64 encoded (`base64 -i cert.p12`) |
   | `IOS_DEVELOPMENT_CERTIFICATE_PASSWORD` | the `.p12`'s password |
4. **The `xcode-27` runner**: the TestFlight jobs request `runs-on: xcode-27`.
   The workflow does not establish which runners the account can use; confirm
   that label is available.
   If this repository can't use the label, a run queues with "Waiting for a runner". To check,
   run the workflow by hand with upload off.

   The workflow selects `/Applications/Xcode_27.1.app`. Change that line if the runner image
   moves on.
5. **The team**: `PX72AL9366`, shared by the Apple apps and the web build in
   `scripts/appleConfig.ts`. Signing in CI is automatic, with that team. A different team goes
   in the repository variable `APPLE_TEAM_ID`; set it separately as the site's build variable
   too, so its association names the same app.
6. **Merge commits** stay allowed for the dev-to-main pull request, with GitHub's default
   message (above).
