# Olfaction in the male CNS model

This study asks whether independently identified olfactory receptor neurons
(ORNs) can support an honest smell sense. The game currently drives none of
them. The experiment uses the TypeScript brain, unchanged; no native brain,
world, default behaviour or sound is changed.

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
claim that any activation of DM5 causes universal aversion.
[Paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC2702439/),
[DOI](https://doi.org/10.1038/nature07983).

**DA2 is the geosmin avoidance comparator.** Stensmyr et al. (2012), Summary
and Figures 2–4, identify Or56a ORNs projecting to DA2 and geosmin-selective PNs.
DA2 activation is necessary and sufficient for the avoidance they measure,
and suppresses attraction, feeding and egg laying. This supports a harmful-food
comparator, not a numerical geosmin concentration-to-spike function here.
[Paper record](https://pubmed.ncbi.nlm.nih.gov/23217715/),
[author manuscript](https://pure.mpg.de/rest/items/item_1577953_11/component/file_1577957/content),
[DOI](https://doi.org/10.1016/j.cell.2012.09.046).

**V is the CO₂ avoidance comparator.** Suh et al. (2004), Figures 3–4,
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

The current evidence contains seed 1 of the protocol; replication is needed.
At 100 events/s, mean rates during the five-second drive are:

| Group driven | Actual driven ORN Hz | ALPN Hz | LH Hz | KC Hz | MBON Hz | DN Hz |
|---|---:|---:|---:|---:|---:|---:|
| DM1 | 90.83 | 2.14 | 1.57 | 0.83 | 1.53 | 0.31 |
| VA2 | 90.68 | 1.08 | 1.52 | 0.51 | 0.56 | 0.39 |
| DA2 | 90.35 | 1.97 | 0.46 | 0.001 | 0.01 | 0.31 |
| V | 90.35 | 2.01 | 1.85 | 0.13 | 0.56 | 0.41 |
| DM5 | 91.14 | 1.37 | 0.22 | 0.003 | 0.02 | 0.31 |

Population sizes are ALPN 686, LH 2,028, KC 4,064, MBON 97 and DN 1,314;
the means include silent cells and cannot exclude a small active subgroup.
Propagation clearly differs by channel. That does not establish useful valence.
For DM1 at 100 events/s, command changes against the paired control are walk
+0.034 and turn −0.107; VA2 gives walk −0.019 and turn −0.028. DA2 gives walk
+0.008, turn −0.006 and no backing; V gives backing +0.031. Feeding and grooming
remain zero. These are commands with no spatial task, and neither a reduction
in walking nor a fixed turn is proof of attraction or avoidance.

Gate 1 holds for selecting annotated inputs. Gate 2 is not established by this
evidence; gates 3 and 4 have not been run. No plume prototype is included.

## Limits and the next experiment

The model is a point-neuron rate-input experiment. One ORN spike reaches all
its targets from one membrane state: axonal branch-specific release differences,
receptor transduction, sensillum interactions and stimulus adaptation are absent.
Presynaptic inhibition onto an ORN terminal cannot be represented faithfully by
synapses onto a single whole-cell state. Most ORNs in a real fly are not silent
in clean air; this assay starts from the existing model's silent ORN baseline.
Neuropeptides and receptor-specific hunger gain are absent, and dopamine,
octopamine and serotonin outputs are muted. Consequently, neither state-dependent
odour attraction nor mushroom-body learning/reinforcement is established by a
short fixed-rate response. The existing lateral-LN transmitter override is
especially material to an olfactory assay; this study does not retune it.

For a later steering gate, Borst & Heisenberg (1982), Summary, demonstrate
turning toward higher antennal concentration under their open-loop conditions.
Gaudry et al. (2013), Figure 1, elicit a turn toward unilateral DM1 ORN activation;
their abstract and later experiments show branch-dependent transmitter release.
Synapse-count asymmetry alone cannot reproduce that physiology.
[Borst & Heisenberg](https://doi.org/10.1007/BF00612013),
[Gaudry et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC3590906/).

## Reproduce

From the repository root, with dependencies installed:

```sh
npm run brain:fetch
curl -fL https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather -o packages/brain/data/annotations.feather
node packages/brain/scripts/olfaction.ts --part audit > /tmp/olfaction-audit.json
node packages/brain/scripts/olfaction.ts --part simulate --seeds 1 > /tmp/olfaction-seed1.json
node packages/brain/scripts/olfaction.ts --part simulate --seeds 2,3 > /tmp/olfaction-seed23.json
node packages/brain/scripts/olfaction-summary.ts --results /tmp/olfaction-seed1.json,/tmp/olfaction-seed23.json > /tmp/olfaction-summary.json
```

Simulation and the full repository checks need a `/tmp/flies-heavy/slot-N` on
the shared machine; release within ten minutes and wait two minutes between
batches. Raw input data and full recordings remain outside git. Scripts refuse
different wiring or annotation bytes; reviewing another release needs an explicit
provenance review rather than silently repinning the hash.
