Score each criterion 0–10 for each evidence set. A 10 means:
- Beauty: coherent, luminous anatomy, convincing depth, restrained palette, excellent composition in X-ray and corner panel.
- Activity recognition: distinguish rest, walking, grooming, feeding, swoop escape and flight from unlabelled activity-only clips. Assign each clip one behaviour and state confidence. Score by demonstrated recognisability, without using the body pose or captions.
- Anatomical truth: light is driven exclusively by measured simulation activity at defensible dataset-derived anatomical locations. Honest smoothing, subsampling and stand-ins documented; simulation spikes unchanged.
- Legibility: anatomy and active pathways remain readable at 640×480 TV resolution and on portrait/landscape phones, at TV distance.
- Cost: ≤2 additional draws, no per-frame allocations, unchanged brain step budgets, cheap worker traffic and JavaScript on a no-JIT TV.
- Absence of text: activity communicates without captions; no unnecessary words or numbers.

Give absolute per-criterion scores for each set, then a forced ranking with reasons. Report the three worst problems and one idea to try. Judge supplied rendered evidence and measured numbers, inspecting code paths for truth/cost. Missing evidence must reduce confidence; do not invent measurements.


Round 6: withhold the unknown-head-organ group from the pharyngeal nerves.
The rate remains available internally; no simulation, transport, activity
response or geometry changes. Fresh blind paired scores will be recorded.

## Blind paired round 6

B8 is dev at 76787e51; F2 is 290b8d94, withholding unknown-organ head sensory
activity from the pharyngeal nerves. Three fresh high-effort scorers received
B8/F2, F2/B8, B8/F2 respectively, with no chronology, rationale, previous
scores or keys. A fourth fresh reviewer audited losses and preferred F2.

| Reviewer | Set | Beauty | Recognition | Truth | Legibility | Cost | Text | Mean | Rank |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| R1 | B8 | 6 | 4 | 7 | 5 | 8 | 9 | 6.50 | 2 |
| R1 | F2 | 6 | 4 | 8 | 5 | 8 | 9 | 6.67 | 1 |
| R2 | B8 | 6.5 | 4.5 | 6.5 | 4.5 | 8 | 8 | 6.33 | 2 |
| R2 | F2 | 6.5 | 4.5 | 8 | 4.5 | 8 | 8 | 6.58 | 1 |
| R3 | B8 | 6.5 | 4 | 7 | 5 | 8 | 8 | 6.42 | 2 |
| R3 | F2 | 6.5 | 4 | 8 | 5 | 8 | 8 | 6.58 | 1 |
| Mean | B8 | 6.33 | 4.17 | 6.83 | 4.83 | 8.00 | 8.33 | 6.42 | 2 |
| Mean | F2 | 6.33 | 4.17 | 8.00 | 4.83 | 8.00 | 8.33 | 6.61 | 1 |

Retain F2: higher mean and unanimous preference. The gain is entirely truth;
no aesthetic, recognition or speed gain is claimed. Both matched 10 of 18
locked TV activity-only assignments. Reviewers inspected ordered extracted
frames rather than continuous playback; short, varying-duration captures
cannot establish sustained or TV-distance recognition. The losses audit
preferred omitting an uncertain signal to inventing a specific organ.

The pinned anatomy sidecar confirms all 174 members of head-sensory-other
have positionKind 0 (absent), not soma positions or fibre fallbacks. It has
19 true soma positions for the 75 unplaced neurons, with the other 56 absent.
A pooled rate alone does not identify which individual cells fired. This
step leaves those rates available internally and invents no locations.

Evidence reuses round 5's actual recorded rates, initial glow and frame times.
Body anatomy is held at the normal resting reference pose in both X-rays;
the corner panel also remains at rest. This isolates mapping, not movement.
The six windows span 0.983/0.933/0.700/0.983/0.117/0.983 seconds respectively
for rest/walk/groom/feed/takeoff onset/flight. Nominal-native GIFs use 60 fps
with timestamp quantization; slow copies use 7 fps. TV uses native 640×480
exported at 16:9; portrait has a further diagnostic camera. Shared live
references predate subsequent UI changes and do not prove a layout advantage.

Both scenes use four draws and identical geometry. The existing zeroing loop
handles one more cached index; no arrays or objects are created per frame.
The interpreter probes sampled only boxed numbers. CPU: 13.735 versus 12.51
microseconds/frame; elapsed: 13.69 versus 12.44. These noisy probes establish
no speed ranking. State JSON is 3,869–4,080 bytes, a proxy rather than exact
bridge traffic; no fields or readouts were added.

Common M5 verification at 290b8d94: full npm test passed 1057 unit cases with
two skips, plus all five budgets. Native/WASM bitwise spike checks passed.
Brain CPU: build 183 ms, rest 0.066 s/s, full 0.291 s/s against 0.5, median of five.
Lint and typecheck passed. The complete current play e2e passed, including
X-ray, stats, wallpaper wake-up, reload, places and the frame budget (86 draws,
361,304 triangles). No test expectations or camera/eyes pathways were edited.

The separate x86 farm run passed lint, both typechecks and build, but one
server networking test timed out at 2000 ms. Its play e2e also timed out waking
from wallpaper before reaching the nerve checks. Both corresponding current
M5 checks passed. A targeted farm networking recheck was queued; failures are
not hidden or counted as passes, and unrelated code was not changed.

Disclosed key (TV or portrait P, suffixes 11–22):

B8: 11=TV flight, 12=TV rest, 13=P walk, 14=P rest, 15=TV groom, 16=TV feed, 17=P swoop, 18=TV swoop, 19=P flight, 20=P feed, 21=TV walk, 22=P groom

F2: 11=P walk, 12=P rest, 13=P swoop, 14=P groom, 15=TV groom, 16=P feed, 17=TV feed, 18=TV rest, 19=TV flight, 20=P flight, 21=TV walk, 22=TV swoop

Latest origin/dev was merged after scoring, preserving dev behavior.

After the latest merge, typecheck, lint and all 28 area tests passed.
