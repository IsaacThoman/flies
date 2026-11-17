# Olfactory recovery controls

This is a prospective follow-up to the initial assay, not a replacement of its
failed 0.05 command-recovery result. Independent blind reviewers assess this
design before any follow-up simulation, including calibration, is run.

## Questions and locked decisions

1. How large is natural command drift between two equal one-second windows in
   an unstimulated brain? Does pinning the background remove it?
2. At 60 seconds after a five-second sensory pulse, does an olfactory residual
   exceed that drift or a matched non-olfactory perturbation?
3. If recovery is supported, does the independently labelled attractive input
   steer toward the stronger antenna? This is the next experiment, not evidence
   supplied by bilateral commands alone.

Use the unchanged `FlyBrain` operating point, resting senses, eyes shut, hunger
explicitly 1 and every sleep/clock field explicitly 0. There is no body loop,
so hunger and the clock cannot evolve. Two contexts:

- **Wandering:** ordinary background, recording its actual arousal and both
  scene values every second. All paired trials use the same seed and tick
  sequence, so the exogenous background trajectory is identical across them.
- **Pinned:** `spontaneous: false`, manually set each existing visual background
  input to its existing balanced maximum times that seed's time-mean wandering
  level. Compute that mean from the independent internal-state process alone,
  over the complete 67 s measurement schedule, including its preceding 20 s
  settling period. Use the arithmetic mean of all 6,700 post-step 10 ms levels in the
  67 recorded seconds, not the settling period. This matches the mean exogenous drive across contexts without
  consulting any neuron or command. The same constant is used while settling.
  Background Poisson spikes still occur; only their slowly varying rate is
  pinned. No weights, cell identities, readouts or neural state are changed.

Every run uses a fresh `FlyBrain`, 20 s unstimulated settling, then 67 recorded
simulated seconds: 2 rest, 5 stimulation, 60 washout, in
10 ms ticks. Record every one-second bin. Historical residual: final second
minus the same seed's time-matched no-stimulus control. Natural drift: the
no-stimulus run's final second minus its own second 1–2. Also retain the final
five-second mean to diagnose fluctuations rather than hide them. Observe all
eight commands, all nine readouts, ORN/PN/LH/KC/MBON/DN groups, and sparse
per-neuron counts in each of the last three five-second blocks (52–57, 57–62,
62–67 s of the recorded schedule). Commands and readouts are averages of their
100 tickwise decoded/smoothed values per second, not decoded averaged rates.
Population rates are counted spikes divided by all selected neurons and time.
Populations are exact `ORN_<g>` / cb_sensory / olfactory, class ALPN,
cb_intrinsic type /^LH/, class Kenyon_Cell, class MBON, superclass
descending_neuron. Report all seeds, conditions and failures.

## Matching the non-olfactory perturbation

For each ORN group, choose an equally sized set of annotated head-bristle `BM*`
`cb_sensory` neurons, disjoint from command readouts and the ORNs. No response
or command is consulted. Sort ORNs by the sum of absolute effective outgoing
weights at the existing operating point. Greedily match each to the closest
unused bristle neuron by that sum; break ties by body ID for both source ordering and matching. Reset the unused
bristle pool per glomerulus; reuse across glomeruli is allowed, since they are
never stimulated together. An insufficient pool aborts. Effective weight is
`abs(effectiveGain[pre] * round(75 * (1-exp(-count/75))))`, using the existing
operating-point fixes and saturation, not raw synapse counts. Drive at the same
requested rate and duration. This matches expected forced spike opportunities
and approximately matches first-hop delivered synaptic drive, not downstream
network activity. Attempted and accepted external events are not exposed by
the engine: report expected opportunities N×rate×5, measured total emitted
spikes (which can include recurrently generated spikes), and this distinction.
Report neuron counts, outgoing-weight totals/ratios, actual
spike counts and actual weighted spike totals. A mismatch over 20% in expected OR actual emitted-spike-weighted
first-hop drive makes that comparator unqualified; do not silently rematch it
using firing responses. A non-olfactory response is not expected to reproduce
olfactory circuit anatomy or behaviour.

## Calibration and held-out measurements

Calibration seeds **101–120**: one unstimulated run per seed per context. No
olfactory or bristle pulse is run until thresholds are written to a separate
calibration file, whose hash accompanies subsequent results. For each context
and command, take the nearest-rank 95th percentile of absolute natural drift.
The prospective noise-aware tolerance is `max(0.05, percentile)`. Keep the old
0.05 result beside it. If any calibrated command tolerance exceeds **0.1**,
the drift adjustment for that context is unqualified: use the ORIGINAL 0.05
for every command instead, and label any pass as strict recovery, not a pass
granted by the noise envelope. Report the broad drift benchmark as uninformative. This is a descriptive
drift benchmark and prospective practical tolerance, NOT a null distribution
for coupled trajectory differences or an inferential equivalence test. These are explicit
study tolerances, not biological thresholds. Watched-population tolerance stays
1 Hz; a drift correction cannot excuse persistent population activation.

