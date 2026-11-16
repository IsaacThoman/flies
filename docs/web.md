# The web build

The game is a web page underneath, and the web build is a real way to have
the fly: a link anyone can open on a laptop, a phone or a tablet and leave
open as a wallpaper, or install as an app. It is plain files that work from
any static host and from any folder on it; nothing needs a server.

## Building it

```sh
npm install
npm run brain:fetch      # the packed connectome, once (38 MB, not in git)
npm run build            # the site, into dist/
npm run serve -- --base /fly/   # try it as a host would serve it: http://127.0.0.1:8080/fly/
```

`FLY_SITE_URL=https://example.org/fly/ npm run build` makes the link
preview's picture and address absolute, which most sites that show link
previews need; without it they are relative and the rest works the same.

## What to upload

All of `dist/`, as it is, to any folder of the host. About 17 MB:

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
| `brain/anatomy.<n>.<hash>.bin` | where each neuron is (`packages/brain/src/anatomy.ts`), 0.9 MB, if `npm run brain:fetch` built it; nothing loads it yet | the same | the same |

Every file whose contents can change has its contents in its name, so it can
be kept forever; the three that can't (the page, its manifest and the service
worker) are small and must be asked for again each time (`no-cache`, which
still lets a browser revalidate and keep the page in its back-forward cache;
not `no-store`). `scripts/serve.ts` serves exactly this.

What matters, and why:

- **No file over 4 MiB.** Hosts cap a single file at 25 MiB (Cloudflare) or
  warn about anything over 10 MB (Netlify); the brain's parts are well under
  both.
- **The brain arrives as it is.** The connectome's parts are already gzipped (below) but
  are plain binary files to a host: none ends in `.gz`, so no host takes one
  for something to serve with `Content-Encoding: gzip`. A host that
  compresses them again on the way does no harm; the browser undoes it.
