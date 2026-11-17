Score each criterion 0–10 for each evidence set. A 10 means:
- Beauty: coherent, luminous anatomy, convincing depth, restrained palette, excellent composition in X-ray and corner panel.
- Activity recognition: distinguish rest, walking, grooming, feeding, swoop escape and flight from unlabelled activity-only clips. Assign each clip one behaviour and state confidence. Score by demonstrated recognisability, without using the body pose or captions.
- Anatomical truth: light is driven exclusively by measured simulation activity at defensible dataset-derived anatomical locations. Honest smoothing, subsampling and stand-ins documented; simulation spikes unchanged.
- Legibility: anatomy and active pathways remain readable at 640×480 TV resolution and on portrait/landscape phones, at TV distance.
- Cost: ≤2 additional draws, no per-frame allocations, unchanged brain step budgets, cheap worker traffic and JavaScript on a no-JIT TV.
- Absence of text: activity communicates without captions; no unnecessary words or numbers.

Give absolute per-criterion scores for each set, then a forced ranking with reasons. Report the three worst problems and one idea to try. Judge supplied rendered evidence and measured numbers, inspecting code paths for truth/cost. Missing evidence must reduce confidence; do not invent measurements.


Baseline: set-H7, source bd88a01 plus this rubric. Three fresh independent
reviewers received only the rubric, neutral evidence paths and source paths.

| Reviewer | Beauty | Recognition | Truth | Legibility | Cost | Text | Mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| R1 | 5 | 4 | 8 | 4 | 7 | 2 | 5.00 |
| R2 | 5 | 3 | 7 | 4 | 6 | 2 | 4.50 |
| R3 | 5 | 4 | 8 | 4 | 7 | 3 | 5.17 |
| Mean | 5 | 3.67 | 7.67 | 4 | 6.67 | 2.33 | 4.89 |

Ranking: each ranked H7 first of one; baseline establishes no superiority.
The earlier progress message's 4.83 was an arithmetic error; the mean is 4.89.
All three identified diluted command activity, poor contrast and overlapping
behaviour signatures. R1 disclosed seeing one captioned PNG before its GIF;
R2 and R3 classified GIFs before opening full screenshots. Captures contain
transitions, so intent labels are not frame-by-frame behavioural ground truth.

Private evidence key, now disclosed: clips 11–24 are respectively phone rest,
TV rest, TV flight, TV feeding, TV swoop, TV walking, phone swoop, phone
feeding, landscape walking, phone flight, landscape feeding, landscape rest,
phone grooming, landscape swoop. These are capture triggers, not forced
behaviours. Missing bounded observations: TV/landscape grooming, phone walking,
landscape sustained flight. The whole recorded activity sequence is retained
outside git; only images are in the orphan assets branch.

Baseline cost: 9.89 µs/frame for glow, X-ray and corner logic in V8's interpreter,
13 µs in the separate test run. Only boxed numbers sampled. Scene totals
17–85 draw calls; worker state JSON 3,621–4,200 bytes. These are not measured
incremental costs or native JavaScriptCore timings. Targeted tests: 9 passed.

First candidate: command-group rate markers at all 64 true soma coordinates,
shared mesh registration, stronger tissue contrast and no panel heading.
Individual spike events, invented axon paths, behaviour-driven illumination
and native-only telemetry were rejected: they would either misstate the data
or require a separate simulation/transport change. Segment-specific cord
rates remain a separate possible experiment; this candidate leaves both
simulation implementations and their readouts unchanged.

## Matched round 1

Key: H7 = baseline; P4 = d371ddb (64 somata, darker tissue, stronger emission,
no nervous-system heading). Source snapshots and evidence were frozen. Display
order: R1 P4/H7, R2 H7/P4, R3 P4/H7. All three were fresh independent contexts;
a fourth fresh reviewer audited losses in both directions without chronology.

Matched renders replay the same recorded live rates at fixed resting anatomy,
lighting and cameras. TV is native 640×480, exported at its displayed 16:9
aspect; portrait phone is also rendered. This isolates rendering and prevents
body poses or activity captions answering the matching task. Live captures
remain separate. These scores should be compared within this round, not
numerically attributed to the change from the baseline live-only review.

| Reviewer | Set | Beauty | Recognition | Truth | Legibility | Cost | Text | Mean | Ranking |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| R1 | H7 | 6 | 5.5 | 8 | 5 | 8 | 6 | 6.42 | 2 |
| R1 | P4 | 7 | 5.5 | 8.5 | 6.5 | 7.5 | 7 | 7.00 | 1 |
| R2 | H7 | 6 | 6 | 8 | 5 | 8 | 6 | 6.50 | 2 |
| R2 | P4 | 7 | 6 | 9 | 6 | 8 | 8 | 7.33 | 1 |
| R3 | H7 | 6 | 5 | 8.5 | 4.5 | 9 | 6 | 6.50 | 2 |
| R3 | P4 | 6.5 | 5 | 9 | 6 | 8 | 8 | 7.08 | 1 |
| Mean | H7 | 6.00 | 5.50 | 8.17 | 4.83 | 8.33 | 6.00 | 6.47 | 2 |
| Mean | P4 | 6.83 | 5.50 | 8.83 | 6.17 | 7.83 | 7.67 | 7.14 | 1 |

