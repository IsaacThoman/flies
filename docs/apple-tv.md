# The Apple TV app

<!-- docs-check: base apps/tvos -->
<!-- docs-check: base apps/tvos/src -->
<!-- docs-check: base apps/tvos/runtime -->
<!-- docs-check: generated apps/tvos/www/ -->
<!-- docs-check: generated apps/tvos/src/generated/ -->
<!-- docs-check: generated src/generated/ops.h -->
<!-- docs-check: generated www/runtime.js -->
<!-- docs-check: generated www/game.js -->
<!-- docs-check: generated www/config.json -->
<!-- docs-check: generated www/brain/connectome.bin -->
<!-- docs-check: generated runtime.js -->
<!-- docs-check: generated game.js -->
<!-- docs-check: external packages/brain/data/connectome.bin -->

`apps/tvos` runs the game's own JavaScript (the same game entry point, bundled separately for tvOS) on an Apple TV. There is no
WebView: tvOS's WebKit is private API. Instead an Objective-C++ host runs the script in the
public JavaScriptCore framework, with a small browser in TypeScript (`apps/tvos/runtime`) that
fakes enough of the DOM and Web APIs for three.js and the game. three's ordinary
`WebGLRenderer` draws through a home-made WebGL 2 that records calls into shared command
buffers, which native code replays on OpenGL ES 3.0. 2D canvases are CoreGraphics, and the fly's
brain is C++ on a thread of its own, one per fly. Built with WeatherKit, a Swift service tells the game the
weather outside. The target links public frameworks; that does not establish App Review acceptance.

Paths beginning `src/`, `runtime/`, `weather/` or `tests/` in this document are relative to
`apps/tvos/`; `packages/`, `apps/`, `scripts/` and `assets/` are relative to the repository root.
Build outputs under `apps/tvos/www/` and `apps/tvos/src/generated/`, and `Flies.xcodeproj`, are generated.

Historical measurements below are retained observations, not fresh verification of current code.
Their stated dates and machines are the available metadata; unrecorded build identities, capture
dates and hardware details are unknown. Raw captures were not available for this documentation
check, so the results remain independently unverifiable.

## How it works

Three principal host execution contexts in the default render mode, plus one thread per brain
(other queues and system tasks also run):

| Thread | Owns | Code |
| --- | --- | --- |
| Main | UIKit: the layer frames are shown in, the remote's presses and touches, the GameController framework, the splash | `src/main.mm`, `src/Remote.mm` |
| JavaScript | The JavaScriptCore context: runs `runtime.js`, then `game.js`, animation frames from a `CADisplayLink`, timers, events | `src/Host.mm`, `runtime/` |
| Render | The OpenGL ES context: replays WebGL and 2D canvas commands a frame behind JavaScript, presents | `src/Renderer.mm`, `src/Executor.mm`, `src/Canvas2D.mm` |
| Brain, one per fly | Its own `fly_brain`: loads the connectome, steps the simulation whenever time is waiting | `src/BrainBridge.mm`, `packages/brain-native` |

