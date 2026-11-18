# Learning from smells in play: protocol

Written and committed on 18 November 2026, before any measurement it
describes. Food in the world now gives off odour
([smell in the world](smell-protocol.md)), and odour fires the mushroom
body's Kenyon cells (KCs), which nothing the fly saw, tasted or felt did. This
asks whether the fly now learns in play, and what that comes to over long
play. Nothing in the model or the game changes for it; the
[brain's Learning](../packages/brain/README.md#learning) has the rule being
measured.

Everything runs through `scripts/smell-learning.ts`: the whole fly (the
game's `Life`: the TypeScript brain, body and senses, no rendering), 10 ms
steps, odour sources pushed into `life.pantry.foods` as the world's food is.
Learning on and off is the same seed, from the same start (the brain without
learning: `FlyBrain`'s `learning: false`).

## Part A: which two odours

The world has five different smells (`packages/world/src/tastes.ts`): ripe fruit
(ethyl acetate and ethanol 0.1), banana (isoamyl acetate 1, ethyl acetate and
ethanol 0.1), ketchup (acetic acid 1), soda (CO₂ 0.3) and the lab's fly food
(all five at 1). For each, the brain alone, eyes shut, at rest for 1 s, then
the odour at its food's edge strength at both antennae for 2 s, seeds 1 to
12: the KCs that fire. The pair is chosen by a rule fixed here: of the
odours that fire at least 1% of the KCs in every seed, the two whose KC sets
overlap least (Jaccard index, mean over seeds). An odour's own KCs, for Part
B, are those it fires in that seed and the other doesn't.

## Part B: conditioning in play

**Arena.** The ethogram's open disc, 43 mm across (`scripts/ethogram.ts`,
`ARENA`), still air, the clock held at 06:00, hunger held at 1, the eyes
seeing uniform grey (0.5) as in the smell protocol. Two sources 3 mm in
radius, their centres 10 mm either side of the middle, each giving off its
odour at its food's edge strength, kept whole. Which side the CS+ is on
alternates with the seed (even seeds +x). The fly is set down 12 mm from the
middle on the line between them, facing across it, equidistant from both.

**Training, 300 s.** The CS+ is paired with one of the two things in the
game that teach (Learning, Reward and punishment):

- *Loom*: whenever the fly's head is within 5 mm of the CS+'s centre, the
  swoop as its eyes would see it (a dark disc from straight above, l/v 40 ms,
  drawn every frame: the training assay's), at most once every 10 s.
- *Sugar*: the CS+ source tastes of sugar (`sweet` 1), tasted as any food
  patch is; the CS− tastes of nothing.

**Test, 180 s**, straight after: both sources give off their odour, neither is
sweet, nothing swoops.

**Flies.** Seeds 1 to 12, each odour as the CS+ in turn, each US, learning on
and off: 48 learning flies and 48 without.

**Endpoints, synapses** (learning flies): the KCs that fire in training and
their spikes; the learning connections changed after training and after the
test; and, by compartment (γ1, γ2, α′1 and α3, which the loom's PPL1 cells
teach; γ4 and β′2a, which sugar's PAM cells teach), the mean factor of the
connections from each odour's own KCs, after training and after the test.
The paired odour's synapses are depressed specifically if, in the US's
compartment (γ1 for the loom, γ4 for sugar), the CS−'s mean factor less the
CS+'s after training averages more than 0.1 over the flies, with its 95%
bootstrap interval above 0.

**Endpoints, behaviour.** Near a source: the head within 5 mm of its centre.
In the test, the preference for the CS+, (time near CS+ − time near CS−) /
their sum; a fly near neither has none. The primary endpoint is the paired
difference, learning on less off, per seed and CS+, over the pairs where both
flies have a preference (its mean and 95% bootstrap interval, 10,000
resamples, seeded). Fixed now:

- *Conditioned avoidance* (loom): the mean paired difference is below 0 and
  its interval lies wholly below 0.
- *Conditioned approach* (sugar): above 0 and its interval wholly above 0.
- An interval wholly on the other side is reported as a change opposite to
  conditioning. Anything else is no conditioned behaviour detected, and the
  interval bounds how large one could be.
- Fewer than 12 pairs with a preference in an arm makes that arm
  inconclusive.

Described, not decided on: the paired differences in time near each source,
visits to each, the mean visit (how soon it leaves) and when it first came
near each (how soon it approaches), with their intervals; how many pairs'
tests were identical.

## Part C: long play

The lab (`WORLDS.lab`), its food as the game sets it out, the pantry tended
and hunger running as in the game. The fly is set down 6 mm from the centre
of the fly food at (36, −8), the clock running from 08:00 for 6 hours of game
time. Eyes uniform grey, as above (Node draws nothing). Seeds 1 to 3, learning
on and off.

Every 10 minutes of game time: of all the learning connections, how many are
changed, below half their strength and below a twentieth (0.05), and the
lowest; of the fly food's own KCs' connections (those its odour fires, Part
A's measurement, seed by seed), each taught compartment's mean factor and the
share below 0.05; the bytes `exportMemory` would save. And what it did: time
with its head within 2 mm of a smelling food's edge, walking, asleep, in the
air, eating, the mean of the strongest odorant at its antennae, KC spikes.

Fixed now:

- The weights *saturate* if every taught compartment's mean for the fly
  food's KCs moves by less than 0.02 over the last two hours.
- The memory is *clearly not a fly's* if at the end, in any compartment, half
  or more of the fly food's KCs' connections are below 0.05: that odour's
  input to those output neurons all but gone, though nothing ever punished or
  fed it there. (A fly's unpaired odour lowered MBON-γ1pedc's response by a
  quarter: Hige et al. 2015, Neuron 88:985, as the README cites.)
- Its behaviour *drifts with the weights* if, in all three seeds, the
  difference learning on less off in time near smelling food, or in time
  walking, has the same sign in the last two hours and is more than 10
  percentage points.

If the memory is clearly not a fly's, the smallest fix is proposed, and made
only if a measurement in the literature fixes its constant (the README lists
what isn't modelled: forgetting, the compartments' different rates);
otherwise the model is left as it is and that is said.

## Reported

All of it, every seed, with ranges; the CPU it took. The README's Learning,
the About screen's sentence on learning and docs/simulation.md say what was
measured and no more.
