# Air puffs and take-off: investigation

Status: completed circuit investigation; no gameplay change proposed. The full check has a CPU-budget failure, detailed below.

## Review rubric

Each criterion is scored 0–10 by independent reviewers. A 10 requires:

| Criterion | What a 10 looks like |
| --- | --- |
| Literature | Primary papers verified online; numerical claims tied to figures and assay conditions; no conflation of locomotion, tethered flight and free take-off. |
| Wiring | Script reproduces JO A–F membership, direct and indirect paths with counts per hop, and distinguishes chemical connectivity from missing electrical coupling. |
| Principle | Only biological sensory populations are driven; brain commands decide actions; all assumptions and absent mechanisms are explicit. |
| Measurement | Controls, several strengths and seeds, transient and sustained stimuli, DNp01, flight motor and grooming results support a bounded conclusion. |
| Regression | Fingerprint, behaviour and relevant CPU budgets pass; required repository checks reported with failures and limitations. |

## Blind review log

Pending evidence and independent review. Reviewer briefs contain only the rubric,
neutral evidence sets and locations; scores and identities are recorded here
after review.

## What a real fly does

Airflow is not a universal take-off command. Its temporal structure, direction,
contact with a perch, and the animal's state matter. These are adult
*Drosophila* results, verified online on 2026-11-16:

