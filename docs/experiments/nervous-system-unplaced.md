Score each criterion 0–10 for each evidence set. A 10 means:
- Beauty: coherent, luminous anatomy, convincing depth, restrained palette, excellent composition in X-ray and corner panel.
- Activity recognition: distinguish rest, walking, grooming, feeding, swoop escape and flight from unlabelled activity-only clips. Assign each clip one behaviour and state confidence. Score by demonstrated recognisability, without using the body pose or captions.
- Anatomical truth: light is driven exclusively by measured simulation activity at defensible dataset-derived anatomical locations. Honest smoothing, subsampling and stand-ins documented; simulation spikes unchanged.
- Legibility: anatomy and active pathways remain readable at 640×480 TV resolution and on portrait/landscape phones, at TV distance.
- Cost: ≤2 additional draws, no per-frame allocations, unchanged brain step budgets, cheap worker traffic and JavaScript on a no-JIT TV.
- Absence of text: activity communicates without captions; no unnecessary words or numbers.

Give absolute per-criterion scores for each set, then a forced ranking with reasons. Report the three worst problems and one idea to try. Judge supplied rendered evidence and measured numbers, inspecting code paths for truth/cost. Missing evidence must reduce confidence; do not invent measurements.


A separate display-only round from latest origin/dev (97285685), following
the owner's instruction to use a new branch after promoting a blind winner.
No simulation, worker/native transport or geometry changes. Blind evidence
and scores will be recorded here.

## Blind paired round 4

C9 is origin/dev at 97285685; J6 is 4259ce62, withholding the mixed
unplaced group's activity from the neck connective. All other rendering,
geometry, rates and simulation code are identical. Three fresh independent
high-effort scorers saw J6/C9, J6/C9, C9/J6 in randomized order. A fourth
fresh reviewer audited losses in both directions and also preferred J6.
No reviewer received chronology, author rationale, earlier scores or keys.

| Reviewer | Set | Beauty | Recognition | Truth | Legibility | Cost | Text | Mean | Rank |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| R1 | C9 | 6 | 3 | 6 | 4 | 7 | 7 | 5.50 | 2 |
| R1 | J6 | 6 | 3 | 8 | 4 | 7 | 7 | 5.83 | 1 |
| R2 | C9 | 6 | 3 | 5 | 4 | 8 | 6 | 5.33 | 2 |
| R2 | J6 | 6 | 3 | 7 | 4 | 8 | 6 | 5.67 | 1 |
| R3 | C9 | 5 | 3 | 6 | 4 | 8 | 6 | 5.33 | 2 |
| R3 | J6 | 5 | 3 | 7 | 4 | 8 | 6 | 5.50 | 1 |
| Mean | C9 | 5.67 | 3.00 | 5.67 | 4.00 | 7.67 | 6.33 | 5.39 | 2 |
| Mean | J6 | 5.67 | 3.00 | 7.33 | 4.00 | 7.67 | 6.33 | 5.67 | 1 |

Retain J6: higher mean and unanimous forced preference. The gain is entirely
anatomical honesty. No beauty, recognition, legibility or speed gain is claimed.
Both sets matched 6 of 18 locked TV-clip assignments. The losses audit noted
that J6 withholds activity for 75 neurons; it preferred this omission to a
false location. All reports identified another unsupported mapping, from
head sensory neurons of unknown organ to the pharyngeal nerves, as well as
coarse cord aggregation and weak contrast. Those remain separate work.

Evidence replays measured regional rates, actual frame intervals, initial
smoothed glow and body joint poses. Four windows contain 60 consecutive game
frames (~0.983 s); grooming and flight use eight frames (~0.117 s) from the
previous capture because a longer bounded attempt did not obtain them.
GIF playback is 7 fps for inspection, not production timing. The panel retains
its normal resting pose. Activity-only crops were classified before body-pose
screenshots, code or measurements. Shared live PNGs are layout references.
The metadata's claim that the portrait diagnostic camera fits the entire
model is overstated: some extremities remain clipped. The actual screenshots
show this, reviewers penalised it, and scores are retained without adjustment.

Both diagnostic scenes use four draws and the same geometry; this change adds
zero draws. Probe CPU: 15.56 versus 15.18 microseconds/frame; elapsed 18.35
versus 14.39. Separate test runs reverse the elapsed order (23 versus 40).
These do not establish a speed difference. Only boxed numbers were sampled.
No new worker fields, readouts or geometry; state JSON is 3,543–3,955 bytes,
a size proxy rather than an exact structured-clone or native bridge measure.
The region's own rate remains available in NerveGlow.regions and brain stats.

Disclosed key (TV or portrait P, clip suffixes 11–22):

C9: 11=TV groom, 12=P flight, 13=TV walk, 14=P groom, 15=TV swoop, 16=P swoop, 17=P walk, 18=TV flight, 19=P feed, 20=TV rest, 21=TV feed, 22=P rest

J6: 11=TV groom, 12=TV walk, 13=TV swoop, 14=P swoop, 15=P flight, 16=TV feed, 17=TV flight, 18=P groom, 19=P rest, 20=P feed, 21=TV rest, 22=P walk


After scoring, the maintainer merged PR #80 into dev (b5033b1d). The latest
origin/dev was merged into this branch with a merge commit; conflicts retain
dev's measured command-soma behavior and add only explicit zeroing of the
unlit connective. Ownership tests allow both the command groups and the unlit
context; the command-rate smoothing tests are retained. The paired evidence
above predates that upstream merge; its scores are not a new assessment of
the combined appearance. No e2e expectations or simulation sources were edited.

Post-merge checks: typecheck and lint passed; all 28 nervous-system, stats,
model and soma-provenance tests passed, including command-group smoothing
and the interpreter allocation probe. Full farm checks are queued.
