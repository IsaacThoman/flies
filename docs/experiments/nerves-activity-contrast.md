Score each criterion 0–10 for each evidence set. A 10 means:
- Beauty: coherent, luminous anatomy, convincing depth, restrained palette, excellent composition in X-ray and corner panel.
- Activity recognition: distinguish rest, walking, grooming, feeding, swoop escape and flight from unlabelled activity-only clips. Assign each clip one behaviour and state confidence. Score by demonstrated recognisability, without using the body pose or captions.
- Anatomical truth: light is driven exclusively by measured simulation activity at defensible dataset-derived anatomical locations. Honest smoothing, subsampling and stand-ins documented; simulation spikes unchanged.
- Legibility: anatomy and active pathways remain readable at 640×480 TV resolution and on portrait/landscape phones, at TV distance.
- Cost: ≤2 additional draws, no per-frame allocations, unchanged brain step budgets, cheap worker traffic and JavaScript on a no-JIT TV.
- Absence of text: activity communicates without captions; no unnecessary words or numbers.

Give absolute per-criterion scores for each set, then a forced ranking with reasons. Report the three worst problems and one idea to try. Judge supplied rendered evidence and measured numbers, inspecting code paths for truth/cost. Missing evidence must reduce confidence; do not invent measurements.


Round 7 compares two tissue-coverage changes against dev: reduced neuropil
coverage, or reduced tract/nerve/organ coverage. Positions, firing rates,
envelopes, hue and emitted light are unchanged. Blind scores and outcomes follow.

## Blind round 7: rejected coverage trials

D4 is dev's existing tissue; W9 lowers neuropil coverage 0.70 to 0.45; Z3
lowers tract/nerve/organ coverage 0.75/0.85/0.75 to 0.55/0.60/0.60. All
positions, rates, envelopes, hue, emitted light, geometry and JavaScript match.
Three fresh high-effort scorers saw Z3/D4/W9, D4/Z3/W9, Z3/W9/D4 respectively,
without chronology, rationale, previous scores or keys.

| Reviewer | Set | Beauty | Recognition | Truth | Legibility | Cost | Text | Mean | Rank |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| R1 | D4 | 7.5 | 5 | 8 | 6 | 8 | 8 | 7.08 | 1 |
| R1 | W9 | 7 | 5 | 8 | 5.8 | 8 | 8 | 6.97 | 3 |
| R1 | Z3 | 7.5 | 5 | 8 | 5.5 | 8 | 8 | 7.00 | 2 |
| R2 | D4 | 7.3 | 5 | 8 | 6.2 | 7 | 8 | 6.92 | 2 |
| R2 | W9 | 7.5 | 5 | 8 | 6.3 | 7 | 8 | 6.97 | 1 |
| R2 | Z3 | 7.1 | 5 | 8 | 6 | 7 | 8 | 6.85 | 3 |
| R3 | D4 | 7.5 | 3.5 | 8 | 6 | 8 | 8.5 | 6.92 | 1 |
| R3 | W9 | 7 | 3.5 | 8 | 6.3 | 8 | 8.5 | 6.88 | 2 |
| R3 | Z3 | 7.3 | 3.5 | 8 | 5.7 | 8 | 8.5 | 6.83 | 3 |
| Mean | D4 | 7.43 | 4.50 | 8.00 | 6.07 | 7.67 | 8.17 | 6.97 | 1 |
| Mean | W9 | 7.17 | 4.50 | 8.00 | 6.13 | 7.67 | 8.17 | 6.94 | 2 |
| Mean | Z3 | 7.30 | 4.50 | 8.00 | 5.73 | 7.67 | 8.17 | 6.89 | 3 |

Reject both trials and retain D4. Its mean is higher and two scorers rank it
first; the differences are small. W9 improves some separation but sacrifices
anatomical volume and depth. Z3 makes already faint routes harder to follow.
The separate fresh losses audit preferred W9; that disagreement is retained,
not counted as a fourth scorer. Each set matched 12 of 18 locked TV assignments;
no recognition gain. Reviewers inspected decoded temporal samples, not live
TV-distance viewing. This is one round without improvement.

Evidence reuses actual round-5 rates, initial glow and frame times with body
anatomy held at rest. Durations and nominal-native/slowed GIF conventions
are as round 6. Shared live references are older layout examples. Both views
use the same geometry and four diagnostic draw calls. CPU probes D4/W9/Z3:
15.671/13.099/13.046 microseconds per frame; identical JS paths mean these noisy
runs establish no speed ranking. Only boxed numbers were sampled. State JSON
3,869–4,080 bytes is a proxy; no worker fields or readouts are added. The common
brain source matches the M5 reference whose fingerprints and budgets passed.

Key (TV or portrait P, suffixes11–22):

