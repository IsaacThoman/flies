# The iPhone and iPad app

`apps/ios` is the game on an iPhone or an iPad: the web build, unchanged, in a `WKWebView` that
fills the window, served from the app's own bundle through a custom URL scheme. No local server,
and game networking only to the room service, including browsing its list ([Tables with others](#tables-with-others)). The brain is the browser's, in a Web Worker: `packages/brain-native` built as
WebAssembly when its exception feature test passes, otherwise `packages/brain`.
The current app targets iOS 26 and later; this is not an older-iOS app option. The app itself is a
small Swift shell that does what a host should: it serves the page, tells the game the safe area,
stops it when it can't be seen, decides when the screen may sleep, and adds haptics. It draws
nothing of the game. Outside optional reporting/launch diagnostics it reads
the published canvas state; those diagnostics can also inspect game internals
and apply settings.

iOS has what tvOS lacks: a public WebKit with a JIT, WebGL 2 and module workers. So the iPhone
and iPad run the same game the browser does, and there is one game for the web, the phone and
the tablet; only the Apple TV needs its own host ([apple-tv.md](apple-tv.md)).

## Why a web view

Decided by a spike in the iPhone 18 Pro simulator (iOS 27.0, on an M5 Pro), November 2026:

- The web build runs from the bundle as it is: the module script, the brain's module worker, the
  brain fetched through the scheme handler with real progress (then the 38 MB connectome; now
  the web build's 14 MB of gzipped parts, below), WebGL 2 with the eyes'
  asynchronous read-back (`data-eyes="brain"`, a picture every 50 ms), `localStorage`.
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
  answer, not a speed one; see [What isn't verified](#what-isnt-verified). (Since then the
  browser runs the C++ itself, built as WebAssembly, in the same worker: in WebKit about a tenth
  to a fifth less time than the TypeScript, in half the memory; packages/brain-native, In a
  browser.)
- Retargeting the Apple TV's host (JavaScriptCore without the JIT, WebGL replayed on OpenGL ES)
  would throw away the JIT and Metal for a hand-written browser on a deprecated graphics API,
  to run the same page worse.

## How it works

| Process | Runs |
| --- | --- |
| The app | UIKit: the window, the launch image, the power policy, haptics, the scheme handler serving `www/` |
| WebKit's page process (WebContent) | The game's JavaScript, and the brain in a Web Worker on a thread of its own |
| WebKit's GPU process | WebGL 2 on Metal |
| WebKit's networking process | Storage (`localStorage`) |

| File | What it does |
| --- | --- |
| `apps/ios/src/App.swift` | The app and its one scene: one window, since a second would be a second fly with a second brain; a table's link that opened it, or reached it while running |
| `apps/ios/src/Links.swift` | Which links are a table's, and the page's address: the room server and the table |
| `apps/ios/src/GameViewController.swift` | The web view, edge to edge; the launch image over it until the game is ready; the safe area; stopping the game when it can't be seen; a reload if iOS ends the page's process |
| `apps/ios/src/BundleSchemeHandler.swift` | Serves `www/` at `fly://app/`: memory-mapped, in 1 MB slices, one per turn of the main run loop, so the brain's progress is real and nothing outside `www/` is served |
| `apps/ios/src/PageScripts.swift` | What the app adds to the page: a watch on the canvas's state |
| `apps/ios/src/Power.swift` | When the screen may sleep and when the game must stop (below) |
| `apps/ios/src/Haptics.swift` | The feather on the fly, and its take-offs, felt through the glass |
| `apps/ios/src/Report.swift` | Reports for checks and measurements (below); off unless asked for |
| `apps/ios/src/Launch.storyboard` | The launch screen: the launch image filling a screen of any shape |
| `src/Settings.bundle` | The app's page in the Settings app: the Haptics switch |
| `apps/ios/src/PrivacyInfo.xcprivacy` | No tracking, no data collected; `NSUserDefaults` for the Haptics switch (CA92.1) |

### What the app tells the page, and what it reads

- **The safe area.** What the notch, the home indicator, rounded corners and a window's edges
  cover, in CSS pixels, assigned to `window.__flySafeArea` (`SAFE_AREA_PROPERTY`,
  `packages/contracts/src/screen.ts`) followed by a `resize` event, whenever it changes. The page
  is laid out edge to edge (`contentInsetAdjustmentBehavior = .never`) and is told, not inset.
- **A table.** The page's address carries the table a link opened the app for (`?table=`), and a
  room server other than the site's when one was asked for (`?rooms=`); a link that reaches the
  running app is handed to the game as `INVITE_EVENT` (`packages/contracts/src/invite.ts`). See
  [Tables with others](#tables-with-others).
- **Nothing else.** The app defines no `globalThis.__native`: the game takes its presence to mean
  the Apple TV's host (its brain, and no browser input), so a future native bridge on iOS must
  come with a narrower test in `apps/web/src/main.ts`.
- **What it reads**: `data-ready` (the world and the loading screen are drawn: the launch image
  fades, as the Apple TV's does), `data-wallpaper` (the power policy), and for haptics
  `data-screen`, `data-tool`, `data-touch` and `data-takeoffs`. A `MutationObserver` posts them
  to the app only when they change.

### Input

Touch, a trackpad or mouse, a keyboard and a game pad reach the page as they do in Safari, and
the game plays with each as it does in a browser (`apps/web/src/input.ts`): pointer events, the
Gamepad API, and key events while the page is the first responder (it is made so when it loads
and whenever it is shown again). The app adds no input of its own.

## Loading the brain

The web build cuts the brain into gzipped parts of at most 4 MiB, named for their contents
([web.md](web.md)), and the page fetches them. Digest verification and persistent caching depend
on working browser APIs; [the web loading reference](web.md#getting-the-brain-to-the-browser)
describes those conditions and failure paths. In the app the
parts are in the bundle (`www/brain/`, 14 MB, and the WebAssembly brain (see [current artifact sizes](measurements.md#artifact-sizes))) and come through
the scheme handler; the module is compiled from its bytes, so its `Content-Type` doesn't matter. The page there
is a secure context, so it has the Cache API and `crypto.subtle`: every part's digest is checked.
But the Cache API keeps only `http` and `https` responses, so keeping a `fly://` part fails
quietly and nothing is copied: every launch reads the 14 MB from the bundle, as fast as the
phone's storage gives it, and the bundle is the only copy on the phone. Measured in the
simulator: the `fly-brain` and `fly-brain-module` caches hold nothing after a first launch or a
relaunch (the check asserts it, and that the brain running is the WebAssembly one), and WebKit's storage for the app stays at about 240 KB. (The app's caches folder
grows by about 20 MB, WebKit's own compiled Metal shaders, which make every launch after the first
quicker.) A damaged part is caught by its digest, and the loading screen's **Try again** fetches it
again through the same handler.

### When the game runs, and when the screen may sleep

| | The game | The screen |
| --- | --- | --- |
| Seen, playing | Runs | Sleeps as the phone's Auto-Lock says (touches keep it awake) |
| Seen, the screensaver, on a charger | Runs | Kept on |
| Seen, the screensaver, on battery | Runs | Kept on for 10 minutes after the screensaver begins, then Auto-Lock |
| Seen but not in focus: an iPad window beside another app's, Control Center or Notification Center over it, the app switcher | Runs | As above |
| Low Power Mode | Runs (WebKit holds a page's animation frames to 30 a second then) | As the phone's Auto-Lock says |
| Hot (`serious`) | Runs | As the phone's Auto-Lock says |
| Critically hot (`critical`) | Stopped | As the phone's Auto-Lock says |
| Can't be seen: the home screen, another app over the whole screen, the screen locked | Stopped, then suspended by iOS | (the app has no say) |

**Can't be seen** is the scene in the background (`sceneDidEnterBackground`, until
`sceneWillEnterForeground`), which is where iOS puts an app when nothing of it is on screen. Seen
in the simulator: on an iPad, an app opened over the whole screen moves the fly's window to the
background, while a window beside another app's stays in the foreground, inactive, and the fly
lives on in it. UIKit has no public way to say that a window is covered, and iPadOS doesn't
background a window that only another app's window covers: it stays in the foreground, inactive,
and iPadOS gives it fewer frames (6 to 10 a second, measured), so the fly lives on unseen at that
rate, its brain still at real time, until the window is uncovered or the app leaves the screen.

Stopping takes the web view out of the window and puts a still of its last frame in its place. A
page out of a window is hidden, and the game sleeps as in a hidden browser tab
(`apps/web/src/page.ts`): no frames, so the fly's life and the brain stop with them (the worker is
only ever given time by the frame loop). Shown again it carries on where it was:
the game's step is capped at 100 ms and the brain's at 100 ms of fly time, so nothing jumps, and
after more than half a minute away the sky and the weather are put where the clock has them.
WebKit hides an app's page in the background by itself; the still is for the heat, when the app
is still on screen (hiding the web view, `isHidden`, doesn't hide the page).

The brain workload varies with its input, and rendering adapts between
30 and 60 fps with cheaper eye sampling where needed. Leaving it running
uses power and produces heat; physical-phone battery life has not been
measured here. On a
charger the screensaver is the point; on battery it is a glance. The page's own wake lock
(`navigator.wakeLock`, which a browser tab uses) is refused inside an app's web view, so the
app's policy is the only one.

iOS may end the page's process to reclaim memory, mostly in the background; the app then loads
the game again. Its settings are kept; the fly's moment is not.

### Haptics

While playing (never in the screensaver, where nobody's finger is on the glass): a soft tap with the
fly's own touch sense while the feather is on it (`data-touch` above 0.35 with `data-tool`
`feather`: resting on it 0.4, stroking 1), and a knock when it takes off. Both follow the fly's published
state, so they are what happened to the fly. They are sampled roughly every 200 ms while frames run. Frame scheduling
and the asynchronous host message can add delay, and brief touches may be
missed. Off with the Haptics switch in the app's page of the Settings app,
or with the system's own. The game's Rumble setting controls game pads and
Android vibration; these native iPhone and iPad haptics use the Haptics switch.

## Tables with others

A table ([online.md](online.md)) works in the app as it does in a browser: the game's own
`BrowserSocket`, the page's WebSocket, to the apps' room server, `wss://flies.isaacthoman.com/rooms`
(`apps/web/src/online/invite.ts`). The links it hands on are the site's,
`https://flies.isaacthoman.com/?table=<code>`, never `fly://`.

### The socket: the web view's own

Tried in the simulator (iPhone 18 Pro Max, iOS 27.0), November 2026, from a page at `fly://app/`:

| To | |
| --- | --- |
| `ws://127.0.0.1:<port>/rooms`, `ws://localhost:<port>/rooms` | opened, in about 0.1 s |
| `ws://<the Mac's LAN address>:<port>/rooms`, `ws://<the Mac's name>.local:<port>/rooms` | opened |
| a public `wss://` server | opened, and echoed |
| plain `ws://` to a host named on the internet (two tried, one of them a name for 127.0.0.1) | refused at once (1006) |

The page is a secure context, and WebKit doesn't take its plain `ws://` to an address or a local
name for mixed content. What refuses the named hosts is App Transport Security, whose documented
exceptions are IP addresses, `localhost` and `.local` names: every other host needs TLS. That is
all a room server needs (`wss` in production, an address or a `.local` name for development), so
**the app has no ATS exception, in any build**.

So the app bridges nothing. The socket already lives off the page's thread, in WebKit's networking
process; the game's line to the room is the same code as in every browser, and is tested there
(`apps/web/e2e/tables.e2e.ts`); a native socket would add a hop through a script message handler
and two processes for each of the 20 states a second each way, to do what the web view already
does. (The Apple TV needs its bridge because its runtime has no WebSocket at all.)

### Which room server

The site's, unless told otherwise, for development and checks:

- **`ROOMS_URL` when the app is built** (`ROOMS_URL=ws://192.168.1.20:8787/rooms npm run ios -- build`),
  read by the web build (`appSite`, `scripts/webBuild.ts`). For a build to hand to a phone.
- **`-FlyRooms <url>` when it is launched** (`npm run ios -- --rooms ws://127.0.0.1:8787/rooms`,
  `npm run ios -- run --device <udid> --rooms ws://<the Mac>.local:8787/rooms`, or the scheme's
  arguments in Xcode): the app loads the page with `?rooms=<url>`, which the game takes over
  either (`roomsUrl`). The check uses it.

From the simulator the Mac is `127.0.0.1`; from a phone on the same network it is the Mac's address
or `<name>.local` (`scutil --get LocalHostName`), with `npm run rooms` listening on every address,
as it does.

### Away, and back

iOS suspends an app in the background, so away is the usual state on a phone. As the app goes,
WebKit hides the page and the app takes the web view out of the window (When the game runs, above):
the game says at once that its fly is resting (`Online.away`, the away flag in its state) and stops
with its frames. The room keeps the fly there, resting, for 10 minutes.

Coming back, the line may or may not still be open. In the simulator WebKit's networking process
kept it open through 10 s in the background; on a phone iOS suspends that process too, and the room
drops a line whose pings go unanswered for 15 to 30 s. Either way the game carries on: shown again
it hurries a dropped line (`Online.wake`), says hello with its key and where its fly is, and the
room gives back the same seat and colour. The check drops the line from the room's side while the
app is away, as a phone's would be dropped, and sees it back at the table about 2 s after it is in
front again ([Checking it](#checking-it)).

### Sharing the link

`navigator.share` is there in the web view and opens the system's share sheet (the link, Copy,
Messages and the rest) as in Safari; the game's Share the link calls it from the tap (`share()`,
`apps/web/src/online/invite.ts`). On an iPad WebKit shows the sheet as a popover pointing at the
tap. So the app adds nothing for it. Both seen in the simulators.

### Universal links

A table's link opens the app where it is installed, instead of Safari, when both sides say so:

- **The site** serves `/.well-known/apple-app-site-association`, naming the app by its team and
  bundle ID, `PX72AL9366.com.isaacthoman.flies`: `applinks` for its own page with a `table` of ten
  characters (in the components form, so nothing else on the site opens the app), and
  `webcredentials` for password AutoFill. The web build writes it by default, using the Apple
  apps' team (`scripts/appleConfig.ts`). `APPLE_TEAM_ID` overrides the team; unset or blank uses
  the default. Set `APPLE_TEAM_ID=0` and rebuild to omit the file: links then open in Safari,
  which plays them as well ([deploy.md](deploy.md#the-iphone-and-ipad-apps-links)).
- **The app** has the Associated Domains entitlement (`applinks:flies.isaacthoman.com` and
  `webcredentials:flies.isaacthoman.com`) only when it is built with `IOS_LINKS=1`
  (`apps/ios/links.yml`, merged into `project.yml` as `apps/tvos/weatherkit.yml` is for the Apple
  TV). TestFlight releases turn it on by default; set the repository variable `IOS_LINKS` to `0`
  to turn it off. Local builds and archives still require `IOS_LINKS=1` to opt in (omit it or
  use `IOS_LINKS=0` to leave it out). Associated Domains is already enabled on the owner's App ID;
  another App ID needs the capability before signing a build with links.

The app takes a link (`apps/ios/src/Links.swift`, unit-tested) only if it is https, to
`flies.isaacthoman.com`, its own page, with a `table` that could be a table's code; anything else
is ignored. The game is given the code and nothing more, so a link can't point it at another room
server.

- **Opened by a link** (the scene's connection options): the page is loaded as
  `fly://app/index.html?table=<code>` (with `?rooms=` too, if asked for), and the game sits down
  there as it starts, as a browser opening the link would.
- **A link while it runs** (`scene(_:continue:)`): the app dispatches `INVITE_EVENT` with the link on
  the page, and the game leaves the table it is at, if any, and sits down at that one. A link that
  arrives before the game has started waits until it has.
- **For checks**, `-FlyInvite <link>` at launch goes through the same test as a link that opened
  the app. `-FlyInviteLater <link>` hands the link to the running app through
  `scene(_:continue:)`, as iOS hands over a universal link, when the check posts a Darwin
  notification (`com.isaacthoman.flies.invite-now`) from the UI test's process. XCUITest can't do
  it itself: its `XCUIApplication.open(_:)` with an https link starts the app afresh, with the link
  as a URL to open, which a universal link never is.

### Typing names and passwords

A room's name, its password and a code are typed into fields the game draws (Online, docs/online.md),
with the keys going to one hidden `<input>` (`BrowserTextEntry`, `apps/web/src/ui/text-entry.ts`),
focused as a tap on a field lifts (`Game.#typeOnTap`). Tried in the simulator, in the app's
Online → New room, and with a page of its own for what the game doesn't do:

- **The phone's keyboard comes up** for a field tapped, and what is typed reaches it: the name as
  typed, the password as dots. It must be focused in the tap's own handler, as `#typeOnTap` does:
  focused a frame later, the input has focus but no keyboard comes up, since WebKit shows it only for
  focus that comes from the player's touch. A hardware keyboard types into it either way.
- **Return** (the keyboard's blue key, `enterkeyhint="done"`) and **Done** on WebKit's form bar
  (up, down, Done, over the keyboard) both end the typing and keep what was typed; the keyboard
  goes and the panel lays out again.
- **Passwords**: a password field (`current-password` at a locked room's door, `new-password` for
  a new room) brings the keyboard with AutoFill's Passwords button over it, in the app as in
  Safari. With the site's `webcredentials` and the app's entitlement (Universal links, above),
  AutoFill also suggests the passwords saved for `flies.isaacthoman.com`, offers a strong one for a
  new room and offers to save it; without them it offers only the list of all passwords. Seeing
  that needs a signed build on a device.
- **The keyboard covers the bottom of the screen**: on the iPhone 18 Pro Max 415 of 956 points.
  WebKit leaves the window its size (`innerHeight` stays 956, no window `resize`, nothing
  scrolled) and shrinks only the visual viewport, to 541, as Safari on a phone does. So New room's
  Password and Create were under the keyboard, and the password was typed into a field nobody
  could see. The game now takes what the visual viewport no longer shows of the window's bottom as
  covered (`keyboardInset`, `apps/web/src/display.ts`), as it does the home indicator: while the
  keyboard is up the menus lay themselves out above it, in the app and in Safari alike, and back
  when it goes. The app tells the page nothing for it.
- Nothing in the app stands in the way: the web view is the first responder, and the page's own
  focus decides the rest.

## Building and running

Needs a Mac with Xcode 27 and XcodeGen (`brew install xcodegen`), and the connectome
(`npm run brain:fetch`).

```sh
npm run ios                               # build for the simulator and run it in the booted one
npm run ios -- --sim <udid> --report 2    # ...in that simulator, printing reports every 2 s
npm run ios -- build                      # for an iPhone or iPad
npm run ios -- build --sim [--debug]
npm run ios -- run --device <udid>        # install and launch, printing the console
npm run ios -- --rooms ws://127.0.0.1:8787/rooms   # ...at tables on a room server of your own (npm run rooms)
IOS_LINKS=1 npm run ios -- build          # with universal links and the site's passwords (Associated Domains)
npm run ios:check                         # the simulator check (below)
npm run tvos:art -- --only ios/           # render the icon and launch image again
```

`build` writes the asset catalog from `assets/ios` (`scripts/iosAssets.ts`), builds the web app
with the root Vite config into `apps/ios/www/` (17 MB, the brain's parts included; the same files
`npm run build` makes for a web host), generates
`Flies.xcodeproj` from `apps/ios/project.yml` (with `links.yml` merged in under `IOS_LINKS=1`)
and builds it. Release by default; `--debug` makes the page inspectable in Safari's Web Inspector.

### The app's identity

- **Bundle ID and team**: `IOS_BUNDLE_ID` and `IOS_TEAM_ID`, which default to the Apple TV app's
  (`TVOS_BUNDLE_ID`, `com.isaacthoman.flies`; `TVOS_TEAM_ID`, `PX72AL9366`). One bundle ID
  for both makes them one app in the App Store, bought once for both (universal purchase): App
  Store Connect adds iOS as a platform to the Apple TV app's record.
- **Version**: `apps/version.yml`, included by both XcodeGen specs, so the iPhone, iPad and Apple
  TV apps are numbered together.
- **Display name**: "flies", the game's own, as on the Apple TV and the web.
- **Icon and launch image**: rendered from the game by the art pipeline (`scripts/art.ts`,
  `apps/web/src/art.ts`) into `assets/ios` ([assets/README.md](../assets/README.md)): the web
  app's icon (the fly close up on the napkin) at full size, with a night version for the dark
  appearance; and a square picnic with the fly in the middle, which the launch screen crops to the
  screen's shape.
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
steps cost, frames, taps and keys the page saw, the safe area the page was given, what the
browser's cache holds of the brain, where the menu's first row is, and the app's own memory,
power and thermal state, as `report {json}` on the console and in
`Library/Caches/report.log` (replaced each launch), and as the value of an accessibility element,
`fly-report`, for UI tests. The page's errors and console warnings are passed on as they happen.
`-FlySettings <json>` changes the game's settings through its own code once
it has started, only when `-FlyReport` is also positive. The
report includes the table in the page's address; the canvas's state says how the line is
(`data-online`), the seat, its colour, the reconnects and the others there. `-FlyRooms <url>`,
`-FlyInvite <link>` and `-FlyInviteLater <link>` are in [Tables with others](#tables-with-others);
like the rest, they do nothing unless given.

## Checking it

`npm run ios:check` (`apps/ios/tests/simulator.ios.ts`; `--no-build`, `--device <type>`,
`--runtime iOS-27-0`) builds the app and its tests, creates and boots a fresh iPhone 18 Pro
simulator, runs them, then shuts it down and deletes it:

- unit tests (`tests/unit`): the power policy's table; what the scheme handler serves (the site,
  nothing outside it, JavaScript as JavaScript); when haptics play; which links are a table's, and
  the page and script the game is given for one;
- the UI tests, driving the app as a person would. `apps/ios/tests/ui/AliveTests.swift`: the brain is read
  from the bundle, wakes, and the title shows, with nothing of the brain in the browser's cache;
  frames and simulated time keep advancing; the test reports speed without
  requiring real time; a tap on the title's first row starts
  play; away for 6 s (another app over the whole screen), most of that time passes with the brain
  stopped, and in front again it carries on advancing; a setting changed in one run, the app
  killed, is there in the next, and the relaunch again copies nothing of the brain into the cache.
  `apps/ios/tests/ui/TablesTests.swift`, against a room server the check starts on a port of its own, with a
  fake fly (`scripts/tables.ts`) starting each of two tables: the app, launched by the first
  table's link (`-FlyInvite`, `-FlyRooms`), sits down and sees the fly there; play starts; away for
  10 s, the room has its fly resting, and the check drops its line meanwhile; in front again it is
  back at the table in the same seat and colour, `data-online` joined, the reconnect counted, and
  the room heard it come back to its seat, not take a new one; then the second table's link, handed
  to it while it runs (`-FlyInviteLater`), takes it there in the same run of the app;
- the memory of the app and of WebKit's processes, sampled from the Mac while it runs.

It prints what it measured, saves two screenshots (the title, and play at a table), the test
results and the app's log outside the repo, and prints where. About two minutes after the build. Whether a keyboard reaches the game it reports but
doesn't require: a headless simulator, as the check makes, has no keyboard attached (one shown in
Simulator or T3 Code's device panel does), and XCUITest's own Return and Escape never reach a web
page on iOS (its newline does, as Enter; WebKit's own tests send a hardware Escape to the page).

Measured by it over several runs, 16 November 2026, fresh iPhone 18 Pro simulator, iOS 27.0, M5
Pro shared with other work: the brain awake and the title up 20 to 31 s after the first launch
(WebKit compiling everything for the first time), a relaunch drawing its first screen in about
4 s (2.2 s on a simulator used before); 27 to 59 fps on the title, as busy as the Mac was; the
brain at real time, its steps taking 18 to 40% of what they simulate; the peak footprints 29 to
65 MB for the app, 190 to 335 MB for WebKit's page process, 38 to 47 MB for its GPU process,
9 to 11 MB for its networking process. On the Mac at a load average of 180 on its 18 cores the
check still passed, the brain still at real time, but at 33 fps with 18 ms of JavaScript a frame,
and 56 s to the first title; and a busy Mac makes the web build's adaptive picture (web.md,
Running on what people have) step down to bigger pixels, as a slow phone would.

At a table (four runs, the same day): seated 10.6 to 11.7 s after a cold launch by the link, most
of it the brain loading; resting at the table, as the room saw it, for 12.1 to 13.1 s of the 10 s
away (counting the moments the other app takes to slide in and out); with its line dropped, back at the table in the same seat 1.3 to 2.0 s after the app was in
front again, one reconnect (0.2 s in an earlier run where the line had stayed open); the second
table's link seating it there in 0.7 to 0.8 s.

These are the Mac's speeds: the simulator runs the page's JavaScript on the Mac's cores and draws
with its GPU. They say the app works, not how a phone runs it.

## On a device, and in TestFlight

1. The app ID is the Apple TV app's, `com.isaacthoman.flies`: Xcode's automatic signing registers
   it with the first signed build if it isn't in the
   [developer account](https://developer.apple.com/account) yet. The iPhone and iPad app needs no
   capabilities of its own, unless built with `IOS_LINKS=1` (below). With a different
   `IOS_BUNDLE_ID`, the same goes for that one.
2. For a device: enable Developer Mode on it (Settings, Privacy & Security), connect it, then
   `npm run ios -- build` (Xcode's automatic signing makes the profile; `-allowProvisioningUpdates`
   is passed) and `npm run ios -- run --device <udid>` (`xcrun devicectl list devices` gives the
   UDID). Without `--report` it runs as from the home screen.
3. For TestFlight: releases upload it, with the Apple TV app, when `dev` is merged into `main`
   ([release.md](release.md)), once the one-time setup there is done. By hand,
   `npm run ios -- archive --version <x.y.z> --upload`. Add the iPhone and iPad screenshots
   in App Store Connect.
4. For table links that open the app, and the site's passwords in it (universal links, above), in
   this order:
   1. The default team is `PX72AL9366`, shared by the Apple apps and the site's association.
      For another team, find its ID in [developer account](https://developer.apple.com/account),
      Membership details (ten capital letters and digits), and override the app's team too.
   2. Deploy the site; it publishes the association by default. For another team, set
      `APPLE_TEAM_ID=<that ID>` in `.env` (a build variable in Coolify) and rebuild
      ([deploy.md](deploy.md#the-iphone-and-ipad-apps-links)). Check it:
      `curl -i https://flies.isaacthoman.com/.well-known/apple-app-site-association` answers 200,
      `application/json`, no redirect, naming `PX72AL9366.com.isaacthoman.flies` by default. Apple's CDN
      fetches it from there (`https://app-site-association.cdn-apple.com/a/v1/flies.isaacthoman.com`
      shows what it has), and can take a while to see a change.
   3. In the developer account, Certificates, Identifiers & Profiles → Identifiers →
      `com.isaacthoman.flies`, Associated Domains is already on. For another App ID, turn it on
      and save. (Xcode may say the profile
      must be made again; automatic signing does that on the next build.)
   4. Build with it: `IOS_LINKS=1 npm run ios -- build`, then `npm run ios -- run --device <udid>`.
      TestFlight releases already use `IOS_LINKS=1` (`.github/workflows/testflight.yml`,
      [release.md](release.md)); set the repository variable `IOS_LINKS=0` to disable it.
      Archives by hand need `IOS_LINKS=1` explicitly.
   5. On the phone: send yourself a room's link (Online → New room in a browser, then Share the
      link) in Messages or Notes and tap it: the app opens and sits down in that room. A link typed
      into Safari's address bar opens the page in Safari, by design. A password given to a new room
      in the app is offered for saving under flies.isaacthoman.com, and offered again at its door,
      in Safari and in the app.

## What isn't verified

No iPhone or iPad was connected while this was built. Everything above ran in the simulators
(iPhone 18 Pro and iPad Pro 11-inch (M5), iOS 27.0) only. Only a device can answer:

- **The brain's speed and cost on a phone**: whether it keeps real time on the oldest phones iOS
  26 runs on (A13), and what share of the app's power it is. That decides whether the native
  brain over a message bridge (above) is worth building.
- **Battery and heat**: how long a phone lasts showing the screensaver on battery, how warm it gets
  on a charger overnight, and whether the thermal states arrive and the policy follows them. The
  simulator reports no battery (so on battery throughout) and is never hot. The policy's table is
  unit-tested; its effect is not measured.
- **Low Power Mode**, which the simulator can't turn on.
- **Haptics**, which the simulator can't play.
- **A hardware keyboard's Escape and Return** on a device; their arrows, space and Enter were
  seen to reach the page in a simulator with a keyboard attached.
- **Game controllers** through the Gamepad API, which the simulator can't attach.
- **A covered iPad window**: whether iPadOS on a device throttles it as the simulator does (6 to
  10 frames a second), and what the fly costs there unseen.
- The launch image and icon on a home screen, and Stage Manager's own window sizes beyond the
  windowed iPad layout seen in the simulator.
- **A table across a real suspension**: when a phone's line drops (the check drops it from the
  room's side instead), on Wi-Fi and on a cellular network, and the production room server over
  `wss`, which wasn't running while this was built (a public `wss` server stood in for it).
- **Universal links and AutoFill with the site's passwords**, which need the Team ID, the
  capability and a signed build (On a device, step 4); the simulator check hands the app a link
  the way iOS does, but not from Messages.

<!-- docs-check: generated apps/ios/www/ -->
