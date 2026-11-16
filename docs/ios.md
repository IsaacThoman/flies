# The iPhone and iPad app

`apps/ios` is the game on an iPhone or an iPad: the web build, unchanged, in a `WKWebView` that
fills the window, served from the app's own bundle through a custom URL scheme. No network and no
local server. The brain is the browser's: `packages/brain` in a Web Worker. The app itself is a
small Swift shell that does what a host should: it serves the page, tells the game the safe area,
pauses it when the app isn't in front, decides when the screen may sleep, and adds haptics. It
draws nothing of the game and knows nothing of it beyond the state the game publishes on its
canvas for scripts and hosts.

iOS has what tvOS lacks: a public WebKit with a JIT, WebGL 2, module workers and Web Audio. So the
iPhone and iPad run the same game the browser does, and there is one game for the web, the phone
and the tablet; only the Apple TV needs its own host ([apple-tv.md](apple-tv.md)).

## Why a web view

Decided by a spike in the iPhone 18 Pro simulator (iOS 27.0, on an M5 Pro), November 2026:

- The web build runs from the bundle as it is: the module script, the brain's module worker, the
  38 MB connectome fetched through the scheme handler with real progress, WebGL 2 with the eyes'
  asynchronous read-back (`data-eyes="brain"`, a picture every 50 ms), Web Audio, `localStorage`.
  The page is a secure context; it is not cross-origin isolated (no `SharedArrayBuffer`), which it
  doesn't need.
