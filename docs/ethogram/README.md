# Offline behaviour scorecard

`node scripts/ethogram.ts` runs the real FlyEM male CNS spiking brain, `Life`,
senses and body headlessly. It registers 21 verified literature conditions and
records motion/bout diagnostics plus an optional optical escape battery.
The [assay ledger](assays.md) explains every eligibility decision, including all
nine previously unsupported rows. Eight feeding conditions cannot run because
the model has no discrete sips/bursts or calibrated deprivation states; the
ninth, optical escape, is executable through the actual eyes.

```sh
npm ci
npm run brain:fetch
# One recorded hour, then independent visual trials; no extra slot wrapper.
node scripts/ethogram.ts --assay all --hours 1 --seeds 1 --hour 6 \
  --trials 8 --seed-base 20000 --trace-dir /tmp/ethogram-frames --out /tmp/ethogram.json
# Optical battery only: 48 black-square + 48 checkerboard + 8 flash + 8 blank.
node scripts/ethogram.ts --assay escape --hour 6 --trials 8 \
  --seed-base 30000 --trace-dir /tmp/escape-frames --out /tmp/escape.json
```

`--assay training` runs the [training assay](assays.md#training): two
coloured dishes, sugar or a swoop on one, then a choice, with the brain's
learning on and off. It is context, not scored.

The default free run uses three seeds, 60 s burn-in and one recorded hour each.
Each seed is reported separately. `--place arena` selects a 43 mm open disc;
the game's named places also work. **Every assay holds clock time at `--hour`
(default 06:00, ZT0), sunrise 06:00, sunset 18:00.** Sleep pressure and stillness
continue evolving; no sleep command is overridden. The cited assay populations
do not establish a matching clock time. Hunger uses its existing 60× metabolic
clock, so simulated motion hours are not physiological deprivation hours.

The CLI atomically leases one of eight `/tmp/flies-heavy/slot-N` directories,
writes its branch to `owner`, releases after at most 9.5 minutes, and waits two
minutes before reacquiring. Animal state survives fairness pauses. A checkpoint
every simulated second also lets interrupt handlers release the lease. Wall
time includes slot waits, CPU time does not. No renderer, server, sound or
worker process is created. Exported assay functions require a caller-provided
lease/checkpoint for heavy work.

## Measurement definitions

Displacement gives speed; commands do not substitute for movement. Translation
is >0.5 mm/s on the ground; activity additionally includes |yaw|>20°/s.
This does not reproduce Cruz's smoothing, duration and gap rules, so that
comparison gets no score. Edge occupancy is the outer half of floor area;
an open-disc edge is not a wall. Grooming is the game's visible head-groom
state, not a dust-evoked body-part sequence. Eating is continuous consumption,
not individual sips. Airborne bouts include jumps and falls and are not
validated sustained-flight bouts. Categories can overlap.

Durations include complete bouts only. Both observation endpoints are
censored; censored time still contributes to occupancy. Bout rates count known
starts. Zero observed events means zero event rate and undefined duration.
Completed-bout summaries underrepresent long bouts; censor counts are retained.

Saccades are contiguous ground |yaw|>200°/s. A peak-centred angle includes the
whole ±50 ms window, with airborne or truncated windows rejected. Threshold
duration is not the paper's full-turn duration. The existing body command gain
is 3 rad/s (172°/s), below the detection threshold. Neither saccade reference
is scored. Speed quantiles use 0.1 mm/s bins and yaw quantiles 1°/s bins, with
inverse weighted CDF and overflow accounting. Free samples are 10 ms; optical
frames are 5 ms. No-events durations and out-of-range quantiles stay N/A.

The JSON retains seed, commit and dirty flag captured before simulation,
connectome SHA-256, trial/sample counts, readiness failures, censoring and
CPU/wall cost. Additional attribution counters expose antenna-bump time,
current neural grooming, visible grooming without a current command, ground
yaw differing from intent, and sleep. They are diagnostics, not causal proofs.

## Scores and scope

The primary-paper registry states location, value, statistic, population,
reported uncertainty and limitations. Arbitrary tolerance guesses were removed.
Six free-motion comparisons are visible context only because their assays do
not match. Feeding is explicitly unsupported. Optical probability uses bounded
Bernoulli distance; timing fits use labelled reported fit spread as an
engineering scale. No claimed biological acceptance range is inferred from
SE, histogram bins or an author-selected width. See [the exact score
policy](assays.md#score-definition).

Separate optical probability/timing means are reported only over estimable comparisons. Schema 3 requires a continuous ≥50 ms powered episode in the first airborne
bout; cumulative intervals and later jumps cannot qualify it. Missing
latencies remain N/A, so an absent response cannot masquerade as a zero latency.
A validated whole-animal point score is **not identified**. Registry-average bounds
allow unavailable comparisons every score from 0 to 10. They express coverage,
not confidence or biological normality. Multiple conditions and timing
coefficients are correlated; they are not 21 independent traits.

Inherited stand-ins are visible in every report: stochastic arousal and visual
background drive, body edge/wall turns, food alignment, grooming persistence,
and tarsal flight support. All observed behaviour includes these mechanisms.
Protected sleep, hunger, grounded signals, visual ON pathway and antenna-contact
work remain with their owners. No neural threshold is tuned to increase scores.

[Current dev measurements](current-dev.md), [review record](review-log.md), [historical unclocked measurement](baseline.md), [dev 588da9b1 measurement](dev-588da9b1.md), [dev 58481d6c measurement](dev-58481d6c.md),
and [model proposals](proposals.md) preserve findings and rejected approaches.
A broad biological score needs more matched assays; the registry alone cannot
supply one.

Only complete, trial-backed optical records can earn scores. The estimator validates
the condition grid, unique seed cohort, fixed clock, geometry, sensory route and
TTC consistency and finite capture-window bounds, then recomputes all coefficients from raw trials. Scalars cannot
earn credit. The composite weights probability and timing equally and is N/A if
either pattern or any timing fit is unavailable. Registry-average bounds are
not bounds on whole-animal fidelity; whole-animal coverage is listed by domain.


For independently replayable captures, use `--trace-dir` with a **new directory**
that does not yet exist. Schema 4 stores exact binary body observations and
SHA-256 digests. The CLI reconstructs the free statistics from positions and
headings and independently derives first-flight continuity from optical states
before writing the report. `--analyse` repeats digest and replay checks.
Schema 3 remains readable but has no raw-frame verification; schema 2 requires
rerunning. The byte layout and limits are in [trace format](traces.md).
Raw files are external experiment evidence and must not be committed.
