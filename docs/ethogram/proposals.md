# Findings requiring follow-up

## Historical open-edge antennal contact

This finding was captured on dev `c53a64c` and handed to the antenna-contact
owner. It is now fixed upstream by #114; the fresh `cb9b9da2` hour records zero
bump input and zero grooming. No antenna code is changed by this branch.

The one-hour disc run spent 84.38% of recorded time displaying head grooming,
94.59% of grounded time in the outer half of the disc, and only 4.91% translating.
This is an environmental diagnostic, not a published grooming comparison.

`SenseTracker.#pressing` (`packages/body/src/senses.ts`) then returned `body.onFeet`
when an antenna tip lies outside `world.onTable`. Empty space beyond the floor
therefore supplies full contact to that antenna. This drives Johnston's-organ
C/E input, which the existing brain README documents as causing head grooming
and suppressing walking. An empty boundary does not physically deflect an
antenna. The code path is established; its quantitative contribution to this
run has **not** been isolated with a controlled intervention or contact tally.
The elevated grooming occupancy alone does not prove that this is its sole cause.

Proposal for the body/collision owner: distinguish an actual object touching the
antenna from absent floor under its tip. Keep existing physical-wall and other-fly
contact, and leave grounded/load input to its owner. Validate an antenna extending
past an open ledge with no object, a real wall at the same position, and an airborne
antenna inside a solid. Then compare paired seeds through the real brain and body,
reporting both contacts and behaviour; do not replace the contact with an edge-turn
command. No production change is made here because boundary/collision work is
owned by another experiment.

## Steering calibration

Closed: [Steering from recordings](steering.md). The paired DNa02 recordings
were fitted under a protocol fixed first. Three of the four give usable spikes
and agree on the walking gain, 6.4 ± 1.5 °/s per Hz of right-minus-left rate
about 110 ms later (the body's chosen gain is 4.3). Read through the brain's
rate readout, though, they predict a held-out fly's turning poorly (R² 0.05
to 0.23), and the recording chosen in advance to be held out fails the
paper's own −33 mV limit. The body's mapping stays as chosen, and the absence
of saccades stays what it was: the chosen cap, not a measured one.

## Assay coverage

Individual feeding contacts/bursts, dust loads and posterior grooming
readouts are missing. Optical looming is now executable,
as documented in `assays.md`; its surrogate limitations remain explicit.
Continuous intake cannot be counted as repeated
sips, head grooming cannot establish a whole-body hierarchy, and injecting the
loom-detector input cannot validate a projected visual escape. Hunger and the eyes'
ON pathway remain with their existing owners. More unconditioned simulation hours
cannot repair these measurement gaps.

## Optical pattern selectivity and light-off (do not tune the motor threshold)

The optical pilot at 06:00 (ZT0), with the real facets and zero direct loom
inputs, yielded 1/6 black-square jump-and-flight responses, 0/6 checkerboard,
1/1 uniform dark flash and 0/1 blank. These tiny pilot counts motivate the
independent cohort; they do not estimate population probabilities reliably.
Fotowat et al. (2009), Results/Figures 2–3, reports 82% and 87% looming
responses, while red-eyed WT light-off had 0/10 responses. Our uniform flash
is not the paper's four-LED apparatus and pigmentation is absent, so it remains
an unscored diagnostic. The contrast between the model's patterns may expose
luminance-driven escape rather than robust expansion selectivity.

The source distinguishes parallel non-GF visually guided escape from the GF
light-off pathway. The model's takeoff command reads the giant fibers; a
body-level launch mapping cannot manufacture the absent descending decision.
Do not lower ESCAPE_ON to make checkerboards succeed. Eye ON-pathway or
other protected neural work belongs to its owners; this finding is a proposal
for pathway/readout validation, not a code change to those areas.

The historical dev `588da9b1` 112-trial cohort (seeds 20000–20111, 06:00) confirmed the pattern:
20/48 black squares, 1/48 checkerboards, 7/8 uniform flashes, 0/8 blanks;
all met stationary readiness. Black-square TTC fit: slope 2.259 (model SE
0.442), intercept −81.574 ms (model SE 11.833). The paper's central intercept
is −6 ms; negative model TTC was retained. One checkerboard response cannot
support a timing fit. The body impulse-direction experiment preserved every
first-response time and success in this paired cohort; changing launch
mechanics cannot create the missing visually guided decision.

A further readout mismatch deserves a separate neural/interface experiment:
`DNp01` is smoothed with tau=40 ms and normalized at 200 Hz before the body's
0.4 (80 Hz) takeoff threshold. A single spike in one of the two GF neurons,
observed over a 5 ms chunk, produces `(1-exp(-5/40))*1000/(5*2*200)` =
0.05875 command units, far below 0.4. Fotowat et al. describes single-GF-spike
motor activation, while WT visually guided escape can use a parallel non-GF
pathway. Lowering the body threshold to manufacture checkerboard success
would neither restore that missing pathway nor establish correct WT light-off
selectivity. The clipped, smoothed command also cannot be treated as an exact
single-spike timestamp. No threshold change is made here.

Current dev `58481d6c` changes the quantitative picture: black-square responses
are 44/48 in both independent cohorts, checkerboard 26/48 and 27/48, flash
8/8 and blank 0/8. The two complete optical engineering composites are 3.9375
and 4.7361/10. Timing and checkerboard selectivity remain poor; the historical
counts above must not be presented as current measurements. Upstream antenna,
collision and sleep work landed together, so no isolated mechanism is inferred.
See `current-dev.md` for exact fits and uncertainty. A body impulse change did
not alter response timing in its paired experiment and was rejected in review.


