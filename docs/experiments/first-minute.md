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

The owner initially required drafts only. Their later process update authorizes marking PR #75 ready after integrating dev and local checks; the maintainer merges it. Further validated rounds use a new branch and PR. No audio, surrogate brain, camera
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
or draw calls are scheduled. Round 1 retained the pre-existing HUD pulse at 10 Hz; the next candidate tests state-driven redraws.

The Wide-view framing problem reported by the baseline player is left outside
this experiment: `apps/web/src/camera.ts` is explicitly excluded.

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

## Round 1

Frozen key: R6 = candidate 245cbd6 (N5 collection alias), M4 = baseline,
K7 = duplicate baseline. Report headers retaining the collection alias caused
provenance uncertainty; future review copies must normalize all neutral aliases.
Presentation orders: A K7/M4/R6; B R6/M4/K7; C R6/M4/K7;
regression-only K7/M4/R6. Each reviewer was fresh and independent. No reviewer
scored the identical baseline aliases differently, so extra noise reviewers were
not triggered. New subagents now use high effort per the owner's updated rule.

| Set | A | B | C | Mean | Ranking |
|---|---|---|---|---|---|
| R6 | 9,7,5,8,8,6,7 | 9,7,5,8,8,7,7 | 9,7,5,8,8,6,8 | 7.24 | First, all three |
| M4 / K7 | 2,3,5,5,3,4,5 | 2,3,5,4,4,4,4 | 1,3,6,5,3,4,4 | 3.76 | Equal; alias order arbitrary |

Accepted: first animated artwork at 0.195–0.197 seconds on 4G and
0.485–0.515 seconds on slow 3G; truthful bytes/build status; persistent lessons.
World arrival remains about 2.5 / 34.9 seconds, title about 17.4 / 330.2 seconds.
The naive candidate player did hold Blow and Tickle, but never tested Weather
and only selected View at input 20: discovery did not improve in reviewers' scores.

Regressions and gaps: the shelf-navigation glyph clips below the viewport;
"remote" validation actually used keyboard glyphs; Explore hides byte progress;
menu instruction still repeats; completed redraw/allocation cost lacks measurements.
These are the next targets. Requiring a particular fly reaction before retiring a
lesson is rejected: the player learns successful tool operation, and the brain
must remain free to respond or not. Physical-TV validation is excluded by the
house rules; host-event emulation must be labeled accurately instead.

Round 2 proposal: keep measured progress visible while exploring; silence menu
teaching prose; move the clipped shelf cue inside the frame; make entry to Explore
require Select instead of any remote contact; suppress the picture-only eye inset
until the brain arrives. The startup canvas now shows a retry control when the
application script fails. A real aborted-entry/reload check passes.

The native-input check now boots the native-host path in Chromium and sends
its actual DOM button/touch contract, with remote glyphs and `device=remote`.
It still runs the real worker brain and is explicitly not a physical TV test.
All eight lessons plus hand movement persist after relaunch in that harness.

Completed-player runtime samples (8.016 game seconds, 481 frames each): the
round-1 build allocated 481 distinct HUD callbacks and redrew 74 times with no
activity changes; the proposal reused one callback and redrew twice for two
activity changes. Whole-frame averages were 0.801 and 0.803 ms respectively,
which does not establish a CPU speed difference. The intended proof is removal
of callback allocation and periodic teaching uploads, not Apple TV timing.
Shared dash/palette arrays also remove new explicit per-drawing array allocation.

## Round 2

Frozen key: C8 = accepted round-1 build 245cbd6; D3 = a2af514. Presentation
orders: A C8/D3; B D3/C8; C D3/C8; regression-only D3/C8. All reviewers were
fresh, independent and high effort. All three preferred D3.

| Set | A | B | C | Mean | Ranking |
|---|---|---|---|---|---|
| D3 | 9,7,5,9,9,8,8 | 9,7,5,9,8,7,8 | 9,7,5,9,8,7,8 | 7.67 | First, all three |
| C8 | 9,6,5,8,8,6,2 | 9,5,5,7,8,6,2 | 9,5,5,7,8,5,2 | 6.05 | Second, all three |