D4: 11=P walk, 12=P flight, 13=TV rest, 14=TV swoop, 15=TV feed, 16=P rest, 17=P groom, 18=P feed, 19=TV groom, 20=TV flight, 21=TV walk, 22=P swoop

W9: 11=P flight, 12=P walk, 13=P feed, 14=TV swoop, 15=TV flight, 16=P swoop, 17=TV walk, 18=TV feed, 19=P groom, 20=TV rest, 21=TV groom, 22=P rest

Z3: 11=TV walk, 12=P walk, 13=P rest, 14=TV swoop, 15=P swoop, 16=P groom, 17=TV feed, 18=P feed, 19=TV rest, 20=P flight, 21=TV groom, 22=TV flight

Round 7 retains no view change; the normalization comparison below uses
the retained baseline, with these rejected trials kept in the log.


## Blind round 8: command-group display references

The retained tissue is tested against two measured-rate normalizations.
Neutral S4 retains the decoder scales; E8 uses measured display references;
C2 uses the smaller of the decoder scale and measured reference. Only soma
brightness normalization differs, using the same 64 locations and source
mean rates. Regional rates, display envelopes, geometry, worker fields,
command decoding and simulation source remain unchanged.

| Readout | S4 | Measured reference E8 | C2 |
|---|---:|---:|---:|
| DNg100 | 40 | 56 | 40 |
| DNa02 left | 40 | 43 | 40 |
| DNa02 right | 40 | 43 | 40 |
| MDN | 40 | 45 | 40 |
| DNp01 | 200 | 350 | 200 |
| flight | 120 | 160 | 120 |
| DNg12 | 60 | 44 | 44 |
| MN9 | 40 | 50 | 40 |
| pIP10 | 40 | 11 | 11 |

Offline calibration follows the region reference methodology over three seeds:
60 seconds of rest after two settling seconds, each full scalar sense, all
senses together, a looming pulse and the vision battery. It uses each
readout's existing source smoothing; references are the larger of measured
peak, four times the largest resting mean and 5 Hz, rounded upward to two
significant figures. Steering sides share the larger reference. They are
observed display references, not biological maximum rates. The connectome
SHA-256 is `51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c`;
brain source tree is `8cf5b08406f473161ee34266096a08186a60b8d3`.

Fresh actual activity was captured on db934001 with the current upstream
brain. The walking observation is reverse locomotion under the feather;
bounded attempts did not obtain forward walking. Rest, grooming, feeding,
escape, flight and reverse locomotion contain 60/42/60/60/60/55 consecutive
frames, spanning 0.983/0.683/0.983/0.983/1.000/0.900 game seconds. Escape includes
takeoff; the separate flight sample is airborne. Body and wing joint states
are replayed as recorded; the panel retains its standard anatomy. Fixed
cameras and light are identical within each screen shape. The private
snapshot imports are bound to their own workspace source copies to avoid
symlink leakage between display references.

Each envelope starts with at least 3.216 game seconds of actual captured
prehistory; dependence on an unknown saturated initial glow is bounded by
exp(-3.216/0.4), below 0.00033. Regional envelopes are seeded from recorded
state. Native GIFs are nominal 60 fps (subject to GIF time quantization);
7 fps copies permit temporal inspection. Native TV 640×480 pixels are
exported at their displayed 16:9 aspect. Phone diagnostic framing is held
fixed across versions. Shared live TV, portrait and landscape screenshots
show the current integration, not paired normalization comparisons.

Review orders: C2/E8/S4, E8/S4/C2, E8/C2/S4. Reviewers receive only the rubric,
unlabelled evidence and source paths; classifications are locked before
full-body/source inspection. A separate fresh losses audit is not part of
the scorer mean.


| Reviewer | Set | Beauty | Recognition | Truth | Legibility | Cost | Text | Mean | Rank |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| R1 | S4 | 7 | 3 | 8.5 | 5.5 | 9 | 8 | 6.83 | 3 |
| R1 | E8 | 7 | 3 | 9 | 5.5 | 9 | 8 | 6.92 | 1 |
| R1 | C2 | 7 | 3 | 8.8 | 5.5 | 9 | 8 | 6.88 | 2 |
| R2 | S4 | 7 | 4 | 8.5 | 6 | 9 | 8 | 7.08 | 3 |
| R2 | E8 | 7 | 4 | 9 | 6 | 9 | 8 | 7.17 | 1 |
| R2 | C2 | 7 | 4 | 8.5 | 6 | 9 | 8 | 7.08 | 2 |
| R3 | S4 | 7 | 5 | 8 | 6.5 | 9 | 8 | 7.25 | 3 |
| R3 | E8 | 7 | 5 | 9 | 6.5 | 9 | 8 | 7.42 | 1 |
| R3 | C2 | 7 | 5 | 8.5 | 6.5 | 9 | 8 | 7.33 | 2 |
| Mean | S4 | 7.00 | 4.00 | 8.33 | 6.00 | 9.00 | 8.00 | 7.06 | 3 |
| Mean | E8 | 7.00 | 4.00 | 9.00 | 6.00 | 9.00 | 8.00 | 7.17 | 1 |
| Mean | C2 | 7.00 | 4.00 | 8.60 | 6.00 | 9.00 | 8.00 | 7.10 | 2 |

