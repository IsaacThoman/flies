# Releasing

Merging `dev` into `main` starts the release pipeline for the Apple apps.
The workflow uploads archives to App Store Connect for TestFlight; Apple must process them
before testers can use them. The Apple TV app (`apps/tvos`) and the iPhone and iPad app
(`apps/ios`) share the default app identity, "Flies", and marketing version. They archive
and upload in separate jobs, so one can succeed while the other fails.

## How a release happens

1. Merge pull requests into `dev`, with plain-English titles. Squash merging is disabled
   in the repository settings checked on 16 November 2026; recheck them if the workflow changes.
2. To release, open a pull request from `dev` into `main` and merge it with a **merge commit**,
   not a squash, so `main` keeps `dev`'s history and the two don't drift apart.
3. CI (`.github/workflows/ci.yml`) runs the checks on `main`, as it does on every pull request
   and push to `dev` (draft pull requests skip tests and E2E):
   - the Compose configuration check, lint, both typechecks and the web build, on Linux;
   - `npm test`, including CPU budgets, on `macos-latest` (the brain parity tests need Apple silicon);
   - the four E2E suites in separate jobs, with an aggregate `e2e` check that fails if a suite fails.

   The release job waits for `checks` and `test`, not E2E.

   The `checks`, `test` and individual E2E suite jobs restore cached brain data or fetch it
   on a cache miss (`.github/actions/brain`).

   When the checks pass, the `release` job runs
   [semantic-release](https://semantic-release.org) (`release.config.mjs`). It works out the next
   version from eligible commits since the last release tag, tags the release `v<version>`, and creates a
   GitHub Release whose notes list non-merge commit titles from that range.
4. The `testflight` job then calls `.github/workflows/testflight.yml` with that version. On the
   `xcode-27` runner, it archives both apps from the tag with `npm run ios -- archive` and
   `npm run tvos -- archive` (`scripts/apple.ts`) and uploads them to App Store Connect. They
   appear in TestFlight once Apple has processed them.

tvOS archives reject `TVOS_ENTRY`: diagnostic entries are for local builds only. Both
archive commands reject a nonempty `ROOMS_URL`, which is for development builds.

The version is set at build time: `MARKETING_VERSION` is the release (`1.2.3`) and
`CURRENT_PROJECT_VERSION` defaults to Unix time in whole seconds; a later rerun normally gets
a later number, but strict increase is not enforced. Local archives can override it with
`--build-number`. These release values are passed to Xcode, not committed;
`apps/version.yml` supplies the defaults for local builds.

### Owner details and release paperwork

The privacy policy is omitted until all four public build variables are set:
`FLIES_OPERATOR_NAME` (responsible public name), `FLIES_CONTACT_EMAIL` (privacy
mailbox), `FLIES_SUPPORT_URL` (HTTPS support page), and `FLIES_MARKETING_URL`
(HTTPS app page). Set them at build time on the web host and rebuild; direct
web/native builds read the same environment variables. Missing or blank
values produce no policy file at `/privacy/index.html`; the supplied dev, preview and static servers
answer 404 for the missing policy. Configure production hosting to do the same. The game adds
no privacy link. The policy and store-copy files in `docs/` remain clearly
marked owner drafts. See [deployment](deploy.md#privacy-publication) for
configuration and validation.

Before App Store submission, publish the completed policy and supply its
public URL, the support/marketing URLs, a review contact's name/email/phone,
and the production room-service URL. Confirm the intended $0.99 price,
territories and platforms. Confirm hosting/proxy access-log and room-data
backup retention and update the policy; local size-based rotation is not a
verified time limit for providers' logs or backups. Have a lawyer review the
legal texts and confirm live WeatherKit attribution in a signed build.

Listed rooms expose user-chosen names, with no chat channel. Decide whether
to keep that public feature and answer the user-generated-content and
public-posting questions accordingly. The bar/restaurant contain persistent
alcohol imagery: review the frequency answers and accept Apple's resulting
regional age rating; do not submit as a Kids Category app. The rationale is
in [App Store answers](app-store-answers.md).

The large notice files are committed generated output. `npm run notices`
regenerates `THIRD_PARTY_NOTICES` and `apps/web/src/ui/notices.json`; tests
and builds fail on stale contents, and builds emit the checked notices into
the web and app bundles. No owner details are needed to ship these credits.

### What decides the version

Ordinary nonempty commit messages count as patches; `feat` and breaking changes can ask
for more. This is a default rule for commits the analyzer retains, not a guarantee
that every push releases. Publication also requires passing `checks` and `test` and an eligible
`main` head. The dev-to-main pull request's title can ask for more, because GitHub puts it in the merge commit
under "Merge pull request #n from ...":

| Pull request title | Release |
| --- | --- |
| `dev to main`, or anything plain | patch: 0.1.0 → 0.1.1 |
| `feat: rooms online` | minor: 0.1.1 → 0.2.0 |
| `feat!: a new kind of save` | major: 0.2.0 → 1.0.0 |

A commit on `dev` with a conventional title (`feat: ...`, `fix(tvos): ...`) is read the same
way. The repository's merge-commit message must stay at GitHub's default, the pull request's
title (Settings → General → Pull Requests).

The table illustrates version increments, not the next release number. Consult release tags
for the published versions; `apps/version.yml` is not the release history.

### By hand

**Actions → TestFlight → Run workflow**, with a version, from `main` or a `v*` tag (the only
refs the `testflight` environment should allow; verify its protection rules in repository settings):

- **Upload off** only archives and signs both apps, to check the setup.
- **Upload on** builds the selected `main` commit or the matching tag `v<version>` and uploads it.
  On `main`, the supplied version need not match an existing tag; use the tag to rebuild a release.

Locally, set `APP_STORE_CONNECT_API_KEY_PATH` to the `.p8` file and set
`APP_STORE_CONNECT_API_KEY_ID` and `APP_STORE_CONNECT_API_ISSUER_ID`, or use the account
signed in to Xcode:

```sh
npm run tvos -- archive --version 0.1.1             # signs into apps/tvos/build/export/
npm run ios -- archive --version 0.1.1 --upload     # and uploads to TestFlight
```

Ready pull requests that change Apple host inputs also run `.github/workflows/apple-compile.yml`: both
hosts compile for a generic simulator on macOS, without signing credentials or a running device.
The job caches npm downloads, the connectome and Xcode build data. Draft pull requests skip
it, as do edits confined to `docs/` or the root README. Comments or documentation under
matching paths, such as `scripts/` or `packages/`, can still trigger it. Marking a matching
draft ready starts the job.

Ready pull requests and pushes to `dev` or `main` that change `packages/brain-native/**`
(the build script and its pinned SDK version and digests included) or
`.github/workflows/wasm-repro.yml` run that workflow on macOS. Draft pull requests skip it.
It caches the pinned, digest-verified wasi-sdk and runs `wasm.sh --check` unconditionally,
rebuilding both WebAssembly modules and their manifest and comparing them byte for byte
with the committed files. This check cannot skip when the SDK is missing.

## The weather outside

The Apple TV app builds in WeatherKit with `TVOS_WEATHERKIT=1`
([apple-tv.md](apple-tv.md#turning-it-on-for-the-owner)). Its entitlement needs the WeatherKit
capability on the App ID, without which signing fails. Releases build it in when the repository
variable `TVOS_WEATHERKIT` is `1`, `true`, `yes` or `on` (case-insensitive)
(Settings → Secrets and variables → Actions → Variables), and leave it out otherwise.

Turn it on once the capability is registered (below). Without it, outside weather is unavailable;
the game uses its generated sky locally and the starter's shared sky at player-created tables. The iPhone and iPad app has no
WeatherKit.

## Invite links

TestFlight releases build the iPhone and iPad app with `IOS_LINKS=1` by default, adding
Associated Domains so table links open the app and password AutoFill offers the site's
passwords. Verify that Associated Domains is enabled on `com.isaacthoman.flies`
before signing with it. To leave it out of releases, set the repository variable `IOS_LINKS` to `0` (Settings → Secrets and variables →
Actions → Variables); unset or empty defaults to `1`.

The web build publishes `/.well-known/apple-app-site-association` by default for
`PX72AL9366.com.isaacthoman.flies`, using the team shared in `scripts/appleConfig.ts`.
`APPLE_TEAM_ID` overrides the web build's team; unset or empty uses that default. To turn off
the site's association, set the build variable `APPLE_TEAM_ID=0` and rebuild/redeploy
([deploy.md](deploy.md#the-iphone-and-ipad-apps-links)). Local iOS builds and archives still
need `IOS_LINKS=1` (or `true`, `yes`, `on`, case-insensitive) explicitly; omit it or use
`IOS_LINKS=0` to leave the entitlement out.

## One-time setup

The account holder should confirm this setup before releasing. The source defines the
requested configuration, not the account's current state; verify current Apple requirements,
capabilities, credentials and store settings in the account:

1. **App ID and capabilities** ([Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)):
   - register an explicit App ID for `com.isaacthoman.flies`, if a signed build hasn't already;
   - tick **WeatherKit** under both **Capabilities** and **App Services**
     ([apple-tv.md](apple-tv.md#turning-it-on-for-the-owner), steps 1 and 2), then set the
     `TVOS_WEATHERKIT` variable to `1`. Recommended: it's what gives the Apple TV the real sky;
   - **Associated Domains** must be enabled for the invite links that open a table in the
     app. Check it on the App ID before releasing with links on.

   Both apps default to the same bundle ID; local builds can override it.
2. **App Store Connect record**: create one app, **Flies**, with bundle ID
   `com.isaacthoman.flies`, and give it both **iOS** and **tvOS** as platforms (Add Platform;
   if an Apple TV record already exists, add iOS to it).
   Configure universal purchase for one listing across iPhone, iPad and Apple TV, using
   that shared bundle ID. Configure TestFlight groups and platform availability in App Store Connect
   and add testers. Complete the privacy answers from [the audited draft](app-store-answers.md).
   Online keeps pseudonymous identifiers and gameplay records: do not select "Data Not Collected".
   Complete the [privacy policy](privacy.md), [store listing](store-listing.md) and
   [licence audit](licenses.md), replace their placeholders and obtain legal review before submission.
3. **The `testflight` environment** in this repository (Settings → Environments → New
   environment, `testflight`):
   - under **Deployment branches and tags**, choose "Selected branches and tags" and add the
     branch `main` and the tag pattern `v*`;
   - add the following environment secrets for this team. Verify their validity and permissions
     in the Apple account:

   | Secret | What it is |
   | --- | --- |
   | `APP_STORE_CONNECT_API_ISSUER_ID` | the API key's issuer ID (App Store Connect → Users and Access → Integrations) |
   | `APP_STORE_CONNECT_API_KEY_ID` | the key's ID |
   | `APP_STORE_CONNECT_API_PRIVATE_KEY` | the `.p8` file's contents. Use an **Admin** key; confirm its access to the team's cloud-managed distribution certificate |
   | `IOS_DEVELOPMENT_CERTIFICATE_P12_BASE64` | an Apple Development certificate and its private key, exported as `.p12`, base64 encoded (`base64 -i cert.p12`) |
   | `IOS_DEVELOPMENT_CERTIFICATE_PASSWORD` | the `.p12`'s password |
4. **The `xcode-27` runner**: the TestFlight jobs request `runs-on: xcode-27`.
   The workflow alone does not establish the account's access to that runner label or
   whether its runners are hosted or self-hosted. Run the workflow with upload off to
   check runner availability and signing.

   The workflow selects `/Applications/Xcode_27.1.app`. Change that line if the runner image
   moves on.
5. **The team**: `PX72AL9366`, shared by the Apple apps and the web build in
   `scripts/appleConfig.ts`. Signing in CI is automatic, with that team. A different team goes
   in the repository variable `APPLE_TEAM_ID`; set it separately as the site's build variable
   too, so its association names the same app.
6. **Merge commits** stay allowed for the dev-to-main pull request, with GitHub's default
   message (above).