- **Byte ranges** (`Accept-Ranges: bytes`, `206 Partial Content`) let a part
  that breaks off carry on from the byte where it stopped. Without them
  (Cloudflare's static assets answer a range with the whole file) that part
  starts again, which is at most 4 MiB; the parts already in hand are kept.
- **https.** The service worker (opening offline), the browser's cache for the
  brain and its module, the digest check and the wake lock all need a secure page. Over plain
  http the game still runs, but downloads its brain every time.
- **Nothing else.** No headers beyond these, no rewrites, no server code, no
  cross-origin isolation.

The build makes no requests to any other site: no fonts, scripts, analytics
or CDNs. `apps/web/tests/build.test.ts` reads the built files for any, and
the end-to-end run (`apps/web/e2e/web.e2e.ts`) records every request the
browser makes and fails on one that isn't to the site.

## Getting the brain to the browser

Two files: the connectome, below, and the simulation that runs on it. That is
the brain's C++ (`packages/brain-native`) built as WebAssembly, where the
browser can run it (Chrome and Edge 137+, Firefox 131+, Safari 18.4+), and
otherwise `packages/brain`'s TypeScript, which comes with the page's own
script. Both are the same simulation, to the bit (the C++'s README says how);
the WebAssembly one is faster in Chromium and needs half the memory
(measured below). `?brain=typescript` or `?brain=wasm` on the page's address
picks one, for tests and for comparing them; nothing shows it to players.

The module, `brain/fly-brain.0.<hash>.wasm`, is fetched first (it is small)
and kept the same way as the connectome's parts, in a cache of its own
(`fly-brain-module`), counted with them on the loading screen ("3.2 of 14.5
MB"). It isn't gzipped by the build, so a host serves it as it serves any
`.wasm` and may compress it on the way; the worker compiles it from its bytes,
so the type it is served with doesn't matter. The worker then unzips the
connectome straight into the module's memory and builds the brain there:
the 40 MB are never held twice.

The packed connectome (`packages/brain`) is 40 MB, 21 MB gzipped. The build
rearranges it before gzipping (`apps/web/src/brain/wire.ts`): the sorted
columns become the steps between neighbours (each neuron's targets step up
through the neuron numbers in small steps), and every 16- and 32-bit column is
split into byte planes, so the near-empty high bytes run together. Gzipped,
that is **14.2 MB**, a third less, decoded in the brain's worker as it is
unzipped (`DecompressionStream`, about 80 ms of decoding on a desktop) with
nothing held but the result. Brotli would make the plain file 15.3 MB but
needs the host to serve it with `Content-Encoding: br`, which static hosts
decide for themselves, and browsers can't unzip it from script; a
pre-compressed file decompressed in the worker works the same on every host.

The gzipped file is cut into parts of at most 4 MiB, each named for its own
contents (`scripts/webBuild.ts`), and `apps/web/src/brain/download.ts`:

- takes each part from the browser's cache (the Cache API, `fly-brain`: a
  second data file, such as the neurons' positions, gets a cache of its own,
  made the same way by `dataFile` in `scripts/webBuild.ts`) when
  it is there, checked against the SHA-256 the build recorded, and otherwise
  fetches it, counting the bytes for the loading screen ("3.2 of 14.2 MB");
- carries a broken or stalled part (nothing for 20 s) on from where it
  stopped, with a range request where the host serves them, a few times with
  growing pauses before it says so;
- checks each part against its digest before keeping it, so a damaged or
  wrong file is never kept, and keeps it the moment it is whole: a page closed
  halfway through the download fetches only the rest next time;
- lets go of any other brain in the cache: a new deploy with a new brain has
  new part names, and the old ones are deleted, so a phone never holds two;
- runs on without keeping it if the browser's storage is full, and says so
  under "Awake!".

The loading screen says what went wrong in a word or two, with **Try again**
(Select or Enter, a tap or a click): you're offline (and it tries by itself
when the network is back), the download stopped (it carries on from there),
the brain isn't on this server, it arrived damaged (fetched again), there
isn't the memory for it, this browser can't run it (no module workers, or no
`DecompressionStream`), or this browser can't draw its world (no WebGL 2,
drawn in 2D in the game's own look). A brain that crashes or stalls later
brings the same screen back.

Measured on the built site (`npm run e2e`, Chromium on an M-series Mac):

| | Over the wire | Time to the title (with the 1.2 s "Awake!") |
| --- | --- | --- |
| First visit, 2.5 MB/s, the first part broken off at 3 MB and resumed | 14.2 MB | 9.9–10.6 s |
| Second visit, network off | 0 (the page from the service worker, the brain from the cache) | 1.7–2.1 s |

What a slower device does with it is in the measurements below.

## Running on what people have

The TypeScript brain costs about 0.12 s of one core per simulated second at
rest and up to 0.4 s with the eyes busy (`packages/brain/README.md`). A slow
brain runs the fly slower than real time rather than falling behind
(`BrainDriver.tick`), and "Inside its brain" shows by how much.

In a browser the game watches its own pace (`apps/web/src/quality.ts`): the
time between frames, and how fast the brain runs against real time, judged
every two seconds. Two bad judgements in a row and it draws less, a step at a
time:

| Level | Frames | Pixels | The eyes |
| --- | --- | --- | --- |
| 0 | 60 a second | as chosen | as chosen |
| 1 | 60 | as chosen | no finer than Low |
| 2 | 30 | as chosen | Low |
| 3 | 30 | no finer than Chunky (half the frame each way) | Low |
| 4 | 30 | Chunky | Low, refreshing half as often |
| 5 | 30 | Chunkier (a third of it each way) | Low, half as often |

The frame takes the screen's shape (`display.ts`), so each step keeps it,
square pixels and all, at a quarter and a ninth of the pixels: 370×208 and
247×139 in a 16:9 window, 188×408 and 126×272 on a phone held upright. A step
changes only the size the world is drawn at; nothing is built again. Never
more than Settings asks for, and the player choosing pixels or eyes in
Settings is taken at their word until the device shows again that it can't
keep up. After 30 s of easy going it tries a step back up; if that goes badly
it steps straight back and waits twice as long before trying again. When it
is the brain that falls behind, it steps down until the brain keeps up (on a
phone whose cores share one power budget, less drawing leaves more for the
brain); if even the cheapest picture doesn't get it there, the picture goes
back to where it was and stays, and the brain is left running as fast as the
device allows. Only a level that is known to have helped is remembered.
The brain itself is never slowed, thinned or given less to see to make the
picture smoother, and the eyes are never switched off. Hidden tabs, the
moment a place is built, the pause menu and the loading screen are not held
against the device. The level it settled at is kept and the next start
begins a step better. 120 Hz screens get 60 frames: twice the frames would be
twice the work for nothing anyone sees. (A screen only a little faster than
60 Hz is left alone: holding it to 60 would drop a frame every few seconds.
And an iPhone in Low Power Mode, which offers 30 frames a second, costs a
level or two the first time, since a capped screen and a slow one look alike
from the page.)

### Measured

`node scripts/measure.ts`, on an M5 Pro shared the whole time with many
other jobs (load averages of 7 to 180 on 18 cores), so the times are on the
slow side; each run is a minute of the wallpaper ("watch") or of play with
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

The brain's own cost, in seconds of one core per second of fly time (the
median and the slowest tenth of one-second spans), and the speed against
real time that would give on a CPU four or six times slower:

| Browser | Scenario | Cost | On 4× slower | On 6× slower |
| --- | --- | --- | --- | --- |
| Chromium | watch | 0.33 / 0.50 | 0.76× | 0.51× |
| Chromium | play | 0.23 / 0.44 | 1.00× | 0.74× |
| WebKit | watch | 0.25 / 0.34 | 0.99× | 0.66× |
| WebKit | play | 0.28 / 0.37 | 0.91× | 0.61× |