## Visual update and paired checkerboard loss

A fresh rebase onto dev `cb9b9da2` includes the protected ON pathway (#104).
Using the same assay and fixed seeds as dev `58481d6c`, checkerboard responses
fell 26/48 to 11/48 and 27/48 to 11/48 in the two independent seed cohorts.
There were 18 paired losses/3 gains and 17 losses/1 gain. Readiness times and
eligibility match exactly; black-square responses changed 44/48 to 45/48 and
44/48 to 44/48, flash stayed 8/8 and blank 0/8. Every free-hour diagnostic
matches exactly. The six-comparison engineering composites changed 3.9375 to
3.104167 and 4.736103 to 3.413598. These are upstream snapshot observations,
not changes made by this branch or population-level biological statistics.

### Mechanism, isolated (dev 28015737)

Rerun on dev `28015737` gives the same counts: checkerboard 11/48 in both
cohorts (seeds 20000–20111 and 30000–30111), black square 45/48 and 44/48,
flash 8/8, blank 0/8. The pre-#104 code (`cb9b9da2^1`) and the current code with
`RETINA.withdraw` at 0 fire the same spikes under the checkerboard, so the
whole loss comes from L1's withdrawals. With the withdrawals off and nothing
else changed, the same cohorts give checkerboard 26/48 and 27/48 and black
square 44/48 and 44/48: the dev `58481d6c` numbers exactly. With them on and the
three Li types below muted (a diagnostic, not a proposal), seeds 20000–20111
give checkerboard 48/48, black square 48/48, flash 8/8 and blank 0/8. That
overshoots the paper's 82–87%, which is one more sign the cells shouldn't be
muted.

Replaying the assay's own stimulus on a still brain (l/v 10, 40 and 80 ms,
seeds 1–6) traces the path. The bright squares drive Tm3, and through it three
small GABAergic lobula intrinsic types that inhibit LC4. Li28 has 6 cells per
side; nearly all its input is Tm3 and Tm2 in equal parts, and it makes 3,780
synapses onto LC4. Li17 (10 cells) and Li29 (4 cells) add 1,511 and 1,298
synapses onto LC4. Li28 rises from 3–11 Hz to 16–60 Hz. Direct ON excitation of
LC4 (Tm3, TmY3) doesn't make up for it. The giant fiber fires 21–41% less, and
DNp02, DNp04 and DNp06 fall with it. LPLC2 stays at 0.1–0.5 Hz with or without
the ON pathway, and T4/T5 change by 0.1 Hz. On the still brain, black squares
are spike-for-spike unchanged. In the assay, 9 and 11 of the 48 black trials per
cohort change take-off time (all at l/v 20–80 ms), and one gains a response.
That is likely the body's own movement under the fixed screen moving the
square's edge back off some facets, which brightens them; it was not isolated.
Full numbers are in the brain README, Seeing.

This is the connectome as modelled, not an error in the ON model: the signs,
synapses and withdrawal scale follow the cited physiology, and Li17/28/29
really are wired from Tm3 to LC4. What turns the checkerboard's bright half
against escape is what the model lacks:

- each Li cell is a single point neuron pooling 120–290 columns, so local bright
  squares inhibit every LC4 it reaches;
- LPLC2's expansion selectivity from T4/T5 edges of both signs is missing
  (weak direction selectivity, no resting Mi9);
- the parallel non-GF visually guided escape (Fotowat et al. 2009) has no readout.

No code changes. Muting the Li cells, raising ON or loom gain, or lowering
`ESCAPE_ON` would recover the number without giving the fly what a real one
uses for this stimulus. The paper pools an orientation mixture, while this
model uses a right-side screen; counterbalance that reconstruction asymmetry in
a separate validation assay.

The regression review also found that the inherited HS direction-selectivity
guard changed from 2× to 1.3× in `packages/brain/src/seeing.test.ts`. A pass
under the latter bound does not establish preservation of the former. This
change belongs to the upstream visual work, not the ethogram feature diff.
All five current CPU budgets pass, but the all-senses brain case supplies only
scalar senses; it does not exercise active visual withdrawals. A controlled
native/WASM checkerboard, grating and flicker cost replay remains needed.


## Steering raw-data audit — no calibrated gain claimed

Closed: [Steering from recordings](steering.md#the-source) resolves what this
audit left open. The two bin widths are the paper's two rate pipelines (its
text says 1.25 ms and 2.5 ms, the archived notebook 12.5 ms and 25 ms; which
one has the slipped decimal point can't be told), and neither enters the fit,
which applies the model's own readout to the spikes. The files' units are an
older calibration than the authors' final one (yaw about 10% high). Spikes
were extracted per cell with their own checks in all four recordings; a2_d_14
fails them.


## CPU calibration at low host load

After rebasing onto dev 6eda5cb4, the full five-case budget run passed four
and skipped brain cost. Three rejected samples had work max/min 1.52 > 1.35,
then reference max/min 2.26 and 2.27 > 2. Load was 1.21 before / 1.46 after
on 18 logical CPUs. A bounded brain-only repeat rejected work ratio 1.45,
then reference ratios 2.73 and 2.49. Prior matching CNS source passed at
0.263 against 0.500 M5 Pro CPU s/s under higher load. Aggregate load therefore
does not by itself establish calibration validity. The budget owner could
investigate core placement, frequency changes and sample granularity while
preserving existing limits and raw variance. These are hypotheses, not causes
isolated by this audit. A rejected sample is neither a pass nor a cost failure.
