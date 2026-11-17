# Air puffs and take-off: investigation

A real puff can initiate flight, while sustained wind can stop walking. The
chemical-only model does not implement the verified fast JO-A electrical input
or the real giant fibre's single-spike trigger. This investigation supports
withholding a puff gameplay mapping; it does not establish that flies cannot
escape from a puff or that missing electrical coupling alone causes the
negative model result.

## Review rubric

Each criterion is scored 0–10 by independent reviewers. A 10 requires:

| Criterion | What a 10 looks like |
| --- | --- |
| Literature | Primary papers verified online; numerical claims tied to figures and assay conditions; no conflation of locomotion, tethered flight and free take-off. |
| Wiring | Script reproduces JO A–F membership, direct and indirect paths with counts per hop, and distinguishes chemical connectivity from missing electrical coupling. |
| Principle | Only biological sensory populations are driven; brain commands decide actions; all assumptions and absent mechanisms are explicit. |
| Measurement | Controls, several strengths and seeds, transient and sustained stimuli, DNp01, flight motor and grooming results support a bounded conclusion. |
| Regression | Fingerprint, behaviour and relevant CPU budgets pass; required repository checks reported with failures and limitations. |

## What a real fly does

Airflow is not a universal take-off command. Its temporal structure, direction,
contact with a perch, and the animal's state matter. These are adult
*Drosophila* results, verified online on 2026-11-16:

