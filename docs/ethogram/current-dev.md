# Current dev observation — held at 06:00

Clock held at 6 h; sunrise 06:00, sunset 18:00. No validated whole-animal point score is identified. Optical scores are limited engineering comparisons; unmatched and unsupported metrics remain N/A.

InternalState uses stochastic arousal and per-eye scene backgrounds, outside the connectome, to drive spontaneous activity.
The body supplies edge avoidance and wall escape, tarsal flight support, grooming-pose persistence, and alignment to food after a neural feeding command.
Airborne duration and grooming display occupancy include those body mechanisms; this audit does not attribute them to additional neural decisions.

| Metric | Literature value (reported spread) | Measured | Benchmark /10 | Source |
|---|---:|---|---|---|
| Walking speed median (mm/s) | 20 | 9.9500 | N/A | [Katsov et al. (2017)](https://doi.org/10.7554/eLife.26410), Table 4, Katsov row (2.0 cm/s) |
| Time walking (fraction) | 0.54 (±0.17) | 0.0665 | N/A | [Cruz et al. (2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8556163/), STAR Methods, Unsupervised segmentation of movement dynamics, opening paragraph |
| Walk bout mean (s) | 22.6195 (±12.6052) | 1.6828 | N/A | [Paulk et al. (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4868374/), Table 1, No Electrode |
| Walk bout frequency (1/s) | 0.0482 (±0.0039) | 0.0333 | N/A | [Paulk et al. (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4868374/), Table 1, No Electrode |
| Saccade duration median (ms) | 90 | N/A | N/A | [Geurten et al. (2014)](https://doi.org/10.3389/fnbeh.2014.00365), Figure 1G and Results, Walking Drosophila perform saccades |
| Peak-centred saccade angle mean (deg) | 15 | N/A | N/A | [Geurten et al. (2014)](https://doi.org/10.3389/fnbeh.2014.00365), Figure 1F (100 ms window) |
| Yeast sip duration mode (s) | 0.13 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5a |
| Sucrose sip duration mode (s) | 0.16 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5c |
| Yeast inter-sip interval mode (s) | 0.08 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5b |
| Sucrose inter-sip interval mode (s) | 0.07 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5d |
| Sips per burst, fed (sips) | 5.8 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6b |
| Sips per burst, 8 h deprived (sips) | 8.3 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6b |
| Inter-burst interval, fed (s) | 78 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6c |
| Inter-burst interval, 4 h deprived (s) | 29 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6c |
| Black-square jump-and-flight probability (fraction) | 0.82 | 0.4167 | 5.97 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming stimuli evoke reliable jump and flight after reaching a fixed angular threshold size |
| Checkerboard jump-and-flight probability (fraction) | 0.87 | 0.0208 | 1.51 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming is sufficient to trigger escape; Figure 3 |
| Black-square TTC–l/v slope (ms/ms) | 2 (±0.2) | 2.2590 | 7.05 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Figure 2 caption |
| Black-square TTC intercept (ms) | -6 (±11) | -81.5738 | 0.00 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Figure 2 caption |
| Checkerboard TTC–l/v slope (ms/ms) | 2.1 (±0.1) | N/A | N/A | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming is sufficient to trigger escape; Figure 3 |
| Checkerboard TTC intercept (ms) | -22 (±5) | N/A | N/A | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming is sufficient to trigger escape; Figure 3 |
| WT light-off jump-and-flight probability (fraction) | 0 | 0.8750 | N/A | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Light-off and looming stimuli evoke distinct behaviors in white-eyed flies, opening paragraph |

Black square: 20/48 eligible responses; 0/48 readiness failures; model Wilson 95% interval 0.288–0.557; timing fit 20 successes across 5 l/v values, slope SE 0.442, intercept SE 11.833 ms.

Checkerboard: 1/48 eligible responses; 0/48 readiness failures; model Wilson 95% interval 0.004–0.109; timing fit N/A.

Flash surrogate: 7/8 eligible responses; 0/8 readiness failures; model Wilson 95% interval 0.529–0.978; timing fit N/A.

Blank: 0/8 eligible responses; 0/8 readiness failures; model Wilson 95% interval 0.000–0.324; timing fit N/A.

Optical probability mean: **3.74/10**; timing mean **N/A/10**; equal probability/timing composite **N/A/10**. 4/21 registered comparisons estimable. Whole-animal score: **N/A**. Registry-average bounds **0.69–8.79/10** describe only these rows, not biological fidelity or confidence intervals.

Seed 1: 1.0000 recorded hours; 1308.0 CPU seconds.

Full sample counts, trial denominators, readiness failures, censoring, assay blockers and uncertainty labels are in JSON.

FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0).


## Recording provenance and diagnostics

Runtime source `dbe02d9b`, clean tree, rebased on dev `588da9b1`; protected
production brain/body/Life sources match that dev. Analysis source `520648c3`
adds trial-backed scoring and correct uncertainty/reporting; no stimulus or
neural/body decision is changed by reanalysis. Connectome SHA-256:
`51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c`.

Free behaviour: seed 1, 60 s burn-in + 3600 s recorded, 43 mm open disc,
uniform facet luminance 0.5, no food/dust/external stimuli. Clock held at
06:00 (ZT0), sunrise 06:00, sunset 18:00; natural sleep pressure and hunger.
CPU 1308.03 s; wall 2240.04 s including fair-lease pauses. This is one animal,
not a population estimate. The capture commit was recorded before execution.

| Diagnostic | Observation |
|---|---:|
| Translating time | 5.609% |
| Translation or rotation time | 6.653% |
| Moving speed p10 / median / p90 | 7.55 / 9.95 / 12.65 mm/s |
| Mean / median complete walk bout | 1.683 / 1.150 s |
| Complete walk bouts | 120 |
| Mean / median complete stop bout | 27.483 / 3.530 s |
| Complete stop bouts | 119 |
| Visible head-grooming time | 84.870% |
| Mean complete head-groom bout | 7.591 s |
| Complete head-groom bouts | 402 |
| Outer-half-area grounded occupancy | 95.353% |
| Antenna-bump input >0.05 | 91.016% |
| Neural grooming command >0.05 | 90.255% |
| Visible grooming with command ≤0.05 | 0.533% |
| Ground yaw differing from intent by >0.001 rad/s | 0 s |
| Sleep, feeding, airborne, takeoffs, saccades | 0 observed |

Stop/groom bouts are censored at both observation endpoints. Histogram overflow
is zero. Occupancy and raw neural-command categories overlap; these counters
are not a causal intervention. Antenna contact belongs to `fix-antenna-contact`
and is not changed here.

The optical cohort uses seeds 20000–20111. Every one of 112 attempts met ≥3 s
stationary readiness; none used direct loom input. Blank and flash controls have
8 trials each. Flash is an unscored LED surrogate. Wilson intervals and fit SEs
refer only to model trials. The 82%/87% source probabilities are pooled; the
paper does not supply their denominators in the cited text. Its SD-versus-SE
fit-spread ambiguity remains explicit. Registry-average bounds depend on the
chosen rows and are not bounds on biological fidelity.

## Paired body mapping

Runtime `520648c3`, same 112 optical trial seeds, same clock, stimuli and
readiness. All 112 records match exactly in eligibility, readiness time,
baseline takeoffs, first takeoff, TTC and powered-flight outcome. Thus every
reported optical probability and timing score is identical. There is no measured
escape-score improvement. The candidate changes only the launch components;
its body-only command sweep preserves the initial impulse norm.

| At the first 5 ms frame after takeoff | Existing mapping | Balanced mapping |
|---|---:|---:|
| Mean angle, all 28 powered responses (including flash) | 64.420° | 41.056° |
| Mean speed, same responses | 375.817 mm/s | 384.623 mm/s |
| Mean angle, 21 looming responses only | 64.541° | 41.110° |
| Mean speed, looming responses only | 373.733 mm/s | 382.407 mm/s |
| Optical probability mean | 3.7375/10 | 3.7375/10 |
| Complete optical composite | N/A | N/A |

Initial energy is preserved, while frame-end speed differs because gravity
and flight forces act during those 5 ms. Neither speed is compared to Card &
Dickinson's mean over the first 2 ms. Their roughly 45° launch is a mechanical
approximation from female flies on an angled pipette, not a condition-matched
male angle distribution or a source for a guessed tolerance. See
[calibration limits](calibration.md). The candidate remains subject to blind
review; these data do not establish a whole-fly fidelity improvement.

## Exact-source validation and CPU variability

Independent source roots resolve their own @fly workspace packages (not a
shared live body module). Each ran a full `npm test`, lint and typecheck:

| Motion source | Functional tests | Brain full-senses CPU / limit | Full npm test | Lint / types |
|---|---|---|---|---|
| Existing | 783 pass, 2 optional skips | 0.400 / 0.500 s/s | pass | pass / pass |
| Balanced | 783 pass, 2 optional skips | 0.502 / 0.500 s/s | fail (one CPU case) | pass / pass |

The failing case is `packages/brain/src/cost.budget.ts`, “it builds and runs
within its cost bounds.” No production brain/budget source differs. Earlier
current-tree/control values were 0.520 / 0.546, both against 0.500. Historical
values were 0.609 initially, 0.538 repeat and 0.529 control. The source roots'
measured one-minute loads ranged about 15–42; no idle-machine reproduction is
claimed. These observations do not establish a body-caused brain-cost change,
and a failing budget is not counted as a pass. No threshold was relaxed.

The candidate graphical play e2e passed, including brain-triggered takeoff,
with a maximum 90 draws and 350,627 triangles. Native/WebAssembly parity tests
passed in the full suite; optional pinned annotations and WASM rebuild checks
were skipped for missing data/toolchain. Raw recordings, test transcripts and
neutral evidence roots remain under /tmp, outside git. This file is a summary.