Evaluation seeds **21, 22, 23**, never used in the initial assay or calibration:
This is a descriptive fixed-seed screen, not a population-level reliability or
statistical equivalence claim. The 20-seed percentile is the 19th order statistic,
not a simultaneous 95% confidence bound. Freeze source hashes for runtime, sim,
io, params, state, regions, eyes, vision and eye-columns and the connectome SHA
`51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c`.
Store resolved ORN and bristle body IDs and the original annotation URL/hash.
Bind the acquisition script, helper and this design text by one assay hash;
bind the reducer separately. Calibration and resume require matching hashes.

- Pinned: all five groups DM1, VA2, DA2, V, DM5 at all five rates 10, 25, 50,
  100, 200 events/s, their matched bristle comparators, and a no-stimulus run.
- Wandering: all five groups and their comparators at 100 events/s, plus a
  no-stimulus run. This diagnostic subset is selected before measurement to
  compare the same rate shown in the initial report; it cannot establish the
  complete wandering-context dose response.

All input groups are appended in the same order to every brain, even when
their rates are zero. Controls cannot differ in existing input random streams.
Verify identical pre-stimulus observations and, in wandering pairs, identical
arousal/scene trajectories. The natural-drift calibration is a noise envelope,
not a causal attribution: olfactory residuals inside it alone do not prove that
arousal caused them. Compare wandering with pinned results and the bristle
comparator to distinguish rate drift from generic network trajectory sensitivity.

## Decision rule, recorded without follow-up results

An individual pulse meets recovery only when every command's final-second
paired residual is within its calibrated, qualified tolerance and every watched
population is within 1 Hz of control. Report the final-five-second result too;
it cannot replace a failing primary window. Independently bound every individual
readout's last-five-second paired residual by 0.05 times its decoder scale:
DNg100 and each DNa02 2 Hz, MDN 2, DNp01 10, flight 6, DNg12 3, MN9 2, pIP10 2.
This prevents cancellation or clamping from hiding readout persistence.
Report the per-command counts and
readouts responsible, plus final-window cells with the largest rate differences.

Recovery supports advancing to the steering experiment only if **every pinned
olfactory trial** meets that rule, every watched population's absolute paired mean is within 1 Hz in EACH late
five-second block, and the LH dose response rises
at every adjacent strength in every evaluation seed. LH response is raw mean
spike rate over the five stimulated seconds, minus the same-window control
rate, over the exact LH population above. A tie fails this separate responsiveness
screen; it is not called instability. A sparse persistent-cell flag is an absolute
rate difference of at least 20 Hz in EACH late block, including sustained
suppression. Flags unconditionally prevent advancement; no explanatory waiver
is allowed. These are diagnostic study cutoffs, not pathological thresholds.
An unqualified noise envelope grants no relaxation: only passing the original
strict command bound can support recovery in that case. Primary recovery,
late persistence, and dose responsiveness are separate reported outcomes.
Comparator qualification is per glomerulus and condition: an unqualified
comparator blocks modality attribution, not advancement when every olfactory
recovery, persistence and responsiveness requirement independently passes.
No outlier or rate is dropped.

For each seed/channel/rate/context, report signed residual vectors and
`M = max(abs(commandResidual[k])/effectiveTolerance[k])` for odour and bristle, their
paired difference, and `C[k] = abs(odourResidual[k])-abs(bristleResidual[k])`.
Effective tolerance means the calibrated practical bound in a qualified context,
or 0.05 in every command otherwise. Report the mean and range over seeds, never a pooled trial p-value. A modality
excess requires C[k] > 0.05 in every seed for the same command. It supports
only a larger residual for these selected perturbations, not olfactory specificity
or a shared mechanism. Also report the 100-Hz background interaction of C[k]:
`C[k,pinned]-C[k,wandering]`. Natural within-run drift and pulse-paired residuals
remain separately labelled.

| Qualified comparator outcomes | Interpretation |
|---|---|
| Both recover | Transient effects within stated bounds on these seeds |
| Odour fails, bristle recovers | Odour persistence in this comparison; locate it; no universal modality claim |
| Odour recovers, bristle fails | Persistence is possible outside olfaction; odour is not failing this criterion |
| Both fail | Persistence follows both interventions; shared mechanism NOT established |
| Expected or measured drive outside 0.8–1.2 | Modality contrast unresolved; no retuning/rematching |

Pinned versus wandering changes timing of background drive while matching its
mean, but can still change network susceptibility. Within-drift residuals alone
do not prove that arousal caused the failure.

If this recovery-qualified gate 2 passes, preregister a mirrored gate-3 assay
using annotation rootSide, excluding unknown sides: equal antennal rates and
both mirrored asymmetries in DM1 and VA2, same total requested drive, paired
controls and every seed. Do not equate bilateral commands with validated valence.
If recovery fails, stop and identify the persistent commands, readouts and cells;
do not add a plume or modify default/native behaviour.

## Design-review rubric

Score each 0–10: control validity (drive matching and exogenous state), separation
of calibration from evaluation, ability to attribute persistence, decision-rule
clarity without favourable-case selection, and reproducibility/scope. A 10 means
the design can distinguish its stated alternatives, has prospective measurable
criteria and leaves missing biology explicit. Identify fatal flaws before any
measurements are made. Reviewers receive only this design and model references,
not previous scores or a preferred outcome.