With the picture pinned at levels 0, 2, 3 and 5 the brain cost 0.38, 0.25,
0.41 and 0.27: no difference the noise doesn't explain. The brain has a core
of its own, and the picture doesn't take from it here.

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

So a phone four to six times slower than this machine draws the game at 60
frames with room to spare, but its TypeScript brain, with the eyes open,
lives at about half to three quarters of real time, and no cheaper picture
changes that. That was the case for running the C++ brain as WebAssembly,
which is what browsers that can now do.

### The two brains

The same runs (`node scripts/measure.ts --brain typescript|wasm`), one of
each brain back to back so both meet the same load, on the same shared
machine; the brain's cost as above (median / slowest tenth), the speed that
implies on a CPU four and six times slower (Chromium slows the page but not
the worker, so the worker's cost is multiplied, as above), how long the
worker took from the connectome's arrival to a running brain (unzipping,
compiling the module, building), the page's process's memory in Chromium,
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
  the TypeScript, 1.2 to 1.6 times less at an ordinary load. On a phone four
  times slower it lives in real time, with room, where the TypeScript lives
  at 0.8 to 0.97; on one six times slower neither does: 0.8 to 0.88 against
  0.55 to 0.65.
- **WebKit** (Safari, and every browser on an iPhone or iPad): 1.1 to 1.2
  times less. JavaScriptCore compiles the TypeScript's typed-array loops
  nearly as well as the C++, so the gain is small, but it is there, and an
  iPhone's brain is no slower for it.
- **Memory**: the module holds 95 MB once the brain is built, the
  TypeScript brain about 180 MB (`node packages/brain-native/scripts/bench.ts`);
  the page's process was 45 to 70 MB smaller with it in four runs of six,
  and in the other two it went either way by more, as garbage collection
  fell.
- **Starting**: compiling the 268 KB module takes 2 or 3 ms; the brain is
  running 200 to 240 ms after the connectome arrives, against 230 to 290
  for the TypeScript.
- Measured again, a second time each with the load average at 60 to 110,
  Chromium's play at 1× cost 0.33 and 0.42: the order holds, the size of the
  gap moves with the load.

The packages/brain-native README has the same comparison brain alone, in
Node (where the TypeScript runs as fast as the WebAssembly, probably because
Node's V8, unlike Chrome's, has no sandbox around its typed arrays), Chromium and WebKit, and why it is no
more: the C++ runs 1.4 to 1.7 times slower as WebAssembly than natively.
What would take a six-times-slower phone to real time is in its list of
what more speed would cost.

## Being a good tab

`apps/web/src/page.ts`, in a browser only:

- **Hidden**, the fly's life and its brain stop with the frames (the game
  skips them even where a browser keeps frames coming for a hidden page) and
  the sound is suspended. Shown again, it carries on from where it was, the
  first frame no longer than any other; after more than half a minute away,
  the sky and the weather are put where the clock and the forecast have them
  now, before that frame is drawn, not eased there from where they were.
- **A frozen or sleeping page** (a laptop lid closed with the tab showing, a
  phone in a pocket, a tab frozen in the background) wakes the same way: the
  game notices the wall clock has jumped between two frames, since no event
  says so. Nor is it taken for a stalled brain: only time while frames are
  coming counts toward the brain's 2 s stall limit.
- **The screen stays awake** (the Screen Wake Lock API) while the wallpaper
  shows in a visible tab, and is let go otherwise. Browsers without it, or that
  refuse it, let the screen sleep as usual.
- **Sound** starts on the first press, tap or click, from inside that event,
  as Safari requires.
- **A lost graphics context** (a GPU reset, a phone reclaiming memory) is
  waited out with the fly living on unseen, and when it is given back three.js
  rebuilds its state and the game draws its reflections again.
- **The back-forward cache**: leaving and coming back either restores the
  page as it was, asleep since it left, or loads it afresh from the caches.
- **Days open**: `node scripts/webSoak.ts` leaves the built game as a
  wallpaper, carrying the fly between places every few seconds, and prints the
  JavaScript heap after a garbage collection and three.js's geometries,
  textures and programs each lap. Over 80 moves (`--minutes 9 --every 5`)
  the textures stay at 18, the programs at 39 and the geometries at 44, and
  the heap settles at about 21 MB after the first few laps. It found the
  picnic and the bar each leaving a texture behind on every visit (the gull's
  shadow, and the counter's contact shadows, which only uniforms added as the
  shader compiles held); both are fixed.

