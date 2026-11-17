# The web build

The game is a web page underneath, and the web build is a real way to have
the fly: a link to open in a supported browser on a laptop, phone or tablet,
leave as a screensaver, or install where the browser offers it. It is plain
files for a static host serving the types below, including from a subfolder.
Solo play needs no application server; tables with others need the room
server ([online.md](online.md)).

## Building it

```sh
npm install
npm run brain:fetch      # setup: packed connectome (historically 38 MB, not in git)
npm run build            # the site, into dist/
npm run serve -- --base /fly/   # try it as a host would serve it: http://127.0.0.1:8080/fly/
```

The build fails if the connectome is missing; the development server only warns.

`FLY_SITE_URL=https://example.org/fly/ npm run build` makes the link
preview's picture and address absolute, which most sites that show link
previews need; without it the picture is relative and `og:url` is omitted.

## What to upload

Upload `dist/` to the game's folder. If that is a subfolder, also place the
app association at the host root; its table-link matcher still covers only
`/`. The sizes below are
historical estimates, not current build totals; their capture date and exact
machine were not recorded. About 17 MB in that build:

| Path | Size | Cache-Control | Content-Type |
| --- | --- | --- | --- |
| `index.html` | 2 KB | `no-cache` | `text/html` |
| `sw.js` (the service worker) | 1 KB | `no-cache` | `text/javascript` |
| `manifest.webmanifest` | 1 KB | `no-cache` | `application/manifest+json` |
| `assets/index-<hash>.js` | 1 MB, 295 KB gzipped | `public, max-age=31536000, immutable` | `text/javascript` |
| `assets/brain.worker-<hash>.js` | 108 KB | the same | `text/javascript` |
| `assets/*-<hash>.png` | icons and the link preview, 1.3 MB | the same | `image/png` |
| `brain/connectome.<n>.<hash>.bin` | the brain, in four parts of at most 4 MiB, 14.2 MB in all | the same | `application/octet-stream` (any will do) |
| `brain/fly-brain.0.<hash>.wasm` | the brain's simulation as WebAssembly, 268 KB (106 KB gzipped) | the same | `application/wasm` (what hosts send for `.wasm`; any will do) |
| `brain/anatomy.<n>.<hash>.bin` | where each neuron is (`packages/brain/src/anatomy.ts`), 0.9 MB, if `npm run brain:fetch` built it; nothing loads it yet | the same | `application/octet-stream` |
| `THIRD_PARTY_NOTICES` | generated legal notices | `no-cache` | `text/plain` |
| `privacy/index.html` | static policy when owner variables are complete, at `privacy/` under the deployment base | `no-cache` | `text/html` |
| `.well-known/apple-app-site-association` | which links open the iPhone and iPad app, on by default (`APPLE_TEAM_ID=0` disables it; [deploy.md](deploy.md#the-iphone-and-ipad-apps-links)); it must be at the host's root, with no redirect, and is never kept by the service worker | `no-cache` | `application/json` |

Files under `assets/` and `brain/` carry content hashes in their names and can
use immutable caching. The page, manifest, service
worker, legal documents and
app association have fixed names and use `no-cache`, allowing browser
revalidation rather than forbidding storage with `no-store`.
`scripts/serve.ts` sets these types and cache headers; with a subfolder base
it does not also expose the association at the host's root. The generated
association matches table links at `/`, not at a subfolder path.

What matters, and why:

- **Data parts at most 4 MiB.** `dataFile` caps each brain data part,
  keeping retries small. Historical host limits are listed below.
- **The brain arrives as it is.** The connectome's parts are already gzipped (below) but
  are served as binary parts, not as `.gz` files. Do not add
  `Content-Encoding: gzip` for the stored payload; the worker unzips it.
  Separate transport compression is fine when its encoding header matches.
- **Byte ranges** (`Accept-Ranges: bytes`, `206 Partial Content`) let a part
  that breaks off carry on from the byte where it stopped. Without them
  that part
  starts again, which is at most 4 MiB; the parts already in hand are kept.
- **https.** The service worker (opening offline), the browser's cache for the
  brain and its module, the digest check and the wake lock need a secure
  context (HTTPS, or loopback for local checks). Without the Cache API it
  fetches the brain again, subject to the browser's HTTP cache; without
  `crypto.subtle` it skips SHA-256 checks.
- **Solo hosting.** No extra headers, rewrites, application server code or
  cross-origin isolation are needed for solo play.

The page assets need no external fonts, scripts, analytics
or CDNs. `apps/web/tests/build.test.ts` checks the built files for external asset URLs;
`apps/web/e2e/web.e2e.ts` rejects external requests captured in its initial
browser context, apart from data and blob URLs. Online play also connects to the room server.

## Getting the brain to the browser

The browser needs the connectome parts and a simulation that runs on them.
Where supported, it uses the brain's C++ (`packages/brain-native`) built as WebAssembly, and
otherwise `packages/brain`'s TypeScript, dynamically loaded by the worker
only when selected. Both implement the same simulation; bit comparisons use matched inputs
and the engines described in the C++ README. In the historical runs below,
WebAssembly was faster in Chromium and used about half the brain memory.
`?brain=typescript` or `?brain=wasm` on the page's address
picks one, for tests and comparisons; nothing shows it to players.

Settings → Screensaver → Flies chooses one to four, shown as enamel dots.
Each has its own brain in its own worker, its own body, senses and eyes;
the camera and readouts follow the first. `InTurn`
(`apps/web/src/brain/create.ts`) loads their files one brain after another
from the same cache, so loads do not
overlap. Completed cache writes can be reused; where parts were not kept they are fetched again, still in turn. The eyes take turns too: at most one fly's refresh a frame, normally the most overdue; while a ball comes the
followed
fly gets priority when its readback is ready. A companion whose worker fails
is retried after 5 s and 30 s, and taken off if both retries fail. At a table the same flies travel
in one batch over one connection, up to the table's eight-fly limit
([online.md](online.md)).

The module, `brain/fly-brain.0.<hash>.wasm`, is fetched first (it is small)
and kept the same way as the connectome's parts, in a cache of its own
(`fly-brain-module`), counted with them on the loading screen ("3.2 / 14.5
MB"). It isn't gzipped by the build, so a host serves it as it serves any
`.wasm` and may compress it on the way; the worker compiles it from its bytes,
so the type it is served with doesn't matter. The worker then unzips the
connectome straight into the module's memory and builds the brain there:
the 40 MB are never held twice.

The following sizes and decoding times are historical, with capture date and
machine unknown. The packed connectome (`packages/brain`) was 40 MB, 21 MB gzipped. The build
rearranges it before gzipping (`apps/web/src/brain/wire.ts`): the sorted
columns become the steps between neighbours (each neuron's targets step up
through the neuron numbers in small steps), and every 16- and 32-bit column is
split into byte planes, so the near-empty high bytes run together. Gzipped,
that is **14.2 MB**, a third less, decoded in the brain's worker as it is
unzipped (`DecompressionStream`, about 80 ms of decoding on a desktop) without another complete
uncompressed copy. Brotli would make the plain file 15.3 MB but was not
chosen: this worker uses `DecompressionStream("gzip")`, so it does not rely on
the host choosing a compression format.

The gzipped file is cut into parts of at most 4 MiB, each named for its own
contents (`scripts/webBuild.ts`), and `apps/web/src/brain/download.ts`:

- takes each part from the browser's cache (the Cache API, `fly-brain`) when
  it is there, checked against the SHA-256 the build recorded when digest support
  works, and otherwise
  fetches it, counting the bytes for the loading screen ("3.2 / 14.2 MB");
- carries a broken or stalled part (nothing for 20 s) on from where it
  stopped, with a range request where the host serves them. It stops after
  four consecutive attempts without new progress, with growing pauses;
  new progress resets that counter, so total attempts are not capped;
- checks each part's length and, when available and working, its digest before starting a cache write. A later visit reuses whole parts whose
  writes completed; an unfinished part starts again;
- tries to delete other part names from that cache on loading. Cleanup can
  fail, and tabs using different builds can keep different parts;
- runs on without keeping it if the browser's storage is full, and says so
  in the "Awake · storage full" status.

The loading screen says what went wrong in a word or two, with **Try again**
(Select or Enter, a tap or a click): you're offline (and it tries by itself
when the network is back), the download stopped (it carries on from there),
the brain isn't on this server, it arrived damaged (fetched again), there
isn't the memory for it, this browser can't run it (no module workers, or no
`DecompressionStream`), or this browser can't draw its world (no WebGL 2,
drawn in 2D in the game's own look). A brain that crashes or stalls later
brings the same screen back.

Historical measurements on the built site (`npm run e2e`, Chromium on an M-series Mac; capture date and exact model unknown). The wire column records
the connectome transfer, not all page assets or the WebAssembly module:

| | Over the wire | Time to the title (with the historical 1.2 s "Awake!" hold) |
| --- | --- | --- |
| First visit, 2.5 MB/s, the first part broken off at 3 MB and resumed | 14.2 MB | 9.9–10.6 s |
| Second visit, network off | 0 (the page from the service worker, the brain from the cache) | 1.7–2.1 s |

What a slower device does with it is in the measurements below.

## Running on what people have

Historical TypeScript timings were about 0.12 s elapsed per simulated second at
rest and up to 0.4 s with the eyes busy (`packages/brain/README.md`). A slow
brain advances less simulated time: `WorkerBrainDriver.tick` caps pending
work at 100 ms and drops excess time. The body still advances on the game's
frame time; the stats' real-time figure describes the brain.

In a browser the game watches its own pace (`apps/web/src/quality.ts`): the
time between frames, and how fast the brain runs against real time, judged
every two seconds. Two bad judgements in a row and it draws less, a step at a
time. These are caps: coarser pixels or eyes set to Off stay as chosen, and
frame rates are targets rather than achieved rates:

| Level | Frames | Pixels | The eyes |
| --- | --- | --- | --- |
| 0 | 60 a second | as chosen | as chosen |
| 1 | 60 | as chosen | no finer than Low |
| 2 | 30 | as chosen | Low |
| 3 | 30 | no finer than Chunky (half the frame each way) | Low |
| 4 | 30 | Chunky | Low, refreshing half as often |
| 5 | 30 | Chunkier (a third of it each way) | Low, half as often |

The eye rates above are normal rates; a flying ball requests faster updates
(`eyes/eyes.ts`), still limited by rendering. The frame follows the screen's shape between aspect ratios 1:4 and 4:1 (`display.ts`); more extreme screens
stretch it. Within that range, the pixel steps keep approximately square
pixels, at a quarter and a ninth of the pixels: 370×208 and
247×139 in a 16:9 window; for a portrait example with a 376×816 full frame,
188×408 and 126×272. Pixel and eye-detail
changes recreate render targets and eye samplers, without rebuilding the world
scene. Never
more than Settings asks for, and the player choosing pixels or eyes in
Settings is taken at their word until the device shows again that it can't
keep up. After 30 s of easy going it tries a step back up; if that goes badly
it steps straight back and waits twice as long before trying again. When it
is the brain that falls behind, it steps down until the brain keeps up (on a
phone whose cores share one power budget, less drawing might leave more
for the brain); if even the cheapest picture doesn't get it there and frames are
keeping up, the picture goes
back to where it was, and the brain is left running as fast as the
device allows. Steps taken for the brain are saved when
it catches up, or at the bottom if frames are also behind. The neural model is
not simplified, but the eyes do sample less detail and refresh less often. The
governor never chooses Off for the eyes. Hidden tabs, the
moment a place is
built and the loading screen are not held
against the device. The level it settled at is kept and the next start
begins a step better. 120 Hz screens are
capped at the current level's 60 or 30 frames.
(A screen only a little faster than
60 Hz is left alone: holding it to 60 would drop a frame every few seconds.
And an iPhone in Low Power Mode, which offers 30 frames a second, costs a
level or two the first time, since a capped screen and a slow one look alike
from the page.)

### Measured

Historical runs of `node scripts/measure.ts` (capture date unknown), on an M5 Pro shared the whole time with many
other jobs (load averages of 7 to 180 on 18 cores), so the times are on the
slow side; each run is a minute of the screensaver ("watch") or of play with
the ball thrown every 3 s ("play"). Chromium can slow a page's own thread by
a factor, but refuses to slow a worker that way, so the frame figures are a
slow device's main thread with this machine's brain; the brain is measured
from its own ticks instead, below.

| Browser | Page CPU | Brain running | Title | Frames a second (median / slowest tenth) | JavaScript a frame | Level |
| --- | --- | --- | --- | --- | --- | --- |
| Chromium | 1× | 0.7–1.0 s | 1.9–2.3 s | 60 / 60 | 0.5–0.7 ms | 0 |
| Chromium | 4× | 1.5–2.0 s | 2.7–3.3 s | 60 / 60 | 2.4–2.7 ms | 0 |
| Chromium | 6× | 2.8–3.1 s | 4.0–4.3 s | 60 / 60 | 4.5–5.6 ms | 0 |
| Chromium | 12× | 5.5 s | 6.9 s | 59 / 55 | 12 ms | 0 |
| Chromium | 20× | 8.4–10.7 s | 10.1–10.7 s | 29–30 / 23–27 | 23–26 ms | 0 → 1 → 2 (30 frames), and in one run 3 (bigger pixels) |
| WebKit 26 | 1× | 1.6–2.0 s | 2.8–3.3 s | 60 / 51–53 | 1.0–2.0 ms | 0 |

Firefox wouldn't start in this environment (its sandbox), so it is
unmeasured. A first visit at 6× on a 1.6 Mbit/s, 150 ms connection had the
brain running after 80 s, 71 s of it the 14.2 MB at that speed, its progress
read 330 times and never going back.

The brain's own cost, in elapsed seconds per simulated second (including
OS preemption within a tick, but excluding worker queueing and delivery; the median and the slowest tenth of one-second spans), and the speed against
real time that would give on a CPU four or six times slower:

| Browser | Scenario | Cost | On 4× slower | On 6× slower |
| --- | --- | --- | --- | --- |
| Chromium | watch | 0.33 / 0.50 | 0.76× | 0.51× |
| Chromium | play | 0.23 / 0.44 | 1.00× | 0.74× |
| WebKit | watch | 0.25 / 0.34 | 0.99× | 0.66× |
| WebKit | play | 0.28 / 0.37 | 0.91× | 0.61× |

With the picture pinned at levels 0, 2, 3 and 5 the brain cost 0.38, 0.25,
0.41 and 0.27: no difference the noise doesn't explain. The brain runs in a
worker; these noisy figures do not establish how much drawing competes with
it.

The same brain in C++ (`packages/brain-native`, `node
packages/brain-native/scripts/bench.ts`, one thread, the same frames, on the
same loaded machine):

| | TypeScript | C++ | |
| --- | --- | --- | --- |
| At rest | 0.40 | 0.10 | 4.1× |
| Every sense at full strength | 0.77 | 0.27 | 2.9× |
| Eyes open, a steady scene | 0.32 | 0.12 | 2.6× |
| A disc looming over and over | 1.00 | 0.22 | 4.5× |
| A grating drifting across both eyes | 2.01 | 0.43 | 4.6× |
| The whole field flickering | 0.90 | 0.35 | 2.5× |

These main-thread throttling runs and worker-time extrapolations are not
measurements on phones. They motivated running the C++ brain as WebAssembly,
which supported browsers now do.

### The two brains

The same runs (`node scripts/measure.ts --brain typescript|wasm`), one of
each brain back to back to sample adjacent periods of load, on the same shared M5 Pro
(capture date unknown); the brain's cost as above (median / slowest tenth), the speed that
implies on a CPU four and six times slower (Chromium slows the page but not
the worker, so the worker's cost is multiplied, as above), init-to-ready elapsed time (from posting the worker's init message to
receiving its ready reply, including startup, scheduling, compilation and
building), the page's process's memory in Chromium,
the worker included, and the load average (TypeScript run, then
WebAssembly run). The eyes are open throughout; every run kept 60 frames.

| Browser | Scenario | Page CPU | TypeScript | WebAssembly | Faster | TypeScript on 4×, 6× slower | WebAssembly on 4×, 6× slower | Start, ms | Memory, MB | Load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chromium | watch | 1× | 0.29 / 0.34 | 0.20 / 0.23 | 1.4× | 0.86×, 0.57× | real time, 0.83× | 250 / 208 | 446 / 390 | 9, 8 |
| Chromium | watch | 4× | 0.26 / 0.43 | 0.21 / 0.26 | 1.2× | 0.97×, 0.65× | real time, 0.80× | 262 / 206 | 307 / 382 | 8, 6 |
| Chromium | watch | 6× | 0.60 / 0.69 | 0.30 / 0.41 | 2.0× | 0.41×, 0.28× | 0.83×, 0.56× | 377 / 316 | 444 / 303 | 187, 90 |
| Chromium | play | 1× | 0.30 / 0.35 | 0.19 / 0.22 | 1.6× | 0.83×, 0.55× | real time, 0.87× | 234 / 214 | 458 / 389 | 46, 110 |
| Chromium | play | 4× | 0.28 / 0.42 | 0.19 / 0.24 | 1.5× | 0.90×, 0.60× | real time, 0.88× | 261 / 229 | 501 / 437 | 13, 21 |
| Chromium | play | 6× | 0.31 / 0.37 | 0.21 / 0.26 | 1.5× | 0.81×, 0.54× | real time, 0.78× | 285 / 238 | 476 / 432 | 11, 13 |
| WebKit 26 | watch | 1× | 0.35 / 0.39 | 0.31 / 0.36 | 1.1× | 0.71×, 0.47× | 0.81×, 0.54× | 499 / 354 | | 154, 112 |
| WebKit 26 | play | 1× | 0.22 / 0.26 | 0.19 / 0.22 | 1.2× | real time, 0.77× | real time, 0.88× | 332 / 201 | | 10, 9 |

- **Chromium** (Chrome and Edge, and most Android browsers): the
  WebAssembly brain costs 0.19 to 0.21 s a second, against 0.26 to 0.31 for
  the TypeScript, 1.2 to 1.6 times less at an ordinary load. Multiplying those elapsed costs by four predicts real time for
  WebAssembly and 0.8 to 0.97 for TypeScript; by six, 0.8 to 0.88 against
  0.55 to 0.65. These are extrapolations, not phone results.
- **WebKit** (the Safari engine used for these runs): 1.1 to 1.2
  times less. The gain in these runs was small; these desktop timings do not
  establish how the two brains compare on an iPhone.
- **Memory**: the recorded WebAssembly worker held 95 MB once its brain was
  built, the
  TypeScript brain about 180 MB (`node packages/brain-native/scripts/bench.ts`);
  the page's process was about 45 to 70 MB smaller with it in four runs of six,
  and in the other two it went either way by more, as garbage collection
  fell.
- **Starting**: the recorded compile time for the 268 KB module was 2 or 3 ms.
  In the ordinary-load Chromium rows, startup was 200 to 240 ms after the
  connectome arrived, against 230 to 290 for TypeScript; the table also
  records slower starts.
- Measured again, a second time each with the load average at 60 to 110,
  Chromium's play at 1× cost 0.33 and 0.42. The engine order for this repeat
  was not recorded, so it cannot establish which was faster.

The packages/brain-native README has the same comparison brain alone, in
Node (where the recorded TypeScript and WebAssembly timings were similar; the
README's V8 sandbox explanation is an unverified hypothesis), Chromium and WebKit, and why it is no
more: the C++ runs 1.4 to 1.7 times slower as WebAssembly than natively.
What would take a six-times-slower phone to real time is in its list of
what more speed would cost.

## Being a good tab

`apps/web/src/page.ts`, in a browser only:

- **Hidden**, the game stops advancing each fly and sending brain ticks
  with the frames (even where the browser keeps frames coming). A worker
  tick already in flight may finish.
  Shown again, it carries on from where it was; the frame loop caps the
  resumed step at 100 ms. After more than half a minute away,
  clock-following sky and forecast-following weather settle to now before that frame is drawn. Manually chosen conditions stay as chosen; an online
  table follows its shared light where applicable.
- **A frozen or sleeping page** (a laptop lid closed with the tab showing, a
  phone in a pocket, a tab frozen in the background) wakes the same way: the
  game notices the wall clock has jumped between two frames, since no event
  says so. Nor is it taken for a stalled brain: only time while frames are
  coming counts toward the brain's 10 s stall limit.
- **The screen stays awake** (the Screen Wake Lock API) while the screensaver
  shows in a visible tab, and is let go otherwise. Browsers without it, or that
  refuse it, let the screen sleep as usual.
- **A lost graphics context** (a GPU reset, a phone reclaiming memory) is
  waited out with the fly living on unseen, and when it is given back three.js
  rebuilds its state and the game draws its reflections again.
- **The back-forward cache**: leaving and coming back either restores the
  page as it was, asleep since it left, or loads it afresh, using caches where available.
- **Days open**: `npm run soak:web -- --built` leaves the built game running
  from a subfolder, with its service worker. It samples page and brain-worker
  heaps after collection, three.js resources, DOM counts, frame cost
  and brain speed. Place circuits, weather/daylight, tools, menus, eyes and
  uninterrupted screensaver are separate phases; `npm run e2e:soak` is the fast
  resource regression. See [the soak guide](web-soak.md) for durations,
  comparable checkpoints and what still needs an Apple TV. Hidden-tab sleep,
  context loss, caching and offline recovery remain in `npm run e2e`.

The service worker (`apps/web/src/offline/sw.ts`) precaches the page and the
dependencies listed by the build, excluding the brain and link preview. After
successful caching, it can open offline. On navigation it asks the network for the page
first, falling back to the cached page after four seconds or a
failure. A new version's
service worker waits until every tab of the old one has closed, so a page
left open as a screensaver continues using its loaded
code. Navigating again can fetch a different version. The brain is not the
service worker's: the page keeps it, with its own progress and checks.

## Installing it

The build has a web app manifest: full screen, the theme colour of the space
round the picture, and icons rendered from the game (`scripts/art.ts`,
`assets/web/`): 192 and 512 px, a maskable 512 with the fly well inside the
middle, a 180 px home-screen icon for iPhone and iPad, and a favicon of the
fly alone. The page and social descriptions credit the connectome (FlyEM male CNS,
Janelia Research Campus, CC-BY 4.0), as the About screen does. The title
is just the name; the link preview is 1200×630, the launch shot with the
wordmark. In a production build with service-worker support,
`Page.keepForOffline` asks for persistent storage
(`navigator.storage.persist()`) when the display mode is standalone or
fullscreen. This can reduce eviction risk if granted; ordinary browser-mode
tabs do not ask. The recorded reason was to avoid a Firefox prompt, without
a retained platform capture.

It is named "flies". The installed name is `APP_NAME` in
`scripts/webBuild.ts`; `apps/web/index.html` also sets the title and social
metadata, and `ui/wordmark.ts` draws the title screen's name.

## In an iPhone or iPad app

`apps/ios` ([ios.md](ios.md)) shows the web build in a WKWebView, loading `index.html` from its
own bundle through a custom URL scheme (`WKURLSchemeHandler`). That works
as it is, with no network for solo play.
The platform observations below were recorded without a retained capture or
exact device/date metadata:

- the scheme handler serves `dist/` as it is, the brain's parts and its
  WebAssembly module included, at paths relative to the page; the WASM
  `Content-Type` does not affect compilation (it uses bytes, not
  streamed). The current app targets iOS and iPadOS 26.0 or later
  (`apps/ios/project.yml`); the page selects WebAssembly by feature detection
  and otherwise falls back to TypeScript;
- there is no service worker (it isn't offered there; registering fails
  quietly), and the Cache API, though there, keeps only `http` and `https`
  responses, so nothing is copied and the brain is read from the bundle on
  every launch, which is quick from local storage (measured in the iPhone
  and iPad app, [ios.md](ios.md));
- the page is a secure context there, so `crypto.subtle` checks each part's
  digest when the API is available and working; otherwise the check is skipped, and gzip's own check and
  the connectome's loader also validate the input; these are not a
  substitute for a working digest check;
- its WebSocket and `navigator.share` work as in Safari, so a table with
  others needs nothing of the app beyond the room server's address and the
  site's links, which the game knows it is in an app for (`fly:`).

The iOS app uses the worker; it does not implement the Apple TV's native brain
bridge (`NativeBrainBridge` in `packages/contracts/src/brain.ts`).

## Browsers

The version cutoffs below are recorded compatibility guidance, not a retained
browser-test matrix; the exact capture date is unknown. Engine selection
checks features (`wasmBrainSupported()`), not version numbers.

It needs WebGL 2, module Web Workers and `DecompressionStream`: Chrome and
Edge 80+, Firefox 114+, Safari 16.4+ (iOS and iPadOS 16.4+). The brain runs as
WebAssembly where the browser has WebAssembly's exceptions in their final
form (exnref): Chrome and Edge 137+, Firefox 131+, Safari 18.4+ (iOS and
iPadOS 18.4+); before those, as TypeScript. The wake lock
is Chrome and Edge 84+, Firefox 126+ and Safari 16.4+, and in an iPhone's or
iPad's home-screen app 18.4+.

## Where to host it

For the owner's Docker server at `flies.isaacthoman.com`, use the
[self-hosting instructions](deploy.md): a multi-stage web image, Caddy with
the headers above behind the owner's own HTTPS reverse proxy, and a Compose
stack with the room server. The options below are managed static
hosts for anyone who prefers those.

The following host comparison was recorded as checked on 16 November 2026; the
underlying capture is unavailable. Treat prices, quotas and policies as
historical and check the linked host documentation before choosing. Each
takes files built elsewhere: the connectome isn't in git, so a CI job fetches
it, builds, and uploads `dist/`, and the repository can stay private. Whatever
the host sends as `Cache-Control` matters less than it seems: on a second
visit the service worker serves the precached assets and the brain comes from its
own cache, provided the writes succeeded and storage was retained.

| | GitHub Pages | Cloudflare (Workers static assets) | Netlify |
| --- | --- | --- | --- |
| Largest file | none stated (a site up to 1 GB) | [25 MiB](https://developers.cloudflare.com/workers/platform/limits/#static-assets) | none stated, but ["files over 10 MB … are not well-supported"](https://docs.netlify.com/build/configure-builds/troubleshooting-tips/#large-files-or-sites) |
| From a private repository | [Pro or Team](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) ($4 a month) | yes, deployed from CI with Wrangler | yes for a person's, Pro for an organisation's |
| Response headers | can't be set | `_headers` | `_headers` (not `Content-Encoding` or range headers) |
| Byte ranges | not documented | [no](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/#range-requests): the whole file | not documented |
| Traffic | [100 GB a month, soft](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): about 6,900 first visits | [free and unlimited](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) for static files | [credits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/): the free 300 a month buy at most 15 GB, about 1,000 first visits |
| Cost | free for a public repository | free (Workers Paid, $5 a month, isn't needed) | free, then $9 a month |

The recorded managed option was **Cloudflare Workers static assets**: no limit on
static traffic, a file cap this build is far under, headers when wanted, a
[subdirectory](https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/)
if the site should live under one, and Cloudflare's own
[advice](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/#use-workers-static-assets-for-new-projects)
to use it over Pages for new projects. It answers a range request with the
whole file, so a broken part starts again, which costs at most 4 MiB. A CI
job would run `npm ci`, `npm run brain:fetch`, `npm run build`, then
`npx wrangler deploy` with a `wrangler.jsonc` naming `./dist` as its
`assets.directory`; the
repository has no Wrangler deployment configuration. For a site at the host's
root, a `_headers` file in `dist/` can request the cache lifetimes above.
Prefix the game paths with its folder when hosted under one; keep the app
association at the host's root:

```text
/
  Cache-Control: no-cache
/THIRD_PARTY_NOTICES
  Cache-Control: no-cache
/privacy
  Cache-Control: no-cache
/privacy/*
  Cache-Control: no-cache
/.well-known/apple-app-site-association
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/brain/*
  Cache-Control: public, max-age=31536000, immutable
```

The recorded comparison also allowed GitHub Pages for a public repository or
paid plan, and estimated about a thousand first visits from Netlify's free
traffic allowance. Those policy and capacity estimates need rechecking.


## Release documents

The build checks and emits [third-party notices](licenses.md). A static [privacy policy](privacy.md)
is emitted only when all four [owner build variables](deploy.md#privacy-publication) are complete. At the host root,
serve `/privacy` as `privacy/index.html` (a directory redirect is fine), never as the game's SPA fallback.
The supplied Caddy config and `scripts/serve.ts` handle that path;
with a subfolder base, `scripts/serve.ts` expects the policy under that base.
The service worker keeps the policy
for offline navigation too. About → Acknowledgements reads its bundled notice sections without a fetch.
Otherwise `/privacy` must answer 404. Any empty owner field omits the policy; once
all are nonempty, angle-bracket placeholders stop the build. Before publishing, verify production log/backup retention.

<!-- docs-check: base apps/web/src -->

<!-- docs-check: generated index.html -->

<!-- docs-check: generated sw.js -->

<!-- docs-check: generated manifest.webmanifest -->

<!-- docs-check: generated privacy/index.html -->

<!-- docs-check: generated ./dist -->
