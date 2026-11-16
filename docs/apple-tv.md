# The Apple TV app

`apps/tvos` runs the game's own JavaScript (the web build, unchanged) on an Apple TV. There is no
WebView: tvOS's WebKit is private API. Instead an Objective-C++ host runs the script in the
public JavaScriptCore framework, with a small browser in TypeScript (`apps/tvos/runtime`) that
fakes enough of the DOM and Web APIs for three.js and the game. three's ordinary
`WebGLRenderer` draws through a home-made WebGL 2 that records calls into shared command
buffers, which native code replays on OpenGL ES 3.0. 2D canvases are CoreGraphics, Web Audio is
AVAudioEngine, and the fly's brain is C++ on a thread of its own. Public APIs only, so it can go
through App Review.

The host is the one built for aerodance (github.com/IsaacThoman/aerodance, `apps/tvos`), which
holds 60 fps there on an Apple TV 4K; its `docs/apple-tv.md` records the measurements and the
alternatives that were tried and dropped (tvOS WebKit, WebGPU, React Native, streaming). This app
copies its generic parts and leaves out the rest (pairing, networking, file transfer, songs,
benchmarks). See [What came from aerodance](#what-came-from-aerodance).

## How it works

Five threads:

| Thread | Owns | Code |
| --- | --- | --- |
| Main | UIKit: the layer frames are shown in, the remote's presses and touches, the GameController framework, the splash | `src/main.mm`, `src/Remote.mm` |
| JavaScript | The JavaScriptCore context: runs `runtime.js`, then `game.js`, animation frames from a `CADisplayLink`, timers, events | `src/Host.mm`, `runtime/` |
| Render | The OpenGL ES context: replays WebGL and 2D canvas commands a frame behind JavaScript, presents | `src/Renderer.mm`, `src/Executor.mm`, `src/Canvas2D.mm` |
| Brain | The `fly_brain`: loads the connectome, steps the simulation whenever time is waiting | `src/BrainBridge.mm`, `packages/brain-native` |
| Audio | AVAudioEngine's render callback: the Web Audio graph, mixed per sample | `src/Audio.mm` |

WebGL calls that return nothing are encoded into a 4 MB command buffer (about 0.2–0.3 µs a call
on the device, per aerodance) and run later on the render thread. Object handles are numbered in
JavaScript, so creating a buffer or texture doesn't wait. Calls that need an answer
(`getParameter`, shader and link status, `readPixels`, `getBufferSubData`, `getImageData`)
hand the buffer over and wait for the render thread to catch up: see [Reading pixels
back](#reading-pixels-back). 2D canvas drawing goes into the same stream, so a `CanvasTexture`
always sees what was drawn before it was uploaded.

WebGL's default framebuffer is an FBO the size of the canvas (640×480), shown in a
`CAEAGLLayer` stretched over the screen. The game renders at 640×480 and lays itself out for
16:9; the stretch makes the pixels wide. Scaling is nearest-neighbour unless the launch config
says otherwise.

The splash (the launch image) stays up until the screen canvas has `data-ready="true"` (or 30
seconds), then fades. The screen saver is off while the app is open.

## Building and running

Needs a Mac with Xcode 27 and XcodeGen (`brew install xcodegen`), and the connectome
(`npm run brain:fetch`). For a device: an Apple TV 4K on tvOS 26 or later, paired with the Mac
(Settings → Remotes and Devices → Remote App and Devices on the TV, then Xcode's Devices window or
`xcrun devicectl manage pair`), and a paid developer team signed in to Xcode. Builds sign with
`TVOS_TEAM_ID` (default `PX72AL9366`) and `TVOS_BUNDLE_ID` (default `com.isaacthoman.appletvfly`).

```sh
npm run tvos -- build                    # the game, for an Apple TV
npm run tvos -- build --sim              # ...for the tvOS simulator
npm run tvos -- build --sim --test-scene --stand-in-brain
npm run tvos -- run --sim <udid>         # install and launch, printing the console
npm run tvos -- run --device <udid> --config '{"script":"game.js","stats":2}'
npm run tvos -- run --device <udid> --detached --config '{"script":"game.js","stats":10,"logFile":true}'
npm run tvos:soak -- --device <udid> --minutes 30
npm run tvos:check                       # the simulator check (below)
```

`build`:

1. writes `src/generated/ops.h` (the command stream's opcodes) and the asset catalog from
   `assets/` (`scripts/tvosAssets.ts`);
2. bundles the runtime (`runtime/index.ts`) with rolldown into `www/runtime.js`;
3. builds the page as one classic script, `www/game.js`, with Vite (`apps/tvos/vite.config.ts`):
   `apps/web/src/main.ts`, or `apps/tvos/tests/scene.ts` with `--test-scene`. The host has no
   module loader, so everything is inlined; `apps/web/public` is copied beside it;
4. copies `packages/brain/data/connectome.bin` to `www/brain/` (and stops, saying how to get
   it, if it isn't there);
5. generates `AppleTVFly.xcodeproj` (XcodeGen, `project.yml`) and builds it with xcodebuild.

The Xcode project compiles every source under `packages/brain-native/src/` with that
package's release flags (`-O2 -DNDEBUG -ffp-contract=off`). `--stand-in-brain` compiles
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
| `stats` | Logs frame timings every N seconds as `stats {json}`: fps, JavaScript and GL ms per frame, draws, memory |
| `logFile` | Redirects stderr to `Library/Caches/performance.log` in the app container, replacing the previous run's log; defaults to `false` |
| `profile` | With `stats`: time spent in each WebGL and 2D canvas method |
| `gpuTiming` | `glFinish` after every frame, to time the GPU (slows it down) |
| `glDebug` | Checks `glGetError` after every GL command |
| `drive` | Scripted remote input for unattended runs, waiting on the canvas's `data-*` state: `[["wait", {"ready": "true"}], ["press", "ArrowRight", 650], ["swipe", "ArrowUp"], ["touch", 0.5, -0.2, true], ["sleep", 500], ["log", "mark"]]`. Presses, swipes and touches go through the same native code as the remote's (`runtime/report.ts`) |

`devicectl ... --console` (what `run --device` uses) attaches a debugger, which slows
JavaScript down by about 1.5x (aerodance's measurement): don't trust frame timings taken that
way.

Use `--detached` with `logFile` for device measurements. `tvos:soak` installs and launches the
last physical-device build without attaching, exercises feeding, ball throws, the eye picture
at Low and High, and pause/settings, then watches the wallpaper at midday and at night for
`--minutes` in total (plus about three minutes of interaction and idle transitions). It assumes
the default tool variants and Low eyes, and restores Low before the wallpaper phases. It leaves
the app running. Do not attach a console or enable `profile`, `gpuTiming` or `glDebug` for the
final measurement. Pull its log while it runs or after `drive: soak complete`:

```sh
xcrun devicectl device copy from --device <udid> \
  --domain-type appDataContainer --domain-identifier com.isaacthoman.appletvfly \
  --source Library/Caches/performance.log --destination /tmp/fly-performance.log
```

Reports include the canvas state, elapsed `atMs`, and `thermalState` (0 nominal, 1 fair,
2 serious, 3 critical). `intervalMs` measures animation-frame starts; `completedIntervalMs`
measures render-thread frame completions. Neither is a hardware scanout measurement. Check
their tails as well as average FPS, and compare early and late windows for slowdown and memory
growth. The host retains about 68 seconds of frame history, so use a stats interval below that.

## The Web APIs that exist

Everything else is missing, and code that reaches for it gets `undefined` or an exception. In
JavaScriptCore itself: all of ES2023, `Intl`, typed arrays, `Promise`, `WeakRef`,
`FinalizationRegistry`. There is no JIT: JavaScript runs about 16 times slower than in a
desktop browser.

- **Window**: `window`/`self`/`globalThis`, `addEventListener` etc., `innerWidth`/`innerHeight`
  (1920×1080, never change), `devicePixelRatio` (1), `screen`, `matchMedia` (static answers),
  `getComputedStyle` (the element's own `style`), `location` (read-only; navigation is
  ignored), `history` (inert), `navigator` (`getGamepads()` is always empty).
- **Document**: `document.getElementById`, `querySelector(All)` (tag, `#id`, `.class` and
  combinations; no combinators), `createElement`, `body`, `head`, `activeElement`,
  `visibilityState` and `visibilitychange` (when the app goes to the background), `fonts`.
  `<canvas id="game">` is in the body before the script runs, as in `apps/web/index.html`.
  Elements are a tree with attributes, `dataset`, `style` and `classList`, but nothing is laid
  out or drawn: every element reports the screen's size.
- **Events**: `Event`, `CustomEvent`, `KeyboardEvent` (the remote; see below) with capture and
  bubbling. `MouseEvent`, `PointerEvent`, `WheelEvent` exist as classes but nothing sends them.
- **Canvas**: `getContext('webgl2')` on one canvas (the screen canvas; a second WebGL canvas
  gets `null`) and `getContext('2d')` on any number of others. No WebGL 1, no
  `OffscreenCanvas`, no `toDataURL` (returns `data:,`) or `toBlob` (gives `null`).
- **WebGL 2**: all of it that three.js uses, on OpenGL ES 3.0. Extensions as the GPU has them.
  The simulator has `EXT_color_buffer_half_float` but not `EXT_color_buffer_float`: `RGBA16F`
  render targets work (the test scene checks one), `RGBA32F` ones are incomplete. three warns
  "EXT_color_buffer_float extension not supported" at start-up because it asks for that
  extension whenever it makes an `RGBA16F` target, which `PMREMGenerator` does for the
  reflections; they render all the same. Use `HalfFloatType` or `UnsignedByteType` render
  targets, never `FloatType`. No timer queries, no
  transform feedback, no `KHR_parallel_shader_compile`: a shader compiles the first time it's
  drawn, which stalls that frame; warm materials up (`renderer.compile`) while the splash is up.
  `antialias: true` gives a 4x MSAA default framebuffer; the game's look wants `false`.
  Fences (`fenceSync`, `clientWaitSync`, `getSyncParameter`) are real.
- **2D canvas**: CoreGraphics. Paths, `roundRect`, `Path2D`, fills and strokes, gradients
  (linear, radial, conic), patterns, line dashes, shadows, clipping, every
  `globalCompositeOperation`, transforms, `drawImage`, `get`/`putImageData`, `fillText`,
  `strokeText`, `measureText`, `letterSpacing`. Not: `filter` (accepted, ignored),
  `isPointInPath`/`isPointInStroke` (always false), `direction` (always left to right).
  Text uses the fonts the page has loaded with `FontFace`, else the system font (SF) for any
  family.
- **Fonts**: `new FontFace(family, 'url(fonts/x.woff2)' or bytes, { weight, style })`,
  `face.load()`, `document.fonts.add(face)`, `document.fonts.ready`, with TTF, OTF or WOFF
  files from the app's own (aerodance ships WOFF this way; WOFF2 isn't checked). No CSS
  `@font-face`.
- **Images**: `Image`/`<img>`, `createImageBitmap` (from a `Blob`, an image or a canvas),
  `ImageBitmap`, from the app's files, `blob:` and `data:` URLs (PNG, JPEG, anything ImageIO
  reads). Decoding happens off the JavaScript thread. No remote images.
- **Files**: `fetch` of the app's own files (GET only; relative URLs resolve against
  `http://fly.local/`), `blob:` and `data:` URLs. `Response` (`arrayBuffer`, `json`, `text`,
  `blob`, `bytes`; `body` gives the whole file as one chunk), `Request`, `Headers`, `Blob`,
  `File`, `URL`, `URLSearchParams`, `URL.createObjectURL`. The app has no network: anything
  else rejects. No `XMLHttpRequest`, `WebSocket`, `EventSource`.
- **Storage**: `localStorage`, kept in `NSUserDefaults` (keep it small: settings, not data).
  `sessionStorage` lasts as long as the app runs. No IndexedDB, no cookies, no Cache API.
- **Timers and frames**: `setTimeout`, `setInterval`, `requestAnimationFrame` (the display
  link, 60 Hz; a frame isn't started while two are still on their way to the screen),
  `requestIdleCallback`, `queueMicrotask`, `performance.now()` (no marks or measures),
  `console` (to the device console), `reportError`.
- **Web Audio**: `AudioContext` (`currentTime`, `resume`/`suspend`, `getOutputTimestamp`,
  `outputLatency`), `GainNode`, `AudioBufferSourceNode` (`start` with offset and duration,
  `stop`, `loop`, `playbackRate`, `ended`), `AudioBuffer` (`getChannelData`,
  `copyTo/FromChannel`), `createBuffer` for generated sounds, `decodeAudioData` (what
  AVAudioFile reads, such as WAV, AIFF, CAF, MP3 and AAC/M4A; not Ogg), `AudioParam` automation
  (`setValueAtTime`, linear and exponential ramps, `setTargetAtTime`, `setValueCurveAtTime`,
  `cancelScheduledValues`), and `DynamicsCompressorNode` as a pass-through (the output is hard
  clipped at full scale). Nothing else: no oscillators, filters, panners, analysers,
  convolvers, `AudioWorklet` or media elements; build sounds as buffers. The context needs no
  user gesture. The session is ambient: other apps' music keeps playing under the fly's sounds.
- **Misc**: `crypto.getRandomValues`, `crypto.randomUUID` (no `crypto.subtle`),
  `structuredClone`, `atob`/`btoa`, `TextEncoder`/`TextDecoder` (UTF-8, UTF-16LE, Latin-1),
  `AbortController`, `DOMException`, `ResizeObserver` (fires once, at the screen's size),
  `IntersectionObserver` and `MutationObserver` (inert).
- **Not there**: `Worker` (it is `undefined`: the brain is `__native.brain`), modules and
  `import()` at run time (Vite inlines them; `import.meta.url` is `http://fly.local/game.js`),
  WebGPU, WebXR, video, the Gamepad API, pointer and touch events, `alert`/`confirm` (logged).

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
`window.__flyAtRoot` (`AT_ROOT_PROPERTY`) to say whether it is at its root; the runtime turns
each assignment into a native call, and the main thread reads it the moment a Back press begins.
When it is true the game never sees that press: tvOS takes it and goes to the home screen.
Assign the property; don't `defineProperty` over it.

## The brain

`globalThis.__native.brain` is `NativeBrainBridge` (`packages/contracts/src/brain.ts`),
implemented in `src/BrainBridge.mm` over `packages/brain-native/include/fly_brain.h`:

- `start(seed)` starts the brain thread (8 MB stack, QoS user-initiated: below the JavaScript
  and render threads). It memory-maps the bundled `www/brain/connectome.bin` (38 MB) and builds
  the brain there; the main and JavaScript threads never wait for it. `status()` is `loading`
  until then (and before `start`), then `running` or `failed` with `error()`.
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
  `rateNames()` entry) into a `Float32Array` and returns how many states there have been.

In the simulator the real brain (`packages/brain-native` as of 15 November) loads in about 150 ms
and keeps up with real time at 60 submits a second, on an M5 Pro. How fast it runs on an Apple TV
is not measured yet.

## Reading pixels back

The game renders what the fly's eyes see into a small render target and reads it back every
frame or two. Both of three's ways work and are checked by the test scene (`tests/scene.ts`, a
32×16 target, red on the left and green on the right, read back pixel-exact):

- `renderer.readRenderTargetPixels(target, ...)` is synchronous: one `readPixels` query, so
  the JavaScript thread hands over its commands and waits until the render thread has replayed
  everything submitted so far (in mode 2 that can include the end of the previous frame), and
  the GPU has finished drawing the target. It also undoes, for that frame, the overlap between
  JavaScript and GL replay that mode 2 exists for.
- `renderer.readRenderTargetPixelsAsync(target, ...)` reads into a pixel-pack buffer, sets a
  fence and polls it. The fence is real: the render thread writes the newest signalled fence
  into shared memory, so polling never waits. When it has signalled, `getBufferSubData` is
  still a query (it waits for the render thread to catch up, but not for the GPU). The answer
  arrives a few milliseconds later, in a timer between frames, and is a frame old.

Measured in the simulator (M5 Pro, the software renderer, mode 2): the synchronous read takes
0.08 ms on average (0.5 ms at most) on tvOS 27 and 0.11 ms (1.9 ms at most) on tvOS 26, and the
frame rate is the same with or without it (60 fps); the async read resolves about 5 ms after it
starts, before the next frame (most of that is three's 4 ms polling interval). These say the
path is correct and cheap on a Mac; they say nothing about the Apple TV, where the wait is for
its render thread and GPU. On a device, run the test scene (`build --test-scene
--stand-in-brain`, `run --device <udid>`) and read `readback` and `readbackAsync` in its
`report` lines. The game uses the async path with at most one read in flight, retaining the last
completed facet values while it waits. Resolution changes wait for the read before disposing
its target, and keep the previous light until the new picture arrives. `data-eyes-updates`
counts completed pictures; `data-eyes-ms` includes submission and resampling CPU time, excluding
the asynchronous wait. A readback's final data copy can still wait for queued render-thread
commands; this is not a fully asynchronous native transfer.

## Checking it

`npm run tvos:check` (`apps/tvos/tests/simulator.tvos.ts`; `--no-build` to reuse the last
build, `--runtime tvOS-26-0` for the older system) builds the app with the test scene and the
stand-in brain, creates and boots a fresh Apple TV 4K simulator, installs and launches the app
with a `drive`, and checks what the scene reports:

- a held Right repeats (three times in 650 ms), Select, a swipe, Back and Play/Pause arrive as
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
- a generated beep plays and ends; a WAV decodes; `localStorage` keeps a value; `fetch` reads
  a bundled file;
- the brain bridge: the stand-in loads the bundled connectome and reports its neuron and
  connection counts (so the file arrived whole), its eyes, its rate names; the commands it
  answers prove the senses and both light arrays arrived on the right sides; a 600 ms burst of
  submits is simulated in steps of at most 100 ms;
- the host's frame stats.

It saves a screenshot in a temporary folder outside the repo and prints its path, then shuts the
simulator down and deletes it. It takes about 15 seconds after the build. The simulator draws
OpenGL ES in software, so it says nothing about speed.

### The simulator's renderer loses clipped triangles

The simulator draws OpenGL ES with Apple's software renderer ("Apple Software Renderer",
`APPLE-22.0.12` on tvOS 26, `APPLE-24.0.2` on tvOS 27), and its clipper is broken: some triangles
that have to be clipped (against the near plane, or against the sides of the picture) are
dropped, whole or in part. Which ones depends on where their vertices are and in what order they
come; a triangle that needs no clipping is always drawn. In the game, close to the fly, this
punches wedges out of the table top and the napkin, all meeting at the table's middle (the
table top is one fan of 96 triangles), through which the lawn of the backdrop pass shows, and
cuts stripes out of the jars. The whole-table view, where nothing needs much clipping, looks as
it does in a browser.

It is not the host: the same three.js triangles, one per draw, are dropped with or without
multisampling, depth testing, culling or primitive restart, on the screen or in a render
target, and the host passes draws to GL untouched. Drawn by the Mac's GPU in Chromium (ANGLE on Metal), every one matches the same
triangle clipped by hand. On an Apple TV, OpenGL ES runs on the GPU, which clips in hardware,
so the device should not show it; until a device has run the test scene, that is a strong
expectation, not a measurement (its `clipping` report must say `wrong: 0`).

There is no clean way round it in the simulator: the renderer ignores `gl_ClipDistance`
(`GL_APPLE_clip_distance` is listed, but a distance of -1 clips nothing), and the only other
fixes are clipping on the CPU or another renderer. Judge the look of anything near the camera
in a browser.

## What isn't verified

No Apple TV was connected while this was built, so none of this has run on one:

- **Performance**: frame times with the real game, the cost of `readPixels` there, the brain's
  speed, memory. The device build signs (team `PX72AL9366`, the team's wildcard tvOS
  provisioning profile) but hasn't been installed.
- **The real remote**: this Mac's Xcode has no Simulator app, so the simulated remote (its
  window and keyboard) couldn't be used either; every press, swipe and touch in the check is
  scripted, through the same native code as real input from the point UIKit hands it over. The
  headless simulator does connect a micro gamepad, so the GameController path is set up there.
  On a device, check: presses and repeats on the clickpad ring and centre; swipes; that the
  touch surface reports absolute positions with y up through the 2nd-generation remote's dpad,
  and that lifting the finger reads exactly (0, 0) as assumed; that a click doesn't also arrive
  as a GameController button (none is read, so it shouldn't); that Play/Pause reaches the app
  as a press (it isn't the Now Playing app); and that Back at the root really leaves the app.
- **Clipping**: that the device's GPU draws the triangles the simulator loses (above). Run the
  test scene on it and read `clipping` in its `report` lines.
- **Audio** on a TV's speakers, and with other apps' music playing.
- The home-screen icon's parallax and the Top Shelf banner on the home screen.

## What came from aerodance

Copied and adapted: the host (`Host.mm`, `JSHost.h`, `Host.h`), the command executor
(`Renderer`, `Executor`, `Canvas2D`, `Fonts.mm`), Web Audio (`Audio.mm`, `runtime/audio.ts`),
the runtime (`dom.ts`, `web.ts`, `webgl.ts`, `canvas2d.ts`, `color.ts`, `glConstants.ts`,
`ops.ts`, `native.ts`), the frame-stats and `drive` hooks (`runtime/report.ts`), the XcodeGen
spec, the privacy manifest, the build script and the asset-catalog pipeline.

Left out: phone pairing and the relay, WebSocket and EventSource, HTTP `fetch` and the
log/report uploads, the page's file store, `crypto.subtle`, React-specific mount points, songs,
the benchmarks and their natives, Now Playing, App Store archiving.

Changed or added: the remote (its own `Remote` class; Play/Pause is its own key; key repeat;
the touch surface through GameController; the root flag pushed from JavaScript instead of polled
from the game's state), the brain bridge and its stand-in, real WebGL fences, `FontFace` in
place of fonts bundled by file name, `sessionStorage` in memory instead of sharing
`localStorage`'s store, an ambient audio session, readiness from `data-ready`, nearest-neighbour
stretch by default, the test scene and the simulator check, and placeholder art drawn by script.
