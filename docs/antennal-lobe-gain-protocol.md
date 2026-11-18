# The antennal lobe's gain control, and smell firing at rest: protocol

Written and committed before any measurement it describes, on `dev` as it
is. The question: can a measured gain control at the olfactory receptor
neurons' (ORNs') terminals let them fire at their recorded resting rates
(`BrainOptions.restingSmell`) without locking the antennal lobe, as it does
now (packages/brain/README.md, Smell)? Every mechanism below is applied in
a script (`packages/brain/scripts/al-gain.ts`), to the ORNs' release (an
output gain on each glomerulus's group, as slow neuromodulation scales
release); the model is not changed unless one passes.

## The mechanisms, with their constants as published

The ORNs' rates are inputs the brain sets (the table's resting rate plus each
odorant's answer), so each mechanism's gain is worked out from them, every
tick, and is the same for every seed.

- **R, resting firing alone**: `restingSmell` on, release as wired. The known
  failure, as the baseline.
- **N, divisive normalisation as published** (Olsen, Bhandawat & Wilson 2010,
  Neuron 66: 287, Equations 2, 5 and 6 and Methods): a projection neuron
  answers its ORNs' rate ORN as R_max·ORN^1.5 / (ORN^1.5 + σ^1.5 + s^1.5), with
  s = m·Σr/190, Σr the summed rate of Hallem & Carlson's (2006) ORN types and
  m = 10.63 (VM7's, which their simulations used for every glomerulus; DL5's
  was 4.19), σ = 12 Hz. Lateral inhibition there is input gain control, a
  horizontal scaling: the same as scaling the ORNs' rate by
  g = σ / (σ^1.5 + s^1.5)^(2/3), which is applied here as their release. Σr is
  over the 23 glomeruli whose table row is Hallem & Carlson's, each antenna's
  own (the antennal field potential was one antenna's), and g of each antenna
  is applied to its ORNs, the mean of the two s to those whose antenna isn't
  recorded. Every rate in Olsen et al.'s fits is odour-evoked, the baseline
  subtracted, so as published r is each type's rate less its resting rate,
  floored at 0, and at rest s = 0 and g = 1: N is R at rest, and only
  changes odour responses.
- **N₀, the same with the resting rates counted in**: r is each type's whole
  rate. An extrapolation beyond the fits, said so.
- **B, the bound**: every ORN's release divided by 2.53, at rest and under
  odour. Blocking GABA-B receptors, which sit on the ORNs' terminals, raises
  a projection neuron's gain by at most 153% of the glomeruli measured (DA1;
  67% and 43% for two others, 0% for CO₂'s; Root et al. 2008, Neuron 59: 311,
  Figure 1). No measured presynaptic inhibition is stronger, so if B fails at
  rest, no gain control at the ORNs' terminals of a measured size can pass.

Not tried: a rule from the connectome's GABAergic synapses onto the ORNs'
terminals. Every input to a sensory neuron in the CNS is onto its axon, so it
is presynaptic, but turning a local neuron's spikes into a fraction of an
ORN's release needs a constant no measurement gives; B bounds what any such
rule could do.

## Endpoints

At rest (`al-gain.ts --part rest`): the brain alone, standing, eyes shut,
resting senses, hunger 1, the wandering background on, 5 s settling, then
10 s measured; seeds 1 to 3. Each mechanism's mean rate of: the broad local
neurons, by family (il3LN6; lLN2F_a and _b; lLN2T_a to _e; lLN2P_a to _c);
MZ_lv2PN; the uniglomerular projection neurons (types ending `_adPN`, `_lPN`,
`_vPN`, `_lvPN`, as `scripts/resting.ts` takes them), mean and median; the
Kenyon cells; every antennal lobe local neuron.

Under odour, only for a mechanism that passes at rest: ethyl acetate at full
strength at both antennae for 2 s after 2 s of rest, the Kenyon cells' share
firing (`scripts/olfaction-kc.ts`'s measure), and [the gate
protocol](olfaction-gates-protocol.md)'s Part C (P1, seeds 41 to 50).

## Pass, fixed now from physiology

At rest, in each of seeds 1 to 3:

1. every broad local neuron family's mean between 5 and 20 Hz (the range
   packages/brain/README.md gives for local neurons at rest; its source could
   not be read again for this work, and a failure by more than a factor of two
   either side would stand under any range the literature gives);
2. the uniglomerular projection neurons' mean between 2.3 and 9.2 Hz (within a
   factor of two of the 4.6 Hz measured: Turner, Bazhenov & Laurent 2008);
3. the Kenyon cells' mean between 0.02 and 0.5 Hz (within a factor of five of
   the 0.1 Hz measured, ibid.).

Then, under odour: 5 to 10% of the Kenyon cells firing, and Part C's P1
passing by its own rule. Then nothing else broken: `scripts/report.ts`'s
response matrix and recovery sections, and the sleep tests' backing at night.

A mechanism that fails at rest is not taken further. If none passes, the
mechanisms' code is not kept in the model, `restingSmell` stays off, and this
file, the script and the result stay. If one passes, whether resting smell
should be on by default is decided on the measurements above and its cost,
and only then is `scripts/resting.ts` run to ask, by the criteria that script
already fixes, whether the made-up visual background could be smaller.
