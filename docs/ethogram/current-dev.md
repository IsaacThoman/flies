# Dev cb9b9da2 — clock-pinned behaviour and optical escape

Clock held at 6 h; sunrise 06:00, sunset 18:00. No validated whole-animal point score is identified. Optical scores are limited engineering comparisons; unmatched and unsupported metrics remain N/A.

InternalState uses stochastic arousal and per-eye scene backgrounds, outside the connectome, to drive spontaneous activity.
The body supplies edge avoidance and wall escape, tarsal flight support, grooming-pose persistence, and alignment to food after a neural feeding command.
Airborne duration and grooming display occupancy include those body mechanisms; this audit does not attribute them to additional neural decisions.

| Metric | Literature value (reported spread) | Measured | Benchmark /10 | Source |
|---|---:|---|---|---|
| Walking speed median (mm/s) | 20 | 9.6500 | N/A | [Katsov et al. (2017)](https://doi.org/10.7554/eLife.26410), Table 4, Katsov row (2.0 cm/s) |
| Paper walking fraction; model activity proxy (fraction) | 0.54 (±0.17) | 0.5454 | N/A | [Cruz et al. (2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8556163/), STAR Methods, Unsupervised segmentation of movement dynamics, opening paragraph |
| Walk bout mean (s) | 22.6195 (±12.6052) | 1.8812 | N/A | [Paulk et al. (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4868374/), Table 1, No Electrode |
| Walk bout frequency (1/s) | 0.0482 (±0.0039) | 0.2292 | N/A | [Paulk et al. (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4868374/), Table 1, No Electrode |
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
| Black-square jump-and-flight probability (fraction) | 0.82 | 0.9375 | 8.82 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming stimuli evoke reliable jump and flight after reaching a fixed angular threshold size |
| Checkerboard jump-and-flight probability (fraction) | 0.87 | 0.2292 | 3.59 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming is sufficient to trigger escape; Figure 3 |
| Black-square TTC–l/v slope (ms/ms) | 2 (±0.2) | 1.4916 | 0.00 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Figure 2 caption |
| Black-square TTC intercept (ms) | -6 (±11) | -29.6681 | 0.00 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Figure 2 caption |
| Checkerboard TTC–l/v slope (ms/ms) | 2.1 (±0.1) | 1.1224 | 0.00 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming is sufficient to trigger escape; Figure 3 |
| Checkerboard TTC intercept (ms) | -22 (±5) | -68.4630 | 0.00 | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming is sufficient to trigger escape; Figure 3 |
| WT light-off jump-and-flight probability (fraction) | 0 | 1.0000 | N/A | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Light-off and looming stimuli evoke distinct behaviors in white-eyed flies, opening paragraph |

Black square: 45/48 eligible responses; 0/48 readiness failures; model Wilson 95% interval 0.832–0.979; timing fit 45 successes across 6 l/v values, slope SE 0.157, intercept SE 6.524 ms.

Checkerboard: 11/48 eligible responses; 0/48 readiness failures; model Wilson 95% interval 0.133–0.365; timing fit 11 successes across 5 l/v values, slope SE 0.151, intercept SE 8.340 ms.

Flash surrogate: 8/8 eligible responses; 0/8 readiness failures; model Wilson 95% interval 0.676–1.000; timing fit N/A.

Blank: 0/8 eligible responses; 0/8 readiness failures; model Wilson 95% interval 0.000–0.324; timing fit N/A.

Optical probability mean: **6.21/10**; timing mean **0.00/10**; equal probability/timing composite **3.10/10**. 6/21 registered comparisons estimable. Whole-animal score: **N/A**. Registry-average bounds **0.59–7.73/10** describe only these rows, not biological fidelity or confidence intervals.

Seed 1: 1.0000 recorded hours; 349.4 CPU seconds in the traced capture.

Full sample counts, trial denominators, readiness failures, censoring, assay blockers and uncertainty labels are in JSON.

FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0).

## Replication and source provenance

The initial schema-3 recordings used clean runtime
`29942c80c01ad5117290ac225205a58bf6ee9fb0`, rebased onto dev
`cb9b9da277a0cfe1f84dd16538ea41286fd5b6a6`, including the
upstream ON pathway (#104). Brain/body/world/Life/native production source has
zero feature diff from that dev. The connectome SHA-256 remains
`51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c`.
The hour uses seed 1 after 60 s burn-in; the two optical cohorts use distinct
seeds on one anatomical connectome, not independent anatomical populations.
All assays hold 06:00, sunrise 06:00, sunset 18:00. Raw evidence is outside git.

| Quantity | Seeds 20000–20111 | Seeds 30000–30111 |
|---|---:|---:|
| Black-square escape | 45/48 | 44/48 |
| Checkerboard escape | 11/48 | 11/48 |
| Flash surrogate, unscored | 8/8 | 8/8 |
| Blank | 0/8 | 0/8 |
| Probability mean /10 | 6.208333 | 6.312500 |
| Timing mean /10 | 0.000000 | 0.514695 |
| Optical composite /10 | 3.104167 | 3.413598 |

All 224 attempts met readiness and had zero direct loom input.

First cohort, black: model Wilson 95% interval 0.831646–0.978517; TTC fit slope 1.491597 (model SE 0.156892), intercept -29.668091 ms (SE 6.523551), n=45 successes over 6 l/v values.

First cohort, checkerboard: model Wilson 95% interval 0.133078–0.365393; TTC fit slope 1.122385 (model SE 0.151243), intercept -68.463043 ms (SE 8.340200), n=11 successes over 5 l/v values.

Replication, black: model Wilson 95% interval 0.804467–0.967116; TTC fit slope 1.414511 (model SE 0.180156), intercept -25.735341 ms (SE 7.398163), n=44 successes over 6 l/v values.

Replication, checkerboard: model Wilson 95% interval 0.133078–0.365393; TTC fit slope 0.701904 (model SE 0.203936), intercept -50.939058 ms (SE 8.836023), n=11 successes over 6 l/v values.


Six of 21 reference comparisons are estimable. The composite is an engineering
utility with equal probability/timing weights; the paper does not validate its
fit-spread bands, the 50 ms flight endpoint or the idealized assay as biological
acceptance criteria. A whole-animal score remains unidentified. Unsupported
feeding and unmatched free-motion rows do not earn numerical agreement credit.

## Paired dev snapshots

[Dev 58481d6c](dev-58481d6c.md) retains the preceding clock-pinned measurements.
On the same fixed cohorts, checkerboard responses changed **26/48 → 11/48**
and **27/48 → 11/48**. Paired changes were 18 losses/3 gains and 17 losses/1
gain. Black responses changed 44/48 → 45/48 and 44/48 → 44/48. Readiness times
and eligibility were identical for every paired seed. Flash remained 8/8 and
blank 0/8 in both cohorts. Optical composites changed **3.9375 → 3.104167**
and **4.736103 → 3.413598**. These are observations across upstream snapshots,
not a body-mapping gain or a change implemented by this branch. Their pooled
reference probabilities also include an orientation mixture this battery does
not reconstruct; see `assays.md`.

Every reported free-behaviour metric is exactly equal between these snapshots:
translation 43.111%, activity 54.541%, moving median 9.65 mm/s, mean complete
walking bout 1.8812 s, outer-half-area occupancy 69.164%, and zero grooming,
antenna bump, feeding, airborne bouts, takeoffs, saccades or observed sleep.
Zero grooming in a clean, dust-free arena is not a validated hierarchy result.
This run took **391.07 CPU s / 394.71 wall s** for the free hour; cost variation
under shared-host load is not interpreted as behaviour improvement.

The checkerboard loss is referred to the protected visual-pathway owner as a
proposal. No eye input, neural parameter or motor threshold is changed to
recover the score. The model's giant-fiber readout and missing parallel escape
output remain separate validation questions.

## Endpoint and mapping limits

Flight requires ten consecutive 5 ms powered airborne frames in the first
bout; a landing ends eligibility. Interrupted bursts and later jumps cannot
qualify the first departure. Replay bounds takeoff and powered duration by the
actual response/follow-up windows. The initial schema-3 captures retained only
summaries. The subsequent schema-4 captures below retain the underlying frames
and reproduce every observation. Body tarsal support makes flight follow
most departures; this does not validate an autonomous neural flight controller.

The balanced launch experiment was rejected and reverted (blind means 6.625
control / 6.167 candidate). It preserved all 112 response/timing outcomes.
The scored optical endpoints concern triggering and timing; rotating a
post-trigger impulse cannot restore a missing descending decision. No accepted
body or brain change remains. Further mappings need an independently calibrated
command-to-motion relationship, not a constant selected to improve this table.

## Frame-verified replication

Both cohorts were rerun with exact binary observations. The first capture used
clean runtime `bb92d33f2985e5617da0a2e584f9917423489869`; replication used
`3936fa39d151f15b00b64c253f05aea7ebba5c7f` (documentation-only difference).
Production brain/body/world/Life/native code still equals dev `cb9b9da2`.
All original free metrics and all 224 original optical trial observations are
**exactly equal** to their schema-3 counterparts. Scores remain 3.104167 and
3.413598. Raw data total **225 files / 20,723,976 bytes**: 360,000 free frames
and 224 optical traces. All digests and supplied replay checks pass.
Three fresh blind reviewers independently decoded the files and reconstructed
the free motion, first departures and uninterrupted powered-flight classifications.

Across the two optical cohorts, **4,403/4,403** and **4,331/4,331** counted
powered first-bout frames have raw neural wing command below 0.6 alongside a
body reflex floor at least 0.6. This is a descriptive association, not an
ablation proving causation; command smoothing also exists. It prevents these
flight endpoints from being presented as autonomous neural flight control.
Readiness waiting frames and retinal arrays are not retained; stationary
eligibility and sensory delivery therefore lack the same frame-level proof.

The traced free run used **349.413 CPU s / 350.068 wall s**. Variation from
the earlier run is not a controlled performance comparison. A separate
synthetic observer-cost experiment is described in [trace format](traces.md).

The review history and test provenance are in `review-log.md`. Earlier
unclocked and clock-pinned reports remain versioned history, rather than being
silently overwritten or presented as current evidence.


## Verification on this runtime

The final exact-source farm run `20261117T051219-241399` tested runtime
`bb92d33f`, including trace/replay code: lint, web types, tvOS types and build
pass; **1108 functional tests passed, zero failed, three recorded
platform/data/toolchain skips**. Focused audit tests: **28/28 passed**.
The earlier merge `dfdf08c9`, tree `17a1ba9502b7dff360974f5fb1c6461e222c3389`,
identical to runtime `29942c80`, passed 1105 functional tests with three skips.
The farm omits five named Apple-silicon WASM cases by policy; seven WASM cases
including those five passed on the Mac, as did its additional arm64 FMA guard.
That matching-production run passed **all five CPU budgets**, zero skips. The all-senses brain case is
**0.263 M5 Pro CPU s/s versus 0.500**, build **185 ms versus 250**, rest
**0.064 s/s versus 0.160**. Valid samples followed rejected noisy attempts;
load was about 8–11, so no idle-machine claim follows. The scalar-sense brain
budget does not measure active ON-pathway visual workloads.

The script-only farm Docker run failed because linked Git metadata was not
mounted (three failing top-level cases). All eight tests passed directly on
the farm host in the matching checkout. The
new report links also pass the local four-test documentation checker after
installing the upstream manifest's missing documentation dependencies.

The extra browser play test fails waiting for `wallpaper=false` on the feature
and the unchanged `cb9b9da2` control (549 s and 626 s). Pointer e2e fails reading
an undefined `held` property during orientation-change testing (860 s).
These are recorded failures, not passes or fixes claimed here; no production
UI or browser-test feature diff exists. Web/offline passed (257 s); tables
failed waiting for restaurant/epoch 1 after a move (441 s). Only play was
independently repeated on unchanged dev. That exact-source audit run selected
unit tests, not browser suites. Historical CPU failures and skips
remain preserved in the earlier reports and review log rather than being
erased by the later passing run.


## Integration rebase

The branch subsequently rebased onto dev
`6eda5cb4c3e04fd79cedbc62d388e39540853307` at head
`5feae07b338233ca16bd986699ef6f2a2e5cb298`. Brain, native brain, body,
`apps/web/src/life.ts`, the in-process driver and world physics/pantry sources
used by these arena and optical protocols are byte-identical to cb9b9da2.
The new kitchen/greenhouse definitions are imported but not selected. No new
CNS recording is relabelled as part of this rebase. Rendered fly gait, UI and
browser-test changes are covered by a separate integration check.

A local all-budget repeat on this rebase gives four passes, no failures and
one contention skip. The brain-cost case rejected all three attempts:
work-sample max/min 1.52 exceeds 1.35, then reference max/min 2.26 and 2.27
exceed 2. Host load was 1.21 before / 1.46 after on 18 logical CPUs. Low load
does not make unstable calibration a valid timing result. The earlier five
passes remain recorded on the matching physics/CNS source; this repeat is
not counted as a fifth pass or an idle-machine failure.

A bounded brain-only repeat also skipped after three invalid attempts: work
sample ratio 1.45 > 1.35; reference ratios 2.73 and 2.49 > 2. No further
repeats or relaxed guards are used to obtain a favourable number. This is
calibration instability, not a measured cost exceeding the 0.500 limit.

Post-rebase `--analyse` also reverified the primary schema-4 capture: 360,000
free frames and all 112 optical traces match; composite remains 3.104167.
The analysis records head 5feae07b and dirty=true for documentation edits.
A single whole CLI analysis, including imports, JSON I/O, hash checks and
reconstruction, used 0.42 user + 0.04 system CPU s and 0.35 wall s. This is
one offline observation, not a repeated throughput or production benchmark.

The integration farm completed all four browser suites: **play pass (810 s)**,
**pointer pass (695 s)**, **web/offline pass (166 s)**, **tables fail (525 s)**.
Tables passed the previous restaurant/epoch transition, then timed out after
30 s while adding devices with three/two flies. The final extra tab was still
loading its brain, with zero neurons and download progress 0/14,288,331 bytes.
No matching unchanged-dev tables rerun was performed; this is an unattributed
integration failure, not a demonstrated regression introduced by this auditor.
There is no production game or browser-test feature diff from the rebase base.

The matching farm host separately passed **all eight root-script tests**.
Final documentation additions pass the four local link/command tests.
The completed helper removed its owned checkout and containers. No owned
Mac server, browser, simulator or heavy slot remains. Historical failures are
retained, not relabelled by the later play/pointer successes. These checks were
completed after the last blind packet froze and do not change its review scores.
