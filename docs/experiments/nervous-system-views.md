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
