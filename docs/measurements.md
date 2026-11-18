# Measurement provenance

The reference keeps historical measurements rather than replacing them with
estimates. They are observations of the revision and setup used at the time,
not guarantees for today's `dev`. The source documents did not preserve exact
capture dates for every table. For historical rows without a capture date, dates below refer to the retained
source revisions, **not invented measurement dates**. A row marked “captured”
records a fresh measurement date. A missing machine or capture date remains
unknown; remeasure before using those figures as a current performance claim.

| Evidence | Retained source revision and date | Machine or runtime recorded with it |
| --- | --- | --- |
| [Frame cost](rendering.md#the-frame), [flight and vision](simulation.md#flight) | `11f3a15`, 16 November 2026 | Chromium on an M-series Mac for the frame; Node/browser for flight and vision; exact model not recorded |
| [World queries and build cost](places.md#the-world) | `1c8354f`, 16 November 2026 | Desktop Node/Chromium; exact machine not recorded |
| [Browser comparisons](web.md#measured) | `ac957d9`, 16 November 2026 | M5 Pro, shared under load; WebKit 26 and throttling are recorded; the Chromium version was not retained |
| [Native brain speed and memory](../packages/brain-native/README.md#speed-and-memory) | `7d452a3`, 16 November 2026 | Apple M5 Pro, one thread, release C++; TV figures there are estimates |
| [Neuron engine](../packages/brain/README.md#neuron-model), [region cost](../packages/brain/README.md#cost) | `11f3a15`, 16 November 2026 | M5 Pro; workloads are described; scripts supply default seeds, while capture seeds were not recorded |
| [Fly update cost](../packages/fly/README.md) | `d91c8dd`, 16 November 2026 | Node with JIT and V8 interpreter; exact machine not recorded |
| [Food responses](world.md#food), current columns | `56d9f3b` with `scripts/foods.ts`, captured 17 November 2026 | Apple M5 Pro, macOS 27.0.1, Node 26.12.0, shared host; seeds 1–3, hunger 0.7 and 1, 10 s each; historical before columns retained |
| [Phototaxis](simulation.md#a-light-on-the-table) | `56d9f3b` with `scripts/phototaxis.ts`, captured 17 November 2026 (prior captures `7ea05eea`, `f8a9225`) | Apple M5 Pro, macOS 27.0.1, Node 26.12.0, shared host; 96 trials, seeds 1–8 both sides (1–4 at night/30 mm), 3 min each, paired with unlit controls |
| [What would carry phototaxis](simulation.md#what-would-carry-it) | `56d9f3b` with `packages/brain/scripts/routes.ts`, captured 17 November 2026; the experiment branch `exp-l1-sustained-luminance` (`739a44a`, `c3ac446`) with `scripts/phototaxis.ts` and its lamp script, 17 November 2026 | Current routes: Apple M5 Pro, macOS 27.0.1, Node 26.12.0, seeds 1–3, 50 Hz for 5 s; historical experiment on a shared M5 Pro/Node 26.12.0 host at load 11–16 |
| [Brain response and recovery](../packages/brain/README.md#what-it-does-and-doesnt-reproduce) | `56d9f3b`, captured 17 November 2026; `packages/brain/scripts/report.ts` | Apple M5 Pro, macOS 27.0.1, Node 26.12.0, shared host; seeds 1–3, default 16 ms ticks, 106 scalar and 64 visual recovery cases per seed; costs retained historically |
| [Seeing](../packages/brain/README.md#seeing) | `56d9f3b`, captured 17 November 2026; `packages/brain/scripts/vision.ts` | Same machine/runtime; seeds 1–3, the full battery with withdrawals on and off; 24 additional full-precision right-eye grating comparisons |
| [Taste](../packages/brain/README.md#senses), [hunger](../packages/brain/README.md#hunger), [thirst](../packages/brain/README.md#thirst), [courtship](../packages/brain/README.md#courtship) | `56d9f3b`, captured 17 November 2026; the named taste, hunger, thirst and song scripts | Same machine/runtime; default seeds 1–3, extension/drinking seeds 1–20, held-sugar 20 s, resting hunger comparisons 10 min; costs retained historically |
| [Grooming](../packages/brain/README.md#what-it-does-and-doesnt-reproduce) | `56d9f3b`, captured 17 November 2026; `packages/brain/scripts/grooming.ts` | Same machine/runtime; seeds 1–3, 25/50/100 Hz, 2 s region/pair stimulation and 60 s held dust; pose occupancy counted exactly |
| [Regions](../packages/brain/README.md#how-fast-each-fires-and-fullhz) | `56d9f3b`, captured 17 November 2026; `packages/brain/scripts/regions.ts` | Same machine/runtime; seed 1, 63 regions, the script's complete stimulus set; table and derived display scales refreshed |
| [Learning](../packages/brain/README.md#learning), brain-only assays | `56d9f3b`, captured 17 November 2026; `packages/brain/scripts/learning.ts` | Same machine/runtime; survey/conditioning/dishes seeds 1–3, colour comparison seeds 1–5; independent output probe: fresh brain, 10 ms ticks, 30 Hz for 2 s, pooled seeds 1–3 (old probe window unrecorded); whole-animal captures recorded separately below |
| [Leg feedback](../packages/brain/README.md#senses), [wing feedback](../packages/brain/README.md#what-it-does-and-doesnt-reproduce) | `56d9f3b`, captured 17 November 2026; `scripts/legs.ts`, `packages/brain/scripts/wingbeat.ts` | Same machine/runtime; seeds 1–3, 600 s leg-feedback rest, named grooming/flight/withdrawal controls, leg rates 25/50/200 Hz and wing rates 100/150/200/250 Hz; costs retained historically |
| [Antennal pushes](../packages/brain/README.md#what-it-does-and-doesnt-reproduce) | `56d9f3b`, captured 17 November 2026; `scripts/antenna.ts`, `packages/brain/scripts/antenna-routes.ts` | Same machine/runtime; seeds 1–3, 10 min wall/jar runs and named push/no-bump controls; route stimulation 1 s after 2 s settling |
| [Temperature](../packages/brain/README.md#temperature) | `56d9f3b`, captured 17 November 2026; `packages/brain/scripts/thermo.ts`, `scripts/thermotaxis.ts` | Same machine/runtime; steps/rest seeds 1–3, choice seeds 1–9 for 180 s each way, spot seeds 1–6 for 180 s; triple-rate reading tested separately |
| [Finger](playing.md#the-fingertip) | `56d9f3b`, captured 17 November 2026; `scripts/finger.ts`, `packages/brain/scripts/fingertip.ts` | Same machine/runtime; walking-on seeds 1–3 for 5 min, fingertip seeds 1–6 at 0°/70°, skins 0.69/0.43/0.05 and speeds 600/15 mm/s; named finger-loom test passes |
| [Learning](../packages/brain/README.md#learning), whole-animal assay | `56d9f3b`, captured 17 November 2026; scratch copy of `scripts/ethogram/training.ts` used by `scripts/ethogram.ts --assay training` | Same machine/runtime; Life timestamps aligned to `performance.now()` to match the in-process driver, zero stale-command ticks; original mixed-clock captures retained as invalid diagnostics. 36 trials (18 learning/control pairs), seeds 1–3, both pieces trained; dishes blue/yellow with sugar and swoop, tiles blue/red with swoop, 5 min training plus 3 min test. KC/change counts are learning-on readouts; paired preferences exclude trials with no choice |
| [Neuromodulation](../packages/brain/README.md#slow-neuromodulation), diagnostic limitation | `56d9f3b`, captured 17 November 2026; `packages/brain/scripts/modulation.ts` | Same machine/runtime; sleep comparison seed 1 and none/VL/VPM walking seeds 1–3 complete. VUM seeds 1–2 fail when plastic edges overlap the probe's output gain; seed 3 completes at 32.2%. The older VUM triplet remains attributed to `028eacd4` |
| [Sleep and daily rhythm](../packages/brain/README.md#sleep-and-the-daily-rhythm) | `56d9f3b`, captured 17 November 2026; `scripts/sleep.ts` | Same machine/runtime; natural and still-leg controls at hunger 0.7, six-seed siesta/night/deprived-dawn hours, two-seed other hours; Lively five half-hour rows, seeds 1–2; threshold seeds 1–8. Historical parameter-selection sweeps retained |
| [Flight](simulation.md#flight), [checkerboard escape](../packages/brain/README.md#what-it-does-and-doesnt-reproduce) | `56d9f3b`, captured 17 November 2026; scratch instrumented copy of `apps/web/tests/swoop-escape.budget.ts`, `scripts/ethogram.ts --assay escape` | Same machine/runtime; swoop floor/wing-sensor factorial seeds 1–4, 8 throws each, ON/OFF seeds 1–5, hand-wired loom seeds 1–4, 6 throws each; per-flight ranges. Escape scorecard 8 trials per condition, seed bases 20000/30000; historical browser captures retained |
| [Smell](../packages/brain/README.md#smell), inputs, steering and sparse KC responses | `b73e08e4` (resting taste input, rebased onto smell merge `c0deb562`), captured 17 November 2026; `packages/brain/scripts/olfaction.ts --part audit`, `orn-table.ts --check`, `packages/brain/scripts/olfaction-steering.ts` and `packages/brain/scripts/olfaction-kc.ts` | Apple M5 Pro, macOS 27.0.1, Node 26.12.0, shared host; pinned annotation/DoOR checks; steering seeds 41–50, 130 runs, 20 s rest/5 s stimulus; KC seeds 1–3, seven odour conditions each, 2 s rest/2 s stimulus |
| [Smell](../packages/brain/README.md#smell), current README recovery comparisons | `b73e08e4`, captured 17 November 2026; `packages/brain/scripts/olfaction-controls.ts` with its calibration/summary reducer and `packages/brain/scripts/olfaction-noninferiority.ts` | Same machine/runtime; 40 calibration runs (seeds 101–120 in both contexts), 186 evaluation runs (seeds 21–23), 408 amended-assay runs (control plus 25 odour/25 bristle pulses, seeds 141–148); 20 s settling and 67 s recording each; original scripts and decision rules unchanged |
| [Learning](../packages/brain/README.md#learning), with the brain's own smell | `b73e08e4`, captured 17 November 2026; `packages/brain/scripts/learning.ts --part smells --seeds 61,62,63,64,65,66` | Same machine/runtime; ethyl acetate/isoamyl acetate at full strength on both antennae, each as CS+; seven US/pairing conditions, paired learning on/off (168 trials). Scratch copy adds raw-row output only for exact pooled means/ranges; recorded commands are walk, turn, back, escape and feed |
| [Smell](../packages/brain/README.md#smell), resting-smell diagnostics and provenance limitation | `b73e08e4`, captured 17 November 2026; recovered scratch hot.ts and touch.ts, importing this worktree and explicitly selecting `restingSmell` | Same machine/runtime; local/PN rates: seed 1, 3 s settling/5 s recording, 20 ms ticks; generic night-touch comparison: seeds 200–205, 20 s settling/3 s touch 0.6, 20 ms ticks, clockSleep 1/sleepPressure 0.5/depth 0. These diagnostics do not establish the original README examples' exact setup; those examples and the static completeness grouping statistics remain unresolved |

The smell refresh applies to the current brain README. The pre-registered
[olfaction study](olfaction-study.md) and [gate protocol](olfaction-gates-protocol.md)
retain their original commit-bound captures and are not relabelled. Historical
timings are retained.

[Apple TV](apple-tv.md#checking-it-1) and [iOS](ios.md) retain their own dated,
named-device measurements. CPU budget thresholds are separate from historical
wall-time observations: `scripts/cpuBudget.ts` calibrates them in M5 Pro CPU
milliseconds, and tests run the budgets serially.

For another measurement, record the capture date, commit, machine/device,
OS and runtime, workload/seed, sample count and whether other work was running.
Keep raw evidence outside the source branch and link a compact results table.

## Artifact sizes

Measured 16 November 2026 on an Apple M5 Pro, macOS, Node 26.12.0 with
zlib 1.2.12, at source revision `4a7db80` (sleep and grounded/wingbeat merged):

| Artifact | Bytes | Local Node default gzip bytes |
| --- | ---: | ---: |
| Packed connectome | 40,404,208 | 21,081,614 |
| Anatomy sidecar | 1,668,256 | 936,365 |
| Browser WebAssembly module | 290,598 | 114,240 |

The connectome SHA-256 is
`51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c`,
verified by `npm run brain:fetch`. These are local file/compression sizes,
not a fresh measurement of the complete web build or a server's transfer
encoding. The retained 268 KB / 106 KB module measurements predate the sleep
module; download and compilation timings beside them remain historical.

A read-only instantiation during the native-source audit on the same machine
and Node runtime allocated 99,680,256 bytes (95.0625 MiB) of WebAssembly linear
memory after creating the real brain. This is the module's memory capacity,
not total worker or browser resident memory.