The service worker (`apps/web/src/offline/sw.ts`) keeps the page and every
file it loads, so it opens with no network; it asks the network for the page
first, so a new version shows as soon as there is one. A new version's
service worker waits until every tab of the old one has closed, so a page
left open as a wallpaper keeps the files it started with. The brain is not the
service worker's: the page keeps it, with its own progress and checks.

## Installing it

The build has a web app manifest: full screen, the theme colour of the space
round the picture, and icons rendered from the game (`scripts/art.ts`,
`assets/web/`): 192 and 512 px, a maskable 512 with the fly well inside the
middle, a 180 px home-screen icon for iPhone and iPad, and a favicon of the
fly alone. The page's title, description and link preview (1200×630, the
launch image's shot with the wordmark) credit the connectome (FlyEM male CNS,
Janelia Research Campus, CC-BY 4.0), as the About screen does. An installed
copy asks the browser to keep its storage (`navigator.storage.persist()`), so
the brain isn't cleared when space runs short; a plain tab doesn't ask,
since Firefox would show a prompt.

It is named "Flies", what the title screen's wordmark says:
`APP_NAME` in `scripts/webBuild.ts` and the page's `<title>` are the two
places it is set.

## In an iPhone or iPad app

`apps/ios` ([ios.md](ios.md)) shows the web build in a WKWebView, loading `index.html` from its
own bundle through a custom URL scheme (`WKURLSchemeHandler`). That works
as it is, with no network:

- the scheme handler serves `dist/` as it is, the brain's parts and its
  WebAssembly module included, at paths relative to the page; any
  `Content-Type` will do (the module is compiled from its bytes, not
  streamed). WKWebView runs WebAssembly, and on iOS and iPadOS 18.4+ this
  module; before that the page runs the TypeScript brain;
- there is no service worker (it isn't offered there; registering fails
  quietly), and the Cache API, though there, keeps only `http` and `https`
  responses, so nothing is copied and the brain is read from the bundle on
  every launch, which is quick from local storage (measured in the iPhone
  and iPad app, [ios.md](ios.md));
- the page is a secure context there, so `crypto.subtle` checks each part's
  digest; where it is missing the check is skipped, and gzip's own check and
  the connectome's loader catch damage;
- or the app runs the C++ brain itself and exposes it as
  `globalThis.__native.brain` (`NativeBrainBridge` in
  `packages/contracts/src/brain.ts`), as the Apple TV app does: the game then
  skips the download and the worker altogether.

## Browsers

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
automatic HTTPS and the headers above, and a Compose stack with a slot for
the future multiplayer room server. The options below are managed static
hosts for anyone who prefers those.

Checked against each host's own documentation on 16 November 2026. Each
takes files built elsewhere: the connectome isn't in git, so a CI job fetches
it, builds, and uploads `dist/`, and the repository can stay private. Whatever
the host sends as `Cache-Control` matters less than it seems: on a second
visit the service worker serves the page's files and the brain comes from its
own cache.

| | GitHub Pages | Cloudflare (Workers static assets) | Netlify |
| --- | --- | --- | --- |
| Largest file | none stated (a site up to 1 GB) | [25 MiB](https://developers.cloudflare.com/workers/platform/limits/#static-assets) | none stated, but ["files over 10 MB … are not well-supported"](https://docs.netlify.com/build/configure-builds/troubleshooting-tips/#large-files-or-sites) |
| From a private repository | [Pro or Team](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) ($4 a month) | yes, deployed from CI with Wrangler | yes for a person's, Pro for an organisation's |
| Response headers | can't be set | `_headers` | `_headers` (not `Content-Encoding` or range headers) |
| Byte ranges | not documented | [no](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/#range-requests): the whole file | not documented |
| Traffic | [100 GB a month, soft](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): about 6,900 first visits | [free and unlimited](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) for static files | [credits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/): the free 300 a month buy at most 15 GB, about 1,000 first visits |
| Cost | free for a public repository | free (Workers Paid, $5 a month, isn't needed) | free, then $9 a month |

**Cloudflare Workers static assets**, free, is the managed option to use: no limit on
static traffic, a file cap this build is far under, headers when wanted, a
[subdirectory](https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/)
if the site should live under one, and Cloudflare's own
[advice](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/#use-workers-static-assets-for-new-projects)
to use it over Pages for new projects. It answers a range request with the
whole file, so a broken part starts again, which costs at most 4 MiB. A CI
job would run `npm ci`, `npm run brain:fetch`, `npm run build`, then
`npx wrangler deploy` with a `wrangler.jsonc` naming `./dist` as its
`assets.directory`; nothing has been set up or deployed. For the cache
lifetimes in the table above, a `_headers` file in `dist/`:

```text
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

GitHub Pages works too, if the repository is public or on a paid plan, but
nothing about its responses can be set. Netlify's free traffic would run out
after about a thousand first visits a month.