| Paper and figure | Verified observation | What it establishes |
| --- | --- | --- |
| [Yorozu et al. 2009, Nature 458:201–205](https://pmc.ncbi.nlm.nih.gov/articles/PMC2755041/), Fig. 1b–d, 3d–g | Walking arrests reversibly at 0.7–1.6 m/s; Fig. 1b n=6 group trials. JO-C/E ablation abolishes wind-induced suppression of locomotion (WISL; Fig. 3, n=15 group trials). The WISL protocol uses 20 flies per trial (Methods). | Sustained wind need not make a perched fly leave. |
| Same paper, Fig. 1i–l, 2d–o and 5j–n | Wind-selective cells are tonic; sound-selective cells are phasic, with occasional onset/offset spikes during wind. A/B and C/E are distinct sensory channels. | A sharp mechanical onset is not represented adequately by tonic C/E drive alone. |
| [Mu, Bacon, Ito & Strausfeld 2014, J Exp Biol 217:2121–2129](https://doi.org/10.1242/jeb.099135), Fig. 4A–D ([full text](https://jfly.uni-koeln.de/temp/reprints/2014_Mu_JExpBiol_giant_fiber.pdf)) | Air puffs depolarized 28/29 recorded giant descending neurons; onset evoked a large EPSP, later responses varied. A roughly 6 Hz puff train adapted. Combined light-off and puff responses exceeded either alone but were sublinear relative to their sum. | 28/29 is a membrane response count, **not** a jump or flight probability. Sensory depolarization often stayed below spike threshold. |
| [Banerjee et al. 2004, J Neurosci 24:7869–7878](https://pmc.ncbi.nlm.nih.gov/articles/PMC1289272/), Fig. 3A and associated Results | Wild-type CS air-puff-evoked DLM flight patterns were reported in five of five animals; each of two itpr mutant combinations failed in four of four. | 5/5 is a small-sample tethered muscle-pattern result, **not** a free-standing take-off dose-response. |
| [Iyengar & Wu 2014, J Neurogenet 28:316–328](https://pmc.ncbi.nlm.nih.gov/articles/PMC5555410/), Fig. 3 and Methods | A 500 ms puff reliably initiated tethered WT male flight (Fig. 3: 37 initiations from 14 flies). Non-fliers failed five puffs separated by 5 s. Onset DLM firing was 19.65±2.9 Hz versus 4.25±0.9 Hz in sustained flight. | Flight initiation is well established; these are muscle rates, not GF rates or single-puff jump percentages. |
| [Ache et al. 2019, Nat Neurosci 22:1132–1139](https://pmc.ncbi.nlm.nih.gov/articles/PMC7444277/), Fig. 3d–f and Mechanosensory stimulation | Strong one-second posterior-lateral puffs moved antennae, legs and wings but did **not** initiate flight in this preparation. DNp10 was excited and DNp07 inhibited. | Direction and preparation matter; a non-GF mechanosensory response does not imply take-off. |
| [Lebestky et al. 2009, Neuron 64:522–536](https://pmc.ncbi.nlm.nih.gov/articles/PMC2908595/), Fig. 1A–J, S2, S7 ([full text](https://www.bennington.edu/sites/default/files/sources/docs/Sherman_Two%20Different%20Forms%20of%20Arousal.pdf)) | Six 200 ms puffs, 5 s apart, 35 psi at the apparatus produced 7–10 min of hyperlocomotion. Peak velocity/distance saturated near four puffs. Sensitization remained significant after 10 min. At 30 min the authors reported no statistically significant difference from naïve flies (data not shown); this is not proof of absence. | A persistent locomotor state (ReSH), not sustained GF spiking or a take-off count. The puffs physically displaced flies against mesh. Regulator psi is not air velocity at the antenna. |

The group-trial WISL protocol (20 flies per trial) is also documented in [Yorozu’s author thesis, Methods, WISL assay protocol](https://thesis.caltech.edu/5882/1/Thesis_Suzuko_Yorozu.pdf).

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
all A–F is justified. Zone-D puff recruitment is left unspecified here; F's natural stimulus remains uncertain ([Hampel et al. 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7652415/), Fig. 5 and supplements). The current model
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
smoothed population mean of at least 80 Hz. One unilateral spike in a 10 ms chunk,
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
| rest | 0.00–23.81 | 0.00–5.75 | 0.00–0.00 | 0.00–0.12 | 0/3 |
| wind | 0.00–31.21 | 24.88–27.72 | 22.52–27.59 | 0.00–0.16 | 0/3 |
| A | 0.00–32.26 | 0.00–6.37 | 0.00–0.00 | 0.00–0.16 | 0/3 |
| B | 68.87–76.36 | 4.76–8.54 | 0.00–0.25 | 0.34–0.38 | 0/3 |
| AB | 36.84–48.87 | 0.00–7.76 | 0.00–0.00 | 0.18–0.24 | 0/3 |
| ABCE | 17.80–35.12 | 19.75–24.19 | 22.62–24.40 | 0.09–0.18 | 0/3 |
| all | 0.00–39.52 | 21.52–22.52 | 19.38–35.56 | 0.00–0.20 | 0/3 |
| loom | 301.82–308.85 | 98.25–100.12 | 8.55–9.28 | 1.00–1.00 | 3/3 |

At 200 Hz for 100 ms:

| Population | Escape peak range | Threshold events |
| --- | ---: | ---: |
| B | 0.459–0.493 | 3/3 |
| AB | 0.335–0.374 | 0/3 |
| ABCE | 0.115–0.187 | 0/3 |
| all | 0.071–0.140 | 0/3 |

Isolated B's direct chemical route is not evidence that recruiting B alone
is a natural puff. Adding other populations recruits a different signed
network; these interventions do not identify the causal inhibitory relay.
A causal inhibition claim requires selective perturbations.

One-second step conditions with threshold events (seeds 1–3):

| Population | Requested rate | Escape peak range | Threshold events |
| --- | ---: | ---: | ---: |
| B | 100 Hz | 0.405–0.453 | 3/3 |
| B | 200 Hz | 0.506–0.555 | 3/3 |
| AB | 200 Hz | 0.404–0.452 | 3/3 |

No JO condition crossed for a 20 ms transient in this sweep. This is neural duration/strength dependence, not physical puff calibration.

B, 100 Hz / 100 ms: total raw spikes over the 1.5 s observation per descending group: DNp02 3–4; DNp04 0–0; DNp11 9–12; DNp10 0–0.

ABCE, 100 Hz / 100 ms: total raw spikes over the 1.5 s observation per descending group: DNp02 0–1; DNp04 0–0; DNp11 0–1; DNp10 23–24.

loom, 100 Hz / 100 ms: total raw spikes over the 1.5 s observation per descending group: DNp02 48–50; DNp04 67–67; DNp11 42–43; DNp10 0–0.

wind, 100 Hz / 100 ms: total raw spikes over the 1.5 s observation per descending group: DNp02 0–0; DNp04 0–0; DNp11 0–0; DNp10 26–28.

The isolated-B 200 Hz transient gives 22–27 left GF spikes; 0–4 right GF spikes. The reconstruction asymmetry matters to the two-cell mean.

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

A/B, 100 ms onset drive, seeds 1–20; a fresh brain uses the same seed at each strength:

| Requested neural rate | Realized population rate during pulse | Escape peak range | Threshold-event fraction |
| --- | ---: | ---: | ---: |
| 25 Hz | 23.1–27.2 Hz | 0.098–0.196 | 0/20 |
| 50 Hz | 45.0–50.9 Hz | 0.095–0.215 | 0/20 |
| 100 Hz | 87.6–95.6 Hz | 0.141–0.315 | 0/20 |
| 200 Hz | 163.4–172.9 Hz | 0.260–0.388 | 0/20 |

Seeds sample model stochasticity, not animal-to-animal variability. For a
0/20 condition, the two-sided 95% exact binomial interval is 0–16.8%; a small
observed count is not proof of a zero biological probability. Realized rates
are below requested Poisson rates because neurons keep their refractory
period. No airflow-strength conversion is known, so this curve cannot be
compared quantitatively with tethered DLM initiation or real free take-offs.

```sh
node packages/brain/scripts/puff.ts --simulate --populations AB --rates 25,50,100,200 --durations 100 --seeds 20 > /tmp/puff-dose.jsonl
```

The script records cumulative spikes at 20 ms, stimulus end, 1,000 ms and
1,500 ms, and realized input firing. Subtraction gives onset/held/recovery
counts. The event threshold is the body's inclusive `escape >= 0.4`.

## Timing control

Onset A/B plus tonic C/E was tested separately, seeds 1–10. A/B receives
a 20 or 100 ms pulse; disjoint C/E receives the same requested rate for 1 s.
This is a recruitment/timing experiment, not a measured antenna waveform.
Existing completeness corrections remain in place.

| Requested rate | A/B pulse | Largest escape peak across 10 seeds | Threshold events |
| --- | ---: | ---: | ---: |
| 50 Hz | 20 ms | 0.209 | 0/10 |
| 50 Hz | 100 ms | 0.166 | 0/10 |
| 100 Hz | 20 ms | 0.221 | 0/10 |
| 100 Hz | 100 ms | 0.221 | 0/10 |
| 200 Hz | 20 ms | 0.175 | 0/10 |
| 200 Hz | 100 ms | 0.198 | 0/10 |

A 0/10 fraction has a two-sided exact 95% upper limit of 30.8%; pooling
strengths would not estimate a single puff probability. Other recruitment
patterns and missing electrical transmission remain untested.

```sh
node packages/brain/scripts/puff.ts --simulate --populations AB+CE --rates 50,100,200 --durations 20,100 --seeds 10 > /tmp/puff-temporal.jsonl
```

## Validation

The branch merged `origin/dev` at `1ebc3a446892349e88d1ff1dbf7c719f2d2ca3f2`
with merge commit `cecaab0d5ef50a64d837e592cd6160fe31468846`. Relative to
that dev revision, production brain/native/body/tool code and CPU budgets
are unchanged. This PR adds one research write-up, machine-readable numerical
and provenance summaries, two Node research scripts and a README pointer.
No behaviour change is proposed here.

At the clean merge commit, with the real connectome available:

- `npm test`: exit 0. Main suite **867 passed, 0 failed, 4 skipped** out of
  871 tests, including real-connectome behaviour/fingerprint and native and
  committed-WASM parity. The four optional skips are three anatomy/Feather
  checks (sidecar absent) and a byte-for-byte WASM rebuild (SDK absent).
- Budget suite: **2 passed, 0 failed, 2 skipped**. Fallback swoop and fly-update
  checks passed. Swoop-through-eyes and brain construction/run budgets each
  exhausted three contention attempts and skipped locally under dev's
  `measureBudget` policy; their reference medians were 4.96 and 4.97 ms,
  above the local 4.8 ms acceptance limit. Those CPU budgets are **unmeasured**,
  not demonstrated passes. Executed functional throws still recorded 8/8
  take-offs with the eyes open and 6/6 through the fallback loom. No acceptance
  bound was changed by this PR.
- `npm run typecheck` and `npm run lint`: exit 0.
- No browser e2e flow changed; no server, browser or simulator was needed.

The provenance summary records the clean tested commit/tree, commands, exit
statuses and log hashes. The earlier branch, before dev's contention policy
landed, had all-senses measurements of 0.597 and 0.566 CPU s/s against 0.5.
Those remain historical failures, not evidence of current compliance or
proof of overload causation. A quiet-machine CPU measurement is still useful;
readiness does not turn a contention skip into a pass. GitHub CI was not
waited on, following the owner's process instruction.

Heavy runs used an owned shared slot for at most nine minutes at a time,
with the process group suspended while releasing a slot and taking the
required two-minute cooldown if needed. No local process or device is left
running by this study.

## Matched twenty-seed control cohort

A fixed 100 Hz, 100 ms A/B condition is compared with sham, LPLC2/LC4
positive control and the same pulse plus a one-second C/E step, seeds 1–20.
The pre-stimulus resting state is matched by seed. Earlier three-/ten-seed
cohorts overlap the expansions and are not extra independent replicates.

| Condition | Escape peak range | Events >= 0.4 | Trials with any GF spike in first 100 ms | Mean excess early GF spikes, paired to sham (approximate 95% bootstrap interval) |
| --- | ---: | ---: | ---: | ---: |
| rest | 0.000–0.167 | 0/20 | 4/20 | reference |
| AB | 0.141–0.315 | 0/20 | 20/20 | 8.25 (7.60–8.90) |
| AB+CE | 0.055–0.221 | 0/20 | 20/20 | 1.50 (1.15–1.85) |
| loom | 1.000–1.000 | 20/20 | 20/20 | 65.05 (64.65–65.45) |

GF activity is distinct from this rate-based command. An offline rule
calling any GF spike an escape also flags sham trials; it is a diagnostic,
not a proposed decoder or physical flight replay. Counts are cumulative,
not sub-millisecond event times. No weight, threshold or mapping changed.

The positive control crossed at 10–20 ms. Condition fractions and paired spike intervals describe model-seed
uncertainty, not biological take-off probabilities. The paired percentile
bootstrap draws twenty seed differences with replacement, 20,000 times per
condition, using `mulberry32(1)`. Its sorted endpoints are indices 499 and
19,500. Coverage is approximate. The executable summarizer reproduces it.

```sh
node packages/brain/scripts/puff.ts --simulate --populations rest,loom,AB+CE,AB --rates 100 --durations 100 --seeds 20 > /tmp/puff-matched.jsonl
```

## Regenerating the summaries

[`summarize-puff.ts`](../packages/brain/scripts/summarize-puff.ts) consumes
JSONL captures without loading or simulating the connectome. It regenerates
the two CSV summaries and the paired differences/intervals. Give captures in
the desired row order; identical condition summaries are emitted once, while
conflicting duplicates fail. The cohort size is part of the condition key,
so expanded trials never overwrite a smaller cohort or get pooled with it.
Historical empty sham inputs labelled with a requested rate are normalized
to zero drive. Their zero-neuron membership is checked.

Retain the exploratory captures as `puff-sim.jsonl` and `puff-zones.jsonl`
using the reproduction commands, and redirect the dose and timing commands
above to `puff-dose.jsonl` and `puff-temporal.jsonl`. Capture the matched
cohort with:

```sh
node packages/brain/scripts/puff.ts --simulate --populations rest,loom,AB+CE,AB --rates 100 --durations 100 --seeds 20 > /tmp/puff-matched.jsonl
node packages/brain/scripts/summarize-puff.ts responses /tmp/puff-sim.jsonl /tmp/puff-zones.jsonl /tmp/puff-dose.jsonl /tmp/puff-temporal.jsonl /tmp/puff-matched.jsonl > /tmp/puff-results.csv
node packages/brain/scripts/summarize-puff.ts wiring /tmp/puff-wiring.jsonl > /tmp/puff-wiring.csv
node packages/brain/scripts/summarize-puff.ts paired /tmp/puff-matched.jsonl > /tmp/puff-paired.json
```

The retained captures reproduce all **148 response rows**, all **720 wiring
rows**, and all three paired bootstrap intervals. The CSVs use six-decimal
rounding; the paired calculation uses the unrounded trial counts. These
regeneration checks run without a heavy simulation sweep. They verify the
summary transformation; physiological validity still requires measurements
of a real puff and its sensory recruitment.

## Capture provenance and replay

The [provenance summary](puff-startle-provenance.json) identifies every
response and wiring capture used here, all taken from clean merge commit
`cecaab0d5ef50a64d837e592cd6160fe31468846`. Each JSONL header records Node,
architecture, arguments, probe hash, all 19 runtime source hashes and the
packed dataset hash. Raw and numerical-payload hashes are supplied; payload
hashing omits the changing provenance header. The supplied commands and
summary script reproduce the values without relying on an unrecorded probe
revision. This certifies the current sweep, not a complete archived operating
system or a physical-flight replay.

This rerun covers the full exploratory grid, the four-strength twenty-seed
A/B expansion, six timing-control conditions and the matched twenty-seed
cohort. The older captures were superseded rather than retroactively assigned
source metadata. Model RNG samples overlap across conditions/cohorts and are
not pooled as independent animals.

## Compatibility with the merged senses

Antenna contact #114 changes when the **body** reports `bump`: a wall held
off by the forelegs or empty space beyond a table edge no longer counts as a
push. It does not change the JO-C/E selector or `wind` selector. This isolated
brain protocol holds `bumpLeft = bumpRight = 0`, so it does not simulate those
contacts. Its result cannot diagnose grooming at a particular wall.

Grounded/wingbeat #68 is present in both the initial study base and this merge:
`grounded` drives the 13 leg campaniform neurons, and `wingbeat` the other 413.
The experiment uses `RESTING_SENSES`: grounded true, wingbeat zero, eyes shut,
all other external senses zero, hunger omitted (the brain defaults to 1), and
optional clock/sleep fields omitted (zero).
Thus it describes the awake, no-clock resting operating point, not the game's
night-time sleep state. No protected sense was edited.

The merged clock/sleep support appends internal-state input groups. At zero
state their rates are zero, but the research inputs subsequently added by the
probe receive different RNG indices. The numerical sweep was therefore
rerun on the merge; no claim of byte-identical stimulated trajectories across
the two model revisions is made. Wiring counts remain the same chemical
connectome. The conclusion concerns the tested recruitment/decoder, not
absence of any real-fly puff pathway.
