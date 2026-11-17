# Web performance experiment

`CHROMIUM_PATH` must point to an existing Chromium in the Playwright cache.
No browser download is needed. Raw reports and renders belong outside git.

```
CHROMIUM_PATH=... node scripts/webPerf.ts --build --out /tmp/fly-perf-A
```

Each build and measurement acquires an atomic `/tmp/flies-heavy/slot-1` through
`slot-8`, writing the branch into `owner` and removing the slot when complete.
Batches end before ten minutes; the branch waits two minutes between batches.
No slot is held during reviews.
`--phases loads,frames,memory,brain` selects work; `--dir` reuses a built site.
Loads and frame scenarios run three times by default (`--runs`, minimum 3).
The memory lane runs once, for 600 active seconds in two five-minute batches,
with frames held during the two-minute cooldown, plus ten place changes.
Both active and total wall time are recorded.
It is a duration check, not a bound on future memory growth.

The desktop is 1280×720. The phone is 390×844 with touch, 4× page CPU
throttling and 1.6 Mbit/s, 150 ms network latency. Chromium does not apply
that CPU throttle to the worker; it is not a real phone measurement.
Each cold visit has a fresh browser context and its paired warm visit uses
the completed page/brain caches. The static server sends uncompressed files,
so transfer numbers describe that host; `bundle.json` also gives gzip sizes.
CDP encoded bytes through title include page requests and cache hits as CDP
reports them. The server also counts completed response body bytes, including
service-worker installation traffic in its own target; those counts exclude
HTTP headers and bytes of incomplete responses.

First frame is completion of the first game frame; title is the first frame
with the brain running and the title visible. These include game setup,
download, worker startup and the deliberate Awake transition. Timing starts
at navigation, using the page's performance clock. `modules.json` reports
rendered module bytes before final chunk minification; they are not additive
gzip contributions. `bundle.json` reports actual emitted sizes.

Frames are recorded individually by wrapping the game's frame function.
This adds equal instrumentation overhead to both versions. Reports include
CPU submission cost, inter-frame gaps (including >50 ms), CDP task duration
per rendered frame, canvas stats, quality levels, calls and triangles. All
places are visited in play (a swoop every two game seconds) and screensaver;
order reverses each repetition. Adaptation remains active and is recorded,
so a cheaper picture must never be counted as a speed win.

Memory checkpoints briefly hold frames while forcing GC in the page and brain worker, and record their
heaps, backing stores and the worker's Wasm separately, plus renderer object
counts. These exclude GPU/native allocations and perturb frames; compare
frame scenarios separately. Brain step costs use the deterministic seed,
senses, warmup, lap calibration and CPU timer from `cost.budget.ts`.

Review rubric (0–10 each):

- Benchmark soundness: 10 means reproducible paired measurements, variance,
  quality and cache controls, and sensitivity to regressions.
- Measured wins: 10 means substantial repeatable reductions in a player
  facing cost, beyond measurement variance.
- Unchanged output: 10 means matching screenshots, behavior, and brain
  fingerprints, with no quality reduction.
- Simplicity/safety: 10 means small comprehensible changes with tested failure
  paths and unchanged supported environments.

`node scripts/webPerfFixtures.ts /absolute/built/site /tmp/fly-fixtures`
uses the same Playwright driver helpers to capture static render fixtures.
The civil clock and page randomness are fixed, automatic frames and life
updates are held, and fixed frame steps draw the real scenes. These compare
rendering only; the real brain and behavioral tests remain separate evidence.
`node scripts/workerCost.ts --baseline <revision> --out /tmp/worker-cost.json`
isolates sending senses with synchronous structured cloning, alternating
versions over nine CPU-time repetitions after two warmups. It is a Node
microbenchmark, not a substitute for measured browser frames.

Independent reviewers assign absolute scores to each neutral evidence set
and rank them. The experiment log records keys, scores and rejected attempts.