Built with WeatherKit, the weather outside is found on the main thread (Core Location, timers)
and in Swift's own tasks (the request), and read from the JavaScript thread
([The weather outside](#the-weather-outside)). A table's line to its room is handled on a queue of
its own, and the system keyboard on the main thread ([Playing together](#playing-together)).

WebGL calls that return nothing are encoded into one of four 4 MiB command buffers and run later on the render thread. Object handles are numbered in
JavaScript, so creating a buffer or texture doesn't wait. Calls that need an answer
(`getParameter`, shader and link status, `readPixels`, `getBufferSubData`, `getImageData`)
can hand the buffer over and wait for the render thread to catch up (cached answers need no query): see [Reading pixels
back](#reading-pixels-back). 2D canvas drawing goes into the same stream, so a `CanvasTexture`
sees earlier drawing commands before its upload.

WebGL's default framebuffer is an FBO the size of the canvas (640×480), shown in a
`CAEAGLLayer` stretched over the screen. The game renders at 640×480 and lays itself out for
16:9; the stretch makes the pixels wide. Scaling is nearest-neighbour unless the launch config
says otherwise.

The splash (the launch image) stays up until the screen canvas has `data-ready="true"` (or 30
seconds), then fades. The screen saver is off while the app is open.

## Building and running

Uses a Mac with Xcode (the recorded toolchain was Xcode 27) and XcodeGen (`brew install xcodegen`), and the connectome
(`npm run brain:fetch`). For a device: an Apple TV 4K on tvOS 26 or later, paired with the Mac
(Settings → Remotes and Devices → Remote App and Devices on the TV, then Xcode's Devices window or
`xcrun devicectl manage pair`), and a paid developer team signed in to Xcode. Builds sign with
`TVOS_TEAM_ID` (default `PX72AL9366`) and `TVOS_BUNDLE_ID` (default `com.isaacthoman.flies`).
The app used to be `com.isaacthoman.appletvfly`: a TV with that one installed gets this as a
separate app, with its settings starting fresh, and the old one can be deleted.
`TVOS_WEATHERKIT=1` builds in the weather outside, which needs the App ID set up first: see
[Turning it on](#turning-it-on-for-the-owner). Without it the app is built as it always was, with
no Swift, no WeatherKit, no location and no entitlements.

```sh
npm run tvos -- build                    # the game, for an Apple TV
npm run tvos -- build --sim              # ...for the tvOS simulator
npm run tvos -- build --sim --test-scene --stand-in-brain
TVOS_WEATHERKIT=1 npm run tvos -- build  # with the weather outside (WeatherKit)
npm run tvos -- run --sim <udid>         # install and launch, printing the console
npm run tvos -- run --device <udid> --config '{"script":"game.js","stats":2}'
npm run tvos -- run --device <udid> --detached --config '{"script":"game.js","stats":10,"logFile":true}'
npm run tvos:soak -- --device <udid> --minutes 30
npm run tvos:soak -- --device <udid> --minutes 20 --table   # ...in a room of eight
npm run tvos:soak -- --device <udid> --minutes 10 --flies 3 # ...living three flies (also with --table)
npm run tvos -- build --local-rooms      # ...that can reach a room server over plain ws://
ROOMS_URL=ws://192.168.1.20:8787/rooms npm run tvos -- build   # with that room server built in
npm run tvos:check                       # the simulator check (below)
npm run tvos:check -- --weatherkit       # ...with the real weather service
npm run tvos -- archive --version 0.1.1   # archive for the App Store (docs/release.md)
```

`build`:

1. writes `src/generated/ops.h` (the command stream's opcodes) and the asset catalog from
   `assets/` (`scripts/tvosAssets.ts`);
2. bundles the runtime (`runtime/index.ts`) with rolldown into `www/runtime.js`;
3. builds the page as one classic script, `www/game.js`, with Vite (`apps/tvos/vite.config.ts`):
   `apps/web/src/main.ts`, or `apps/tvos/tests/scene.ts` with `--test-scene`. The host has no
   module loader, so everything is inlined; any configured public assets are copied beside it;
4. copies `packages/brain/data/connectome.bin` to `www/brain/` (and stops, saying how to get
   it, if it isn't there);
5. generates `Flies.xcodeproj` (XcodeGen, `project.yml`, with `weather.yml` and
   `weatherkit.yml` merged in when the weather is wanted, and `local-rooms.yml` for a room server
   without TLS: [Playing together](#playing-together)) and builds it with xcodebuild.

The Xcode project includes the source directory `packages/brain-native/src/` with the tvOS target flags (`-O2 -DNDEBUG -ffp-contract=off`). `--stand-in-brain` compiles
`apps/tvos/tests/brain-stand-in/` instead: a fake `fly_brain` with predictable answers, for
checking the bridge. The build stops with a message if the brain folder has no sources.

The home-screen icon, Top Shelf banners and launch image come from `assets/`
([assets/README.md](../assets/README.md)); `npm run tvos:art` renders them from the game
itself.

### The launch config

JSON, from `--config` on the command line, else `www/config.json` (what the home screen runs).

| Key | Meaning |
| --- | --- |
| `script` | The script to run, under `www/`: `game.js` |
| `url` | The page's URL (`location`); its origin maps to the app's files. Default `http://fly.local/` |
| `fit` | `fill` (default) stretches the 640×480 canvas over the screen; `contain` letterboxes it |
| `pixelated` | Nearest-neighbour scaling, default `true`; `false` for linear |
| `mode` | `2` (default): GL runs on the render thread a frame behind. `1`: on the JavaScript thread at the end of each frame. `0`: as each call is made, for comparison |
| `fps` | Caps the frame rate (default 60) |
| `stats` | Logs frame timings every N seconds as `stats {json}`: fps, JavaScript and GL ms per frame, draws, memory, and `cpu`, the percentage of a core each of the host's threads used since the last line: the JavaScript and render threads, each fly's brain (`flies.brain.N`), the rest as `other`, and `total` |
| `logFile` | Redirects stderr to `Library/Caches/performance.log` in the app container, replacing the previous run's log; defaults to `false` |
| `profile` | With `stats`: time spent in each WebGL and 2D canvas method |
| `gpuTiming` | `glFinish` after every frame, to time the GPU (slows it down) |
| `deferReads` | Reads into a pixel-pack buffer wait for their copy rather than for the GPU ([Reading pixels back](#reading-pixels-back)): on by default on a device, off in the simulator |
| `glDebug` | Checks `glGetError` after every GL command |
| `typed` | Answers for the keyboard in unattended runs: each keyboard shown is answered with the next after 1.5 s, as if typed and confirmed (`null`: as if the player went back). The check uses it; nothing else should |
| `drive` | Scripted remote input for unattended runs, waiting on the canvas's `data-*` state: `[["wait", {"ready": "true"}], ["press", "ArrowRight", 650], ["swipe", "ArrowUp"], ["touch", 0.5, -0.2, true], ["sleep", 500], ["log", "mark"]]`. Presses, swipes and touches go through the same native code as the remote's (`runtime/report.ts`) |

`devicectl ... --console` (what `run --device` uses) attaches a debugger, which slows
JavaScript down in historical observations (about 1.5x; capture date and machine unknown).
Use detached runs for measurements.

Use `--detached` with `logFile` for device measurements. `tvos:soak` installs and launches the
last physical-device build without attaching. It logs when the splash lifts (`drive:
{"ready":"true"}`; the line's `[js ms]` is the time since the host started), exercises feeding,
ball throws, the eye picture at Low and High, and pause/settings, then carries the fly to each
place in turn. It pins the first through Settings, so the screensaver doesn't move it on. Settings
applies the place after the choice rests for one second or its row/screen is left; the soak
sets the pin once and the Place tool moves it afterward. It shows each place in every weather and light for 5 seconds, and watches its
screensaver at midday and at night, `--minutes` in total split among them. The screensaver delay is a saved setting (30 seconds by default). A historical
30-minute soak took about 55 minutes. It assumes the
default tool variants and Low eyes, and restores Low before the screensaver phases. It leaves the
app running, pinned to the last place. `--flies N` first sets Settings' Flies to N and waits
until that many live (at a table it brings N, and the fakes take the other seats); the count
stays set afterwards. Do not attach a console or enable `profile`,
`gpuTiming` or `glDebug` for the final measurement. Pull its log while it runs or after `drive: soak complete`:

```sh
xcrun devicectl device copy from --device <udid> \
  --domain-type appDataContainer --domain-identifier com.isaacthoman.flies \
  --source Library/Caches/performance.log --destination /tmp/fly-performance.log
```

The single-player soak currently presses Down four times from Play to reach Settings
(`scripts/tvosSoak.ts`), but the current menu puts Online there. It can therefore time out
waiting for Settings; the sequence above describes its intended coverage, not a passing run
of the current script. The table soak uses a separate sequence. The single-player soak also omits `?alone`, so
  default automatic room joining can interfere with its intended solo coverage.

Reports include the canvas state, elapsed `atMs`, and `thermalState` (0 nominal, 1 fair,
2 serious, 3 critical). `intervalMs` measures animation-frame starts; `completedIntervalMs`
measures render-thread frame completions. Neither is a hardware scanout measurement. Check
their tails as well as average FPS, and compare early and late windows for slowdown and memory
growth. The host retains 4096 frame records (about 68 seconds at 60 FPS); choose a stats interval
shorter than the history at the measured frame rate.

## The Web APIs that exist

This is a partial browser API implementation; some missing operations are inert shims rather
than exceptions. JavaScriptCore provides modern JavaScript features, including `Intl`, typed arrays, `Promise`, `WeakRef`,
`FinalizationRegistry`. There is no JIT. The historical estimate was about 16 times slower than a
desktop browser; capture date, workload and comparison machine are unknown.

- **Window**: `window`/`self`/`globalThis`, `addEventListener` etc., `innerWidth`/`innerHeight`
  (fixed at 1920×1080), `devicePixelRatio` (1), `screen`, `matchMedia` (static answers),
  `getComputedStyle` (the element's own `style`), `location` (URL getters and writable hash; navigation methods log and do not navigate), `history` (inert), `navigator` (`getGamepads()` is always empty).
- **Document**: `document.getElementById`, `querySelector(All)` (tag, `#id`, `.class` and
  combinations; no combinators), `createElement`, `body`, `head`, `activeElement`,
  `visibilityState` and `visibilitychange` (when the app goes to the background), `fonts`.
  `<canvas id="game">` is in the body before the script runs, as in `apps/web/index.html`.
  Elements are a tree with attributes, `dataset`, `style` and `classList`, but nothing is laid
  out or drawn: every element reports the screen's size.
- **Events**: `Event`, `CustomEvent`, `KeyboardEvent` (the remote; see below) with capture and
  bubbling. `MouseEvent`, `PointerEvent` and `WheelEvent` exist as classes. Native remote input does
  not generate them; an element's `click()` dispatches a synthetic `MouseEvent`.
- **Canvas**: `getContext('webgl2')` on one canvas (the screen canvas; a second WebGL canvas
  gets `null`) and `getContext('2d')` on any number of others. No WebGL 1, no
  `OffscreenCanvas`, no `toDataURL` (returns `data:,`) or `toBlob` (gives `null`).
- **WebGL 2**: all of it that three.js uses, on OpenGL ES 3.0. Only the runtime's explicit extension whitelist is exposed, subject to native support.
  The recorded simulator observation had `EXT_color_buffer_half_float` but not `EXT_color_buffer_float`: `RGBA16F`
  render targets work (the test scene checks one), `RGBA32F` ones are incomplete. three warns
  "EXT_color_buffer_float extension not supported" at start-up because it asks for that
  extension whenever it makes an `RGBA16F` target, which `PMREMGenerator` does for the
  reflections; they render all the same. Use `HalfFloatType` or `UnsignedByteType` render
  targets, never `FloatType`. No timer queries, no
  transform feedback, no `KHR_parallel_shader_compile`: a shader compiles the first time it's
  drawn, which stalls that frame; warm materials up (`renderer.compile`) while the splash is up.
  `antialias: true` requests up to 4x MSAA, bounded by the GPU's sample limit; the game's look wants `false`.
  Fences (`fenceSync`, `clientWaitSync`, `getSyncParameter`) are real.
- **2D canvas**: CoreGraphics. Paths, `roundRect`, `Path2D`, fills and strokes, gradients
  (linear, radial, conic), patterns, line dashes, shadows, clipping, every
  `globalCompositeOperation`, transforms, `drawImage`, `get`/`putImageData`, `fillText`,
  `strokeText`, `measureText`, `letterSpacing`. Not: `filter` (accepted, ignored),
  `isPointInPath`/`isPointInStroke` (always false), `direction` (stored but not passed to native drawing).
  Text uses the fonts the page has loaded with `FontFace`, else a system font, with a monospaced fallback for monospace.
- **Fonts**: `new FontFace(family, 'url(fonts/x.woff2)' or bytes, { weight, style })`,
  `face.load()`, `document.fonts.add(face)`, `document.fonts.ready`, with TTF, OTF or WOFF
  files from the app's bundle; WOFF2 has no retained verification here. No CSS
  `@font-face`.
- **Images**: `Image`/`<img>`, `createImageBitmap` (from a `Blob`, an image or a canvas),
  `ImageBitmap`, from the app's files, `blob:` and `data:` URLs (PNG, JPEG, anything ImageIO
  reads). Decoding happens off the JavaScript thread. No remote images.
- **Files**: `fetch` of the app's own files (GET only; relative URLs resolve against
  `http://fly.local/`), `blob:` and `data:` URLs. `Response` (`arrayBuffer`, `json`, `text`,
  `blob`, `bytes`; `body` gives the whole file as one chunk), `Request`, `Headers`, `Blob`,
  `File`, `URL`, `URLSearchParams`, `URL.createObjectURL`. This fetch shim serves local files only: anything
  else rejects. (The weather service's requests are native: [The weather outside](#the-weather-outside);
  so is a table's line to its room, `__native.socket`: [Playing together](#playing-together).) No
  `XMLHttpRequest`, `WebSocket`, `EventSource`.
- **Storage**: `localStorage`, kept in `NSUserDefaults` (keep it small: settings, not data).
  `sessionStorage` lasts as long as the app runs. No IndexedDB, cookie jar or Cache API (`document.cookie` is only a string property).
- **Timers and frames**: `setTimeout`, `setInterval`, `requestAnimationFrame` (the display
  link, 60 Hz; a frame isn't started while two are still on their way to the screen),
  `requestIdleCallback`, `queueMicrotask`, `performance.now()` (no marks or measures),
  `console` (to the device console), `reportError`.
- **Misc**: `crypto.getRandomValues`, `crypto.randomUUID` (no `crypto.subtle`),
  `structuredClone`, `atob`/`btoa`, `TextEncoder`/`TextDecoder` (UTF-8, UTF-16LE, Latin-1),
  `AbortController`, `DOMException`, `ResizeObserver` (fires once, at the screen's size),
  `IntersectionObserver` and `MutationObserver` (inert).
- **Not there**: `Worker` (it is `undefined`: the brain is `__native.brain`), modules and
  `import()` at run time (Vite inlines them; `import.meta.url` is `http://fly.local/game.js`),
  WebGPU, WebXR, video, the Gamepad API, pointer and touch events, `alert` (logged), `confirm` (returns false),
  `navigator.clipboard` and `navigator.share` (a phone scans a table's code instead).

## The remote

Per `packages/contracts/src/remote.ts`, all on `window`:

| Remote | Event |
| --- | --- |
| Clickpad ring up/down/left/right, or a swipe | `keydown`/`keyup` `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` |
| Clickpad centre (click) | `Enter` |
| Back (Menu on the first Siri Remote) | `Escape`, except at the root (below) |
| Play/Pause | `MediaPlayPause` |
| Finger on the touch surface | `remotetouch` CustomEvent, `{ x, y, touching }`, -1 to 1, y up |

Buttons come from UIKit presses (`src/Remote.mm`). A held button repeats: `keydown` with
`repeat: true` after 400 ms, then every 100 ms, until `keyup`. Swipes (UIKit swipe recognisers)
are an arrow `keydown` and `keyup` at once, with no repeat.

The touch surface's position comes from the GameController framework: the remote's micro
gamepad with `reportsAbsoluteDpadValues`, whose dpad is where the finger is (UIKit only says how
a touch moved). Whether a finger is down comes from UIKit's touches; the dpad reads exactly
(0, 0) once the finger lifts, and that is ignored so `x` and `y` keep their last values. The
app reads no buttons from GameController, so no press is reported twice. A click is a finger on
the surface too, so `remotetouch` events come with it.

Back at the root of the game leaves the app, as tvOS requires. The game sets
`window.__flyAtRoot` (`AT_ROOT_PROPERTY`) to say whether it is at its root; the runtime forwards changes in its boolean value to native code, and the main thread
reads it the moment a Back press begins.
When it is true the game never sees that press: tvOS takes it and goes to the home screen.
Assign the property; don't `defineProperty` over it.

## The brain

`globalThis.__native.brain` is `NativeBrainBridge` (`packages/contracts/src/brain.ts`),
implemented in `src/BrainBridge.mm` over `packages/brain-native/include/fly_brain.h`:

- `start(seed)` starts this bridge's brain thread, once (8 MB stack, QoS user-initiated: below the JavaScript
  and render threads). It requests memory mapping where safe for the bundled `www/brain/connectome.bin` (38 MB) and builds
  the brain there; the main and JavaScript threads never wait for it. `status()` is `loading`
  until then (and before `start`), then `running` or `failed` with `error()`.
- `spawn()` on the first bridge makes another bridge, with its own brain and thread when
  `start(seed)` is called on it, reading the same bundled connectome. A spawned bridge's
  `stop()` wakes its thread to end and frees the brain; reducing the fly count calls it through
  `NativeBrainDriver.dispose()`. The first brain is kept by the host. Each bridge has its own
  senses, time waiting, results and locks; no brain waits for another.
- `neurons()`, `connections()`, `eyeDirections(side)` (a new `Float32Array` each call),
  `eyeAcceptance()` and `rateNames()` are fixed once running; ask once.
- `submit(dtMs, scalars, lightLeft, lightRight)` copies the senses (`Float32Array`s; scalars in
  `SENSE_ORDER`, light one value per facet, or `null` with the eyes shut) under a lock the brain
  thread holds only to copy them out, adds `dtMs` to the time waiting, and returns. Time waiting
  is capped at 100 ms: while the brain is busy, submitted time piles up to one step of at most
  100 ms, and anything beyond is dropped, so a brain slower than real time runs slow rather
  than falling further behind. The newest senses replace older ones. Submits before `running`
  are ignored.
- The brain thread sleeps until time is waiting, takes all of it as one `fly_brain_tick`, and
  publishes the result.
- `read(out)` copies the latest state (`COMMAND_ORDER`, then `STATE_STATS`, then one rate per
  `rateNames()` entry) into a `Float32Array` and returns how many states there have been. The real
  brain reports 84 rates: nine neural readouts, the 63 regions (`region.<id>`) and the 12
  vision stages. Nothing on this side assumes a count: the bridge sizes everything from
  `fly_brain_rate_count`, and the stand-in reports as many rates so the simulator check can check the count and last rate (not every value). `NativeBrainDriver` copies the regions into its `regionRates` in the catalog's order,
  without allocating.

A historical simulator observation of the real brain (`packages/brain-native` as of 15 November 2026) loads in about 150 ms
and keeps up with real time at 60 submits a second, on an M5 Pro. This is not a direct Apple TV brain-throughput measurement; hardware game observations are below.

Settings → Screensaver → Flies chooses one to three here (`NATIVE_MOST`,
`apps/web/src/brain/create.ts`; four in a browser), shown as enamel dots and saved with the
other settings. A count saved as more than that lives, and shows, as three. An older host
without `spawn()` runs one fly and shows no Flies row. Each extra
fly has its own body, senses and eyes (`apps/web/src/company.ts`); the camera, pointer and
readouts follow the first. The eyes take turns, at most one fly's refresh a frame, whichever
is most overdue; four at 60 fps each get about 15 Hz rather than 20. While a ball comes the
followed fly takes priority at up to 60 Hz and the others usually wait, so a frame never refreshes two. A companion fly
whose brain thread fails is given a new one twice (after 5 s, then 30 s) and is then taken off.

Each native brain takes about 58 MB, on its own thread. On peev none ran short: a brain thread
averaged 8 to 39% of a core and its busiest 10 seconds 87%. The limit is the frame, measured in
[Several flies on peev](#several-flies-on-peev): with four the screensaver falls below 60 fps
even at the picnic, with three it keeps 58 to 60 there. From three flies on an eye refresh comes
every frame (the eyes' frame is about 80 draws against 34), and the bar and the restaurant,
already held by the render thread with one fly, fall to 30 and about 20 fps.

## The weather outside

Built with `TVOS_WEATHERKIT=1`, the app can tell the game the real weather where the TV is, and
today's sunrise and sunset (what the game makes of them is in [the README](../README.md), "The
weather outside", and `apps/web/src/scene/outside.ts`). `globalThis.__native.weather` is
`NativeWeatherBridge` (`packages/contracts/src/weather.ts`), made by `src/WeatherBridge.mm` over a
Swift service it finds by its Objective-C name (`FlyOutsideWeather`). A build without the service
has no Swift and no `__native.weather`, and the game keeps its made-up forecast.

- `weather/Shared/OutsideWeather.swift` holds what the JavaScript thread reads (status, error,
  the last answer as JSON, Apple Weather's attribution, a version that counts answers) under a
  lock it holds only to copy, and keeps the last answer in `NSUserDefaults` (the conditions and
  when they were fetched, never where) for the next run.
- `weather/WeatherKit/Service.swift` finds the answer, on the main actor. `start()` (the game
  calls it once the title is up, and when Settings → Screensaver → Real weather is turned on) asks for When
  In Use location permission the first time; after that it takes one location fix at a time
  (`requestLocation`) and uses it for six hours, a TV not being one to move. It rounds the
  coordinates to two decimal places (about a kilometre) and asks WeatherKit for the current
  conditions and today's daily forecast (for its sunrise, sunset and solar noon) in one
  request. It asks again every 20 minutes while the app is open (not before WeatherKit's answer
  expires unless the one-hour maximum interval wins), and after a failure sooner, backing off from a minute to
  20. Timers don't fire while the app is suspended; when it becomes active again it asks if the
  answer is 20 minutes old. A relaunch within 20 minutes of the last answer uses the kept one
  and doesn't ask. Apple Weather's attribution is requested separately at startup and kept for the run after
  success, with another attempt after a weather answer if retrieval failed, so a kept weather
  answer can also have attribution. `stop()` stops it asking.
- `start` and `stop` dispatch to the main actor; other bridge reads copy under a lock.
  Alone and in rooms open to everyone, the game polls `version()` every two seconds and parses conditions on a
  change. Status/error strings are also read for canvas diagnostics; this is not a blanket
  zero-allocation guarantee. In a player-created room the shared simulated weather takes precedence; rooms open to
  everyone retain the player's own light and weather.
- What JavaScript gets (`OutsideConditions`): cloud cover, precipitation (mm an hour), visibility
  (m), wind speed (m/s), WeatherKit's condition (`foggy`, `snow`...), whether it is day, the
  observation's time, and sunrise, sunset and solar noon as local hours (null where the sun
  doesn't rise or set). Not the location. `status()` says what it has: `locating`, `fetching`,
  `ok`, or why it has nothing: `denied` (location permission refused or restricted),
  `no-location`, `offline`, `unauthorised` (WeatherKit refused the app: the capability isn't on
  its App ID), `failed`; `error()` says more. The game logs `weather outside: <status>
  (<error>)` on the console each time it changes, and puts it on the canvas as `data-outside`,
  with `data-outside-age` (seconds), `data-weather-from` and `data-sun-from`.

### What Apple's documentation says it needs

The following external requirements were recorded in November 2026. Account state, pricing
and platform policy were not revalidated by the source-only check; consult the linked Apple
documentation before enabling the service:

- [WeatherKit](https://developer.apple.com/documentation/weatherkit) is on tvOS from 16 (this
  app targets 26), and so is
  [`WeatherService.weather(for:including:_:)`](https://developer.apple.com/documentation/weatherkit/weatherservice/weather(for:including:_:)).
  The recorded quota interpretation was one request per call however many data sets it includes ([Apple, on the
  developer forums](https://developer.apple.com/forums/thread/750791)).
- Core Location is on tvOS with
  [When In Use authorisation only](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services)
  (Always is for "All platforms except tvOS and visionOS"),
  [`requestWhenInUseAuthorization()`](https://developer.apple.com/documentation/corelocation/cllocationmanager/requestwheninuseauthorization())
  and the one-shot
  [`requestLocation()`](https://developer.apple.com/documentation/corelocation/cllocationmanager/requestlocation())
  (tvOS 9); `startUpdatingLocation()` isn't on tvOS. The prompt shows
  `NSLocationWhenInUseUsageDescription`, which Info.plist must have ("Authorization requests
  fail immediately if the required keys aren't present"), and only while the app is in the
  foreground.
- The [WeatherKit entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.weatherkit)
  (`com.apple.developer.weatherkit`), on an App ID registered with
  [WeatherKit ticked under App Services and under Capabilities](https://developer.apple.com/help/account/configure-app-services/weatherkit/).
  A wildcard App ID can't have it, so a device build signs with an explicit one.
- [Attribution](https://developer.apple.com/weatherkit/get-started/): an app that shows weather
  data from Apple must "clearly display the Apple Weather trademark ( Weather), as well as
  the legal link to other data sources", and one that shows it changed ("value-added") must
  attribute it to " Weather" "along with a notice that the data provided by Apple has been
  modified". tvOS can't open the link, and
  [`legalAttributionText`](https://developer.apple.com/documentation/weatherkit/weatherattribution/legalattributiontext)
  (tvOS 16.4) is the "text that should be made available to users for apps that cannot display
  the attributionURL contents in a Safari view". About the fly shows the mark, that the game
  has modified the data, the legal text and the legal page's address, all from
  `WeatherService.attribution`; the screensaver shows none of it. The game shows no weather
  alerts, which have rules of their own.
- [Quotas](https://developer.apple.com/weatherkit/): 500,000 calls a month come with the
  developer membership; more is a subscription (a million a month for US$49.99, up to 200
  million). Unused calls don't roll over.
- Privacy. The [privacy manifest](../apps/tvos/src/PrivacyInfo.xcprivacy) declares Online's retained
  identifiers, user content, gameplay and operational data, including time-zone settings.
  See the [policy](privacy.md) and [App Privacy draft](app-store-answers.md) for the full audit.
  WeatherKit's rounded location goes directly to Apple to answer the request; the app never
  sends coordinates, returned conditions or sun times to the room server. Player-created rooms use a shared simulated forecast; rooms open to everyone retain
  local weather and light choices. Apple excludes responsibility for data collected by Apple in its
  [App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/).
  This WeatherKit distinction does not exempt Online's separate persistent collection.
  The weather service's required-reason API is `NSUserDefaults` for its last answer (CA92.1);
  Core Location is not a required-reason API.

### Cost

At an assumed one request every 20 minutes while the app is open and Real weather is on: 72 a day for a TV
that shows the fly around the clock, about 2,200 a month, so the recorded 500,000 quota would cover
about 230 TVs doing that, and none while a TV sleeps (tvOS suspends the app). Attribution requests are separate and may retry after failure; their quota treatment was
not established by this source check.

### Turning it on (for the owner)

The recorded setup used a wildcard profile; current account/profile state is unknown.
WeatherKit needs an explicit App ID and matching entitlement. Ordinary builds leave it off
unless requested, and the game uses its made-up forecast.

1. In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
   for team `PX72AL9366`, open the App ID `com.isaacthoman.flies` (or whatever
   `TVOS_BUNDLE_ID` is), or register it: Identifiers → + → App IDs → App, Explicit Bundle ID.
   WeatherKit set up on the old `com.isaacthoman.appletvfly` doesn't carry over: this is a new App ID.
2. On its **Capabilities** tab tick **WeatherKit**, and on its **App Services** tab tick
   **WeatherKit** too (the usual missing step when WeatherKit refuses an app). Save.
3. Build and install with the switch on: `TVOS_WEATHERKIT=1 npm run tvos -- build`, then
   `npm run tvos -- run --device <udid>`. Xcode's automatic signing (`-allowProvisioningUpdates`)
   makes an explicit development profile for the App ID with the entitlement, in place of the
   wildcard one.
4. On the TV, the first time the title comes up, allow the app to use your location while it is
   in use. Settings → Screensaver now has Real weather (on); on the Weather tool "Now" becomes "Outside" within
   a few seconds; About the fly ends with Apple Weather's attribution.
5. If it stays "Now", read the console (`run --device` prints it) for `weather outside: …`:
   `unauthorised` with a `WDSJWTAuthenticator` error means WeatherKit doesn't accept the App ID
   yet (check both tabs; Apple's side can take a while), `denied` that location was refused
   (Settings → Privacy → Location Services on the TV).

Keep building with `TVOS_WEATHERKIT=1` from then on: a build without it has no weather service,
and the game goes back to the made-up forecast.

### Checking it

The simulator check (below) builds the stand-in service (`tests/weather-stand-in/Service.swift`,
`--stand-in-weather`): with no WeatherKit and no location, it answers with fixed conditions. The check verifies
their keys and values and the attribution service name, but not the whole attribution payload;
it also checks that the service reports `fetching` then `ok`, and that stopped it says `idle`.
`npm run tvos:check -- --weatherkit` builds the real service instead, grants the app location
(`simctl privacy`) and sets the simulator's, and checks that it asks WeatherKit and either returns conditions or reports
`unauthorised`. It does not assert a particular error string. A real answer needs a signed build on an App ID
with the capability.

In a browser there is no service: scripts feed the game conditions (`__fly.outside.feed`, in the
README's Tests).

## Playing together

The Apple TV plays online, in rooms with others, as a browser does (`docs/online.md`).
Settings → Screensaver → Join others is on by default: once the brain is running, the game
tries a room open to everyone. A room invitation or `?alone` suppresses that automatic attempt
for the launch; retained player-created rooms are resumed instead of automatically choosing a
room. Failed automatic attempts leave the fly alone and may retry. The player can turn Join
others off. Its runtime has no
`WebSocket`, so the host gives it one, and tvOS's own keyboard for typing a table's code.

### The line to the room

`globalThis.__native.socket` is `NativeSocketBridge` (`packages/contracts/src/socket.ts`), made
by `src/SocketBridge.mm`. Each line is an `NSURLSessionWebSocketTask` in an ephemeral session
whose delegate runs on a queue of the bridge's own, never the JavaScript or main thread.

- What arrives waits in the line's inbox until the game takes it, once a frame
  (`apps/web/src/online/native-socket.ts`): `next` copies a binary message straight into the
  game's one 64 KiB `ArrayBuffer` (`JSObjectGetArrayBufferBytesPtr`); JavaScript caches a
  `DataView` per message length, allocating one when it first sees that length; the room's rare JSON comes back as a string. A frame with nothing new is two
  native calls, each a lookup under a lock (the check times them: about a microsecond a frame in
  the simulator).
- It keeps what a browser's line keeps (`apps/web/src/online/socket.ts`): at most 256 messages
  or 256 KB waiting to be taken, and as much waiting to go. A line that falls further behind is
  closed with 1000, "line fell behind", its backlog dropped; the game opens it again and the
  room gives it the table as it is now. A binary message bigger than the game's buffer closes the
  line with 1009 (the server's 4 KiB limit applies to incoming client messages, not all outbound JSON).
- A line that can't open, fails or drops is closed with 1006 and no reason, as a browser's is;
  the room's own close keeps its code and reason. The line reports closed only once everything
  that came before the close has been taken, as a browser hands on its messages before its close
  event.
- When the app goes to the background (`sceneDidEnterBackground`, in `src/main.mm`) the game
  hears it first (`visibilitychange`: at a table, the room is told at once that its flies are
  away), then every line is closed with 1001, both on the JavaScript thread
  and in a short background task, before tvOS suspends the app. Its flies rest together at the table,
  and after 10 minutes away they leave (the room's rule). Coming back, the game wakes as a shown tab
  does and opens its line again at once, rather than waiting out its retry.

### Where the room is

The app's room server is the site's, `wss://flies.isaacthoman.com/rooms` (`APP_ROOMS` in
`apps/web/src/online/invite.ts`), and the links it hands on are the site's
(`https://flies.isaacthoman.com/?table=<code>`), which open in a browser, or in the iPhone app
where it is installed. For development:

- `ROOMS_URL=ws://192.168.1.20:8787/rooms npm run tvos -- build` builds another room server in
  (and `FLY_SITE_URL` another site for the links); `scripts/webBuild.ts`, `appSite()`.
- The launch config's `url` can name one for a single run, as a page's address does:
  `{"script":"game.js","url":"http://fly.local/?rooms=ws://192.168.1.20:8787/rooms"}`, with
  `&table=<code>` to sit at a table straight away.

App Transport Security wants `wss://` to a site with a valid certificate, which is all the real
room server needs: a release build has no exception. A room server on the Mac or the local
network (`npm run rooms`) is plain `ws://`. Reached by its IP address (`ws://192.168.1.20:8787/rooms`)
it needs nothing: ATS leaves addresses alone (checked in the simulator: the check passes with and
without the exception). Reached by a name (`ws://my-mac.local:8787/rooms`), it needs
`NSAllowsLocalNetworking`, which a build for a local room server adds
(`apps/tvos/local-rooms.yml`, merged into `project.yml` by XcodeGen only when it is wanted):
`npm run tvos -- build --local-rooms`, any build whose `ROOMS_URL` is `ws://`, and the simulator
check. Never ship one of those.

### Typing

`globalThis.__native.keyboard` is `NativeKeyboardBridge` (`packages/contracts/src/text-entry.ts`),
made by `src/KeyboardBridge.mm`. `ask(title, value, kind, done)` returns at once; on the main
thread the host presents an alert titled with the field's label, holding what the field holds,
brings up tvOS's full-screen keyboard for it, and calls `done` on the JavaScript thread with what
was typed (OK), or null (Cancel, or Back). The kind sets the keyboard: `code` (ASCII, no
autocorrection or capitals), `name` (words capitalised), `password` and `new-password` (hidden,
marked as one or the other for the system). One question at a time: asking while one is up
answers the first with null, and the new one comes up once the first is down; `close` takes it
down the same way. The game's frames go on under it, but the remote is the keyboard's: while it is
up `Remote` sends the game nothing, and what the game was holding (the Select that asked) is let
go as it comes up.

The game types through a `TextEntry`, polled each frame, as it does a browser's hidden input:
`NativeTextEntry` (`apps/web/src/ui/text-entry.ts`) asks the bridge when a field is begun, and
when the keyboard answers the field takes the whole of what was typed at once (to its length),
ending as Return (`done`) or Escape (`cancel`) would. So every field in Online works on the TV
with no change to the screen: a new room's name and password, a locked room's password, and a
room's code, which joins it.

### In a room, with the remote

Online (the menu's last row when available) lists the rooms, makes one, and joins one by its code, typed into
Code. In a room there is no share sheet or clipboard on tvOS, so no Share the link; beside the
menu, as everywhere, is a card with the room's QR code for a phone to scan and its code (two
groups of five, typed as one) for another TV (`apps/web/src/ui/room-card.ts`). The QR code
(`packages/ui/src/qr.ts`, level M, versions 1 to 10) is drawn once per room into a small canvas, a
module a pixel, and scaled up on whole pixels each time the menu is drawn: one `drawImage`, not a
path of hundreds of squares.

### Eight flies on a TV

The simulator check (below) sits the app in a room of eight and requires sampled canvas draw
counts and host window-average draws below 150, but
the simulator draws in software and has a Mac's CPU, so whether eight flies hold 60 fps on an
Apple TV has to be measured there before it is promised. `tvos:soak --table` does it: seven fake
flies from this Mac (`fakeFly`, `scripts/tables.ts`: no brain, each walking a small circle round
the TV's fly and sending its state 20 times a second, as a device does) start an unlisted room at
midday in clear weather, and the TV, launched detached with `stats` and `logFile` and the room's
code in its URL, sits down in it and plays: feeding, the ball every 20 s, then watching them as the screensaver, half the minutes each.
The process keeps the fakes walking for an estimate based on scripted sleeps plus five
minutes; it does not observe the TV's completion signal.

Against the real room server, with a release build as it is:

```sh
npm run tvos -- build
npm run tvos:soak -- --device <udid> --minutes 20 --table
```

Or against a room server on the Mac, which the TV reaches over the local network (find the Mac's
address with `ipconfig getifaddr en0`):

```sh
npm run rooms                                  # in one terminal: ws://0.0.0.0:8787/rooms
npm run tvos -- build --local-rooms
npm run tvos:soak -- --device <udid> --minutes 20 --table --rooms ws://192.168.1.20:8787/rooms
```

Pull `performance.log` as for any soak. The `stats` lines from `drive: table play` and
`drive: table wallpaper` on are eight flies; `state.others` lists the seven others (`id:1:0:…`
is one there and living) and `state.calls` the game's draws a frame. Compare them with the
single-player soak above.

Measured 16 November 2026 on an Apple TV 4K (3rd generation), tvOS 27.2.1, release build, against
a room server on a Mac over the local network (by address, with no ATS exception), `--minutes 20`.
The TV was warm from an earlier soak and reported thermal state 2 (serious) throughout.

| Phase | FPS in 10-second windows | Mean JavaScript a frame | Its p95, median window and worst | Draws a frame (host's mean) |
| --- | --- | --- | --- | --- |
| Playing at the table | 55–60, mean 59.9 | 7.5 ms | 13.1 ms, 26.6 ms | 48.7 |
| Screensaver at the table | 59.9–60 | 6.2 ms | 8.9 ms, 18.6 ms | 48.4 |

This was one locally simulated fly and seven sent from elsewhere. All seven others were there
throughout, with no reconnects; memory stayed at 183–187 MB. The
host's draws are a mean over every frame: with the eyes at 20 Hz, two frames in three are the
usual 34 and the third refreshes the eyes (about 83). `state.calls` is one frame sampled every
200 ms, every twelfth frame at 60 fps, so it can lock onto the eyes' frames and read about 85
for minutes on end; it never read more than 93. In steady state a frame that rebuilds the reflections defers the eyes' refresh
(`apps/web/src/eyes/eyes.ts`); the first picture, with no previous light, can bypass that deferral.
The historical reflection rebuild was reported as 34 draws. Brought back from the background with Settings in front,
the same run of the app was in its own seat 3 s later; a capture of the TV's screen at a room
decodes to the room's link.

## Reading pixels back

With one local fly, the game renders its eyes into small targets at 20 Hz with Low eyes,
30 Hz with High eyes, or up to 60 Hz for urgent updates. Several flies share refresh slots as
described above. Both of three's ways work and are checked by the test scene (`tests/scene.ts`, a
32×16 target, red on the left and green on the right, checking red, green and alpha at one sampled pixel on each side; blue and other pixels are not asserted):

- `renderer.readRenderTargetPixels(target, ...)` is synchronous: one `readPixels` query, so
  the JavaScript thread hands over its commands and waits until the render thread has replayed
  everything submitted so far (in mode 2 that can include the end of the previous frame), and
  the GPU has finished drawing the target. It also undoes, for that frame, the overlap between
  JavaScript and GL replay that mode 2 exists for.
- `renderer.readRenderTargetPixelsAsync(target, ...)` reads into a pixel-pack buffer, sets a
  fence and polls it. The fence is real: the render thread writes the newest signalled fence
  into shared memory, so zero-timeout polling reads that shared state without a query; nonzero timeouts can synchronise. When it has signalled, `getBufferSubData` is
  still a query (it waits for the render thread to catch up, but not for the GPU). The answer arrives later through timer polling and represents an earlier picture; its age
  depends on completion and scheduling.

  On the Apple TV, OpenGL ES's `glReadPixels` into a pixel-pack buffer waits until the GPU has
  drawn what it reads. The fly's eyes are drawn just after the frame's scene, so reading them
  held the render thread for the GPU's whole frame, and the next frame could only start once
  the GPU was idle: JavaScript, GL replay and the GPU in turn rather than side by side. Where the
  GPU took most of a frame, that was 40 frames a second (the bar and the restaurant, "Measured
  on peev"). So the executor reads an RGBA8 picture
  in two halves (`Executor::deferRead`): at once, a blit on the GPU into a renderbuffer of its
  own, with a GL fence after it; then, when the render thread finds that fence signalled, the
  `glReadPixels` from its copy into the page's buffer, which no longer waits. WebGL fences the
  page makes in between are held until the read is done, so a fence after a read still
  signals after it, and anything that would see the buffer (`getBufferSubData`, deleting it, new
  data in it, `finish`, a `clientWaitSync` with a timeout) finishes the reads into it first:
  several flies' eyes, each read into a buffer of its own, don't wait on one another. Other formats, and
  the multisampled default framebuffer, are read at once as before. The simulator renders in
  software, with no GPU for a read to wait for, so there it reads at once unless the launch
  config asks otherwise (`deferReads`): the simulator check's test scene does, so its
  `readbackAsync` goes this way, and its real game doesn't. With the deferral on, the real game's
  table of eight in the simulator, which already stalls for 10 to 25 seconds rendering in
  software, lost its room more often: 1 of 5 checks passed against 3 of 5 on `dev`.

Historically measured in the simulator (M5 Pro, the software renderer, mode 2; capture date unknown): the synchronous read takes
0.08 ms on average (0.5 ms at most) on tvOS 27 and 0.11 ms (1.9 ms at most) on tvOS 26, and the
frame rate is the same with or without it (60 fps); the async read resolves about 5 ms after it
starts, before the next frame (most of that is three's 4 ms polling interval). These say the
path is correct and cheap on a Mac; they say nothing about the Apple TV, where the wait is for
its render thread and GPU. On a device, run the test scene (`build --test-scene
--stand-in-brain`, `run --device <udid>`) and read `readback` and `readbackAsync` in its
`report` lines. The game uses the async path with at most one read in flight per fly, retaining the last
completed facet values while it waits. Resolution changes wait for the read before disposing
its target, and keep the previous light until the new picture arrives. `data-eyes-updates`
counts completed pictures; `data-eyes-ms` includes submission and resampling CPU time, excluding
the asynchronous wait. A readback's final data copy can still wait for queued render-thread
commands; this is not a fully asynchronous native transfer.

## Holding to what it can sustain

A TV that draws a heavy place flat out at 60 frames a second warms until tvOS slows its GPU and
CPU, and then it draws far fewer than a steady lower rate would have (the restaurant fell to 15,
"Measured on peev"). So the host says how hot the device is (`thermalState()` on `__native`,
`ProcessInfo.thermalState`, and every change of it in the log as `thermal state: …`), and the
game holds itself to what the TV can sustain (`Warmth` in `apps/web/src/quality.ts`):

| Level | Frames a second | Pixels |
| --- | --- | --- |
| 0 | 60 | as chosen |
| 1 | 40 | as chosen |
| 2 | 30 | as chosen |
| 3 | 30 | no finer than Chunky |
| 4 | 30 | no finer than Chunkier |

- It asks once a second. Fair for 15 s steps down a level, and another each minute it stays fair;
  serious steps down at once and every 45 s while it lasts; critical every 15 s.
- It steps back up only after the TV has been nominal for a long while, a level at a time: 10
  minutes at first, twice that each time a place warms the TV (once a spell, however many steps
  it took), up to two hours. A step up that warms the TV within 10 minutes comes straight back
  down.
- Each place starts where it was last held, with the wait it had earned there, kept in
  `localStorage` (`flies.warmth`): the bar and the restaurant warm the TV very differently. peev
  goes from nominal straight to serious, never through fair, so a place that has once made it hot
  starts where it stayed cool.
- Only the frame rate and the pixels change. The brain is handed the same time whatever the frame
  rate, and its senses and the eyes are the same at every level. At 40 a second on a 60 Hz screen
  the frames alternate one and two refreshes apart (`main.ts`).
- The canvas says where it is held (`data-warmth`, the level), how hot the TV says it is
  (`data-thermal`) and the frame rate it is held to (`data-fps`), so the `stats` lines of a soak
  show them. The iPhone app doesn't pass its thermal state to the page, so a browser keeps to its
  frame-time quality alone.

## Checking it

### Measured on peev

Measured 16 November 2026 on peev, Apple TV 4K (3rd generation, A15), tvOS 27.2.1: signed
Release, 640×480, mode 2, real 166,700-neuron connectome, Low eyes except for the High phase, no
WeatherKit. `tvos:soak --minutes 30` ran detached, with 10-second stats written to the app's
cache, on the code that reads the eyes back without waiting ([Reading pixels back](#reading-pixels-back)),
draws behind a black veil into one pixel, and shades the bar and the restaurant more cheaply
for the same picture (`docs/places.md`, "The Apple TV's budget"). It finished (`soak complete`)
in 53 minutes 46 seconds, with no drive timeouts or runtime errors. A TV whose display is asleep
launches the app but draws nothing (`frames: 0`, a 300×150 framebuffer): wake it first.

The splash lifted 2.4 seconds after the host started. Steady screensaver by place; the windows
at the start and end of each 3-minute phase are left out. "Built" is the place's
`data-place-ms`, the JavaScript that builds it behind the veil, and "Select to arrival" runs from
the Place tool's press until the veil has lifted.

| Place | Built | Select to arrival | FPS, midday / night | Mean JavaScript per frame | Highest window's JavaScript p95 | Mean GL replay per frame | Draws per frame | Memory |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Picnic | 568 ms (at launch) | 2.1 s | 59–60 / 59.9–60 | 3.48 / 3.40 ms | 7.78 ms | 7.5 ms | 33–39 | 182 MB |
| Windowsill | 1,100 ms | 2.5 s | 59–60 / 60 | 2.73 / 2.86 ms | 6.85 ms | 14.0 ms | 25–28 | 166 MB |
| Lab | 1,273 ms | 2.8 s | 59.1–60 / 59.9–60 | 3.09 / 2.90 ms | 7.10 ms | 13.8 ms | 25–27 | 210 MB |
| Bar | 1,130 ms | 2.5 s | 59.1–60 / 60 | 2.80 / 2.95 ms | 8.44 ms | 13.9 ms | 25 | 176 MB |
| Restaurant | 2,137 ms in steps (longest 416 ms) | 4.1 s | 15–60 / 15.3–37.6 | 4.30 / 4.54 ms | 17.68 ms | 32.4 ms | 18–20 | 229 MB |

The same soak on `dev` at `8e50250`, before these changes: the bar at 40–58 FPS (about 50) and the
restaurant at a flat 40, with GL replay 17.0 and 22.0 ms a frame; select to arrival 4.2–4.7 s for
the windowsill, the lab and the bar and 11.1 s for the restaurant; GL replay about 14 ms
everywhere else.

- **The render thread waited for the GPU at every reading of the fly's eyes.** With the eyes off,
  or only their read skipped, the restaurant and the bar ran at 60 FPS and the restaurant's GL
  replay fell from 20 to 0.4 ms a frame (`gpuTiming` on): the eyes are drawn just after the
  frame's scene, and the pixel-pack read of them waited until the GPU had drawn it, so JavaScript,
  GL replay and the GPU took turns. Read a frame later, they no longer do ([Reading pixels
  back](#reading-pixels-back)). The GL replay that remains, about 14 ms where a place's GPU work
  fills most of a frame, is the render thread waiting to present, not working: the picnic's is
  7.5 ms.
- **The bar holds 60 FPS.** Every 10-second window of its screensaver, at midday and at night,
  was 59.1–60 FPS, and the TV stayed thermally nominal.
- **The restaurant holds 60 FPS while the TV is cool, not for long once it is hot.** Its GPU work
  fills most of a frame at 60 FPS, where the read's waiting had held it to 40, and the TV heats
  up: its thermal state went to serious (2) during its weather sweep and stayed there, and the
  screensaver fell from 60 to as low as 15 FPS as the TV slowed its GPU and CPU (JavaScript rose
  from 2.5 to 12 ms a frame). Shading it once a fragment and drawing its street only through the
  shop front (after this soak) gave, in a restaurant-only run starting serious: the weather
  sweep at 39–59 FPS (mean 55), the midday screensaver at 60 FPS for over 3 minutes until the TV
  went critical (3), then 20–55; the night at 36–58 (mean 39). The other places, at nominal,
  never left 59–60. To hold 60 hot, the restaurant's per-pixel work has to fall by about a third
  again: the largest costs left are the casters' exact shadows (a quarter to a third of its GPU
  time in desktop measurements), its transparent layers, its clear coat and its reflections.
- **The restaurant comes in after about 4 seconds, against 11.** Behind a black veil the world is
  drawn into one pixel, so the frames that build it and send each part of it to the GPU don't
  wait for a full picture of the room. The first visit after an update compiles its two big
  programs, about 2 seconds each on the TV (the arrival in a verification run was 8.0 s); tvOS
  keeps them compiled after that, across launches.
- Memory goes down again when the fly leaves a place (210 MB at the lab, 176 MB at the bar next).
  The restaurant is the largest, at 229 MB.

These historical single-player measurements did not include Online. The current app uses
the native socket bridge described above, including the separate eight-fly observation.

### Several flies on peev

Measured 16 November 2026 on peev, Apple TV 4K (3rd generation, A15), tvOS 27.2.1: signed
Release of pull request #106 at `52c93dbb`, which let an Apple TV live four, with the host's
per-thread `cpu` in its stats; 640×480, mode 2, the real connectome, Low eyes, no WeatherKit.
Each case ran `tvos:soak --flies N` detached with 10-second stats. Alone: the whole tour (each
place in every weather and light, then its screensaver at midday and at night), `--minutes 10`
for one fly and `--minutes 2` for three and four, about 27 minutes each. At a table:
`--table --flies 4 --minutes 10` against a room server on the Mac over the local network, the
TV's four flies and four fake devices' (a full table of eight), at the picnic. The first window
of each phase is left out. Two flies weren't measured.

The screensaver, FPS over its 10-second windows (mean, and lowest to highest):

| Place | 1 fly | 3 flies | 4 flies |
| --- | --- | --- | --- |
| Picnic | 59.9 (59.1–60) | 59.6 (57.8–60) | 54.7 (45.2–58.9) |
| Windowsill | 59.9 (59.0–60) | 58.1 (50.3–60) | 53.8 (50.5–57.6) |
| Lab | 59.9 (58.9–60) | 58.1 (49.5–60) | 57.8 (46.7–60) |
| Bar | not reached; 40–58 in [Measured on peev](#measured-on-peev) | 30.1 (29.9–30.8) | 30.1 (30.0–30.9) |
| Restaurant | 41.0 (40–43.1) playing, at launch | 18.9 (17.8–21.8) | 20.4 (17.9–25.8) |

At the picnic, where the flies meet most: its sweep through every weather and light, then its
screensaver (at the table, playing among the others, then its screensaver):

| | 1 fly | 3 flies | 4 flies | 4 at a table of 8 |
| --- | --- | --- | --- | --- |
| FPS | 58.9 / 59.9 | 56.1 / 59.6 | 54.6 / 54.7 | 45.5 / 54.7 |
| Frame-start interval p95 (mean of windows) | 19.3 / 19.2 ms | 26.8 / 26.1 ms | 26.1 / 25.8 ms | 30.7 / 23.3 ms |
| JavaScript a frame (mean; highest window's p95) | 3.79; 11.2 / 3.76; 9.8 ms | 6.62; 12.7 / 5.30; 9.3 ms | 7.94; 14.5 / 9.27; 18.0 ms | 13.56; 31.2 / 11.69; 21.5 ms |
| GL replay a frame | 13.8 / 13.5 ms | 10.5 / 12.3 ms | 9.3 / 7.9 ms | 7.8 / 5.4 ms |
| Draws a frame (host's mean) | 38 / 38 | 72 / 67 | 77 / 78 | 83 / 74 |

Over each whole run:

| | 1 fly | 3 flies | 4 flies | 4 at a table of 8 |
| --- | --- | --- | --- | --- |
| Each brain thread, mean share of a core | 39% | 15–17% | 19–24% | 8–24% |
| Any brain thread's busiest 10 s | 87% | 71% | 64% | 48% |
| JavaScript thread | 28% | 34% | 40% | 72% |
| Whole process, mean (busiest 10 s) | 75% (146%) | 91% (232%) | 131% (276%) | 131% (214%) |
| Memory | 162–221 MB | 271–334 MB | 327–405 MB | 333–336 MB |
| Thermal state, share of windows | serious 95%, critical 1% | nominal 34%, serious 63%, critical 4% | nominal 30%, serious 70% | serious 98% |

- **Three is the most an Apple TV lives** (`NATIVE_MOST`). With four the screensaver misses 60 fps
  at the picnic (54.7, windows down to 45) and the windowsill (53.8); with three it keeps 58 to 60
  in the lighter places, as one fly does.
- **No brain ran short.** Each thread stayed well under a core, the busiest 10 seconds of any at
  87% (the one fly, in the lab's sweep). A lone fly's brain was busier than each of several's.
- **The frame is the limit.** JavaScript a frame doubles from one fly to four (3.8 to 7.9–9.3 ms at
  the picnic, 13.6 ms playing at a full table), and frames come later than JavaScript and GL
  replay together account for: frame-start p95 is 26 ms with three or four against 19 with one.
  That is time neither counts, and most likely the eyes' readbacks, from three flies one every
  frame, waiting for the render thread ([Reading pixels back](#reading-pixels-back)).
- **The bar and the restaurant fall with any company from three flies.** Already held by the render
  thread with one fly (40 FPS in the restaurant), their GL replay grows from 21 to 35–40 ms in
  the restaurant and 17 to 23–24 ms in the bar, to about 20 and 30 FPS with three as with four.
  Fewer flies won't bring them back; fewer eye refreshes with company would.
- **Memory grows by about 58 MB a fly**, as expected of a native brain: 405 MB at most with four,
  in the restaurant.
- **It runs warm.** Every run reached serious (2) within four minutes, even one fly's, and the
  nominal windows with three and four were mostly in the bar and the restaurant, where frames are
  fewest. Critical (3) came briefly in the lab's sweep with three and in the bar with one.
- The one-fly run stopped writing its log 24 minutes in, during the bar's sweep just after a
  critical window, though its process was still there an hour later; it isn't known why, and it
  has no bar or restaurant screensaver.

### Sustained performance on Rufus

Measured 15 November 2026 on Rufus, Apple TV 4K (3rd generation, AppleTV14,1), tvOS 27.2.1
(24K157): signed Release, 640×480, mode 2, real 166,700-neuron connectome, Low eyes except for
the High-eye interaction phase. The runs were detached, with 10-second stats written to the
app's cache; no console, GPU timing or GL debug was attached.

The measured build completed `tvos:soak --minutes 20` in 23 minutes 3 seconds: interaction phases
followed by ten minutes each of midday and night screensaver. It was left running on Rufus.

| Phase | FPS in steady 10-second windows | Mean JavaScript per frame | Highest window's JavaScript p95 | Memory |
| --- | --- | --- | --- | --- |
| Midday screensaver | 59.9–60.0 | 4.22 ms | 10.40 ms | 140.4–142.5 MB |
| Night screensaver | 59.9–60.0 | 4.60 ms | 11.84 ms | 142.5–143.5 MB |

Feeding, sixteen ball throws, the Low/High eye picture, pause/settings, and waking the
screensaver all completed. There were no runtime errors or drive timeouts, and every thermal
sample was nominal. The last six complete 10-second windows all reported 60 FPS. Memory
increased about 3 MB after interaction warmup; this run does not establish an overnight bound.

This meets the sustained average 60 FPS target on this device, not an every-frame guarantee.
Startup and lighting changes had 10-second averages as low as 58.6 FPS. In steady screensaver,
the worst window's frame-start interval p95 was 19.71 ms and render-completion interval p95
was 20.83 ms, so some pacing variation remains even when average FPS is 60. These intervals
are CPU-side measurements, not display scanout. Raw logs, CSVs and test evidence are outside
git; this table is the retained summary.

### Simulator correctness check

`npm run tvos:check` (`apps/tvos/tests/simulator.tvos.ts`; `--no-build` to reuse the last
build, `--runtime tvOS-26-0` for the older system) builds the app with the test scene, the
stand-in brain and plain `ws://` to room servers on the Mac (`--local-rooms`), creates and boots a fresh Apple TV 4K simulator, installs and launches the app
with a `drive` and `?alone` (suppressing automatic room joining), and checks what the scene reports:

- a held Right repeats (the check accepts two to four repeats in 650 ms), Select, a swipe, Back and Play/Pause arrive as
  the right keys in order; a second Back, after the scene has said it is at its root, doesn't
  reach the game and the host says tvOS took it;
- three touches arrive, and the finger lifts where it was;
- text measured and drawn on a 2D canvas, used as a `CanvasTexture`;
- the render target reads back correctly both ways, with timings;
- the game's two render passes (`apps/web/src/stage.ts`): the depth clear between the backdrop
  and the table takes effect, in a render target and on the screen; an `RGBA16F` target renders
  and keeps values over 1; and the game's lawn and table top seen from a fly's height, which
  must be clipped, are all table at the bottom of the picture. The last is asserted on any
  renderer but the simulator's, which gets it wrong (see below); the check prints how wrong;
- `localStorage` keeps a value; `fetch` reads a bundled file;
- the brain bridge: the stand-in reads the bundled connectome header and reports its neuron and
  connection counts (not a whole-file integrity check), its eyes and selected rate names; the
  rate count is 84, as in the real brain, and the last value is checked. Selected commands
  check sweet taste, male taste, grounded input and light asymmetry; a 600 ms burst is submitted, and the largest reported step observed must be positive and
  at most 100 ms (pending time beyond the cap is dropped);
- the weather bridge, against the stand-in weather service: its conditions arrive with the expected keys and values, and its
  attribution service name is checked (not its complete payload), and its status goes `fetching`, `ok`, and
  `idle` once stopped (with `--weatherkit`, the real service: above);
- the socket bridge, against an echo server the check runs: a text and the bytes of a view both
  ways, the bytes copied into the scene's buffer; a URL that is no WebSocket's, and a port nobody
  listens on, give lines closed with 1006 and no reason; a message bigger than the buffer closes
  its line with 1009; a line sent more messages than it keeps closes with 1000, "line fell
  behind", with nothing left to take; the server's close (4321 and a reason) comes after the
  message it sent before it; a line the game closed is forgotten; and what a frame with nothing
  new costs;
- the keyboard bridge, answered by the launch config's `typed`: asked twice at once, the first
  is answered with null and the second as typed; a press while it is up goes to it and not the
  scene, and the press that asked is let go as it comes up; frames go on meanwhile;
- the host's frame stats.

It then launches the bundled real game with the same stand-in brain, in a room of eight in a
room server it runs (keeping its rooms in a temporary folder): seven fake flies
(`scripts/tables.ts`) start an unlisted room and walk round the game's fly, and the game, given
the room server and `alone` by its launch config's URL, goes to Online, Code, and is answered the room's code
(in capitals) by `typed`. It checks the game publishes its own readiness (the test scene's can't
stand in for it). It selects two flies in Settings and checks a second running native brain
in the canvas diagnostics. With seven fake flies already seated, it checks that the TV joins
with one fly and one local seat, then photographs Online in the room, its QR code and code; in play, sees
all seven others in each joined sample across five 2-second stats windows. It requires sampled
canvas draw counts and host window-average draws below 150, rather than checking each frame
against the budget, and prints JavaScript cost a frame; then stops the room server, sees the game lose the room, starts it
again on the same port and sees the game come back to the same seat.

The recorded simulator observation was slow with the real game (capture date unknown): a few frames a second at best, and now and
then none for seconds. After such a stall the others read as resting for a moment (what arrived
meanwhile is taken as heard at the frame before it), and after one of more than about 12 s the
line has more waiting than it keeps and is opened again, as a browser's would be. The check prints
both. These stall observations do not establish that steady frame rate prevents resting or
reconnections: network stalls can cause them too.

It saves screenshots in a temporary folder outside the repo and prints their paths, then shuts
the simulator down and deletes it. It takes a few minutes after the build, most of it the real
game starting on the simulator's software renderer. The simulator draws OpenGL ES in software,
so it says nothing about the GPU's speed; its JavaScript times are a Mac's, without the TV's slower
CPU, and its draw counts are what the TV would draw.

### The simulator's renderer loses clipped triangles

The historical simulator investigation used Apple's software renderer ("Apple Software Renderer",
`APPLE-22.0.12` on tvOS 26, `APPLE-24.0.2` on tvOS 27), and reported clipping failures: some triangles
that have to be clipped (against the near plane, or against the sides of the picture) are
dropped, whole or in part. Which ones depends on where their vertices are and in what order they
come; unclipped triangles were reported to draw in that investigation. In the game, close to the fly, this
punches wedges out of the table top and the napkin, all meeting at the table's middle (the
table top is one fan of 96 triangles), through which the lawn of the backdrop pass shows, and
cuts stripes out of the jars. The whole-table view, where nothing needs much clipping, looks as
it does in a browser.

The historical investigation attributed this to the renderer rather than the host: the same three.js triangles, one per draw, are dropped with or without
multisampling, depth testing, culling or primitive restart, on the screen or in a render
target, and the host passes draws to GL untouched. Drawn by the Mac's GPU in Chromium (ANGLE on Metal), every one matches the same
triangle clipped by hand. On an Apple TV, OpenGL ES runs on the GPU, which clips in hardware,
so the device should not show it; until a device has run the test scene, that is a strong
expectation, not a measurement (its `clipping` report must say `wrong: 0`).

The recorded investigation found no clean workaround in the simulator: the renderer ignored `gl_ClipDistance`
(`GL_APPLE_clip_distance` is listed, but a distance of -1 clips nothing), and suggested clipping on the CPU or another renderer. These findings have no retained
capture date or independent verification here. Judge the look of anything near the camera
in a browser.

## What isn't verified

The original simulator-only notes predate the hardware observations above. Remaining limits
are not a claim that the app has never run on a TV:

- **Performance**: the dated observations above are not measurements of current `dev`,
  an overnight bound, or an isolated benchmark of the brain or readback. No fresh run was made.
- **The real remote**: the original check did not use the Simulator window or keyboard; every press, swipe and touch in the check is
  scripted, through the same native code as real input from the point UIKit hands it over. The
  headless simulator does connect a micro gamepad, so the GameController path is set up there.
  On a device, check: presses and repeats on the clickpad ring and centre; swipes; that the
  touch surface reports absolute positions with y up through the 2nd-generation remote's dpad,
  and that lifting the finger reads exactly (0, 0) as assumed; that a click doesn't also arrive
  as a GameController button (none is read, so it shouldn't); that Play/Pause reaches the app
  as a press (it isn't the Now Playing app); and that Back at the root really leaves the app.
- **Clipping**: that the device's GPU draws the triangles the simulator loses (above). Run the
  test scene on it and read `clipping` in its `report` lines.
- **The weather outside**: no retained signed WeatherKit run is established by these observations. Unchecked: the location prompt on a TV and the
  location a TV gives; signing with the explicit profile; real conditions, sunrise and sunset
  reaching the game, and how the mapping looks under them; the attribution WeatherKit returns
  and how it lays out in About (and that the Apple logo in " Weather" draws there, which
  CoreText's font fallback should give it); refreshing across suspend and resume over a day;
  the calls a day it really makes.
- The home-screen icon's parallax and the Top Shelf banner on the home screen.
- **Playing together** (eight flies' frame, the QR code on screen, plain `ws://` by address and
  going to the background and back were checked on a TV: [Eight flies on a
  TV](#eight-flies-on-a-tv)): the keyboard with a real remote (that it comes up at once, that
  Back from it answers null, that a code typed there joins); `wss://` to the real room server
  through a TV's network; plain `ws://` to a room server on the local network by name (from a
  `--local-rooms` build); and the QR code scanned off a TV across a room by a phone's camera.

## Host components

The host consists of: the host (`Host.mm`, `JSHost.h`, `Host.h`), the command executor
(`Renderer`, `Executor`, `Canvas2D`, `Fonts.mm`),
the runtime (`dom.ts`, `web.ts`, `webgl.ts`, `canvas2d.ts`, `color.ts`, `glConstants.ts`,
`ops.ts`, `native.ts`), the frame-stats and `drive` hooks (`runtime/report.ts`), the XcodeGen
spec, the privacy manifest, the build script, the asset-catalog pipeline and App Store archiving
(`scripts/apple.ts`, [release.md](release.md)).

The runtime has no network HTTP `fetch`, browser `WebSocket` or `EventSource`,
`crypto.subtle`, or Now Playing integration. Native room sockets and optional weather supply
the network access described above.

Other components include: the remote (its own `Remote` class; Play/Pause is its own key; key repeat;
the touch surface through GameController; the root flag pushed from JavaScript instead of polled
from the game's state), the brain bridge and its stand-in, real WebGL fences, `FontFace` in
place of fonts bundled by file name, `sessionStorage` in memory instead of sharing
`localStorage`'s store, readiness from `data-ready`, nearest-neighbour
stretch by default, the test scene and the simulator check, game artwork rendered by script, and
a WebSocket bridge of its own (polled, with cached views for binary messages) and the system keyboard, for
tables with others.
