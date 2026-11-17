# Offline behaviour audit

This is an **incomplete scorecard**, not a calibrated fly. It registers 15
independently checkable literature targets and records 25 body-motion and
activity diagnostics. Six targets have exploratory comparisons; nine require
assays or biology that are not implemented. None currently qualifies for a
condition-matched overall biological score. A mean of the exploratory distances
is reported separately with its coverage. N/A never earns a score.

```sh
# Fetch the FlyEM male CNS connectome and install dependencies first.
npm ci
npm run brain:fetch
# Reserve a heavy-work slot before a long run; release it when finished.
mkdir /tmp/flies-heavy/slot-1
node scripts/ethogram.ts --hours 1 --seeds 1,2,3 --place arena --out /tmp/ethogram.json
rmdir /tmp/flies-heavy/slot-1
```

The four slot names are shared with other work: if a mkdir fails, try another
free slot (1–4); never remove someone else's slot. A run defaults to three
independent seeds, each with a 60-second burn-in followed by one hour of motion
time. `--place lab` and the other game places work too. Each seed is reported
separately rather than pooled into one long pseudoreplicate. This is not a
population experiment; three seeds cannot establish a reference distribution.

The runner uses `Life` and the same in-process driver as the headless fuzz tools:
real 166,700-neuron brain, `SenseTracker`, `Behavior`, `FlyBody`, food and hunger.
There are no imposed motor commands, forced choices, resets within a run, or
neuron-specific inputs. The eyes see an adapted uniform field, **not a rendered
place**. The arena is a 43 mm disc with the existing edge reflex, without the
paper's walls, glucose floor or confinement. Results are not claimed to match
its experiment. Hunger retains the game's accelerated metabolic clock (60×);
an hour of motion time is not an hour of physiological starvation. No runtime,
body, brain, hunger, sleep, grounded or ON-pathway code is changed by the audit.

## Measurements

All speeds come from displacement, not the requested velocity or brain command.
On-ground translation is >0.5 mm/s. Activity also includes rotation >20 deg/s,
but lacks Cruz's duration/gap filtering. This is an explicit mismatch, not a
validated recreation of that classifier. Surface motion includes vertical
movement while climbing. Walk and stop bouts are complementary only on the
ground. Grooming is `Life`'s head-groom display state; feeding is actual eating,
not simply proboscis extension. Flight is time off the feet, including falls.
These state categories can overlap except where `Life` gives them priority.

Only completed bouts enter duration summaries. A bout already active at the
observation start is left-censored; one active at the end is right-censored.
Both are counted in time occupancy, but neither is treated as a complete bout.
Bout rates count known starts, excluding an unknown onset before the window.
Zero bouts gives a zero event rate and an **undefined duration**, not duration 0.
Conditioning on completed bouts biases long-duration estimates downwards: raw
censor counts are retained rather than concealing that limitation.

Saccades require actual ground yaw >200 deg/s (Geurten et al. 2014). Their
reported duration is the contiguous suprathreshold interval, which is not
validated as the paper's complete turn-duration measure. Angles integrate the
whole ±50 ms around the largest absolute yaw within each event, including
subthreshold tails. Events whose windows run outside observation are omitted
from angle summaries. At 10 ms sampling, timing resolution is 10 ms and narrow
peaks may be missed. The body's documented 3 rad/s command gain is below
200 deg/s; ordinary steering is not relabelled a saccade to conceal this.

Speed quantiles use a 0.1 mm/s histogram; yaw quantiles use 1 deg/s bins. Each
quantile's bin-centre error is at most one bin width. Overflow is counted and a
quantile falling in it is N/A. The edge diagnostic is occupancy of the outer
half of the floor area while grounded; it is not claimed to measure a biological
wall preference because the current disc has no wall. Full counts, censoring,
CPU/wall cost, commit, dirty flag and dataset hash accompany the report.

## Literature and scores

`scripts/ethogram/references.ts` is the provenance registry. Each entry includes
paper, figure/table or named text location, statistic, units, population,
limitations and the origin of its comparison scale. All 15 central values were
checked against primary papers. These are not 15 independent traits: several
feeding entries are conditions of the same measurement.

The descriptive distance is 10 inside target ± tolerance, falling linearly to
0 at target ± 2 tolerances. Except where marked, tolerances are **audit policy**,
not published biological ranges. Paulk's SEs describe uncertainty in a group
mean, not individual variability, and must not be used to declare that a free
walking fly is normal or abnormal. The exploratory mean excludes unsupported
comparisons and always displays its denominator; it is not evidence of overall
biological fidelity. Validated scores remain N/A until population, observable,
stimulus, selection and uncertainty agree with a primary experiment.

Unimplemented assays:

- Feeding contacts, ISIs, burst structure and calibrated 0/4/8 h deprivation:
  continuous food consumption cannot substitute for individual sips.
- Loom takeoff probability versus l/v and escape latency: a projected visual
  stimulus through facets and repeated independent trials are required. The
  registry's 82% is a pooled Fotowat et al. (2009) result, not von Reyn (2014),
  not a separate 82% target at each l/v, and not evidence about a direct input
  into LC4/LPLC2. Takeoff observations are available as spontaneous diagnostics.
- Seeds et al. (2014), Figure 1 and Figure 3: eyes/antennae precede abdomen,
  wings and notum after dusting. The model reads only head grooming and has
  no body-part dust states. No numerical bout target or hierarchy score is
  invented from the qualitative ordering. See https://doi.org/10.7554/eLife.02951.
- Air-puff startle, optomotor gain, centrophobism and flight-bout duration need
  a verified quantitative target **and** a matched protocol. The runner records
  flight durations and spatial occupancy, without inventing literature ranges.

## Calibration decisions

No behaviour change is accepted. Raising walk speed to the median of selected
Oregon-R female trajectories would fit an unmatched assay. Raising turn gain
until saccades appear would manufacture agreement without an independent
neural-rate-to-yaw calibration. Adding sip oscillations or a posterior grooming
sequence would script actions absent from the brain. All are rejected.

The useful next experiments are a validated visual looming battery (including
non-looming controls and per-l/v denominators), body-part grooming observables,
and a rate-to-motion calibration from primary data. Sleep, hunger, grounded and
the eyes' ON pathway remain owned by other experiments; any related findings
belong in proposals rather than edits. No hill-climb improvement is claimed.

Escape research also needs two distinct observables. [von Reyn et al. (2014),
A spike-timing mechanism for action selection](https://doi.org/10.1038/nn.3741)
shows that GF timing relative to parallel circuits selects fast versus longer
escape sequences. A GF-only takeoff readout cannot establish that both paths
are reproduced. [Card and Dickinson (2008), Visually mediated motor planning
in the escape response of Drosophila](https://doi.org/10.1016/j.cub.2008.07.094)
examines directional preparation, which a body choosing the direction away
from `threat` cannot validate as a neural decision. Both should be explicit
coverage gaps in a future battery; neither is a reason to inject stronger
looming input or relabel a body reflex as brain fidelity.

For a future steering calibration, [Rayshubskiy et al., Neural circuit mechanisms
for steering control in walking Drosophila](https://doi.org/10.7554/eLife.102230),
Figures 2–3, relates bilateral DNa02 firing-rate differences to yaw, including
backward walking. The four paired recordings and analysis code are linked in
its data-availability statement (Harvard Dataverse DOI
10.7910/DVN/0NCLP1). This is an independent candidate calibration source;
extracting a gain and its uncertainty from those recordings is required before
changing the body mapping. An axis limit in a published plot is not a measured
maximum or a defensible gain. No gain is inferred from it in this experiment.
