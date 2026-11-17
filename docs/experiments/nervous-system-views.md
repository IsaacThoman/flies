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
