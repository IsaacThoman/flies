Score each criterion 0–10 (10 described below), absolute scores for each evidence set, forced ranking with reasons, three worst problems, and one suggested experiment. Treat missing evidence as uncertainty, not success. Inspect the actual images and code.

| Criterion | 10 looks like |
|---|---|
| Time to something alive | Visible motion begins almost immediately on cold 4G and slow 3G, with no blank or frozen interval. |
| Quality of the wait | Calm, attractive motion, truthful measurable progress through download and initialization; failures remain understandable and recoverable. |
| Unaided tool discovery | A fresh player discovers the eight tools and their actions within 20 inputs, without being instructed. |
| Absence of text | Tools teach through animated demonstrations and control affordances; no captions or tutorial prose. Essential labels and truthful status only. |
| Nothing nags an experienced player | Successful use retires each hint persistently for mouse, touch and remote; disabling hints silences all teaching. |
| Remote, mouse and touch | Equivalent discoverability, legible safe layouts and usable controls for each modality. |
| No added per-frame cost afterward | Completed onboarding has no animation, allocation, draw calls or extra redraws; TV-safe during onboarding. |

## Protocol and baseline

Draft PR only; never merge this experiment. No audio, surrogate brain, camera
changes or Online room-policy changes. Evidence images live only on the orphan
`pr-assets-first-minute` branch. The screenshot driver uses `scripts/play.ts`
and production builds; heavy work acquires one `/tmp/flies-heavy/slot-N`.

Criterion order below is: alive, wait, discovery, text, returning player,
input devices, completed cost. Scores are independent reviews, never author scores.

| Round | Evidence key | Reviewer A | Reviewer B | Reviewer C | Mean | Ranking |
|---|---|---|---|---|---|---|
| 0 | M4 = baseline | 2,4,6,5,4,5,4 | 2,4,6,5,4,4,3 | 1,4,6,5,4,4,4 | 4.10 | Singleton |

Baseline findings: slow-3G startup is blank for about 35 seconds; loading
invents a neuron count from download bytes and a build percentage from time;
mouse/touch do not learn held gestures; light/weather/view never complete;
pointer Go and tool selection omit learning; turning hints back on erases history.
The naive mouse player selected all eight tools by input 16 but never discovered
sustained Blow. Its 20 inputs spanned 153 seconds, so this is an input-budget
study, not evidence of eight discoveries within the first wall-clock minute.

Measurement correction: baseline review began while slow-3G runs were still
finishing. The original 4G screenshot helper waited for fonts, delaying images
past their requested timestamps. Recapture bypassed that wait; raw CDP phone
screenshots were clipped and are unsuitable for layout judgment. This is a
protocol defect, not a positive result. Subsequent comparisons must use frozen,
complete sets with actual capture timestamps and full viewport screenshots.

## What is real during early exploration

Explore opens the existing world and tools while the real connectome arrives.
The HUD says “Waiting for its brain”; no smaller brain, scripted decisions or
surrogate neural activity is substituted. Tools may change the environment,
and physical forces still act on the body. The actual brain takes over when
its worker reports ready. Download progress is received bytes / total bytes;
initialization has an indeterminate moving bead because it reports only completion.

The translucent gesture diagrams are illustrations of player input and tool
motion, never a depiction of a neural response. They do not call tool actions,
change the world, send senses or move the fly. HTML startup bubbles are also
abstract loading artwork. Its temporary 2D canvas is replaced before WebGL
starts and its animation stops when detached. The native TV skips this prelude.

## Reproducing evidence

Build, serve, then run `node scripts/first-minute.ts --url <local-url> --out
<scratch-directory>` under a heavy slot with `CHROMIUM_PATH` set. Fresh browser
contexts block service workers and disable HTTP cache. 4G is 9 Mbps down,
0.9 Mbps up, 170 ms latency; slow 3G is 400 kbps each way, 400 ms latency.
The local static server serves uncompressed JavaScript. Phone is Chromium's
iPhone 15 descriptor without CPU throttling, not a physical phone or TV.

The driver photographs navigation +0.5, 2, 5, 10, 20, 40 and 60 seconds,
records actual capture times, and waits for the title. A separate gated-download
e2e checks early exploration and completion/relaunch for mouse, touch and remote.
Wordless diagrams draw on the existing HUD quad, only for an incomplete lesson.
Completed lessons omit the diagram and its projection; no extra overlay uploads
or draw calls are scheduled. The pre-existing HUD pulse still refreshes at 10 Hz.

The Wide-view framing problem reported by the baseline player is left outside
this experiment: `camera.ts` is explicitly excluded.

Candidate validation caught an early-access boundary defect: the existing
picture-only stand-in eyes had 889 left facets, while the arriving brain had
880. Sending that last picture failed the worker. The handoff now uses only a
completed picture belonging to the actual eye map. A regression test exercises
that transition, and the gated-download e2e passes all eight tools, persisted
completion, and relaunch for mouse, touch and remote. No visual ON-pathway
processing was changed. The preliminary P8 build is retained as rejected probe
evidence; it is not the source used for comparative review.

Resource protocol was expanded to eight slots during the run, with branch-name
owner files, a ten-minute hold limit and a two-minute cooldown. One 1.08-second
build ran when a failed shell assertion did not stop the next command. Heavy
launch guards now use a single process that executes work only after successful
slot acquisition. This is recorded as a protocol error, not omitted from the log.