Select E8: all three scorers rank it E8 > C2 > S4, with small score gains
entirely in anatomical truth/calibration provenance. Beauty, legibility,
recognition, cost and text scores are tied within each review. This does
not establish a visible composition or recognition improvement. All sets
match 9 of 18 locked TV assignments: R1 2/6, R2 4/6, R3 3/6. No paired
recognition gain. The source/dataset revision is pinned in the calibration
artifact, and the display references are separate from command decoding.

The fresh losses audit found no strict overall ranking. It identifies E8's
reduced marker visibility at unsaturated rates (walking about 29%, escape 43%,
flight 25%, feeding 20% less normalized glow than S4), versus C2's earlier
clipping. We accept the documented reference consistency, without claiming
a readability win. This audit's recognition scores are excluded: it opened
one full-body still before activity-only inspection. Scorer R1 also reports
an overbroad checksum glob reading bytes, but not viewing images or scores,
from unlisted sets. These limitations are retained; no scores were adjusted.
All scorers decoded temporal samples rather than observing real-time native
playback. No physical TV-distance test was performed.

All variants report 4 diagnostic draws versus 3 with views hidden, 48,686
triangles, and 13/13 focused tests passed. E8/S4/C2 interpreter CPU probes
are 9.575/9.565/9.545 microseconds per frame; those differences are noise.
Sampling found boxed numbers only, with no structured per-frame allocations.
State JSON proxies are 3,675–4,058 bytes; exact live worker/native bridge wire
traffic is not measured. Zero fields, readouts or per-frame JS paths are
added by the scale comparison. Native and WASM fingerprints pass against
TypeScript. The initial full run's documentation-path failure was corrected;
a complete repeat passed 1,094 unit tests (two unrelated skips) and all five
budgets, plus lint and typecheck. Brain budget: build 182 ms, rest 0.064 CPU s/s,
full stimulation 0.244 CPU s/s on the M5 Pro reference. These checks precede
the final merge of latest dev; final landing checks are recorded below.

This is the eighth and final round under the agreed cap. Seven rounds were
retained (round 7 was rejected). The remaining major weakness is activity-only
behaviour recognition. A next experiment would need richer measured cell
or segment specificity and longer observations, rather than pretending the
aggregate rates reveal individual spike paths.

Key (TV or portrait P; each suffix identifies clip-N):

S4: 11=TV rest, 12=TV groom, 13=TV swoop/takeoff, 14=TV reverse locomotion, 15=P groom, 16=P rest, 17=TV feed, 18=TV flight, 19=P flight, 20=P feed, 21=P reverse locomotion, 22=P swoop/takeoff

C2: 11=P rest, 12=TV reverse locomotion, 13=P swoop/takeoff, 14=TV groom, 15=TV swoop/takeoff, 16=P flight, 17=TV feed, 18=P feed, 19=P groom, 20=P reverse locomotion, 21=TV flight, 22=TV rest

E8: 11=P flight, 12=TV flight, 13=P feed, 14=TV reverse locomotion, 15=TV swoop/takeoff, 16=P groom, 17=TV feed, 18=TV rest, 19=P rest, 20=TV groom, 21=P reverse locomotion, 22=P swoop/takeoff


Final integration: origin/dev 5dd616ca was merged with a merge commit
(e821d9d0), keeping dev's UI, model and e2e harness behaviour. The brain tree
remained 8cf5b08406f473161ee34266096a08186a60b8d3, so calibration and spike
checks remain relevant. The selected E8 full references were regenerated
against the pinned anatomy and connectome. After this merge, npm test
passed 1,128 unit tests (two skips), four budget checks and skipped the brain
cost check under reference contention. The same unchanged brain passed
that budget before this merge, measuring 0.244 CPU s/s full stimulation.
Typecheck and lint passed; the documentation checker also passed after
final wording changes. No budget threshold or test expectation was relaxed.

The complete farm run used the earlier ready unplaced-anatomy head with
dev merged. Lint, types, build and web e2e passed; one server test and
wallpaper/network transitions in play, pointer and tables timed out. A
separate targeted server recheck passed on the later head-location head.
The earlier local play suite passed, but these results do not establish an
all-green full farm run for E8. No GitHub CI wait was used as a landing gate.