Decision: retain P4, unanimously preferred and higher scored. No recognition
gain was demonstrated. All three still confused walking/grooming and broad
motor events. The source recordings include mixed activities: especially the
short grooming observation, which transitions into backing. Forced clip
assignments are subjective recognition evidence, not verified six-way accuracy.

The losses audit also preferred P4, but identified compressed bright amber
masses, tiny marker visibility and extra geometry. It recommended retaining
the darker tissue while testing the earlier activity threshold/emission.
Other reviewers independently proposed a 2–3-pixel soma footprint.

Matched cost: 4 draws in each version; 47,174 versus 51,794 triangles across
both views. P4 logic: 15.93 µs CPU/frame without JIT, 68.06 µs elapsed in that
run. Baseline elapsed: 9.89 µs. These are not an equivalent timing delta:
the probe workloads differ and shared-machine scheduling is noisy. Only boxed
numbers were sampled. No simulation/driver source changes or new message fields.

Matched key (clip suffixes 11–22):

| Set | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| H7 | P walk | P feed | TV rest | P flight | P swoop | TV walk | TV swoop | TV feed | P rest | TV groom | TV flight | P groom |
| P4 | TV flight | P swoop | TV feed | P groom | P rest | P flight | TV walk | TV swoop | P walk | TV groom | TV rest | P feed |

P means portrait phone. Labels name observation triggers; the anatomy remains
at rest in the diagnostic replay. Every scorer classified activity-only GIFs
before screenshots/source/measurements. Existing app captions were visible only
in the later live-game evidence, and still lower the text score.

## Matched round 2

Key: P4 = round-1 incumbent; Q8 = an identical copy of P4, a consistency
control; N6 = 2f2278f, two-pixel soma floor, restrained activity emission,
compact stats with retained values/units and no duplicate activity headings.
All scorers were fresh contexts, now using the owner's updated high effort.
Six unlabelled TV activity clips per set were classified before other evidence;
phone evidence remained available for layout and legibility. Source/evidence
were frozen, with review logs and keys excluded from source snapshots.

| Reviewer | Set | Beauty | Recognition | Truth | Legibility | Cost | Text | Mean | Ranking |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| R1 | P4 = Q8 | 7 | 6 | 8 | 6.5 | 8 | 6 | 6.92 | tied 2 |
| R1 | N6 | 7.5 | 6 | 8.5 | 7 | 8 | 7 | 7.33 | 1 |
| R2 | P4 = Q8 | 6 | 5 | 8 | 5 | 8 | 5 | 6.17 | tied 2 |
| R2 | N6 | 6 | 5 | 8 | 5 | 8 | 6 | 6.33 | 1 |
| R3 | P4 = Q8 | 7 | 5.5 | 8 | 5.5 | 8 | 4 | 6.33 | tied 2 |
| R3 | N6 | 7.5 | 5.5 | 8 | 6 | 8 | 5 | 6.67 | 1 |
| Mean | P4 = Q8 | 6.67 | 5.50 | 8.00 | 5.67 | 8.00 | 5.00 | 6.47 | 2 |
| Mean | N6 | 7.00 | 5.50 | 8.17 | 6.00 | 8.00 | 6.00 | 6.78 | 1 |

Decision: retain N6, unanimously preferred and higher scored. Identical sets
received identical criterion scores from all three reviewers; no extra noise
reviewers were needed. Duplicate control scores are not counted twice.
Recognition again did not improve. The separate losses audit preferred N6,
but found weaker regional contrast than P4/Q8; it recommended testing an
intermediate response. Some marker merging remains possible at two pixels.

Matched cost remains 4 draws and 51,794 triangles. Logic CPU: 15.79 versus
15.93 µs/frame, an equivalent-workload result consistent with no meaningful
CPU difference. Live message ranges fluctuate with numeric values; no new
message fields/readouts were introduced. Targeted tests: 29 passed.

Mandatory validation correction after evidence was frozen: full tests exposed
18,433 nervous-system triangles against the existing 18,000 limit. The soma
glyphs were reduced to eight faces, preserving centres and pixel footprint,
in f065461a. The mesh is now 16,639 triangles; all 16 targeted model/anatomy
tests passed. No budget was relaxed. Full rerun: 722 tests passed, 2 skipped;
the unchanged brain's independent CPU budget then failed at 0.607 s/s against
0.5. Both brain source trees are unchanged from the task's base. Lint and
typecheck passed. A separate budget rerun is being used to investigate shared
machine variability; the failure is not hidden or counted as a visual win.

