Score each criterion 0–10 for each evidence set. A 10 means:
- Beauty: coherent, luminous anatomy, convincing depth, restrained palette, excellent composition in X-ray and corner panel.
- Activity recognition: distinguish rest, walking, grooming, feeding, swoop escape and flight from unlabelled activity-only clips. Assign each clip one behaviour and state confidence. Score by demonstrated recognisability, without using the body pose or captions.
- Anatomical truth: light is driven exclusively by measured simulation activity at defensible dataset-derived anatomical locations. Honest smoothing, subsampling and stand-ins documented; simulation spikes unchanged.
- Legibility: anatomy and active pathways remain readable at 640×480 TV resolution and on portrait/landscape phones, at TV distance.
- Cost: ≤2 additional draws, no per-frame allocations, unchanged brain step budgets, cheap worker traffic and JavaScript on a no-JIT TV.
- Absence of text: activity communicates without captions; no unnecessary words or numbers.

Give absolute per-criterion scores for each set, then a forced ranking with reasons. Report the three worst problems and one idea to try. Judge supplied rendered evidence and measured numbers, inspecting code paths for truth/cost. Missing evidence must reduce confidence; do not invent measurements.


Round 5: test reduced face coverage of the glass cuticle, retaining its
silhouette, specular reflection, measured nerve activity and ordinary body.
Fresh blind scores and evidence will be recorded here.

## Blind paired round 5

Key: K3 is dev's cuticle; R8 lowers only its base face coverage from body
0.16 to 0.07 and eyes 0.18 to 0.10. The cubic edge term and full reflections
remain; no activity response, geometry, ordinary-body shader or JavaScript
changes. L5 is an exact duplicate of R8. Frozen source snapshots exclude
experiment logs and keys. Three fresh high-effort scorers saw L5/R8/K3,
K3/L5/R8, L5/R8/K3 respectively; a fourth fresh reviewer audited losses.
No author rationale, chronology or earlier scores were supplied.

| Reviewer | Set | Beauty | Recognition | Truth | Legibility | Cost | Text | Mean | Rank |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| R1 | K3 | 6 | 4 | 8 | 4.5 | 7 | 8 | 6.25 | 2 |
| R1 | R8 = L5 | 6.5 | 4 | 8 | 5 | 7 | 8 | 6.42 | 1 |
| R2 | K3 | 6.5 | 4 | 7.5 | 4.5 | 8 | 6 | 6.08 | 2 |
| R2 | R8 = L5 | 7 | 4 | 7.5 | 5 | 8 | 6 | 6.25 | 1 |
| R3 | K3 | 6 | 4.5 | 8 | 5 | 8 | 7 | 6.42 | 2 |
| R3 | R8 = L5 | 6.5 | 4.5 | 8 | 5.5 | 8 | 7 | 6.58 | 1 |
| Mean | K3 | 6.17 | 4.17 | 7.83 | 4.67 | 7.67 | 7.00 | 6.25 | 2 |
| Mean | R8 = L5 | 6.67 | 4.17 | 7.83 | 5.17 | 7.67 | 7.00 | 6.42 | 1 |

Retain R8. All three preferred its internal visibility. The duplicate received
identical scores in every criterion from every scorer, and is counted once.
Their forced L5/R8 ordering was explicitly arbitrary. The losses audit also
preferred that appearance while noting K3's stronger body envelope. This is
a modest visibility gain, not a recognition gain: both matched 10 of 18
locked TV activity-only assignments. All scorers inspected extracted ordered
frames rather than continuous native-speed playback, limiting temporal claims.

Six fresh observed windows: rest 60 frames/0.983 s, walking 57/0.933 s,
grooming 43/0.700 s, feeding 60/0.983 s, takeoff onset 8/0.117 s, flight
60/0.983 s. Walking was obtained by monitoring during the normal tool sequence
after an initial bounded attempt failed. No commands or spikes were injected.
Different clip lengths, especially the very short onset, can provide capture
cues and do not establish general six-way recognition. Rates, initial display
glow, frame intervals and body joints are identical in matched replays.
The panel keeps its normal resting anatomy. Native GIFs use nominal 60 fps
with GIF timestamp quantization; slowed copies use 7 fps. TV renders use
640×480 displayed at 16:9; portrait uses a further diagnostic camera. Shared
live PNGs establish layout, not comparative shader appearance.

Both scenes use four draw calls; no geometry, draw or message fields are added.
CPU probes: 13.56 versus 12.92 microseconds/frame without JIT; elapsed 14.48
versus 12.96. The JavaScript paths are identical, so these noisy probes do not
establish a speed difference. Only boxed numbers were sampled. State JSON is
3,869–4,080 bytes, a size proxy rather than exact live transport cost. Brain
step code and budgets are unchanged by this feature.

Disclosed key (TV or portrait P, suffixes 11–22):

K3: 11=TV feed, 12=P groom, 13=P walk, 14=TV flight, 15=P feed, 16=P flight, 17=TV groom, 18=P rest, 19=TV walk, 20=P swoop, 21=TV swoop, 22=TV rest

R8: 11=P feed, 12=TV swoop, 13=P groom, 14=TV walk, 15=P walk, 16=TV feed, 17=TV flight, 18=P swoop, 19=TV groom, 20=TV rest, 21=P flight, 22=P rest

L5 retains the R8 key.

After scoring, latest origin/dev was merged with a merge commit. This includes
the separately validated unplaced-activity correction and other upstream work;
paired evidence above predates that refresh. Dev behavior is retained.
Before that merge, typecheck, lint and all 27 area tests passed.

Post-merge checks: all 28 area tests and lint passed. Typecheck initially
reported missing dependencies newly added on dev; npm ci refreshed this
worktree, then typecheck passed. No source workaround or lockfile change.
