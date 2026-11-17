# Assay eligibility and the nine coverage gaps

Every executable assay holds clock phase at **06:00, ZT0**, with sunrise 06:00
and sunset 18:00. `Rhythm` starts with its usual pressure for that hour, then
pressure and stillness evolve. Holding clock phase does not disable sleep.
The cited papers do not establish this clock phase as a matched population;
it is a reproducibility control. The model remains the FlyEM male connectome.

The nine previously unsupported rows have these individual dispositions:

| Reference row | Disposition and exact missing observable |
|---|---|
| Yeast sip duration, 0.13 s mode, Itskov Fig. 5a | Cannot run: no yeast/protein taste, no sip contact onset/offset or proboscis retraction oscillator; female 12 h wet-starved assay is not the male sugar-only model. |
| Sucrose sip duration, 0.16 s mode, Fig. 5c | Cannot run: `Life` integrates continuous consumption while its proboscis is extended. A meal duration cannot supply a contact-duration histogram. |
| Yeast ISI, 0.08 s mode, Fig. 5b | Cannot run: no successive resolved yeast contacts, and no yeast channel. An idle frame between meal episodes is not an inter-sip interval. |
| Sucrose ISI, 0.07 s mode, Fig. 5d | Cannot run: no contact/retraction events. There is no per-fly ISI histogram from which to calculate the mode. |
| Fed burst size, 5.8 sips, Fig. 6b | Cannot run: cannot identify ≥3-sip bursts with intervals below twice the fly's median ISI. Continuous sugar intake is not a count of sips. |
| 8 h-deprived burst size, 8.3 sips, Fig. 6b | Cannot run: same absent events, plus `Hunger` has no experimentally calibrated 8 h deprivation state. Its metabolic clock is 60× faster than motion. |
| Fed inter-burst interval, 78 s, Fig. 6c | Cannot run: no valid burst onset/offset events. Inter-meal intervals are not interchangeable with inter-burst intervals. |
| 4 h-deprived inter-burst interval, 29 s, Fig. 6c | Cannot run: same absent events, plus no calibrated 4 h deprivation state. Changing hunger to a guessed level would not reproduce the experiment. |
| Loom-evoked jump-and-flight, 82%, Fotowat Results | Implemented optical battery: independent real-brain trials, six l/v values 5–80 ms, fixed world-space screen, white-adapted eyes, ≥3 s stationary readiness, recorded failures, blank and dark-flash controls. No direct `loomLeft/Right` input or imposed motor command. |

Itskov's duration/ISI statistics are **modes**, using individual-fly 30 ms
histogram bins; Figures 5–6 give n=24. Bin width is not an uncertainty or
acceptance band. The six sucrose rows are male assays; the two yeast rows
are female assays. The source is [Itskov et al. 2014, Figures 5–6 and
Methods](https://doi.org/10.1038/ncomms5560).

The feeding gaps require new biology or validated event readouts. Inventing
sip timing in the body would script neural behaviour, contrary to Rule 1.
No such pattern generator is added here. Hunger belongs to another experiment.

## Optical protocol and limits

[Fotowat et al. 2009](https://doi.org/10.1152/jn.00073.2009), Figures 1–3 and
Visual stimulation, specifies 200 Hz expanding squares, 2–220 pixel half-size,
16.5 pixels/cm, and screen distance 60–75 mm. This battery uses their distance
midpoint, 67.5 mm, a 5 mm circular platform matching the funnel exit diameter,
and measured relative luminances. A screen stays fixed in the world while
the body moves. It is sampled by the actual idealized eye map; no neural input
is adjusted to increase responses. A 4×4 checkerboard tests expansion without
a net screen luminance decrease. Pixel geometry tests cover both patterns.

Takeoff is the body's leg-departure event, sampled at 5 ms. Jump-and-flight
requires one continuous ≥50 ms powered episode in the first airborne bout,
with wing drive ≥0.6 and wingbeat >0.15. A landing ends eligibility; a later
departure cannot qualify the first takeoff. This rule
is an operational approximation, declared explicitly: the paper used 400 fps
video, and the model's sustained flight comes from a body tarsal reflex.
The final square is held for 250 ms; late responses and negative TTC remain
in the timing fit. This response-window convention is an audit choice, not a
reported publication cutoff. Controls receive the same readiness rule.

The paper's 82% black-square and 87% checkerboard responses are pooled
probabilities, not six separately measured targets. The pooled denominators
are not provided in the cited results text. Model Wilson intervals describe
model trials only, never inferred reference counts. Sex and clock time are
not specified in the paper's Methods. Funnel climbing, spectral sensitivity,
absolute photon flux, head/wing kinematics and pigmentation are not modeled.
The paper pooled 65% parallel/monocular presentations with 35% at 45–90° to
the screen (Methods, Behavioral experiments). This battery fixes the screen
on the fly's right at stimulus onset; it does not reconstruct that orientation
mixture or counterbalance the connectome's left/right reconstruction asymmetry.
Uniform 25 ms dark flash approximates the LED experiment and is **excluded
from scoring**; its WT reference is 0/10, not the white-eyed 45% cohort.

Four timing coefficients are retained with their exact provenance. Figure 2
and Results call their spread SD; Statistical analysis says fit spread is SE.
The ambiguity is carried into the registry. They are correlated fit parameters,
not four independent phenotypes, and the spread is not a population range.

## Score definition

Scores apply only to the optical benchmark. Probability agreement is
`10 × (1 − |model probability − reference probability|)`, the complement of
Bernoulli total variation. This uses the physical [0,1] probability domain;
there is no invented ±0.10 tolerance. Timing coefficients use their explicitly
labelled reported fit spread as an engineering scale: 10 within one spread,
linearly decreasing to 0 at two spreads. This is not a normality test or a
confidence statement. Unestimable fits are N/A, not latency zero.

The other six executable reference comparisons retain their raw diagnostics
but get **no score**: source selection, preparation or measurement differs.
Arbitrary ±5 mm/s, ±5°, ±30 ms and all feeding tolerance guesses are removed.
Published Cruz/Paulk dispersions remain source context, not acceptance bands.
There are 21 registered reference conditions, not 21 independent behaviours.

No validated whole-animal point estimate follows from these observations.
The report gives separate optical probability/timing means and registry-average coverage bounds: assign
every unavailable row any score from 0 to 10. These are missing-evidence
bounds, not statistical confidence intervals. An unsupported assay never earns
10; a missing duration never becomes a zero-valued biological observation.

## Other requested domains

The source code records walking/stop bouts, speed/yaw distributions, edge
occupancy, head-groom bouts and airborne bouts. Seeds et al. (2014), Figures
1 and 3, concerns dust and body-part-resolved grooming. The model has neither
dust loads nor a posterior grooming readout, so the anterior-to-posterior
hierarchy cannot run. There is no verified numeric grooming-bout target here.
An open-disc edge occupancy is not wall-following or centrophobism. Airborne
time includes falls and body-maintained flight, so it is not a calibrated flight
bout. Air-puff flow geometry and quantitative optomotor gain need separately
verified protocols/targets; neither receives an invented target.

Only complete, trial-backed optical records can earn scores. The estimator validates
the condition grid, unique seed cohort, fixed clock, geometry, sensory route and
TTC consistency and finite capture-window bounds, then recomputes all coefficients from raw trials. Scalars cannot
earn credit. The composite weights probability and timing equally and is N/A if
either pattern or any timing fit is unavailable. Registry-average bounds are
not bounds on whole-animal fidelity; whole-animal coverage is listed by domain.