N6 matched key (clip suffixes 11–22): TV swoop, P feed, P groom, TV feed,
P walk, TV rest, P rest, TV walk, P swoop, TV groom, P flight, TV flight.
P4/Q8 retain the round-1 P4 key. These are observation-trigger labels, not
verified exclusive behavioural ground truth for transition clips.

Round-2 presented order: R1 Q8/N6/P4; R2 N6/Q8/P4; R3 Q8/P4/N6.
The regression audit saw N6/P4/Q8.


## Matched round 3

Key: V2 = the retained transfer function on updated dev, with the mandatory
triangle-budget repair; U7 = intermediate colour threshold 0.35 and emission
coefficient 1.0. Both share the same updated dev behaviour. Fresh scorers saw
V2/U7, U7/V2, V2/U7 respectively, with no author rationale or previous scores.
A separate fresh losses audit also preferred U7 narrowly.

The refreshed evidence captures eight consecutive game frames during actual
observed rest, walking, grooming, feeding and flight. Escape is the actual
jump onset (one falling frame, seven flying frames). Actual frame times, the
measured initial display glow, rate values and body joint frames are replayed
in both variants; the corner panel remains in its normal resting pose. Eight
frames span about 0.117 seconds. GIFs play at 7 fps for inspection; production
timing is unchanged. This is a short diagnostic window, not evidence of
recognising complete sustained behaviours. Shared live-layout PNGs are the
same reference images in both sets, not comparative shader evidence.

| Reviewer | Set | Beauty | Recognition | Truth | Legibility | Cost | Text | Mean | Ranking |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| R1 | V2 | 6.5 | 4 | 8 | 5.5 | 7.5 | 6 | 6.25 | 2 |
| R1 | U7 | 7 | 4 | 8 | 6 | 7.5 | 6 | 6.42 | 1 |
| R2 | V2 | 6.3 | 4 | 8 | 5.3 | 7 | 6 | 6.10 | 2 |
| R2 | U7 | 6.5 | 4 | 8 | 5.5 | 7 | 6 | 6.17 | 1 |
| R3 | V2 | 6.5 | 4 | 9 | 5.5 | 8 | 4 | 6.17 | 2 |
| R3 | U7 | 6.7 | 4 | 8.5 | 6 | 8 | 4 | 6.20 | 1 |
| Mean | V2 | 6.43 | 4.00 | 8.33 | 5.43 | 7.50 | 5.33 | 6.17 | 2 |
| Mean | U7 | 6.73 | 4.00 | 8.17 | 5.83 | 7.50 | 5.33 | 6.26 | 1 |

Decision: retain U7. All three scorers preferred it and its mean is higher,
but the margin is small. Recognition did not improve. Against the observed
window key, each variant matched 10 of 18 locked assignments (six recordings,
three reviewers); this small slowed benchmark is not a generalisation claim.
The losses audit identified mildly reduced depth within bright overlapping
anatomy in U7, against V2's reduced visibility of weak activity.

Two scorers reported stale transfer coefficients in U7's README. Direct
inspection of the frozen file shows 0.35 and glow², matching its shader.
No correction was needed. Their scores are retained without adjustment.

Both matched scenes: 4 draws, 48,206 triangles; nervous-system mesh 16,639 triangles,
under the unchanged 18,000 limit. Shared identical glow JavaScript: 16.73 µs CPU
and 17.09 µs elapsed in one interpreter probe. The separate test log's 35 µs is a
different run, not another component or a speedup. Both permit boxed numbers.
No new worker fields/readouts or simulation changes were introduced.

Full validation after the earlier rebase: 792 tests passed, 2 skipped, plus all 4
budget tests passed; lint/typecheck passed. Brain cost: build 205 ms, rest 0.086
CPU s/s, full 0.471 against 0.5. Earlier failures remain recorded: the original
untouched task base also failed full CPU at 0.505 s/s; no threshold was relaxed.

Round-3 key (P = portrait):

set-V2: 11=TV swoop, 12=TV walk, 13=P swoop, 14=P groom, 15=P flight, 16=P rest, 17=P feed, 18=TV rest, 19=TV feed, 20=P walk, 21=TV groom, 22=TV flight
set-U7: 11=TV feed, 12=TV flight, 13=TV walk, 14=P groom, 15=P swoop, 16=P walk, 17=TV swoop, 18=P flight, 19=TV groom, 20=P feed, 21=P rest, 22=TV rest

## Owner process update

The owner subsequently requested merging latest origin/dev with a merge
commit, promoting any blind winner to ready after local checks, and leaving
merging to the maintainer. This supersedes the earlier draft-only process.
The latest dev merge is retained without changing dev behaviour. Subsequent
validated rounds belong on new branches and PRs. No GitHub CI wait is used.

Post-merge validation (c7c3de66): typecheck, lint and all 40 area tests passed.
The updated full play e2e also passed, including the nervous-system/X-ray,
stats, place and frame-budget steps. No e2e expectations were changed.