Accepted: runtime retirement, measured progress during Explore, startup retry,
native-host event/glyph coverage and the unclipped tool-selection cue. Main
regression concern: glyph-only menu legends are less explicit; the text-free
constraint makes this a tradeoff. The naive player still omitted Blow, while
using several world controls. No population-level discovery improvement is claimed.
Next targets: first-entry menu hiding and moving selector-arrow positions, both
responsible for observed wasted inputs. The long indeterminate module-download
phase remains a limitation; its timing is kept distinct from brain download.

Round 3 proposal: keep the first arrival's menu visible until Play/Watch, save
that arrival experience, retire its menu legend, and keep selector-arrow hit
positions stable across every kind and the Place Go control appearing. New HUD
keys preserve redraws for actual place, availability, weather-source, surface and
brain-status changes. A two-second test with a one-second idle threshold confirms
first-visit controls stay visible; after entry the normal wallpaper resumes.
The browser checks pass every input mode and confirm Go clears after arrival.
A completed-player probe reuses one callback and redraws eleven times for eleven
activity changes across 481 frames; no periodic shimmer or upload is added.


## Round 3

Frozen key: P7 = accepted a2af514; J2 = 7d5d8590; T5 = duplicate J2.
Presentation orders: A T5/P7/J2; B P7/J2/T5; C J2/T5/P7;
regression-only J2/T5/P7. Fresh high-effort reviewers all prefer J2/T5;
identical aliases receive identical scores, so no extra noise reviewers trigger.

| Set | A | B | C | Mean | Ranking |
|---|---|---|---|---|---|
| J2 / T5 | 9,7,5,9,9,7,8 | 9,6,5,9,9,8,8 | 9,7,5,9,9,7,8 | 7.71 | First, all three |
| P7 | 9,7,5,9,7,6,8 | 9,6,5,9,7,7,8 | 9,7,5,9,7,6,8 | 7.29 | Second, all three |

Accepted: stable selector targets, first-visit control retention, arrival/menu
lesson retirement and explicit HUD invalidation. The regression reviewer notes
that a retained title obstructs more of the initial view and retirement on entry
does not establish mastery of every menu command. This is the first-visit-only
tradeoff; returning players retain the normal screensaver behavior. Discovery
still scores 5: the naive run left Light and Weather untested and View unchanged.

## Integration for PR #75

Per the owner's process update, origin/dev is merged rather than rebased. Its
sleep rhythm, whole-place screensaver/camera, lifecycle resets, menu-target
identity, food clearing, room fixes, production guards and e2e fixes are retained.
The wordless HUD suppresses the sugar-drop diagram for Clear dropped, matching
the new dev variant. Type checking, lint and 119 relevant area tests pass.
Recorded blind evidence predates this integration; integrated browser validation
is recorded separately, without claiming a fresh usability score for dev changes.
The maintainer reviews and merges; this agent does not wait on GitHub CI.

The integrated browser harness timed out once for touch and once for remote
feather holds. Contact depends on the autonomous fly’s position and grounding;
a fixed screen hold is not a deterministic gesture setup.
The gesture checks now run while the real connectome is held at the network
boundary, followed by the real brain handoff and relaunch checks. This exercises
the supported early-exploration path without requiring a biological reaction
or changing gameplay. Earlier complete modality runs also passed.


## Approved integration with current dev

The merge includes several local flies, the orbit camera, default-room auto-join
and acknowledgements. Camera and default-room policy files are retained from dev.
The multi-fly eyes scheduler retains the eye-map handoff guard for every fly.
The HUD reads the primary brain from the new brain pool.

Type checking, lint and 172 area tests pass. The integrated browser check holds
the real connectome at the network boundary and observes zero room connections
on the loading screen and after entering Explore. Releasing the brain results
in one successful automatic Everyone join. Bootstrap recovery and tool learning
and persistence pass for mouse, touch and native-host input emulation.
