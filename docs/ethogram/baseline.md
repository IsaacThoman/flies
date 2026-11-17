# Behaviour audit

Exploratory scores are descriptive distances, not validated biological agreement. Unsupported assays and absent events are N/A, never zero-valued observations.

InternalState uses stochastic arousal and per-eye scene backgrounds, outside the connectome, to drive spontaneous activity.
The body supplies edge avoidance and wall escape, tarsal flight support, grooming-pose persistence, and alignment to food after a neural feeding command.
Airborne duration and grooming display occupancy include those body mechanisms; this audit does not attribute them to additional neural decisions.

| Metric | Literature value ± comparison scale | Measured per seed | Exploratory /10 per seed | Source |
|---|---:|---|---|---|
| Walking speed median (mm/s) | 20 ± 5 | 9.7500 | 0.00 | [Katsov et al. (2017)](https://doi.org/10.7554/eLife.26410), Table 4, Katsov row (2.0 cm/s) |
| Time walking (fraction) | 0.54 ± 0.17 | 0.0592 | 0.00 | [Cruz et al. (2021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8556163/), STAR Methods, Unsupervised segmentation of movement dynamics, opening paragraph |
| Walk bout mean (s) | 22.6195 ± 12.6052 | 1.6682 | 3.38 | [Paulk et al. (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4868374/), Table 1, No Electrode |
| Walk bout frequency (1/s) | 0.0482 ± 0.0039 | 0.0294 | 0.00 | [Paulk et al. (2013)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4868374/), Table 1, No Electrode |
| Saccade duration median (ms) | 90 ± 30 | N/A | N/A | [Geurten et al. (2014)](https://doi.org/10.3389/fnbeh.2014.00365), Figure 1G and Results, Walking Drosophila perform saccades |
| Peak-centred saccade angle mean (deg) | 15 ± 5 | N/A | N/A | [Geurten et al. (2014)](https://doi.org/10.3389/fnbeh.2014.00365), Figure 1F (100 ms window) |
| Yeast sip duration mode (s) | 0.13 ± 0.03 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5a |
| Sucrose sip duration mode (s) | 0.16 ± 0.03 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5c |
| Yeast inter-sip interval mode (s) | 0.08 ± 0.03 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5b |
| Sucrose inter-sip interval mode (s) | 0.07 ± 0.03 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 5d |
| Sips per burst, fed (sips) | 5.8 ± 1 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6b |
| Sips per burst, 8 h deprived (sips) | 8.3 ± 1 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6b |
| Inter-burst interval, fed (s) | 78 ± 15 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6c |
| Inter-burst interval, 4 h deprived (s) | 29 ± 6 | N/A | N/A | [Itskov et al. (2014)](https://doi.org/10.1038/ncomms5560), Figure 6c |
| Loom-evoked takeoff probability (fraction) | 0.82 ± 0.1 | N/A | N/A | [Fotowat et al. (2009)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3817277/), Results, Looming stimuli evoke reliable jump and flight after reaching a fixed angular threshold size |

Validated overall behaviour score: **N/A** (no condition-matched assays).

Seed 1: exploratory mean 0.84/10 over 4/15 references; 1.0000 recorded hours; 1105.9 CPU seconds.

Full diagnostics, sample counts, censoring, assay caveats and tolerance provenance are in the JSON report.

FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0).

## Diagnostic observations

Seed 1, 60 s burn-in, 3600 s recorded, 43 mm open disc, uniform luminance 0.5, no external stimulation. This is one animal, not a population estimate.

| Diagnostic | Observed |
|---|---:|
| Translation occupancy | 0.0491 |
| Translation-or-rotation occupancy | 0.0592 |
| Outer-half-area occupancy while grounded | 0.9459 |
| Visible head grooming occupancy | 0.8438 |
| Moving speed mean (mm/s) | 9.8624 |
| Moving speed p10 (mm/s) | 7.5500 |
| Moving speed p90 (mm/s) | 12.6500 |
| Completed stop bout mean (s) | 30.6518 |
| Completed stop bout median (s) | 3.8200 |
| Completed head-groom bout mean (s) | 8.3103 |
| Threshold-qualified saccades per second | 0.0000 |
| Takeoffs | 0.0000 |

Completed bouts: 106 walking, 105 stopping, 357 visible head grooming; no feeding, airborne or saccade bouts. Stopping and grooming were censored at both recording endpoints. Histogram overflow: zero.

The run used the auditor corresponding to commit `223fd4c` (the frozen R8 implementation). Its raw JSON records `63388bd` and a dirty tree because that auditor captured git provenance after execution; this known bug is corrected in the current CLI. Production brain/body/Life code is unchanged from base `c53a64c`. Citation labels in this summary use the corrected registry. The raw JSON and console transcript are retained under `/tmp/ethogram-baseline.*`, outside git. Wall time includes CPU-lease pauses and contention; CPU time includes burn-in but excludes brain construction.

No behavioural improvement is measured or claimed. In particular, the exploratory mean of 0.84/10 covers only four unmatched comparisons and is not an overall fidelity score.
