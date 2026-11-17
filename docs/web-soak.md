# Browser soak

Run `npm install` and `npm run brain:fetch` first. Install Chromium with `npx playwright install chromium`, or set
`CHROMIUM_PATH` to an existing Playwright Chromium executable. In `--built`
mode, a cached full Chromium is preferred and can bypass that variable;
see `fullChromiumPath()` in `scripts/play.ts`. The harness uses Playwright's
headless Chromium with the GPU enabled and a real brain worker in every page.
There is no simulated or accelerated time.

```
npm run e2e:soak
npm run soak:web -- --cycles 200 --minutes 5 --wallpaper-minutes 100 --csv /tmp/web-soak.csv
npm run soak:web -- --phases climate,eyes --minutes 10 --interval 10
npm run soak:web -- --phases wallpaper --places picnic --wallpaper-time noon --wallpaper-weather clear --wallpaper-minutes 60
```

`e2e:soak` is a quick check separate from `npm run e2e`; the current CI
workflow does not invoke it. It makes four circuits (20 place visits), then
table join/leave churn and five cleanup visits. Matched checkpoints must have textures no greater than the first
warmed measured baseline, geometry at most one above it, and programs at most
two above it. Lower counts pass. Lazy resources such as fireflies motivate
tolerance; these allowances do not establish the cause of every change.
The default full run uses 200 circuits, 30 minutes per interaction phase, and
60 minutes of screensaver **in each place**. The CLI retains `wallpaper` in phase and flag names; the player-facing name
is screensaver. Options:

| Option | Meaning |
| --- | --- |
| `--phases places,climate,tools,menus,eyes,tables,wallpaper` | Select phases; default all, or places/tables with `--quick`. |
| `--cycles 200` | Full five-place circuits in the places phase. |
| `--minutes 30` | Minimum real minutes per other interaction phase. Climate finishes a complete matrix even if this takes longer. |
| `--wallpaper-minutes 60` | Real minutes per place, in one isolated context per selected place. |
| `--places picnic,windowsill,lab,bar,restaurant` | Places to run screensaver in; interaction phases still visit every place. |
| `--wallpaper-time clock` | Clock or a held daylight preset (morning/noon/golden/dusk/night). |
| `--wallpaper-weather now` | Forecast or a held weather preset (clear/overcast/mist/rain). |
| `--interval 10` | Sample interval in seconds. Overruns skip a tick; GCs never queue indefinitely. |
| `--csv /tmp/soak.csv` | Incremental samples; default a unique file in the OS temporary directory. |
| `--built` | Build once into a temporary directory and serve from `/fly/`, including service-worker behavior. |
| `--url http://localhost:5173/` | Use an existing server; otherwise start and stop Vite. |
| `--quick` | Four circuits and strict resource assertions. Keep the places phase when selecting phases. |

Interaction runs in a separate context alongside screensaver. Each screensaver page
is pinned to its place and by default follows the real clock and forecast.
The interaction page waits for `data-moving` to clear between places; climate visits every
weather and all five daylight presets plus the clock, holding each combination
for 12 seconds, waiting for each weather to arrive, recording every combination,
and taking a fresh-place checkpoint after every weather. Tools use every variant
and hold continuous tools; menus visit the menu, about and all three
settings tabs, repeatedly pausing and resuming. Eyes alternate Off/Low/High,
all eye/nervous-system inset and X-ray settings, the full eye picture, and Inside it.
They also cycle every stats kind, corner size, opacity and visibility; canonical
checkpoints keep all three corner pictures on at Medium/Solid. Input and lifecycle behavior
remain covered by the ordinary e2e test and the web-release work.

Tables starts an in-process room server and repeatedly joins a synthetic peer,
drives its held Blow tool through the real wire, and leaves. The browser's brain
still runs in real time. Cleanup checkpoints and the fast check catch resources
retained by remote hands or pooled fly models. The joined model must also remain
attached to the visible scene after place changes. Menus include Online.
The fast check lists the real scene actors before and after an arrival with a
peer present, verifying every retained descendant by identity: the eyes' sky,
fly and X-ray, bubbles, hands, fireflies, footprints and remote models.

