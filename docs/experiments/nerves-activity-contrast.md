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
envelopes, hue and emitted light are unchanged. Blind scores will be recorded.

## Blind round 7: rejected coverage trials

D4 is dev's existing tissue; W9 lowers neuropil coverage 0.70 to0.45; Z3
lowers tract/nerve/organ coverage 0.75/0.85/0.75 to0.55/0.60/0.60. All
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
not counted as a fourth scorer. Each set matched12of18 locked TV assignments;
no recognition gain. Reviewers inspected decoded temporal samples, not live
TV-distance viewing. This is one round without improvement.

Evidence reuses actual round-5 rates, initial glow and frame times with body
anatomy held at rest. Durations and nominal-native/slowed GIF conventions
are as round6. Shared live references are older layout examples. Both views
use the same geometry and four diagnostic draw calls. CPU probes D4/W9/Z3:
15.671/13.099/13.046microseconds per frame; identical JS paths mean these noisy
runs establish no speed ranking. Only boxed numbers were sampled. State JSON
3,869–4,080bytes is a proxy; no worker fields or readouts are added. The common
brain source matches the M5 reference whose fingerprints and budgets passed.

Key (TV or portrait P, suffixes11–22):

D4: 11=P walk, 12=P flight, 13=TV rest, 14=TV swoop, 15=TV feed, 16=P rest, 17=P groom, 18=P feed, 19=TV groom, 20=TV flight, 21=TV walk, 22=P swoop

W9: 11=P flight, 12=P walk, 13=P feed, 14=TV swoop, 15=TV flight, 16=P swoop, 17=TV walk, 18=TV feed, 19=P groom, 20=TV rest, 21=TV groom, 22=P rest

Z3: 11=TV walk, 12=P walk, 13=P rest, 14=TV swoop, 15=P swoop, 16=P groom, 17=TV feed, 18=P feed, 19=TV rest, 20=P flight, 21=TV groom, 22=TV flight

No winning step is held in this PR; a final normalization comparison follows
on the retained baseline, with these rejected trials kept in the log.
