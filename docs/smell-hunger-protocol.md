# Hunger on smell: protocol

Written and committed before any measurement it describes. The model under
test is the commit that adds this file: slow neuromodulation's sNPFR1 on the
receptor neurons of DM1, DM4 and DM2, from a stand-in for sNPF signalling set
by hunger (`packages/brain/src/modulation.ts`; packages/brain/README.md,
Hunger). Its constants are Root et al.'s (2011, Cell 145: 133) as read off
their figures, and nothing below changes them, whatever it finds.

"Without" is the same brain with the stand-in held at the starved end, where
the receptor neurons' weights are as wired: the brain before this change,
spike for spike. At hunger 1, and at 0.5 (8.3 hours without food, past the
measured plateau at 4), with and without are the same brain, so only hunger 0
has a "without" to run. Hunger also acts on taste and on the made-up arousal;
comparing with and without at the same hunger takes those out.

## Part A: at the site

The brain alone (`packages/brain/scripts/smell-hunger.ts --part site`),
eyes shut, standing, resting senses, hunger held, 2 s of rest, then ethyl
acetate at both antennae for 2 s, at 1 and at 0.25; seeds 1 to 3. Endpoint:
each glomerulus's projection neurons' mean rate over the 2 s (DM1_lPN,
DM4_adPN and DM4_vPN, DM2_lPN; VA3_adPN and VM2_adPN, which the receptor
doesn't reach, as controls), at hunger 0 with and without, and at 0.5 and 1.

Prediction, from Root et al. (starved flies' DM1 and DM4 projection neurons
answer ethyl acetate more than fed flies': their Figure 1E): DM1's projection
neurons fire less at hunger 0 with the receptor than without.

## Part B: steering (the gate protocol's Part C)

Exactly [the gate protocol's](olfaction-gates-protocol.md) Part C (the brain
alone, open loop, wandering background on, clock and sleep 0, standing, eyes
shut, resting senses, a fresh brain per run, 20 s settling, then 5 s with the
odour, T = (turn mirrored − turn as written) / 2, seeds 41 to 50, each with a
control), for its conditions P1 (ethyl acetate 1 at one antenna) and S2
(ethyl acetate 0.25), at hunger 0, 0.5 and 1 with the receptor, and at
hunger 0 without (`smell-hunger.ts --part steering`). Hunger 1 is the gate
protocol's own measurement again and must reproduce it.

Reported for each: T's mean, its 95% t-interval and the seeds toward, by the
gate's rule (passes when at least 8 of 10 are toward and the interval
excludes 0). The receptor's effect on steering is, for each seed, D = T with −
T without at hunger 0, judged by the same rule: the paper predicts D < 0 (a
fed fly's DM1 passes on less, and DM1 is what starved flies need to find food
faster: Root et al., Figures 2 and 5).

## Part C: the Kenyon cells

`packages/brain/scripts/olfaction-kc.ts`'s measure (ethyl acetate at full strength at both
antennae for 2 s after 2 s of rest, seeds 1 to 3) at hunger 0 with and
without, 0.5 and 1: the share of the 4,064 Kenyon cells that fire, and the
projection neurons' and output neurons' mean rates (`smell-hunger.ts --part
kc`). Reported, no decision: a real odour fires about 5 to 10% of them.

## Part D: cost

The receptor's weights rewritten (the three glomeruli's receptor neurons' outgoing
connections), timed as `packages/brain/scripts/hunger.ts` section d times DopEcR's
(`smell-hunger.ts --part cost`). They are rewritten only while hunger is
under the plateau's, about 0.28, and a factor changes.

## Decision, fixed now

1. The change is kept if, in Part A, DM1's projection neurons fire less at
   hunger 0 with the receptor than without, at ethyl acetate 1 and at 0.25,
   in each of seeds 1 to 3: the effect reaches the site's first synapse the
   way it was measured.
2. It is not kept if Part B's D is positive by the gate's rule (a fed fly
   steering toward ethyl acetate more with the receptor than without), which
   would contradict the paper.
3. Otherwise Part B is a result, reported whichever way it comes out: D < 0
   by the rule is hunger turning smell up in steering; D not distinguishable
   from 0 is the receptor's effect on the projection neurons not reaching
   steering at this size.

If it is not kept, the receptor and its stand-in are removed, the brain left
as it was, and this file and the script stay, with the result.

## Result

Measured on the commit that added this file, as written; nothing above was
changed afterwards. Decision 1 holds (DM1's projection neurons fire less at
hunger 0 with the receptor than without, at both strengths, in each of seeds
1 to 3), decision 2 doesn't apply (D is negative), and by decision 3 hunger
turns smell up in steering: at ethyl acetate 1, D = −0.066 (95% interval
−0.073 to −0.060), negative in 10 of 10 seeds. At 0.25 the turn is too faint
to judge with or without. So the receptor is kept. The numbers are in
[packages/brain/README.md, Hunger](../packages/brain/README.md#hunger).
