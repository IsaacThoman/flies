# Olfaction in the male CNS model

This study asks whether independently identified olfactory receptor neurons
(ORNs) can support an honest smell sense. Its first round, after the second,
used the TypeScript brain unchanged. In its [second round](#second-round-the-orns-as-recorded)
the ORNs answer the world's odorants as they were recorded, and the brain has
an `odor` sense ([brain README, Smell](../packages/brain/README.md#smell));
nothing in the game's world smells.

**Gate 3 passes; gate 2 still fails, so no odour enters the world.** Odour at
one antenna turns the fly toward it in 10 of 10 held-out seeds, and toward the
stronger of two. Five-second pulses still leave the commands more than 0.05
from a paired control 60 s later in 44 of 75 trials, and matched bristle pulses
in 39 of 75, with no population, readout or cell left changed. One forced spike
almost never moves the commands, so the endpoint is not one no input could pass.

## Second round: the ORNs as recorded

The [second-round protocol](olfaction-gates-protocol.md) was committed before
any measurement it describes, and amended once, before the measurements on the
configuration it names. Raw outputs stay outside git, as in the first round.

### The first round, again, on today's brain

Slow neuromodulation (#198), the taste neurons chosen by what they are (#186)
and the transmitter fixes since (#188) changed the brain after the first round,
so both of its assays ran again on `dev` at `6dab55a0`, unedited. Nothing
material moved. DM1 at 100 events/s still brings the projection neurons to
2.15 Hz and the lateral horn to 1.58 Hz on average, the lateral horn is graded
at every step in every seed, and 20 of 75 pulses fail the one-second command
bound (28 in the first round). In the recovery follow-up, pinned odour pulses
fail it in 42 of 75 trials and matched bristle pulses in 42 of 75; the
calibration's drift is the first round's to four places (pinned walk/turn
0.1247/0.1218, wandering 0.6013/0.5964), so again unqualified, and again no
population, late readout or cell stays changed.

### What changed in the fly

Each glomerulus's ORNs now answer ethyl acetate, acetic acid, ethanol, isoamyl
acetate and CO₂ as their receptor or neuron was recorded answering them, at
each antenna apart, and the left antenna's less completely traced ORNs count
their synapses as the right's do (brain README, Smell; the operating point).
The table also holds each glomerulus's recorded resting rate. On the model with
the ORNs firing at those rates, gate 3 was measured first and passed (below).
Before anything else was measured, the brain's tests found what that resting
firing does here: the antennal lobe's broad local neurons, each summing about
30,000 ORN synapses in a single compartment, fire at 250–310 Hz, most projection
neurons fall silent, and the inhibition reaches as far as the backing pathway
(touch's backing at night 0.24 → 0.06). That is the model's missing dendritic
compartments and presynaptic gain control, which the first round's limits
anticipated, not the recordings. Amendment 1 made the model under test the same
model with the ORNs silent at rest, before any of its measurements. Every
result below is on it unless it says otherwise.

### Gate 2, with smell

The first round's assay on this model: DM1 at 100 events/s 2.42 Hz in the
projection neurons and 1.75 Hz in the lateral horn; the lateral horn graded at
every step in all 15 sequences; 24 of 75 pulses fail the command bound. CO₂'s
glomerulus now raises backing a little (`back` +0.089 at 100 events/s, +0.026 on
`dev`): its left neurons count for what the right's do.

The recovery follow-up on this model, 226 runs:

| Context, pulse | Trials | Final 1 s command failures | Late population or readout failures | Persistent-cell flags | Final 5 s means within 0.05 |
|---|---:|---:|---:|---:|---:|
| Pinned, olfactory | 75 | 44 (turn 36, walk 14, back 1) | 0 | 0 | 75 |
| Pinned, bristle | 75 | 39 | 1 readout | 0 | 74 |
| Wandering, olfactory, 100 events/s | 15 | 1 | 0 | 0 | 15 |
| Wandering, bristle, 100 events/s | 15 | 1 | 0 | 0 | 15 |

The largest residual is turn +0.168 (pinned DM5 at 200 events/s, seed 21). The
pinned failures by seed are 23, 4 and 17 of 25.

**What the endpoint measures (Part B).** Thirty runs forced one spike in one
neuron at the pulse's onset, the lowest body ID of each glomerulus's ORNs and
of each matched bristle set, on seeds 21–23; every one fired. Two of the 30
fail the 0.05 bound, and every command's median final-second residual is
exactly 0: one spike usually changes no later spike at all, and the pair stays
identical. So under the protocol's rule the original endpoint stands as the
gate (fewer than half failed); it is not an endpoint no input could pass. The
pulses' residuals are larger than the single spikes' in walk, turn, back,
escape, wings and groom (one-sided Mann–Whitney, p from 7 × 10⁻⁴ down to
2 × 10⁻¹⁴, each under 0.05/8).

**Decision: gate 2 fails.** Five seconds of odour, or of touch on the head's
bristles, leaves the steering and walking commands on another course a minute
later, while nothing the populations, readouts or cells show stays changed.
Part D, the plume, was not run, and no odour is in the world.

### Gate 3, steering

Unchanged from the protocol: the brain alone, standing, eyes shut, the wandering
background on; 5 s of odour after 20 s of rest; T is half the turn with the
odour on the right less the turn with it on the left. On the model under test,
seeds 41–50:

| Condition | T, mean (95% interval) | Seeds the predicted way | Verdict |
|---|---|---:|---|
| P1: ethyl acetate 1 at one antenna | 0.104 (0.084–0.125) | 10 | toward: **passes** |
| S1: CO₂ 1 at one antenna | 0.015 (−0.004–0.033) | 4 | not away: fails |
| S2: ethyl acetate 0.25 | 0.003 (−0.002–0.007) | 5 | fails |
| S3: ethyl acetate 1 against 0.5 | 0.077 (0.067–0.086) | 10 | toward the stronger: passes |
| S4: one antenna's DM1 ORNs +100 Hz | 0.055 (0.034–0.077) | 10 | toward: passes |
| S5: isoamyl acetate 1 | 0.021 (0.010–0.033) | 10 toward | no prediction |

On the model with resting firing, seeds 31–40: P1 0.077 (0.064–0.090, 10 of
10), S1 0.015 (2 of 10 away), S2 0.020 (8 of 10, passes), S3 0.037 (10 of 10),
S4 0.032 (10 of 10), S5 0.099 (10 of 10). Gate 3 passes on both. CO₂ is not
avoided by turning on either, though on the model under test it backs the fly
a little (`back` +0.035 over the 5 s).

### The mushroom body

Odours at full strength at both antennae fire 7.5% of the Kenyon cells
(ethyl acetate), 5.0% (isoamyl acetate), 2.8% (CO₂), 1.7% (ethanol), 1.1%
(acetic acid), and 12.2% all five at once, alike in seeds 1–3; none fire
without odour (`packages/brain/scripts/olfaction-kc.ts`). That is a fly's sparseness, about
5–10% (brain README, Smell).

### The next experiment

Gate 2's failure is a trajectory difference that one spike doesn't start and a
five-second pulse of either sense does. Perturbations of graded size from
identical checkpoints (1, 10, 100, 1,000 forced spikes, olfactory and bristle)
would find where two runs part and whether the parting grows; recovery could
then be judged against the parting the smallest effective perturbation leaves.
That must be preregistered as such: this round's rule didn't allow it.
Separately, a resting antennal lobe needs local neurons that don't saturate:
compartmentalised local neurons or presynaptic inhibition, from measurements.

### Reproduce

From the repository root, the connectome, anatomy and annotations in place:

```sh
node packages/brain/scripts/olfaction.ts --part simulate --seeds 1 > /tmp/olfaction-seed1.json
# ... seeds 2 and 3, then olfaction-summary.ts as in the first round; the recovery follow-up as below.
node packages/brain/scripts/olfaction-divergence.ts --out /tmp/olfaction-kicks --seeds 21,22,23
node packages/brain/scripts/olfaction-divergence.ts --out /tmp/olfaction-kicks --reduce --controls /tmp/olfaction-controls
node packages/brain/scripts/olfaction-steering.ts --out /tmp/olfaction-steering
node packages/brain/scripts/olfaction-steering.ts --out /tmp/olfaction-steering --reduce
node packages/brain/scripts/olfaction-kc.ts
```

The steering runs on seeds 41–50 by default. The model with resting firing is
commit `5c5eac20`, where the same script ran seeds 31–40.

## First round

Everything from here on is the first round as it was recorded, on `dev` at
`c53a64c0`, before the ORNs answered anything.

The questions are sequential gates: identify inputs from annotations; establish
stable, graded, reversible responses with defensible valence; establish antenna
steering; only then build a flagged plume prototype. The [protocol and review
rubric](olfaction-protocol.md) were committed before stimulation measurements.

## The data identifies the inputs

`node packages/brain/scripts/olfaction.ts --part audit` joins the packed wiring
to the [FlyEM male CNS v1.0 public annotation table](https://male-cns.janelia.org/download/)
by body ID. It checks the pinned annotation SHA-256 before decoding and checks
the anatomy sidecar against the actual connectome bytes. Source and attribution:
**FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0)**.

| Input | SHA-256 |
|---|---|
| connectome.bin | `51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c` |
| anatomy.bin | `acd8f7a3d3ec2c631b762098cb6ff186b35cb8ee9803a3fb885e5697b643bbf9` |
| body-annotations-male-cns-v1.0-minconf-0.5.feather | `2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2` |

Of 166,700 packed neurons, **2,639** are `cb_sensory` / `olfactory`:
2,635 have exact `ORN_<glomerulus>` types, spanning 53 labels, and four have no
type. All 2,639 join to the 211,577-row release table, with zero disagreements
in type, class, superclass, root side or entry nerve. This is consistency between
exports of the same dataset, not an independent genetic validation of cell type.
The release's `receptorType` is blank for these cells; receptor genes below come
from papers, not that field. No type or side is inferred from a command response.

| Exact type | Neurons | Root left | Root right | Root unknown | Entry nerve |
|---|---:|---:|---:|---:|---|
| ORN_DM1 | 74 | 35 | 39 | 0 | AN |
| ORN_VA2 | 83 | 33 | 41 | 9 | AN |
| ORN_DM2 | 54 | 24 | 29 | 1 | AN |
| ORN_DM4 | 32 | 16 | 15 | 1 | AN |
| ORN_DA2 | 48 | 21 | 20 | 7 | AN |
| ORN_V | 55 | 16 | 39 | 0 | AN |
| ORN_DM5 | 35 | 10 | 18 | 7 | AN |

These are reconstruction counts, not an estimate of the living animal's neuron
numbers. Antenna identity is `rootSide`, which the anatomy retains, not the
packed column labelled soma side. Sensory somata are outside the reconstructed
CNS. An unknown side stays unknown. Bilateral stimulation includes it; a future
antenna comparison must exclude it explicitly. The inventory output includes
every glomerulus, every body ID and both side columns, so these selections are
reproducible without a hand-maintained root-ID list.

## What those channels mean in real flies

**DM1 and VA2 are the strongest attraction candidates.** Semmelhack & Wang
(2009), Figures 1–3, found low-concentration vinegar responses in DM1, DM2, DM4,
VA2, DP1m and VM2. Their silencing and receptor rescue assays establish attraction
for DM1 (Or42b) and VA2 (Or92a). Response to vinegar alone does not establish an
attraction channel for DM2 or DM4. Figures 4–5 identify DM5 as the additional
channel responsible for reduced attraction at stronger vinegar; this is not a
claim that any activation of DM5 causes universal aversion. Their behaviour assay
used starved females; transfer to this male model is a hypothesis, not a matched
sex/state replication.
[Paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC2702439/),
[DOI](https://doi.org/10.1038/nature07983).

**DA2 is the geosmin avoidance comparator.** Stensmyr et al. (2012), Summary
and Figures 2–4, identify Or56a ORNs projecting to DA2 and geosmin-selective PNs.
DA2 activation is necessary and sufficient for the avoidance they measure;
Figures 5–6 show suppression of attraction, feeding and egg laying. This supports a harmful-food
comparator, not a numerical geosmin concentration-to-spike function here.
[Paper record](https://pubmed.ncbi.nlm.nih.gov/23217715/),
[author manuscript](https://pure.mpg.de/rest/items/item_1577953_11/component/file_1577957/content),
[DOI](https://doi.org/10.1016/j.cell.2012.09.046).

**V is the CO₂ avoidance comparator.** Suh et al. (2004), Figure 3,
identify the CO₂-sensitive V glomerulus and Gr21a-positive neurons, and show
that blocking their transmission blocks avoidance. That is a defined assay's
avoidance circuit, not a claim that CO₂ always means danger in every context.
[Paper](https://www.nature.com/articles/nature02980),
[DOI](https://doi.org/10.1038/nature02980).

**Rate is not concentration.** Hallem & Carlson (2006), Figure 1 and Tables
S1–S2, measure 24 receptor responses, including excitation and inhibition. Table
S1 reports, for example, an ethyl-butyrate response of 193 spikes/s for Or22a
and spontaneous activity of 4 spikes/s. Responses subtract diluent activity;
they are not absolute Poisson input rates. Crucially, the table's 24 columns
do **not** include Or42b, Or92a or Or56a, and are not a CO₂ response matrix.
The 10–200 events/s sweep below uses its measured response scale, not invented
exact rates for those receptors. It is a channel-stimulation assay, not a
reproduction of vinegar, geosmin or a natural fruit's receptor pattern.
[Paper](https://www.sciencedirect.com/science/article/pii/S0092867406003631),
[original supplement](https://ars.els-cdn.com/content/image/1-s2.0-S0092867406003631-mmc1.pdf),
[DOI](https://doi.org/10.1016/j.cell.2006.01.050).
Supplement SHA-256: `de4b020b4a42db327800ee856130adfc3857d6695657477cd1feea3b9dd796c2`.

## The anatomical routes

The audit follows direct edges from each exact ORN group to annotated `ALPN`
cells, then from those reached PNs to `LH*` central-brain cells and separately
to `Kenyon_Cell`, then from reached Kenyon cells to `MBON`. Each column below
is a sum of raw packed synapses on that stage's connected pairs; every pair
is counted once within a stage, with no threshold. Stages are **not** multiplied
or added to give a path strength. A single weak off-channel PN edge can broaden
later reached sets. These are possible routes, not glomerulus-specific functional
connectivity or independent channels. The JSON reports target counts and types
for inspection, including the cognate PN labels.

| ORN group | ORN → PN | PN → LH | PN → KC | KC → MBON | LH → DN | MBON → DN |
|---|---:|---:|---:|---:|---:|---:|
| DM1 | 16,426 | 28,744 | 36,083 | 111,979 | 4,026 | 2,940 |
| VA2 | 13,665 | 23,893 | 30,341 | 123,688 | 9,326 | 2,347 |
| DA2 | 5,331 | 19,815 | 30,654 | 139,703 | 6,548 | 3,793 |
| V | 8,742 | 14,403 | 6,271 | 35,315 | 5,275 | 2,203 |
| DM5 | 4,222 | 2,999 | 5,899 | 36,719 | 3,494 | 2,160 |

`DN` here is the exact superclass `descending_neuron`, not every cell included
in the game's display regions. `LH*` is the dataset's named population, not all
neurons with any LH arbor. The audit also prints routes via one additional
central-brain intermediary from LH or MBON to DNs. Synapses are anatomical,
unsigned, collapsed across neuropils and capped at 65,535 per pair in the packed
file. The model uses transmitter signs, saturation and its documented fixes;
these sums do not describe those effective weights.

## Stimulation assay

The script appends five diagnostic ORN inputs in a fixed order to the existing
`FlyBrain`. A zero-rate control adds the same groups; input streams already in
the model keep their seeds. No readout neuron is driven. Every condition starts
with a fresh brain: 2 s rest, 5 s drive, 5 s washout, 10 ms ticks. Seeds 1–3,
five rates per group, and a control give 78 trials, 936 simulated seconds.
The standard resting senses and spontaneous visual background remain on;
eyes are shut, and there is no world or body feedback. Actual ORN firing is
counted, because input events during a refractory period are discarded.

All eight commands (walk, turn, back, feed, groom, escape, wings and sing), all
nine neuronal readouts (steering has two), population rates and region peaks
are recorded in 1 s bins. Whole-population means include silent neurons. The
summary retains individual seeds, time-matched stimulus-minus-control values,
and washout failures against the protocol's 1 Hz / 0.05 tolerances.

### Recorded response

All 78 trials are complete (936 simulated seconds), with seeds 1–3 and no
parameter or input-population changes. At 100 events/s, rates averaged over
the five-second drive, then equally over seeds, are:

| Group driven | Actual driven ORN Hz | ALPN Hz | LH Hz | KC Hz | MBON Hz | DN Hz |
|---|---:|---:|---:|---:|---:|---:|
| DM1 | 91.21 | 2.15 | 1.58 | 0.83 | 1.53 | 0.28 |
| VA2 | 90.86 | 1.09 | 1.52 | 0.51 | 0.56 | 0.39 |
| DA2 | 90.59 | 1.98 | 0.46 | 0.001 | 0.02 | 0.29 |
| V | 90.40 | 2.00 | 1.84 | 0.13 | 0.53 | 0.39 |
| DM5 | 90.89 | 1.37 | 0.22 | 0.003 | 0.01 | 0.29 |

Population sizes are ALPN 686, LH 2,028, KC 4,064, MBON 97 and DN 1,314;
the means include silent cells and cannot exclude a small active subgroup.
Propagation clearly differs by channel. The lateral horn's whole-population
mean is graded at **every adjacent rate step in every seed**, not just in this
average (15 monotonic five-point sequences):

| Input events/s | 10 | 25 | 50 | 100 | 200 |
|---|---:|---:|---:|---:|---:|
| DM1: LH Hz | 0.153 | 0.501 | 0.979 | 1.584 | 1.927 |
| VA2: LH Hz | 0.105 | 0.437 | 0.925 | 1.516 | 1.753 |
| DA2: LH Hz | 0.002 | 0.038 | 0.174 | 0.464 | 0.861 |
| V: LH Hz | 0.073 | 0.396 | 1.008 | 1.844 | 2.705 |
| DM5: LH Hz | 0.004 | 0.034 | 0.097 | 0.217 | 0.369 |

All commands are also measured. At 100 events/s, mean stimulus-minus-control
commands over the drive, averaged equally over seeds (turn negative is left):

| Driven | walk | turn | back | escape | wings | groom | feed | sing |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| DM1 | 0.006 | −0.070 | −0.001 | 0.000 | −0.001 | 0 | 0 | 0 |
| VA2 | −0.022 | −0.015 | 0.002 | −0.006 | −0.001 | 0 | 0 | 0 |
| DA2 | −0.014 | 0.013 | 0.003 | 0.000 | 0.000 | 0 | 0 | 0 |
| V | −0.024 | 0.025 | 0.023 | −0.007 | −0.001 | 0 | 0 | 0.003 |
| DM5 | −0.006 | 0.009 | 0.002 | −0.001 | −0.002 | 0 | 0 | 0 |

These are commands without a spatial task. A reduction in walking or a fixed
turn is not proof of attraction or avoidance. For example, DM1's walk change
ranges from −0.016 to +0.034 across seeds at 100 events/s; V consistently raises
backing a little (+0.016 to +0.031), while DA2 does not show an equally clear
avoidance command. Both antennae are driven; DM1's leftward turn cannot be
called turning toward an odour. The summary reducer regenerates compact results containing every rate and seed, across-seed means/ranges, all commands, readouts,
peaks and washout differences. The unabridged reducer additionally retains
each seed's 1 s time course.

**Gate 2 fails its preregistered command-recovery test: 28 of 75 stimulated
trials fail**, even though all 75 pass the watched-population recovery test.

| Seed | Stimulated trials failing recovery | Largest final command difference, magnitude | Largest final population difference, Hz |
|---|---:|---:|---:|
| 1 | 16/25 | 0.131399 | 0.061644 |
| 2 | 12/25 | 0.105376 | 0.133181 |
| 3 | 0/25 | 0.012500 | 0.023592 |

Final means refer to the last washout second, 4–5 s after offset, compared with
the same seed's time-matched control. The worst residual is turn −0.131399 for
DM5 at 25 events/s, seed 1. All driven ORN groups are silent then. Watched region
mean rates peak at at most 6.208 Hz during stimulation; the active set reaches
85,367 neurons across all trial windows. These finite, short responses and
quiet population washouts do not look like a population runaway, but cannot
exclude high rates in a small subgroup or establish long-term stability.

A failed command tolerance does **not** prove persistent olfactory activation:
a transient input can change a nonlinear network's subsequent spontaneous
trajectory. The protocol used fixed paired-control tolerances, not a calibrated
noise distribution. Nor did it specify a validated quantitative valence endpoint:
this bilateral assay cannot establish valence even if recovery passes. These are
limits of the experiment, not reasons to loosen its criteria after measurement.
No claim that real flies, or a better olfactory model, lack this behaviour follows.

Gate 1 holds for selecting annotated inputs. Gate 2 fails the stated recovery
criterion; valence remains unestablished. Gates 3 and 4 have not been run.
No plume prototype is included.

## Recovery-control follow-up

Interpretation note: the archived protocol's comparator table uses “persistence”
as shorthand for failure of its recovery endpoint. Those outcome labels alone
do not establish sustained neuronal activation; the separate late-population,
readout and cell tests determine what activity remains. The protocol is retained
verbatim because its pre-measurement text is part of the locked assay hash.

The [prospective control protocol](olfaction-recovery-protocol.md) was reviewed
by three independent blind reviewers, revised without follow-up measurements,
and assessed again by three fresh reviewers plus a relative regression audit.
The scientific design was judged conditionally adequate for a descriptive
fixed-seed screen. Implementation discrepancies were corrected before
calibration and covered by helper tests; no approval of observed recovery is
claimed. Review scores and decisions are in the PR description only.

The follow-up uses fresh evaluation seeds 21–23, separate unstimulated calibration
seeds 101–120, 20 s settling and a 60 s washout. It compares a wandering background
with a seed-specific mean-matched constant background, pins hunger and all sleep/
clock fields, records drift between equal windows in unstimulated runs, and
compares each olfactory input to an independently selected, drive-matched
non-olfactory bristle perturbation. It retains every condition and distinguishes
primary recovery, persistent-cell/readout changes and permission to test steering.
The pre-measurement implementation is commit `fa7231a1` (rebased without assay
content changes as `88bf9e03`). Source, design, analysis and input hashes bind
calibration and evaluation.

The unstimulated calibration is complete: 40 runs, 20 seeds per context. Its
nearest-rank 95th-percentile absolute walk/turn drift is 0.1247/0.1218 with the
background pinned, and 0.6013/0.5964 with the background wandering. Wandering
wings drift is 0.0808; the remaining practical tolerances are 0.05. Both contexts
exceed the prospective 0.1 ceiling. Their broad drift benchmarks therefore grant
**no tolerance relaxation**: every evaluation command still uses 0.05. A wide
within-run drift range is not a null distribution for the difference between
coupled trajectories and cannot establish that arousal caused a residual.

The calibration file SHA-256 is
`8aa7df44a4aafb14286ecf31eb9c585065808b50dc58c0d80f9b150b38f44738`.
The acquisition/helper/protocol assay hash is
`f594b36cb020db0e8f73ccfbfbb6f039fe75c4be5443b187af4b4127b84e70e5`;
the separately locked reducer hash is
`c78a0cf99ee10dc7623adddbd077ac9402c15ce14e752bd077ea46a6a1d048d9`.
The 75 pinned olfactory trials are complete. **Forty fail the original command
bound after 60 s washout**, despite fixed exogenous background rates:

| Seed | Final command failures | Commands exceeding 0.05, trial counts | Largest absolute residual |
|---|---:|---|---|
| 21 | 21/25 | turn 20, walk 4 | turn +0.173903, V at 10 events/s |
| 22 | 1/25 | walk 1 | walk −0.050290, DM1 at 200 events/s |
| 23 | 18/25 | turn 11, walk 11, back 2 | turn +0.132878, DM5 at 100 events/s |

Command counts overlap within trials. The largest turn residual exceeds the
calibrated pinned turn-drift benchmark too (0.121762), although that broad
benchmark is not an accepted tolerance. The initial 28/75 and follow-up 40/75
counts use different seeds, settling and background contexts; they are not a
paired estimate of the effect of extending washout.

All **226 follow-up runs** are complete: 40 calibration and 186 evaluation,
19,662 simulated seconds including settling. The locked reduction verifies
identical pre-stimulus observations, identical exogenous state trajectories in
each pair, complete condition matrices, source/calibration hashes and every
binary cell-count hash. Results use the original 0.05 command bound because
both drift calibrations were prospectively disqualified.

| Context, pulse | Trials | Final 1 s command failures | Final population failures | Late 5 s readout failures | Persistent-cell flags |
|---|---:|---:|---:|---:|---:|
| Pinned, olfactory | 75 | 40 | 0 | 0 | 0 |
| Pinned, bristle | 75 | 46 | 0 | 1 | 0 |
| Wandering, olfactory, 100 events/s | 15 | 1 | 0 | 0 | 0 |
| Wandering, bristle, 100 events/s | 15 | 0 | 0 | 0 | 0 |

Every population is also within 1 Hz in each of the three late five-second
blocks. The 15 pinned LH dose sequences still rise at every adjacent strength.
All 180 pulses have final-five-second command means within 0.05; the largest
olfactory one is 0.048127 (turn, pinned DA2, 25 events/s, seed 21). That secondary
window cannot replace the predeclared failing final-one-second endpoint.
The endpoint is therefore sensitive to sampling window, with fluctuating
trajectory differences, rather than evidence of tonic olfactory activation.

### What remains different, and where

Pinned olfactory failures involve turn in 31 trials, walk in 16 and back in
two (counts overlap); no other command fails. The wandering olfactory failure
is walk +0.056131 for DM1 at 100 events/s, seed 21. In the largest pinned case
(V, 10 events/s, seed 21), final-second DNa02-left is 5.054298 Hz below control
and DNa02-right 1.901834 Hz above it, producing turn +0.173903. Their final-five-
second differences are only −0.996798/+0.217205 Hz. The driven ORNs are silent
at that endpoint. The largest pinned olfactory final population difference is
0.103501 Hz in DNs, comfortably inside the declared 1 Hz bound.

Every olfactory late-five-second readout meets its individual limit: the
largest normalized difference is 0.893811 of its bound (DNa02-left +1.787623 Hz,
pinned DM1, 10 events/s, seed 23; bound 2 Hz). The sole bristle readout failure
is DNa02-right −2.043243 Hz (pinned DM1, 200 events/s, seed 23); that trial also
fails a command bound. No cell has an absolute excess or suppression of 20 Hz
in all three late blocks. The largest olfactory final-block cell difference is
only +4.8 Hz: body 10205, `GNG003`, central-brain-other, pinned DM1 at 10 events/s,
seed 23. Its three block differences are −0.2, +1.2 and +4.8 Hz. For the worst
turn case, the largest final-block cell difference is `AVLP449`, body 523842,
left ventrolateral protocerebrum: −2.4 Hz, preceded by −0.4/+1.8 Hz. These are
descriptive extrema across the recorded cells, not identified memory circuits.

Thus the strict mismatch remains in fluctuating descending/command trajectories,
particularly steering, while sustained olfactory, population, individual-readout
and sparse-cell activation are not demonstrated within these windows and bounds.
No inference about unmeasured slow adaptation or longer times follows.
These averaging windows and the coarse cell cutoff also leave smaller sustained
changes and brief high-rate bursts unresolved.

### Perturbation and drift attribution

Expected first-hop weight ratios range from 1.0068 to 1.1548. Measured emitted-
spike-weighted ratios span 0.979150–1.228508; **89/90 pairs qualify**. Pinned DM1,
10 events/s, seed 22 is unqualified (1.228508), stays in the recovery data and
cannot support modality attribution. No input set is rematched or dropped.
Among qualified pinned pairs, 32 have both pulses fail recovery, 20 both recover,
eight only olfaction fail and 14 only bristle fail. Among wandering pairs,
14 both recover and one only olfaction fails. These are descriptive outcomes,
not independent replicate counts or proof of a common mechanism; bristle sets
are reused between glomerulus-specific comparisons. Matching absolute first-hop
drive does not match target topology, excitation/inhibition balance or downstream
susceptibility.

No channel/rate/context meets the prospective modality-excess rule for the same
command in every evaluation seed. The reducer retains every signed residual,
normalized maximum, paired contrast, across-seed mean/range and 100-Hz background
interaction; no pooled p-value is inferred. This does not prove that modalities
have identical effects. It establishes that command mismatch also follows these
matched non-olfactory perturbations and is not an olfaction-exclusive failure.

For the broad, **unqualified** drift benchmark alone, 66/75 pinned olfactory
pulses and 67/75 bristle pulses lie within all practical command bounds; all
wandering pulses do. Nine olfactory pinned pulses still exceed that broad
benchmark. Merely being within natural drift cannot attribute the paired
residual to arousal. Pinning rate variation does not remove the mismatch;
hunger and clock/sleep values cannot drift in this open-loop protocol. The
constant-background condition actually has more one-second residual failures
than the wandering 100-Hz diagnostic subset. Its network susceptibility differs,
so this is not an isolated causal estimate of an arousal contribution.

**Decision:** recovery-qualified gate 2 does not pass. The result is a failed
predeclared command-window criterion, not evidence of sustained olfactory firing
or an olfactory-specific defect. Gate 3 and the plume remain untested. This PR
is a reproducible research record, with no change to native/default behaviour.
The follow-up protocol's conditional permission to test steering is a diagnostic
next assay, not validation of the original gate's missing valence endpoint.
Any future study must preregister that endpoint before claiming that full gate
or authorizing a navigation prototype. Nothing advances in this study.

## Limits and the next experiment

The model is a point-neuron rate-input experiment. One ORN spike reaches all
its targets from one membrane state: axonal branch-specific release differences,
receptor transduction, sensillum interactions and stimulus adaptation are absent.
Presynaptic inhibition onto an ORN terminal cannot be represented faithfully by
synapses onto a single whole-cell state. Hallem & Carlson's Table S1 includes
spontaneous ORN firing; this assay starts from the model's silent ORN baseline.
Neuropeptides and receptor-specific hunger gain are absent, and dopamine,
octopamine and serotonin outputs are muted. Consequently, neither state-dependent
odour attraction nor mushroom-body learning/reinforcement is established by a
short fixed-rate response. The existing lateral-LN transmitter override is
especially material to an olfactory assay; this study does not retune it.
Root et al. (2011) directly show that sNPF signalling in Or42b neurons is needed
for starvation-induced food search; a fixed-rate input with no peptide signalling
cannot reproduce that gate. [Primary paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC3073827/).

The model files are those of `dev` at
`c53a64c043cf84c2b7d2d1b7e69d76798ce0b051`; none is edited in this study.
Node v26.12.0 ran the measurements. JSON records the operating point, data
hashes and population sizes. Library defaults, including hunger 1 and the
background's left/right balancing, are retained.

The recovery-control study above tests longer washout, mean-matched background
pinning and a non-olfactory perturbation without changing the measured circuit.
It does not establish population-level reliability from three evaluation seeds.
The next recovery experiment should preregister progressively smaller
perturbations from identical network checkpoints, with shared and independently
reseeded future background streams. That can characterize paired trajectory
divergence directly; within-run drift is not its null distribution. Lock the
windows and analysis before measurement and retain this study's endpoint.
Obtain channel-specific baseline and stimulus rates from the relevant
electrophysiology before claiming natural-odour responses.

Only after gates 2 and 3 independently pass should a maintainer add a separate
opt-in TypeScript experiment: an analytic wind-advected, diffusion-broadened
concentration field per food patch, sampled at two antenna offsets into reused
buffers, delivered through labelled sensory inputs. No direct steering, distance
bonus or food-directed background term is permissible. Keep native/default
behaviour unchanged, predeclare plume constants and food-reach radius/time,
and compare paired trials with odour on/off across held-out seeds and mirrored
source layouts. Report successes over all trials with uncertainty, including
failures; do not choose a plume by navigation success on the reported trials.

For a later steering gate, Borst & Heisenberg (1982), Summary, demonstrate
turning toward higher antennal concentration under their open-loop conditions.
Gaudry et al. (2013), Figure 1, elicit a turn toward unilateral DM1 ORN activation;
their abstract and later experiments show branch-dependent transmitter release.
Synapse-count asymmetry alone cannot reproduce that physiology.
[Borst & Heisenberg](https://doi.org/10.1007/BF00612013),
[Gaudry et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC3590906/).

## Reproduce

From the repository root, with dependencies installed:

<!-- docs-check: generated packages/brain/data/annotations.feather -->
```sh
npm run brain:fetch
curl -fL https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather -o packages/brain/data/annotations.feather
node packages/brain/scripts/olfaction.ts --part audit > /tmp/olfaction-audit.json
node packages/brain/scripts/olfaction.ts --part simulate --seeds 1 > /tmp/olfaction-seed1.json
node packages/brain/scripts/olfaction.ts --part simulate --seeds 2,3 > /tmp/olfaction-seed23.json
node packages/brain/scripts/olfaction-summary.ts --results /tmp/olfaction-seed1.json,/tmp/olfaction-seed23.json > /tmp/olfaction-summary.json
# Append --compact for a compact summary. A partial run needs --partial.
```

For the recovery-control follow-up, choose an empty output directory. Run each
acquisition command until it exits 0; exit 75 is an intentional checkpoint at
the eight-minute batch limit, not a completed matrix. Release the shared slot,
wait at least two minutes, and repeat the identical command to resume. Existing
records and binary cell counts are checked, never silently overwritten. Do not
edit the acquisition/helper/protocol/reducer between calibration and evaluation.

```sh
# Calibration: no stimulus trials may be present when the file is locked.
node packages/brain/scripts/olfaction-controls.ts --out /tmp/olfaction-controls --context pinned --family none --seeds 101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120
node packages/brain/scripts/olfaction-controls.ts --out /tmp/olfaction-controls --context wandering --family none --seeds 101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120
node packages/brain/scripts/olfaction-controls-summary.ts --dir /tmp/olfaction-controls --calibrate /tmp/olfaction-calibration.json
# Evaluation: repeat for each context (pinned, wandering) and family (none, odor, bristle).
node packages/brain/scripts/olfaction-controls.ts --out /tmp/olfaction-controls --context pinned --family none --seeds 21,22,23 --calibration /tmp/olfaction-calibration.json
# Reduction refuses an incomplete held-out matrix or mismatched provenance.
node packages/brain/scripts/olfaction-controls-summary.ts --dir /tmp/olfaction-controls --calibration /tmp/olfaction-calibration.json > /tmp/olfaction-controls-summary.json
# Optional scientific figure (Python 3 with matplotlib; no game dependency).
python3 packages/brain/scripts/olfaction-controls-plot.py /tmp/olfaction-controls-summary.json /tmp/olfaction-controls.png
```

The complete follow-up has 40 calibration plus 186 evaluation runs. Every run
settles for 20 s and records 67 s: 19,662 simulated seconds overall. Its generated
JSON and hashed binary recordings are research outputs, not runtime assets;
no checked-in results file is required by a script. The full reducer retains
all one-second paired time courses, every failure, all qualifying persistent
cells, and the 20 largest final-block cell differences for every pulse.

Simulation and the full repository checks need a `/tmp/flies-heavy/slot-N` on
the shared machine; release within ten minutes and wait two minutes between
batches. Raw input data and full recordings remain outside git. Scripts refuse
different wiring or annotation bytes; reviewing another release needs an explicit
provenance review rather than silently repinning the hash.

## Verification

The branch is rebased onto `dev` including #113, the contention-aware CPU-budget
measurement change. **The full local `npm test` passes:** 894 functional tests
pass, one skips for missing wasi-sdk, none fail; all four serial budgets pass,
with no skips. Brain construction is 188 M5 Pro CPU ms, rest 0.068 CPU s/s,
and all senses together 0.317 CPU s/s against bounds 250 ms / 0.16 / 0.5.
The run finishes in one heavy-work slot without pausing. Earlier contended
budget failures remain in the PR's historical validation record.

Farm lint, typecheck, tvOS typecheck and build pass. Its supported unit suite
reports 887 pass, three skips and no failures; Apple-silicon parity checks and
calibrated budgets are covered locally. The farm wrapper's browser stage was
stopped because these offline tools change no web/e2e behaviour. A separately
queued farm recording check was cancelled before acquiring a slot or collecting
any measurements; every study recording uses the same local Node v26.12.0.

The five helper tests cover percentile ordering, calibration validation, the
strict fallback, exogenous mean determinism and anatomy-only input matching.
Both reducers check protocol completeness and pre-stimulus equality. The
follow-up additionally validates paired exogenous states and hashed late-cell
records. Evaluation validates the locked calibration bytes and embedded drift
derivation; its source-record input-hash manifest requires a separate audit.
Independent reviewers rechecked those calibration input hashes and found no
discrepancy. Model/runtime/native sources and parameters are unchanged; the only
`packages/brain/src` difference from the study's base is the upstream budget
**test** change. No performance bound is relaxed by this PR.

Independent audit scores and comparison keys are recorded in the PR description.
