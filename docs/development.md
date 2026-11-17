# Development and checks

[Documentation index](../README.md#documentation).

## Running and checking

From the repository root:

```sh
npm install
npm run brain:fetch
npm run dev
```

Run checks separately from the foreground dev server:

```sh
npm run typecheck
npm run lint
npm test
npm run e2e
```

The first block starts the browser game. Typecheck and lint check the
source; npm test runs the Node suites, including the documentation checker
and serial CPU budgets. E2E runs browser suites with the real brain; these
commands describe checks, not a claim that this revision passes all of them.
Browser E2E also needs the real connectome and an installed Playwright Chromium;
see [browser prerequisites](web-soak.md).

The checks are next to their implementation or under each package's tests
folder. See `package.json` for the current entry points. The browser drive is
`scripts/play.ts`; the canvas publishes `data-*` state because the visible
menus are drawn in engine. [Web soak](web-soak.md) covers retained
resources and long browser runs; [fuzzing](fuzzing.md) covers seeded body
and neural runs and their replay limits.

Native brain changes and comparison limits belong in
[the native brain reference](../packages/brain-native/README.md#when-the-model-changes).
The committed Wasm parity comparisons target Apple-silicon Node math;
x86-64 or Linux ARM can differ. Preserve the build's floating-point
contraction settings (off outside fdlibm) when changing the implementation;
see `.github/workflows/ci.yml` and `packages/brain-native/wasm.sh`.
Apple host checks belong in [iOS](ios.md#checking-it) and
[Apple TV](apple-tv.md#checking-it-1). Release automation and account setup
belong in [the release guide](release.md).

## Coverage and limits

| Question | Source home and limit |
| --- | --- |
| Is the fly framed in a jump? | `apps/web/tests/camera.test.ts` samples trajectories, requires more than 60% of airborne frames in view and allows 1.5 seconds for landing recovery. |
| Does the nervous display allocate? | `apps/web/tests/nerves.test.ts` and its probe check selected operations; sampled allocation checks allow boxed-number-sized samples. |
| Do browser/platform adapters work? | Driver and host unit tests use fakes; `npm run e2e` uses the real brain across play, pointer, built-web and room scenarios. |
| Are resources bounded in long runs? | [Web soak](web-soak.md) defines checkpoints and tolerances; those do not prove unlimited-time or total GPU/native-memory bounds. |

## Remote and host

The game reads the remote only as `packages/contracts/src/remote.ts` describes,
and sets `window.__flyAtRoot` while on the title (or loading), where the Apple TV host handles Back
by leaving the app. A host that wraps the web build (the iPhone and iPad app)
shows it edge to edge and says what its notch and home indicator cover by
assigning `window.__flySafeArea` (`packages/contracts/src/screen.ts`) and
dispatching a `resize`; otherwise CSS `env(safe-area-inset-*)` says. Arrow presses that arrive during a fast swipe are taken as the
swipe's and ignored. In a browser the brain runs in a Web Worker: `packages/brain-native` as
WebAssembly by default where supported, with `packages/brain` TypeScript as
fallback (`?brain=wasm` or `?brain=typescript` selects explicitly)
(`apps/web/src/brain/create.ts`; worker transport in
`apps/web/src/brain/worker-driver.ts`), fed the connectome in its wire form
(`apps/web/src/brain/wire.ts`: historical reported sizes were 14 MB gzipped
versus 21 MB for plain gzip; capture date and exact machine unknown),
which `apps/web/src/brain/download.ts` fetches with its bytes counted, keeps
in the browser's cache where available (storage can fail or be evicted),
checks each part's length and, when WebCrypto is
available and succeeds, checks its recorded SHA-256
(`scripts/webBuild.ts`; the dev server serves the same file). The page sleeps
while hidden, requests a screen wake lock while visible in screensaver mode
where supported (requests can be refused), and recovers
from a lost graphics context (`apps/web/src/page.ts`); `docs/web.md` has the
rest. On the Apple TV it is `globalThis.__native.brain`
(`apps/web/src/brain/native-driver.ts`), which reuses its buffers and decoded state during steady-state ticks;
initialization and error handling can allocate.
The settings, the shelf's kept choices and what the hints have taught are in
`localStorage` (`apps/web/src/settings.ts`); from a save made by another
build, or a broken one, only what this build can use is kept.

<!-- docs-check: base apps/web/src -->

<!-- docs-check: base packages/body/src -->

<!-- docs-check: generated packages/brain/data/anatomy.bin -->