The harness warms persistent tool meshes, icon textures, eye pictures, and every
place's pixel-mode shader variants before sampling.
Place changes reset adaptive quality so baseline counts use the same render
target; uninterrupted screensaver retains its normal adaptive behavior.
Checkpoints after place changes
compare a fresh place with the same settings and view. Other phases repeat
those same checkpoints after complete stress rounds when at least a minute has elapsed, and when
they finish; a full climate round alone has 24 minutes of holds, so the
minute is a minimum spacing, not a fixed checkpoint cadence; their in-flight counts are deliberately variable.
Only checkpoints within the same phase/place, and continuous screensaver, get
trend verdicts. At least four samples are required. Disjoint early/late
quarters are averaged and their difference divided by elapsed hours. A small
noise band (2% or 256 KiB for heaps, 10% for frame cost/brain speed) labels a
series flat; raw values and hourly rates remain visible. This is evidence for
the duration tested, not proof of an infinite bound. A growing count needs
investigation; changing camera draw counts or lazy uploads alone are not leaks.

Screensaver samples also verify that game time and completed eye readbacks keep advancing. Adaptive quality, the target FPS cap, pixel mode and eye detail are recorded
to help interpret cost. The FPS field is not measured presentation rate,
and these fields alone cannot rule out a slowdown.

Each fixed-interval sample forces `HeapProfiler.collectGarbage` in the page and
brain worker, then records page `Performance.getMetrics` heap bytes, worker
`Runtime.getHeapUsage`, ArrayBuffer backing storage in both isolates,
`Memory.getDOMCounters` nodes/listeners, localStorage
characters, and the canvas's renderer geometries/textures/programs, calls,
triangles, CPU frame milliseconds and brain speed (simulated/real time).
The worker's live `WebAssembly.Memory` buffers are counted separately: V8's
backing-store metric omits them. Inspector handles are released after each query.
The CSV includes screen/tab/brain engine/weather/time/view/eyes/inset/variant for context.

The browser cannot report per-page GPU allocation bytes or the TV's resident
memory, thermal behavior or actual scanout pacing. Three's resource counts
are not GPU bytes; JS heaps exclude most native allocations. Forced GC and
concurrent pages perturb frame timings. For one browser page, use
`--phases wallpaper --places picnic`; a phase alone still starts a page per
selected place. Use a real device for device performance comparisons.

Room sockets bound both unread traffic and stalled sends. A reader that stops
draining reconnects for a fresh snapshot instead of retaining and replaying old
frames. The one-hour transport regression is synthetic; the browser case also
injects hidden-page state in a two-page room, tests reconnection separately
through a server restart, and checks frame budgets with seven synthetic
peers. It does not combine real OS hiding, seven peers and wake reconnection.

The combined OS hide/wake, seven-peer and reconnection case needs a separate
device exercise; neither soak command below automates it.

`npm run tvos:soak -- --device <udid> --minutes 60` generates a solo TV sweep.
It currently has a [menu-navigation defect](apple-tv.md#unattended-soak) and
can stop waiting for Settings; it is not evidence of a completed sweep. Its generated plan covers every place, weather and daylight preset, pins each
place against rotation, and divides its requested screensaver minutes among all
five places, half midday and half night. Interaction time is additional. Keep
raw CSVs, logs and charts out of git; retain a compact results table in the PR.

## Reproducing a failure

Keep the command, commit, browser version, machine, CSV and console error
outside git. Repeat the same command and compare matching phase/place
checkpoints. Use `--phases` to isolate the failing phase and `--places` for
its screensaver pages; interaction still visits every place. Keep
`--phases places,tables --quick` for strict quick resource assertions.
A count that grows during play but returns at each warmed checkpoint is
not itself evidence of a leak. The check cannot replay the exact same
brain trajectory: the browser runs in real time.

For the TV plan's known navigation limitation, see
[the host soak guide](apple-tv.md#unattended-soak).
