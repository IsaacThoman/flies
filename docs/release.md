# Releasing

Merging `dev` into `main` releases the Apple apps to TestFlight. The Apple TV app (`apps/tvos`)
and the iPhone and iPad app (`apps/ios`) go together, as one app, "Flies", at one version.

## How a release happens

1. Pull requests are squash-merged into `dev` as usual, with plain-English titles.
2. To release, open a pull request from `dev` into `main` and merge it with a **merge commit**,
   not a squash, so `main` keeps `dev`'s history and the two don't drift apart.
3. CI (`.github/workflows/ci.yml`) runs the checks on `main`, as it does on every pull request
   and push to `dev`:
   - lint, both typechecks and the web build, on Linux;
   - the unit tests, on a macOS arm64 runner, where the brain's bit-for-bit tests hold;
   - `npm run e2e`, which reports without blocking.

   The connectome is fetched once and cached (`.github/actions/brain`).

   When the checks pass, the `release` job runs
   [semantic-release](https://semantic-release.org) (`release.config.mjs`). It works out the next
   version from the commits since the last `v*` tag, tags the release `v<version>`, and creates a
   GitHub Release whose notes are those commits' titles.
4. The `testflight` job then calls `.github/workflows/testflight.yml` with that version. On the
   `xcode-27` runner, it archives both apps from the tag with `npm run ios -- archive` and
   `npm run tvos -- archive` (`scripts/apple.ts`) and uploads them to App Store Connect. They
   appear in TestFlight once Apple has processed them.

The version is set at build time: `MARKETING_VERSION` is the release (`1.2.3`) and
`CURRENT_PROJECT_VERSION` is the Unix time, which keeps increasing, reruns included. Neither is
committed; `apps/version.yml` only numbers local builds.

### What decides the version

Every commit that landed counts as a patch, so merging anything into `main` releases. The
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

`main` started at `v0.1.0` (`apps/version.yml`'s 0.1), so the first release is 0.1.1, or 0.2.0
with a `feat:` title.

### By hand

**Actions → TestFlight → Run workflow**, with a version, from `main` or a `v*` tag (the only
refs the `testflight` environment, and so its secrets, lets in):

- **Upload off** only archives and signs both apps, to check the setup.
- **Upload on**, from `main` or the tag `v<version>`, rebuilds that release and uploads it.

Locally, with an App Store Connect API key in the environment, or else the account signed in to
Xcode:

```sh
npm run tvos -- archive --version 0.1.1             # signs into apps/tvos/build/export/
npm run ios -- archive --version 0.1.1 --upload     # and uploads to TestFlight
```

Every PR and push to `dev` or `main` also runs `.github/workflows/wasm-repro.yml` on macOS.
It caches the pinned, digest-verified wasi-sdk and runs `wasm.sh --check` unconditionally,
rebuilding both WebAssembly modules and their manifest and comparing them byte for byte
with the committed files. This check cannot skip when the SDK is missing.

## The weather outside

The Apple TV app has WeatherKit only when built with `TVOS_WEATHERKIT=1`
([apple-tv.md](apple-tv.md#turning-it-on-for-the-owner)). Its entitlement needs the WeatherKit capability on the App ID, without
which signing fails. Releases build it in when the repository variable `TVOS_WEATHERKIT` is `1`
(Settings → Secrets and variables → Actions → Variables), and leave it out otherwise.

Turn it on once the capability is registered (below). Without it, the Apple TV's sky is the
game's own weather and clock rather than the weather outside. The iPhone and iPad app has no
WeatherKit.

## Invite links

TestFlight releases build the iPhone and iPad app with `IOS_LINKS=1` by default, adding
Associated Domains so table links open the app and password AutoFill offers the site's
passwords. The capability is already enabled on `com.isaacthoman.flies`. To leave it out of
releases, set the repository variable `IOS_LINKS` to `0` (Settings → Secrets and variables →
Actions → Variables); unset or empty defaults to `1`.

The web build publishes `/.well-known/apple-app-site-association` by default for
`PX72AL9366.com.isaacthoman.flies`, using the team shared in `scripts/appleConfig.ts`.
`APPLE_TEAM_ID` overrides the web build's team; unset or blank uses that default. To turn off
the site's association, set the build variable `APPLE_TEAM_ID=0` and rebuild/redeploy
([deploy.md](deploy.md#the-iphone-and-ipad-apps-links)). Local iOS builds and archives still
need `IOS_LINKS=1` explicitly; omit it or use `IOS_LINKS=0` to leave the entitlement out.

## One-time setup

Done once, by the account holder, before the first release:

1. **App ID and capabilities** ([Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)):
   - register an explicit App ID for `com.isaacthoman.flies`, if a signed build hasn't already;
   - tick **WeatherKit** under both **Capabilities** and **App Services**
     ([apple-tv.md](apple-tv.md#turning-it-on-for-the-owner), steps 1 and 2), then set the
     `TVOS_WEATHERKIT` variable to `1`. Recommended: it's what gives the Apple TV the real sky;
   - **Associated Domains** is already enabled for the invite links that open a table in the
     app. Enable it on any replacement App ID before releasing with links on.

   Both apps use the one App ID.
2. **App Store Connect record**: create one app, **Flies**, with bundle ID
   `com.isaacthoman.flies`, and give it both **iOS** and **tvOS** as platforms (Add Platform;
   if an Apple TV record already exists, add iOS to it).
   Sharing one bundle ID makes it a universal purchase: one listing, bought once for the
   iPhone, iPad and Apple TV, with one TestFlight group for all of them. Then add a TestFlight
   group and the privacy answers (no data collected).
3. **The `testflight` environment** in this repository (Settings → Environments → New
   environment, `testflight`):
   - under **Deployment branches and tags**, choose "Selected branches and tags" and add the
     branch `main` and the tag pattern `v*`;
   - add the same environment secrets as the other apps on the account. They are the same API
     key and certificate, so they can be reused:

   | Secret | What it is |
   | --- | --- |
   | `APP_STORE_CONNECT_API_ISSUER_ID` | the API key's issuer ID (App Store Connect → Users and Access → Integrations) |
   | `APP_STORE_CONNECT_API_KEY_ID` | the key's ID |
   | `APP_STORE_CONNECT_API_PRIVATE_KEY` | the `.p8` file's contents. An **Admin** key, so Xcode can use the team's cloud-managed distribution certificate |
   | `IOS_DEVELOPMENT_CERTIFICATE_P12_BASE64` | an Apple Development certificate and its private key, exported as `.p12`, base64 encoded (`base64 -i cert.p12`) |
   | `IOS_DEVELOPMENT_CERTIFICATE_PASSWORD` | the `.p12`'s password |
4. **The `xcode-27` runner**: the TestFlight jobs run on `runs-on: xcode-27`, a GitHub-hosted
   macOS runner label, not a self-hosted machine. The account's other apps use it: their jobs
   run in the "GitHub Actions" runner group, on runners named "GitHub Actions <n>". No
   repository has a self-hosted runner registered, and an account can't have org-level ones.
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