- The TypeScript brain keeps real time (the meter's speed 1.00) and its steps take 8 to 30% of the
  time they simulate on one of the Mac's cores, about what Node's V8 takes (packages/brain-native,
  Speed and memory). JavaScriptCore with its JIT is no handicap.
- The native brain could be offered to the page, but not cheaply, and it isn't needed for speed.
  The page runs in WebKit's process and the app in its own, so they can share no memory: every
  tick would cross two processes through a script message handler, asynchronously (the
  synchronous `NativeBrainBridge` of the Apple TV can't be built on it; it would be a third driver
  shaped like the worker's). Measured: a tick with the eyes' 1,772 values as an array costs the
  page 0.43 ms to post and 1.6 ms there and back, 0.17 ms of the app's main thread; packed as
  base64, 0.02 ms, 0.26 ms and 0.017 ms. Affordable. What it would buy: the C++ brain takes about
  half the time (its README), and in the simulator the brain is about 25% of a core out of the
  app's 45% or so in all (WebKit's page process about 35% with the brain, its GPU process 7%, the
  app 4%), so roughly a quarter of the app's CPU. That is a power question for a device to
  answer, not a speed one; see [What isn't verified](#what-isnt-verified).
- Retargeting the Apple TV's host (JavaScriptCore without the JIT, WebGL replayed on OpenGL ES)
  would throw away the JIT, Metal and the browser's audio for a hand-written browser on a
  deprecated graphics API, to run the same page worse.

## How it works

| Process | Runs |
| --- | --- |
| The app | UIKit: the window, the launch image, the power policy, haptics, the scheme handler serving `www/` |
| WebKit's page process (WebContent) | The game's JavaScript, and the brain in a Web Worker on a thread of its own |
| WebKit's GPU process | WebGL 2 on Metal, and Web Audio |
| WebKit's networking process | Storage (`localStorage`) |

| File | What it does |
| --- | --- |
| `src/App.swift` | The app and its one scene: one window, since a second would be a second fly with a second brain |
| `src/GameViewController.swift` | The web view, edge to edge; the launch image over it until the game has drawn; the safe area; pausing; a reload if iOS ends the page's process |
| `src/BundleSchemeHandler.swift` | Serves `www/` at `fly://app/`: memory-mapped, in 1 MB slices, one per turn of the main run loop, so the connectome's progress is real and nothing outside `www/` is served |
| `src/PageScripts.swift` | What the app adds to the page: the ambient audio session, and a watch on the canvas's state |
| `src/Power.swift` | When the screen may sleep and when the game must stop (below) |
| `src/Haptics.swift` | The feather on the fly, and its take-offs, felt through the glass |
| `src/Report.swift` | Reports for checks and measurements (below); off unless asked for |
| `src/Launch.storyboard` | The launch screen: the launch image filling a screen of any shape |
| `src/Settings.bundle` | The app's page in the Settings app: the Haptics switch |
| `src/PrivacyInfo.xcprivacy` | No tracking, no data collected; `NSUserDefaults` for the Haptics switch (CA92.1) |

### What the app tells the page, and what it reads

- **The safe area.** What the notch, the home indicator, rounded corners and a window's edges
  cover, in CSS pixels, assigned to `window.__flySafeArea` (`SAFE_AREA_PROPERTY`,
  `packages/contracts/src/screen.ts`) followed by a `resize` event, whenever it changes. The page
  is laid out edge to edge (`contentInsetAdjustmentBehavior = .never`) and is told, not inset.
- **The audio session.** `navigator.audioSession.type = "ambient"` before the page's scripts run:
  the fly's sound obeys the silent switch and plays under other apps' music instead of stopping
  it, as on the Apple TV. Sound starts when the page's own code says (the player's first touch);
  WebKit is told to ask for no gesture of its own (`mediaTypesRequiringUserActionForPlayback`).
- **Nothing else.** The app defines no `globalThis.__native`: the game takes its presence to mean
  the Apple TV's host (its brain, and no browser input), so a future native bridge on iOS must
  come with a narrower test in `apps/web/src/main.ts`.
- **What it reads**: `data-screen` (the first one means the game is drawing: the launch image
  fades), `data-wallpaper` (the power policy), and for haptics `data-tool`, `data-touch` and
  `data-takeoffs`. A `MutationObserver` posts them to the app only when they change.

The game publishes no `data-ready`, though the Apple TV's host waits for one: there its launch
image stays up until its 30-second fallback. The phone's app fades its launch image on the first
`data-screen` instead.

### Input

Touch, a trackpad or mouse, and a keyboard reach the page as they do in Safari: pointer events,
and key events while the page is the first responder (it is made so when it loads and whenever
the app comes back to the front). A keyboard's arrows, Return and space are the remote's buttons
(`REMOTE_KEYS`); Escape is Back. Game controllers reach the page as the standard Gamepad API
(`navigator.getGamepads`), which the game doesn't read yet; reading it there would serve the
browser too. The app adds no input of its own.

### When the game runs, and when the screen may sleep

| | The game | The screen |
| --- | --- | --- |
| In front, playing | Runs | Sleeps as the phone's Auto-Lock says (touches keep it awake) |
| In front, the wallpaper, on a charger | Runs | Kept on |
| In front, the wallpaper, on battery | Runs | Kept on for 10 minutes after the last touch, then Auto-Lock |
| Low Power Mode | Runs (WebKit holds a page's animation frames to 30 a second then) | As the phone's Auto-Lock says |
| Hot (`serious`) | Runs | As the phone's Auto-Lock says |
| Critically hot (`critical`) | Paused | As the phone's Auto-Lock says |
| Not in front: the app switcher, Control Center, Notification Center, a call, Siri, another window in focus on an iPad | Paused | (the app has no say) |
| In the background, or the screen locked | Paused, then suspended by iOS | |

Pausing takes the web view out of the window and puts a still of its last frame in its place. A
page out of a window is hidden: its animation frames stop, so the fly's life and the brain stop
with them (the worker is only ever given time by the frame loop), and its sound is suspended
(`setAllMediaPlaybackSuspended`; the `AudioContext` reads `interrupted`). Back in front the page
carries on where it was: the game's step is capped at 100 ms and the brain's at 100 ms of fly
time, so nothing jumps; the sky follows the clock. WebKit does none of this for a page that is
merely covered (in the app switcher it went on drawing at 60 frames a second, brain and all), and
hiding the web view (`isHidden`) doesn't hide the page.

The brain keeps one core busy and the world is drawn 60 times a second, so a phone that kept the
wallpaper on for as long as it liked would go flat in a few hours and grow warm doing it. On a
charger the wallpaper is the point; on battery it is a glance. The page's own wake lock
(`navigator.wakeLock`, which a browser tab uses) is refused inside an app's web view, so the
app's policy is the only one.

iOS may end the page's process to reclaim memory, mostly in the background; the app then loads
the game again. Its settings are kept; the fly's moment is not.

### Haptics

While playing (never in the wallpaper, where nobody's finger is on the glass): a soft tap with the
fly's own touch sense while the feather is on it (`data-touch` above 0.35 with `data-tool`
`feather`: resting on it 0.4, stroking 1), and a knock when it takes off. Both follow the fly's published
state, so they are what happened to the fly. They come up to 200 ms late (the canvas's state is
published five times a second). Off with the Haptics switch in the app's page of the Settings app,
or with the system's own.

## Building and running

Needs a Mac with Xcode 27 and XcodeGen (`brew install xcodegen`), and the connectome
(`npm run brain:fetch`).

```sh
npm run ios                               # build for the simulator and run it in the booted one
npm run ios -- --sim <udid> --report 2    # ...in that simulator, printing reports every 2 s
npm run ios -- build                      # for an iPhone or iPad
npm run ios -- build --sim [--debug]
npm run ios -- run --device <udid>        # install and launch, printing the console
npm run ios:check                         # the simulator check (below)
npm run tvos:art -- --only ios/           # render the icon and launch image again
```

`build` writes the asset catalog from `assets/ios` (`scripts/iosAssets.ts`), builds the web app
with the root Vite config into `apps/ios/www/` (the connectome included), generates
`AppleTVFlyiOS.xcodeproj` from `apps/ios/project.yml` and builds it. Release by default; `--debug`
makes the page inspectable in Safari's Web Inspector.

### The app's identity

- **Bundle ID and team**: `IOS_BUNDLE_ID` and `IOS_TEAM_ID`, which default to the Apple TV app's
  (`TVOS_BUNDLE_ID`, `com.isaacthoman.appletvfly`; `TVOS_TEAM_ID`, `PX72AL9366`). One bundle ID
  for both makes them one app in the App Store, bought once for both (universal purchase): App
  Store Connect adds iOS as a platform to the Apple TV app's record.
- **Version**: `apps/version.yml`, included by both XcodeGen specs, so the iPhone, iPad and Apple
  TV apps are numbered together.
- **Name**: "Apple TV Fly", the game's own. App Review's guidelines (5.2.5) are wary of Apple's
  trademarks in an app's name; that goes for the Apple TV app too.
- **Icon and launch image**: rendered from the game by the art pipeline (`scripts/art.ts`,
  `apps/web/src/art.ts`) into `assets/ios` ([assets/README.md](../assets/README.md)): the fly close
  up on the napkin, with a night version for the dark appearance; and a square picnic with the fly
  in the middle, which the launch screen crops to the screen's shape.
- **Devices**: iPhone and iPad, iOS 26 or later (the Apple TV app's floor too), every orientation
  (upside down on an iPad only), any window size on an iPad.

### One project or two

Two XcodeGen specs, `apps/tvos/project.yml` and `apps/ios/project.yml`, sharing
`apps/version.yml`. The apps share no native code: the Apple TV hosts the page's JavaScript
itself, with its own browser, renderer and the C++ brain, where the phone hands the page to
WebKit. They bundle different builds of the page (one classic script there, the module build
here), and each is built and checked by its own script. One project would regenerate and rebuild
the TV app for every change to the phone's and couple their checks. What they do share, the
version, the bundle ID, the art pipeline and the web build, lives outside both.

### Reports

`-FlyReport <seconds>` on the command line (as `npm run ios -- --report`, and the check, pass it):
that often the app reports the canvas's state, the brain's speed against real time and what its
steps cost, frames, taps and keys the page saw, the safe area the page was given, and the app's
own memory, power and thermal state, as `report {json}` on the console and in
`Library/Caches/report.log` (replaced each launch), and as the value of an accessibility element,
`fly-report`, for UI tests. The page's errors and console warnings are passed on as they happen.
`-FlySettings <json>` changes the game's settings through its own code once it has started.

## Checking it

`npm run ios:check` (`apps/ios/tests/simulator.ios.ts`; `--no-build`, `--device <type>`,
`--runtime iOS-27-0`) builds the app and its tests, creates and boots a fresh iPhone 18 Pro
simulator, runs them, then shuts it down and deletes it:

- unit tests (`tests/unit`): the power policy's table; what the scheme handler serves (the site,
  nothing outside it, JavaScript as JavaScript);
- the UI test (`tests/ui/AliveTests.swift`), driving the app as a person would: the brain wakes
  and the title shows; frames go on being drawn and the brain keeps real time; a tap on the
  screen reaches the page; away (another app in front) for 6 s, the brain doesn't run, and in
  front again it carries on at real time; a setting changed in one run, the app killed, is there
  in the next;
- the memory of the app and of WebKit's processes, sampled from the Mac while it runs.

It prints what it measured, saves a screenshot and the test results outside the repo and prints
where. About two minutes after the build. Whether a keyboard reaches the game it reports but
doesn't require: a headless simulator, as the check makes, has no keyboard attached (one shown in
Simulator or T3 Code's device panel does), and XCUITest's own Return and Escape never reach a web
page on iOS (its newline does, as Enter; WebKit's own tests send a hardware Escape to the page).

Measured by it, 16 November 2026, fresh iPhone 18 Pro simulator, iOS 27.0, M5 Pro shared with
other work: the brain awake and the title up 20 to 28 s after the first launch (WebKit compiling
everything for the first time), a relaunch drawing its first screen in about 4 s (2.2 s on a
simulator used before); 59 fps on the title; the brain at real time, its steps taking 18 to 30%
of what they simulate; the peak footprints 29 MB for the app, 190 MB for WebKit's page process,
39 MB for its GPU process, 9 MB for its networking process.

These are the Mac's speeds: the simulator runs the page's JavaScript on the Mac's cores and draws
with its GPU. They say the app works, not how a phone runs it.

## On a device, and in TestFlight

1. In the [developer account](https://developer.apple.com/account), the app ID
   `com.isaacthoman.appletvfly` already exists for the Apple TV app; nothing to add (no
   capabilities). With a different `IOS_BUNDLE_ID`, register it.
2. For a device: enable Developer Mode on it (Settings, Privacy & Security), connect it, then
   `npm run ios -- build` (Xcode's automatic signing makes the profile; `-allowProvisioningUpdates`
   is passed) and `npm run ios -- run --device <udid>` (`xcrun devicectl list devices` gives the
   UDID). Without `--report` it runs as from the home screen.
3. For TestFlight: in App Store Connect, open the Apple TV Fly record and add iOS as a platform
   (Add Platform). Raise `CURRENT_PROJECT_VERSION` in `apps/version.yml` for each upload. Then
   `npm run ios -- build`, open `apps/ios/AppleTVFlyiOS.xcodeproj` in Xcode, Product → Archive,
   and Distribute App → App Store Connect. Add the iPhone and iPad screenshots, the privacy
   answers (no data collected) and a TestFlight group.

## What isn't verified

No iPhone or iPad was connected while this was built. Everything above ran in the simulators
(iPhone 18 Pro and iPad Pro 11-inch (M5), iOS 27.0) only. Only a device can answer:

- **The brain's speed and cost on a phone**: whether it keeps real time on the oldest phones iOS
  26 runs on (A13), and what share of the app's power it is. That decides whether the native
  brain over a message bridge (above) is worth building.
- **Battery and heat**: how long a phone lasts showing the wallpaper on battery, how warm it gets
  on a charger overnight, and whether the thermal states arrive and the policy follows them. The
  simulator reports no battery (so on battery throughout) and is never hot. The policy's table is
  unit-tested; its effect is not measured.
- **Low Power Mode**, which the simulator can't turn on.
- **Audio**: the silent switch, mixing under another app's music, and an interruption by a call
  (WebKit's own handling; the simulator has no calls).
- **Haptics**, which the simulator can't play.
- **A hardware keyboard's Escape and Return** on a device; their arrows, space and Enter were
  seen to reach the page in a simulator with a keyboard attached.
- **Game controllers** through the Gamepad API.
- The launch image and icon on a home screen, and Stage Manager's own window sizes beyond the
  windowed iPad layout seen in the simulator.