| Paper and figure | Verified observation | What it establishes |
| --- | --- | --- |
| [Yorozu et al. 2009, Nature 458:201–205](https://pmc.ncbi.nlm.nih.gov/articles/PMC2755041/), Fig. 1b–d, 3d–g | Walking arrests reversibly at 0.7–1.6 m/s; Fig. 1b n=6. JO-C/E ablation abolishes this wind-induced suppression of locomotion (WISL; Fig. 3, n=15). | Sustained wind need not make a perched fly leave. |
| Same paper, Fig. 1i–l, 2d–o and 4 | Wind-selective cells are tonic; sound-selective cells are phasic, with occasional onset/offset spikes during wind. A/B and C/E are distinct sensory channels. | A sharp mechanical onset is not represented adequately by tonic C/E drive alone. |
| [Mu, Bacon, Ito & Strausfeld 2014, J Exp Biol 217:2121–2129](https://doi.org/10.1242/jeb.099135), Fig. 4A–D ([full text](https://jfly.uni-koeln.de/temp/reprints/2014_Mu_JExpBiol_giant_fiber.pdf)) | Air puffs depolarized 28/29 recorded giant descending neurons; onset evoked a large EPSP, later responses varied. A roughly 6 Hz puff train adapted. Combined light-off and puff responses exceeded either alone but were sublinear relative to their sum. | 28/29 is a membrane response count, **not** a jump or flight probability. Sensory depolarization often stayed below spike threshold. |
| [Banerjee et al. 2004, J Neurosci 24:7869–7878](https://pmc.ncbi.nlm.nih.gov/articles/PMC1289272/), Fig. 3A and associated Results | Wild-type CS air-puff-evoked DLM flight patterns were reported in five of five animals; each of two itpr mutant combinations failed in four of four. | 5/5 is a small-sample tethered muscle-pattern result, **not** a free-standing take-off dose-response. |
| [Iyengar & Wu 2014, J Neurogenet 28:316–328](https://pmc.ncbi.nlm.nih.gov/articles/PMC5555410/), Fig. 3 and Methods | A 500 ms puff reliably initiated tethered WT male flight (Fig. 3: 37 initiations from 14 flies). Non-fliers failed five puffs separated by 5 s. Onset DLM firing was 19.65±2.9 Hz versus 4.25±0.9 Hz in sustained flight. | Flight initiation is well established; these are muscle rates, not GF rates or single-puff jump percentages. |
| [Ache et al. 2019, Nat Neurosci 22:1132–1139](https://pmc.ncbi.nlm.nih.gov/articles/PMC7444277/), Fig. 3d–f and Mechanosensory stimulation | Strong one-second posterior-lateral puffs moved antennae, legs and wings but did **not** initiate flight in this preparation. DNp10 was excited and DNp07 inhibited. | Direction and preparation matter; a non-GF mechanosensory response does not imply take-off. |
| [Lebestky et al. 2009, Neuron 64:522–536](https://pmc.ncbi.nlm.nih.gov/articles/PMC2908595/), Fig. 1A–J, S2, S7 ([full text](https://www.bennington.edu/sites/default/files/sources/docs/Sherman_Two%20Different%20Forms%20of%20Arousal.pdf)) | Six 200 ms puffs, 5 s apart, 35 psi at the apparatus produced 7–10 min of hyperlocomotion. Peak velocity/distance saturated near four puffs. Sensitization persisted at 10 min but was absent at 30 min. | A persistent locomotor state (ReSH), not sustained GF spiking or a take-off count. The puffs physically displaced flies against mesh. Regulator psi is not air velocity at the antenna. |

No verified free-standing, clean-air single-puff jump/take-off probability curve
against calibrated airspeed was found in these sources. We therefore do not give
a universal percentage or fit a model probability to 5/5 tethered recordings.
Olfactory jump assays, visually evoked escape probabilities, and larval air-puff
responses are different assays and are excluded.

## The real antennal route

[Lehnert et al. 2013, Neuron 77:115–128](https://pmc.ncbi.nlm.nih.gov/articles/PMC3811118/),
Fig. 2, records auditory JON signals via their electrical coupling to the GFN.
The GFN's antennal mechanosensory dendrite lies in the AMMC among A/B
projections; that overlap does not mean all A/B cells are equivalent GF inputs.
[Pézier et al. 2014, J Neurosci 34:11691–11704](https://pmc.ncbi.nlm.nih.gov/articles/PMC4145173/),
Fig. 1 and the TeTxLC experiments, identify JO-A input and primarily electrical
fast transmission. [Jezzini, Merced & Blagburn 2018, PLoS ONE 13:e0198710](https://pmc.ncbi.nlm.nih.gov/articles/PMC6097648/),
Fig. 1D, 2 and 7, distinguish dye-coupled JO-A from JO-B, with chemical contacts
also present. Chemical contact count is not a measurement of the electrical
conductance responsible for the rapid response.

A real puff can excite the phasic displacement/vibration channel at its onset
(and offset), as well as tonic displacement-sensitive C/E while deflected.
Driving all A/B together is an experimental upper-envelope stimulus, not a
verified natural recruitment fraction or rate. No claim that a puff recruits
all A–F is justified: F's natural stimulus remains uncertain ([Hampel et al. 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7652415/), Fig. 5 and supplements). The current model
has neither antennal mechanics nor electrical junctions nor dopamine-mediated
ReSH. Its Poisson input also omits millisecond synchrony and graded receptor
potentials. A negative result here cannot establish absence of the pathway in
a real fly.

Other escape candidates are DNp02, DNp04 and DNp11: their activation and
silencing experiments are in [Dombrovski et al. 2023, Nature 613:534–542](https://www.nature.com/articles/s41586-022-05562-8),
Fig. 1 and Extended Data Fig. 2. The silencing effects concern escape direction, not a reduction in take-off rate. The probe measures them separately; this game's
escape command reads only DNp01. DNp07 and DNp10 are included as landing-related
mechanosensory controls, not relabelled as escape neurons.

## What is actually driven and reconstructed

`wind` selects `cb_sensory / wind_gravity`, 475 neurons. Its type names cross
zone boundaries: E 267, C 53, B 34, F 14, D 8, A 1, `JO-unclear` 96 and `JO-mz` 2.
It is not a clean JO-C/E selector. The probe prints every exact subtype, side,
annotation and output-synapse total. The A/B/C/D/E/F experimental populations
use the type prefix and exclude `-unclear`; `all` includes unclear/multizone
neurons as a deliberately broad stress control.

| Zone | Typed neurons left/right | Raw output synapses left/right |
| --- | ---: | ---: |
| A | 18 / 8 | 14,869 / 571 |
| B | 57 / 18 | 16,411 / 522 |
| C | 46 / 22 | 15,247 / 1,937 |
| D | 8 / 0 | 1,692 / 0 |
| E | 157 / 110 | 85,995 / 34,596 |
| F | 42 / 36 | 6,708 / 8,070 |

These are reconstruction counts, not the number of cells or synapses in an
intact fly. In particular, multiplying the right A/B fragments until they match
the left would invent their missing targets. The existing completeness gain
for C/E/F remains in the simulation; the probe changes no weights.

## Reproduction

From the repository root with Node >=22.18 and dependencies installed:

```sh
npm run brain:fetch
node packages/brain/scripts/puff.ts --wiring > /tmp/puff-wiring.jsonl
node packages/brain/scripts/puff.ts --simulate --seeds 3 --populations wind,A,B,AB,ABCE,all,loom > /tmp/puff-sim.jsonl
node packages/brain/scripts/puff.ts --simulate --seeds 3 --populations C,D,E,F,rest --rates 0,50,100,200 > /tmp/puff-zones.jsonl
```

Use a shared `/tmp/flies-heavy/slot-N` for local simulations and full checks,
and release it immediately afterwards (the shared hill-climb rules).
The expected packed SHA-256 is
`51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c`.
Data attribution: FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0).

Wiring output uses raw counts along exact-length **walks** through individual
neurons. At each hop it retains the walk maximizing the minimum edge count,
with deterministic ties from dataset index order. It permits repeated neurons;
it is not an enumeration of every simple path. Transmitters and root IDs are
printed on every node, so inhibitory or muted relays are visible. A strongest
bottleneck is a descriptive graph statistic, not a model of effective drive.
The simulator, rather than this ranking, determines whether activity passes. Both unrestricted and model-excitatory-only rankings are supplied, so a large inhibitory walk cannot hide the smaller excitatory candidate.

Each simulated trial starts a fresh brain and its normal spontaneous state,
rests for 2 s, applies independent Poisson drive to the stated population, and
observes 1.5 s from onset in 10 ms chunks. A rectangular 20 or 100 ms transient
is compared with a 1,000 ms step at the same per-neuron rate (25/50/100/200 Hz).
Both have abrupt onset; this tests duration, not an independently controlled
antenna rise time. `rest` has no injected neurons. `loom` directly drives
LPLC2/LC4 as a positive circuit control, not a physical puff. Neither control
changes the eyes or any sensory mapping. Rate is an **experimental neural
input**, not a calibrated puff airspeed or tool intensity. DNp01 crossing
`escape >= 0.4` is counted as a threshold event; there is no body, so these are
not measured free flights. Flight/grooming peaks are the game's usual smoothed
readouts; DN means use raw spike counts over the full 1.5 s. The brain and body
thresholds are unchanged.

## A second limit: what “escape 0.4” means

The real GF can trigger its fast escape sequence with a single action potential
([Ache et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC7444277/), Introduction).
The game's readout is different: it averages the two DNp01 cells, smooths their
rate with a 40 ms time constant, and divides by 200 Hz. Passing 0.4 requires a
smoothed population mean above 80 Hz. One unilateral spike in a 10 ms chunk,
from a zero readout, gives `50 × (1 − exp(−10/40)) / 200 = 0.0553`, not a
threshold crossing. A bilateral spike gives 0.1106. Thus reporting no threshold
crossing does not mean no GF spikes, nor does this model reproduce the real
single-spike trigger. The report keeps raw DN spike counts as well as commands.
Changing that decoder alone would also expose spontaneous GF spikes to the body;
it needs a separate, validated investigation, not a puff-specific bypass.

## Simulated responses

Exploratory sweep: seeds 1–3, independent fresh trials at every condition.
The [condition summary](puff-startle-results.csv) records min/max peaks and
threshold-event counts; it is a summary, not raw capture evidence.

At 100 Hz, for a 100 ms transient (range across seeds):

| Population | DNp01 peak, Hz | Flight MN peak, Hz | DNg12 peak, Hz | Escape peak | Threshold events |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sham / rest | 0.00–23.81 | 0.00–5.75 | 0.00–0.00 | 0.00–0.12 | 0/3 |
| wind | 0.00–30.86 | 23.89–25.08 | 23.46–27.91 | 0.00–0.15 | 0/3 |
| A | 0.00–24.19 | 0.00–8.01 | 0.00–0.00 | 0.00–0.12 | 0/3 |
| B | 67.60–73.67 | 2.79–10.54 | 0.00–0.25 | 0.34–0.37 | 0/3 |
| AB | 38.21–47.77 | 0.00–5.83 | 0.00–0.00 | 0.19–0.24 | 0/3 |
| ABCE | 11.06–22.12 | 23.38–26.77 | 18.86–23.12 | 0.06–0.11 | 0/3 |
| all | 11.06–22.14 | 17.89–21.39 | 20.82–27.31 | 0.06–0.11 | 0/3 |
| loom | 312.88–312.99 | 98.13–101.01 | 8.61–8.92 | 1.00–1.00 | 3/3 |

Raising the injected rate to 200 Hz for 100 ms made isolated B cross in 3/3
(escape 0.440–0.488), but A/B remained 0/3 (0.308–0.361), A/B/C/E 0/3
(0.179–0.197), and all JO 0/3 (0.098–0.132). Isolated B's direct chemical
route is not evidence that recruiting B alone is a natural air-puff stimulus.
Adding other sensory populations can recruit inhibition as well as excitation.
These interventions demonstrate the net result, not which interneuron caused
it. A causal inhibition claim would require selective perturbations.

For the one-second step, B crossed at 100 and 200 Hz (3/3 each), A/B at 200 Hz
(3/3; peak 0.401–0.427), while A, wind, A/B/C/E and all JO had no threshold
crossings at any tested rate. None of the JO populations crossed for a 20 ms
transient in this sweep. This is a duration/strength dependence of this model,
not a physical puff calibration.

At 100 Hz for 100 ms, B gave DNp11 9–13 raw spikes per pair over 1.5 s
(3–4.33 Hz per cell), DNp02 exactly 3 (1 Hz), and DNp04 none. A/B/C/E gave
DNp11 and DNp02 0–1 spikes and DNp04 none. The looming control gave DNp02
49–50, DNp04 67–68 and DNp11 42–43 spikes. Other escape-related DNs are thus
measured, but this probe does not invent an additional body command from them.
Wind, in contrast, gave DNp10 24–26 spikes; that is a mechanosensory response
in a landing-related DN, not proof of flight initiation.

The isolated-B 200 Hz transient's GF spikes were predominantly left-sided:
20–22 on the left versus 0–4 on the right over 1.5 s. The asymmetry in the
chemical reconstruction therefore matters to the game’s two-cell mean.

## Chemical wiring results

The [wiring summary](puff-startle-wiring.csv) gives both unrestricted and
excitatory-only strongest walks at each of 1–3 hops for every source/target
combination, including root IDs, sides, predicted transmitters and counts on
each edge. Excitatory-only filters by the model's transmitter corrections and
gain sign, not by a guess that every anatomical path carries excitation.

Direct chemical synapses, summed over all typed cells of each zone:

| Source | DNp01 | DNp02 | DNp04 | DNp11 | DNp07 | DNp10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 0 | 40 | 0 | 0 | 0 | 0 |
| B | 679 | 0 | 0 | 154 | 0 | 0 |
| C | 10 | 0 | 0 | 9 | 0 | 0 |
| D | 0 | 0 | 0 | 0 | 0 | 0 |
| E | 0 | 0 | 0 | 0 | 0 | 351 |
| F | 0 | 0 | 0 | 0 | 0 | 0 |
| Current wind | 0 | 0 | 0 | 0 | 0 | 351 |

B's 679 synapses comprise 656 onto left DNp01 (10010) and 23 onto right DNp01
(10001); the largest individual pair is JO-B1_a (519875) → left DNp01, 99.
C's 10 are JO-CA1 (261211) → left DNp01. These are raw counts before the
model's saturation and completeness corrections. A lack of chemical A→GF
contacts is compatible with the experimentally established **electrical**
JO-A→GF connection; the graph has no representation of that conductance.
Dataset labels are used as annotated, without relabelling JO-B as JO-A to fit
that literature. The probe cannot validate homology of every annotated subtype
across specimens.

Examples of exact excitatory walks to left DNp01 (counts are per hop):

| Zone | Two hops: neuron IDs and counts | Three hops: neuron IDs and counts |
| --- | --- | --- |
| A | JO-A2 928855 → DNge130 199352 → 10010: **28 / 83** | JO-A2 930760 → SAD097 512688 → PVLP123 514481 → 10010: **72 / 44 / 62** |
| B | JO-B3 112105 → SAD053 13472 → 10010: **46 / 87** | 519875 → 10010 → DNp11 10106 → 10010: **99 / 90 / 108** (recurrent walk) |
| C | JO-CA2 513113 → SAD053 13472 → 10010: **54 / 87** | 513113 → 13472 → AVLP452 531899 → 10010: **54 / 52 / 98** |
| D | JO-DA 516332 → PVLP123 17584 → 10010: **19 / 11** | 516332 → 17584 → PVLP123 16482 → 10010: **19 / 14 / 174** |
| E | JO-EV2 516907 → CB2664 15261 → 10010: **30 / 44** | JO-EV1 79237 → SAD004 25436 → SAD049 513904 → 10010: **66 / 65 / 125** |
| F | JO-FD2 268351 → PVLP123 16445 → 10010: **9 / 8** | JO-FD1 38160 → CB0591 11950 → AVLP452 519389 → 10010: **52 / 46 / 109** |

The unrestricted A two-hop walk is stronger by this statistic, but inhibitory:
JO-A2 29561 → SAD109 11391 (predicted GABA) → the right/left GF,
**116 / 179** and **116 / 181**. Its large counts must not be reported as an
excitatory A→GF route. Excitatory walks also exist from A; therefore “A has no
path” would be false. The simulations test whether the whole signed network
transmits enough activity at its current operating point.

## Decision and limits

A real adult fly **can** initiate flight following a puff, but steady airflow
can instead suppress walking. This chemical-only model has indirect JO→escape
routes and a strong, asymmetric chemical JO-B route. It does not faithfully
represent the fast JO-A electrical route or the real GF single-spike trigger.
The tested onset populations did not justify a calibrated brief-puff input.

No Blow-tool or brain-input change is proposed. In particular, selecting only
B because its artificial stimulation crosses the threshold, increasing its
rate until an escape appears, rescaling missing A/B contacts, or bypassing
the brain with a take-off command would not answer the biological question.
There is no new input requiring TS/native/WASM changes. No sound is added.
The existing post-swoop tarsal flight stand-in is unchanged: it can carry an
escape once the brain initiates it, but it cannot establish an antennal
sensory pathway. DNg12 is a head-grooming readout, not an antenna-specific
motor recording. Neither its command nor wing-motor activity proves flight.

This is a bounded model result, not proof that the real animal lacks puff
escape, nor proof that missing electrical coupling alone caused the negative
result. Other limitations include incomplete JO reconstruction, model gains,
lack of receptor potentials and synchrony, no antennal mechanics, and the
rate-based escape decoder. A physical puff can also move body bristles, wings and legs (the Ache preparation demonstrates this); JO-only stimulation does not test all of those mechanosensory routes. ReSH's dopamine/receptor-mediated persistent
state is absent too; it is not reproduced by simply holding wind on.

The next useful work is a separately validated GF decoder and electrical
sensory transmission model with physiological constraints, plus a calibrated
antennal puff waveform. A physical airspeed-to-neural-rate/timing measurement
would be needed before comparing a game probability curve to real take-offs.

## Expanded transient check

A/B, 100 ms onset drive, seeds 1–20; a fresh brain uses the same seed at each strength. The explicit sham sweep used seeds 1–3:

| Requested neural rate | Realized population rate during pulse | Escape peak range | Threshold-event fraction |
| --- | ---: | ---: | ---: |
| 25 Hz | 22.4–27.8 Hz | 0.083–0.200 | 0/20 |
| 50 Hz | 44.1–51.4 Hz | 0.118–0.207 | 0/20 |
| 100 Hz | 87.2–96.7 Hz | 0.147–0.315 | 0/20 |
| 200 Hz | 159.5–173.2 Hz | 0.243–0.395 | 0/20 |

Every strength had 0/20 observed threshold events. This does **not** estimate a
zero biological probability: the two-sided 95% exact binomial interval for
0/20 is 0–16.8%, and seeds sample model stochasticity, not animal-to-animal
variation. The 200 Hz condition approaches threshold in some seeds. The
realized rate is below the requested Poisson rate because driven neurons
retain their refractory period. No conversion to airflow strength is known.
This neural dose-response is therefore not quantitatively comparable with
the 5/5 tethered DLM observation or a free-standing fly's take-off probability.

Reproduce the expansion:

```sh
node packages/brain/scripts/puff.ts --simulate --populations AB --rates 25,50,100,200 --durations 100 --seeds 20
```

The script also records cumulative spike snapshots at 20 ms, stimulus end,
1,000 ms and 1,500 ms, and realized input firing, allowing onset, held and
recovery intervals to be recovered by subtraction. It counts the body's
inclusive threshold (`>= 0.4`); no measured result here lies exactly on it.

## Timing control

Onset A/B plus tonic C/E was tested separately (seeds 1–10). A/B received a
20 or 100 ms pulse; disjoint C/E received the same requested rate for 1 s.
This is a temporal-recruitment experiment, not a measured antenna waveform.
The C/E completeness corrections remained in place.

| Requested rate | A/B pulse | Largest escape peak across 10 seeds | Threshold events |
| --- | ---: | ---: | ---: |
| 50 Hz | 20 ms | 0.141 | 0/10 |
| 50 Hz | 100 ms | 0.209 | 0/10 |
| 100 Hz | 20 ms | 0.185 | 0/10 |
| 100 Hz | 100 ms | 0.129 | 0/10 |
| 200 Hz | 20 ms | 0.184 | 0/10 |
| 200 Hz | 100 ms | 0.214 | 0/10 |

No threshold event occurred in this timing control. Its 0/10 condition counts
have wide uncertainty (two-sided exact 95% upper limit 30.8%); pooling different
strengths would not estimate a single puff probability. The result rules out
neither other timing/recruitment patterns nor an electrical pathway absent
from the model. It supports withholding this particular sensory mapping.

```sh
node packages/brain/scripts/puff.ts --simulate --populations AB+CE --rates 50,100,200 --durations 20,100 --seeds 10
```

## Validation

Against base `bd88a01` (the origin/dev tip when this branch was created), the
production brain, native brain, body and tool sources are unchanged. The diff
adds this report, two numerical summaries, the Node-only research probe and a
README link. New commits on dev are not treated as part of this experiment.

- Full `npm test`: main suite **717 passed, 0 failed, 4 skipped** (721 tests).
  This includes the real-connectome behaviour/fingerprint tests and native and
  committed-WASM parity. Skips: three optional anatomy/Feather checks (sidecar
  absent) and rebuilding WASM byte-for-byte (wasi-sdk absent). No native source
  or WASM output changed.
- The four subsequent CPU-budget tests: **3 passed, 1 failed**. Swoop/flight
  integration and fly-update budgets passed. Brain build **225 ms < 250**;
  rest **0.100 s/s < 0.16**; everything-at-once **0.597 s/s > 0.5** failed.
- Isolated rerun of `node --test packages/brain/src/cost.budget.ts` also failed:
  build **213 ms**, rest **0.097 s/s**, everything-at-once **0.566 s/s**.
  These are normalized thread CPU measurements (median of five), not wall time.
- `npm run lint` and `npm run typecheck`: passed.
- No browser e2e flow is changed; no UI or browser render was needed to verify
  the documentation/probe-only change.

Thus **the full npm test command is not green**. No budget was relaxed and no
model parameter was adjusted. The failed budget and all its imported runtime
sources are byte-identical to the base. `scripts/cpuBudget.ts` explicitly warns
that its reference cannot normalize other processes thrashing shared caches
and memory; the observed failure is consistent with that limitation, but its
cause has not been experimentally isolated. A quiet-machine budget check is
still needed. The report does not claim an all-green regression run.

Heavy runs used the shared slots. Following the fairness update, the full test
process group was paused and its slot released near nine minutes, then resumed
after a two-minute cooldown in another owned slot. Only CPU/game-time checks
remained active; no test or assertion was skipped to fit a slot. No server,
browser or simulator was started for this investigation.
