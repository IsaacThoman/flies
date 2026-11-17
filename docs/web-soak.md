# Browser soak

Run `npm install` and `npm run brain:fetch` first. The harness needs an installed Playwright Chromium (install with
`npx playwright install chromium` if absent). It launches headless Chromium
with GPU flags and a real brain worker in every page; check the logged renderer
to confirm hardware acceleration.
There is no simulated or accelerated time.

```
npm run e2e:soak
npm run soak:web -- --cycles 200 --minutes 5 --wallpaper-minutes 100 --csv /tmp/web-soak.csv
npm run soak:web -- --phases climate,eyes --minutes 10 --interval 10
npm run soak:web -- --phases wallpaper --places picnic --wallpaper-time noon --wallpaper-weather clear --wallpaper-minutes 60
```

`e2e:soak` is a separate quick check; CI does not run it. Its historical
runtime estimate is roughly two minutes; the capture date and machine are unknown.
By default it makes four circuits (20 measured place visits), then table
join/leave churn and a final five-place cleanup sweep, in addition to warmup
and arrival checks. Slow rounds can trigger additional cleanup sweeps.
Textures must not exceed each place's first measured checkpoint after warmup;
geometries may exceed it by at most one and programs by at most two.
Lower counts are accepted.
The default full run uses 200 circuits, 30 minutes per interaction phase, and
60 minutes of screensaver **in each place**. Options:

| Option | Meaning |
| --- | --- |
| `--phases places,climate,tools,menus,eyes,tables,wallpaper` | Select phases; default all, or places/tables with `--quick`. |
| `--cycles 200` | Full five-place circuits in the places phase. |
| `--minutes 30` | Minimum real minutes per other interaction phase (0.25 with `--quick`). Climate finishes a complete matrix even if this takes longer. |
| `--wallpaper-minutes 60` | Real minutes per place, in one isolated context per selected place. |
| `--places picnic,windowsill,lab,greenhouse,restaurant` | Places to run screensaver in; interaction phases still visit every place. |
| `--wallpaper-time clock` | Clock or a held daylight preset (morning/noon/golden/dusk/night). |
| `--wallpaper-weather now` | Forecast or a held weather preset (clear/overcast/mist/rain). |
| `--interval 10` | Sample interval in seconds (5 with `--quick`). Overruns skip a tick; GCs never queue indefinitely. |
| `--csv /tmp/soak.csv` | Incremental samples; default a unique file in the OS temporary directory. |
| `--built` | Build once into a temporary directory and serve from `/fly/`, including service-worker behavior. |
| `--url http://localhost:5173/` | Use an existing server; otherwise start and stop Vite. |
| `--quick` | Four circuits and strict resource assertions. Keep the places phase when selecting phases. |

When selected, interaction runs in a separate context alongside screensaver
(one per selected place; six contexts in the default full run). Each screensaver page
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
still uses the ordinary clock; the run does not require brain speed to equal one. Cleanup checkpoints and the fast check catch resources
retained by remote hands or pooled fly models. The joined model must also remain
attached to the visible scene after place changes. Menus include Online.
The fast check lists the real scene actors before and after an arrival with a
peer present, verifying every retained descendant by identity: the eyes' sky,
fly and X-ray, bubbles, hands, fireflies, footprints and remote models.

The harness warms persistent tool meshes, icon textures, eye pictures, and every
place's pixel-mode shader variants before sampling.
The harness resets adaptive quality before moving between places so baseline counts use the same render
target; uninterrupted screensaver retains its normal adaptive behavior.
Checkpoints after place changes
use the same settings and view; moving to the current place is a no-op,
while climate explicitly leaves and returns for a fresh place. Other phases repeat
those same checkpoints after a complete stress round once at least a minute
has elapsed since the last sweep, and when the phase finishes; their in-flight
counts are deliberately variable.
Only checkpoints within the same phase/place, and continuous screensaver, get
trend verdicts. At least four samples are required. Disjoint early/late
quarters are averaged and their difference divided by elapsed hours. A small
noise band (2% or 256 KiB for heaps, 10% for frame cost/brain speed) labels a
series flat; raw values and hourly rates remain visible. This is evidence for
the duration tested, not proof of an infinite bound. A growing count needs
investigation; changing camera draw counts or lazy uploads alone are not leaks.

Screensaver samples at least two seconds apart check that game time advances;
with brain eyes active they also check completed eye readbacks. Adaptive quality,
target FPS cap, pixel mode and eye detail are recorded to help interpret changes.
The cap is not a measured presentation rate, and these checks cannot rule out a slowdown.

Each fixed-interval sample forces `HeapProfiler.collectGarbage` in the page and
brain worker, then records page `Performance.getMetrics` heap bytes, worker
`Runtime.getHeapUsage`, backing-storage metrics in both isolates,
`Memory.getDOMCounters` nodes/listeners, localStorage
UTF-16 code units, and the canvas's renderer geometries/textures/programs, calls,
triangles, CPU frame milliseconds and brain speed (simulated/real time).
The worker's `WebAssembly.Memory` buffers found through the inspector are
counted separately, without assuming they are included in backing storage. Inspector handles are released after each query.
The CSV includes screen/tab/brain engine/weather/time/view/eyes/inset/variant for context.

This harness does not report per-page GPU allocation bytes or the TV's resident
memory, thermal behavior or actual scanout pacing. Three's resource counts
are not GPU bytes; JS heaps are not total native memory. Forced GC and
concurrent pages perturb frame timings, so use `--phases wallpaper --places picnic` to isolate one browser page, or
measure on the real device for device performance evidence.

Room sockets bound both unread traffic and stalled sends. A reader that stops
draining reconnects for a fresh snapshot instead of retaining and replaying old
frames. The one-hour transport regression is synthetic; the browser tests separately
inject hidden/visible state into one of two pages, check reconnection after a
server restart, and check frame budgets with seven synthetic peers. They do not
combine OS-level tab hiding, seven peers and reconnection on wake.

`npm run tvos:soak -- --device <udid> --minutes 60` targets a paired Apple TV
from the controlling computer. Its solo plan visits every place, weather and
daylight preset, pins each place against rotation, and divides the requested
screensaver minutes among all five places, half midday and half night.
Interaction time is additional. This describes the generated plan, not a
completed run or hidden-tab coverage; check its waits and completion log before
claiming device coverage. Keep
raw CSVs, logs and charts out of git; retain a compact results table in the PR.

Recheck defaults and assertions in [the browser harness](../scripts/webSoak.ts),
place counts in [the catalog](../apps/web/src/places/catalog.ts), automation in
[CI](../.github/workflows/ci.yml), and visibility and peer-load coverage in
[the table tests](../apps/web/e2e/tables.e2e.ts). The
[TV harness](../scripts/tvosSoak.ts) defines the device plan.
