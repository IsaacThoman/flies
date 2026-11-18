# The central complex: can it hold a heading and steer by it?

A diagnostic, with its criteria fixed before measuring, of whether the
heading circuit of this model's central complex can do what it does in a fly:
keep a bump of activity that stands for the fly's heading, move it when the
fly turns, and turn the fly toward a goal by comparing the two. Nothing in
the model's or the game's behaviour changes here: the measurements are
diagnostic inputs on top of the brain as the game runs it, and every change
to the operating point below is a labelled lift for one run, not a proposal.

**No-go.** At this model's operating point the ring cannot hold a heading:
a bump put on the E-PGs is localised while it is driven (12 of 12 runs) and
gone within 250 ms of letting go (held 0.00 s in all 12, against 5 s), and
no diagnostic lift changes that. Each lift leaves the bump dying at once or
throws the ring into seizure. Nothing the model has moves a bump: the
eyes' rotation reaches the noduli's input neurons' own input, one direction
only, and the P-ENs not at all. The steering read-out is there in the wiring
but too weak to use: PFL3's left-right difference follows a goal put in the
fan-shaped body as the fly's would, at about 1 Hz, where DNa02 needs 2 Hz
to compete. The protocol was committed before any measurement (`cafb80aa`)
and is unchanged below; two of its stimuli turned out unable to show what
they were for, and that is reported beside the variants added after it
([Changes after the protocol](#changes-after-the-protocol)).

## Why

In this model the central complex is silent at rest: E-PG, P-EN, PFL3 and the
ring neurons fire at 0 Hz, and the region at 2.7 Hz with every sense at once
([brain README](../packages/brain/README.md#resting-activity-and-what-the-background-stands-for),
Resting activity, and [Regions](../packages/brain/README.md#regions)). All of
its steering comes from the eyes' projection neurons reaching DNa02 directly.
That probably explains several things the fly doesn't do: its walking bouts
last a few seconds where a fly walks straight for much longer, it holds no
course, what its mushroom body learns moves the commands by hundredths
(learned odour valence is thought to reach steering through the fan-shaped
body), and it cannot track an odour upwind. If the heading circuit works in
this wiring, a follow-up could give the fly a heading the brain itself keeps;
if it can't, that is worth knowing before anyone builds on it.

## What the fly does

Each source was read for the claim it is cited for (full text where open,
the abstract otherwise, as marked); figures' plotted values could not be read.

- **A bump that stays.** E-PG neurons carry one bump of activity around the
  ellipsoid body that tracks the fly's heading, in darkness too, where it
  drifts; while the fly stands it "sometimes persisted for more than 30
  seconds" (Seelig & Jayaraman 2015, Nature 521:186, Fig. 4i). A bump moved
  by stimulation persists where it was put, the signature of a ring attractor
  with local excitation and global inhibition (Kim et al. 2017, Science
  356:849; abstract).
- **A spiking model can hold it.** Kakaria & de Bivort (2017, Front Behav
  Neurosci 11:8) built E-PG, P-EN, P-EG and PB intrinsic (Δ7-like, inhibitory)
  leaky integrate-and-fire point neurons, with the rest and threshold used
  here, from light-microscopy overlap; one input spike made a bump that "would
  persist indefinitely", drifting about one glomerulus a second. Their
  synapses were 20 unit currents each, with no saturation; they modelled no
  rotation by a turn.
- **Turns move it through the P-ENs.** P-ENs in each PB half project to the
  ellipsoid body shifted one tile, the left bridge's one way and the right's
  the other (Green et al. 2017, Nature 546:101, posterior view: left-bridge
  P-ENs clockwise, right-bridge counterclockwise; Turner-Evans et al. 2017,
  eLife 6:e23496, Fig. 1G). "When the fly turned right, we observed a
  transient increase in activity on the right bridge relative to the left"
  (Green et al., Fig. 2), and the E-PG peak then moves "leftward in the
  bridge and counterclockwise in the ellipsoid body"; exciting one bridge's
  P-ENs moves the E-PG bump to that side's shift (Fig. 4). P-ENs fire at 3.9 ±
  2.6 Hz standing, and turning changes that by 5.6 ± 3.7 Hz between preferred
  and non-preferred fast turns (Turner-Evans et al. 2017, Fig. 4B, loose
  patch). Their angular velocity input arrives in the noduli; in the
  hemibrain the GLNO neurons are the ones "that provide input to PEN
  neurons", and the LNO types take most of their input in the lateral
  accessory lobe (Hulse et al. 2021, eLife 10:e66039). No transmitter is
  given for GLNO or LNO1 there.
- **Inhibition.** Δ7 neurons express VGlut; inhibition through GluClα is
  proposed, not shown, and they "may excite the P-EN2" (Turner-Evans et al.
  2020, Neuron 108:145). The ring neurons are GABAergic and inhibit the
  E-PGs; which wedges a landmark's ring neurons inhibit is learned, by
  depression of ring neuron → E-PG synapses, over minutes (Fisher et al. 2019,
  Nature 576:121; Kim et al. 2019, Nature 576:126).
- **The eyes reach it through the anterior visual pathway.** Ring neurons R2
  and R4d have receptive fields covering large parts of the visual field,
  densest near the midline of the ipsilateral field, retinotopically arranged
  (Seelig & Jayaraman 2013, Nature 503:262); MeTu → TuBu → ring neuron
  channels keep azimuth in some channels and not others (Omoto et al. 2017,
  Curr Biol 27:1098, abstract; Timaeus et al. 2020, iScience 23:101590,
  abstract; Hardcastle et al. 2021, eLife 10:e63225).
- **Steering by heading and goal.** PFL3 neurons are tuned jointly to heading
  and goal; FC2 neurons carry the goal (activating FC2 at two FB sites made
  flies hold headings 166° apart), and a right-minus-left PFL3 signal in the
  lateral accessory lobes precedes rightward turns by about 100 ms (Mussells
  Pires et al. 2024, Nature 626:808). "PFL3R cells are recruited when the fly
  is oriented to the left of its goal, and their activity drives rightward
  turning", directly onto DNa02 and through DNa03 (Westeinde et al. 2024,
  Nature 626:819). Only DNa02 receives PFL3 input directly, and the fly's
  rotational velocity is linear in DNa02's right-minus-left rate
  (Rayshubskiy et al. 2025, eLife 13:RP102230, Figs. 3, 7B).
- **Odour.** Mushroom body and lateral horn outputs reach the fan-shaped
  body's tangential inputs and carry odour; wind direction reaches the PFNs;
  hΔC is odour-gated and wind-tuned, and passes a goal to PFL3 in their model
  (Matheson et al. 2022, Nat Commun 13; PMC9360402).

Not verified: an E-PG, FC2 or PFL3 firing rate in Hz (none found in text);
the Hulse et al. wedge-by-glomerulus map (a schematic; the probe takes the
order from the wiring instead). Hulse et al. describe the P-EN shift with the
opposite clockwise labels to Green et al., with no viewpoint stated; the
probe compares directions in the wiring's own terms.

## The circuit in this connectome

Taken from the wiring before the protocol was written, to name the neurons
the protocol drives and reads (`node packages/brain/scripts/central-complex.ts
--part wiring`, which needs the annotations `npm run brain:fetch` downloads,
and prints FlyEM's type-level transmitters beside the model's when FlyEM's
table is at `packages/brain/data/body-neurotransmitters-male-cns-v1.0.feather`:
`curl -o packages/brain/data/body-neurotransmitters-male-cns-v1.0.feather
https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-neurotransmitters-male-cns-v1.0.feather`,
sha256 checked by the script). This dataset's own type names are used
throughout; FlyEM's instance names carry each neuron's protocerebral bridge
(PB) glomerulus and fan-shaped body (FB) column.

<!-- docs-check: generated packages/brain/data/body-neurotransmitters-male-cns-v1.0.feather -->

- **The ring, from the wiring.** 46 E-PG neurons in PB glomeruli L1–L8 and
  R1–R8 (2 to 4 a glomerulus), and 4 EPGt in L9 and R9. Each glomerulus's E-PGs
  make their strongest synapses into the other PB half onto exactly two
  glomeruli's E-PGs, and these chain into one ring of sixteen: R1, L8, R2, L7,
  R3, L6, R4, L5, R5, L4, R6, L3, R7, L2, R8, L1 (16 of 16 glomeruli). The
  probe numbers those positions 0 to 15, 22.5° apart. This is the ring's order
  in the ellipsoid body, read from which E-PGs touch which, not from a
  published map; the 9th glomeruli are left out.
- **P-EN shifts.** P-EN_a (PEN1, 20) and P-EN_b (PEN2, 22) take E-PG input in
  their own glomerulus (mean shift −6° to +7°) and give it back to the E-PGs
  shifted: the left PB's by +56° and +55°, the right PB's by −56° and −54°
  (positive toward rising position). P-EG (18) gives it back in place.
- **What reaches the P-ENs.** 79,439 input synapses; the largest share, 21%,
  from the 4 GLNO neurons, which have no predicted transmitter and are muted
  (FlyEM's type-level call is "unclear"). Then E-PG 15%, the P-ENs themselves
  22%, and glutamatergic ExR4 (9%), Delta7 (9%) and ExR6 (7%), all
  inhibitory here. The GLNO neurons' own largest input is PS196_b, which the
  lobula plate's tangential cells reach through PS047_b (1,302 synapses
  through one neuron, each route counted by its weaker leg); DNa02's 40
  largest inputs reach GLNO through one neuron by 207. LNO1 (muted, no
  prediction; FlyEM's consensus GABA), LNO2, LNOa, LCNOp and LCNOpm reach the
  PFNs, not the P-ENs.
- **What reaches the E-PGs.** 189,654 input synapses, the largest shares from
  GABAergic ring neurons (ER4m 11%, ER2_c 8%, ER4d 6%, ER3w_b 6%), then P-EN
  (13%) and E-PG (6%). Each ring neuron spreads its synapses nearly evenly
  around the ring: the population vector of a ring neuron's synapses per E-PG
  has a median length of 0.06 to 0.14 in every visual type (ER2_a–d, ER4d,
  ER4m), at most 0.24 (0 is even, 1 one position).
- **PFL3 to steering.** The 24 PFL3 reach DNa02 directly: those with somata on
  the right make 356 synapses onto the left DNa02, those on the left 380 onto
  the right, and 251 and 217 onto DNa03. Each FB column's FC2 neurons (FC2A, B
  and C: 9 to 11 a column, C1 to C9) synapse onto the PFL3 of their column,
  which come from two PB glomerulus groups; the circular mean of their PB
  positions gives each column an angle, from −44° (C1) round to 19° (C9).
- **Transmitters.** Of the 2,950 central complex neurons (class CX), 1,582
  are cholinergic, 611 glutamatergic (inhibitory here; Delta7 among them),
  294 GABAergic, 134 monoaminergic and muted (EL octopamine, ExR2 dopamine,
  ExR3, PFGs, PFR_a serotonin, and FB types), and 329 have no prediction and
  are muted (most of them PFNp_b and vDelta types, and GLNO and LNO1).
- **Saturation.** Connections between central complex neurons keep 82% of
  their synapses after saturation, as the whole connectome does; P-EN → E-PG
  keeps 70–73% (116 of 352 P-EN_a connections have 50 synapses or more).

One look at the network running was taken while the probe was being built,
before this protocol: every E-PG driven at 30 Hz for 2 s from rest (seed 1).
The P-ENs and PFL3 stayed silent, Delta7 fired at 13 Hz and ExR6 at 153 Hz.
Nothing else was run on the central complex before the protocol was
committed.

## Protocol

### Common to every run

- The brain as the game runs it, at the operating point
  (`packages/brain/src/params.ts`), built fresh for each run: standing
  (`grounded`), every other sense at 0, the visual background on, eyes shut
  but in questions 2 (the gratings) and 5. Learning is off: no Kenyon cell
  fires in these runs, and a run with it on and off gives the same spikes
  neuron for neuron (seed 2, 9 E-PGs driven at 40 Hz for 3 s and 3 s after:
  219,752 spikes, 0 neurons differing), checked while building the probe.
- 2 s at rest before anything is driven. Rates are read in 250 ms bins.
- Every drive is a Poisson input added after the brain's own, so it leaves
  every other input's random stream as it was, and each run with a drive is
  set against a control of the same seed with that input present at 0.
- Seeds 1, 2 and 3 for everything; ranges and every failure are reported.
- Drive rates (`DRIVE` in the script):
  - **E-PG, 30 Hz** in the bump, chosen: no E-PG rate in Hz was found; a
    rate a few times the P-ENs' measured 4 to 10 Hz, and well inside a spiking
    neuron's range.
  - **Every E-PG evenly, 10 Hz**, chosen: low enough to leave room for a
    bump above it.
  - **A ring neuron, 30 Hz**, chosen as for the E-PGs.
  - **FC2, 30 Hz**, chosen: no FC2 rate was found.
  - **P-EN bias, 3 and 6 mV**, chosen: below the 7 mV threshold, so a P-EN
    fires only with the E-PGs' input; a turn's measured effect on them is a
    rate (5.6 Hz), not a voltage.

### Measures of the bump

From the mean E-PG rate at each of the 16 positions, r_p:

- **mean**, the mean of r_p;
- **length**, the population vector's length over the total,
  |Σ r_p e^(i·22.5°·p)| / Σ r_p: 0 for an even ring, 1 for one position
  (activity even over 180° gives 0.64, over 135° 0.78);
- **phase**, the population vector's angle;
- **width**, the number of positions at half the peak or more.

**Localised** means mean ≥ 2 Hz, length ≥ 0.5 and width ≤ 6 positions
(135°). Chosen, not measured: a fly's bump covers about a quarter to a third
of the ring, and these bounds pass anything that narrow and fail activity
spread over most of the ring. A bump is **where it was put** when its phase
is within 45° (two positions) of the driven positions' centre.

### Question 1: does a bump form and stay?

- **1a, a kicked bump.** The E-PGs of three neighbouring positions, centred
  on R1, R3, R5 and R7 (positions 0, 4, 8, 12), at the E-PG rate for 1 s, then
  nothing for 10 s. Endpoints: localised and where it was put in the last bin
  of the drive; **persistence**, the time after the drive stops until the
  first bin that is not localised or not where it was put.
- **1b, the ring neurons a landmark drives.** Every E-PG at the even rate for
  2 s, with one ring neuron of the visual types (ER2_a–d, ER4d; 67 neurons,
  each in its own run) at the ring-neuron rate, against the even drive alone.
  Endpoint: whether what each ring neuron takes away from the E-PGs is
  localised (the population vector length of the loss, per position), and
  whether a localised bump is left.
- **1c, a bump from an even drive.** Every E-PG at the even rate for 2 s, then
  nothing for 3 s: does the ring break the symmetry into a bump on its own?

**Pass:** in 1a, localised and where it was put in all 12 runs while driven,
and persisting at least 5 s in all 12. 5 s is chosen as the shortest hold
that would change the fly's behaviour: longer than its walking bouts (1.9 to
3.2 s on average). A bump that is localised while driven but persists less
than 5 s is **driven only**: the ring can show a heading given to it but not
keep one. Not localised while driven is a **fail**. 1b and 1c are reported
without a pass criterion: they say whether a landmark could place the bump
and whether the ring has a state with a bump that nothing places.

### Question 2: does it move?

- **2a, wiring** (above, and `--part wiring`, W4 and W5): what reaches the
  P-ENs and their nodulus inputs from DNa02's 40 largest inputs and from the
  lobula plate's tangential cells.
- **2b, the eyes under rotation.** Eyes open on a full-field square-wave
  grating (30° period, 2 Hz: 60°/s) turning clockwise or anticlockwise for
  4 s, against a uniform grey of the same mean; with the ring silent, and with
  every E-PG at the even rate (the P-ENs fire only with E-PG input). Read:
  right minus left of GLNO, LNO1, LNO2, LNOa, LCNOp, LCNOpm, LPsP, PS196_b and
  DNa02, and left-PB minus right-PB P-EN, each less the control's.
- **2c, the brain's own turns.** 60 s at rest, eyes shut: the Pearson
  correlation, over 100 ms bins, of DNa02's right-minus-left rate with each of
  those pairs' right-minus-left rate (P-ENs: left PB minus right PB).
- **2d, a bump pushed.** A bump kicked at R3 (three positions at the E-PG
  rate, 1 s), then for 1 s one PB half's P-ENs depolarised by 3 or by 6 mV
  (an excitability bias, below the 7 mV threshold, so they fire only with the
  E-PGs' input, as a turn's input to them does in a fly), with the kick held
  on or let go. Endpoint: the bump's phase at the end against the same run
  with no bias.

**Pass, a signal:** some cell among the P-ENs and their nodulus inputs
differs right from left by at least 1 Hz under 2b with the sign reversing
between the two directions in all three seeds, or correlates with DNa02's
difference in 2c at |r| ≥ 0.3 in all three. **Pass, movement:** in 2d with
the kick let go, the bump moves at least 45° in that second the way the
wiring says (left PB's P-ENs toward rising position, right PB's toward
falling), and is still localised, in all 3 seeds for both halves at one of
the two biases. With the kick held, the same is reported, not judged: a held
kick pins the bump. 45° a second is chosen as a quarter of a walking fly's
ordinary turning speeds and two positions, so measurable at this resolution.

### Question 3: does it steer?

A bump held at each of the 16 positions (three positions' E-PGs at the E-PG
rate, held on), with a goal in each FB column (that column's FC2A, B and C at
the FC2 rate) or none: 10 goals by 16 positions, 0.5 s from the drive's onset
then 1.5 s measured. Read DNa02 right minus left (the turn command's own
difference) and PFL3 by the DNa02 they reach. Over the bump's position θ the
steering is fitted as a·cos θ + b·sin θ + d: its **amplitude** √(a² + b²), the
phase at which it turns hardest right, and the offset d. Also reported, not
judged: the heading it would hold, where the steering crosses zero rising.
A right turn moves the bump toward falling position (the wiring's right-PB
P-EN shift, and Green et al.'s right-bridge P-ENs, active in right turns), so
the heading is stable where steering to the right lies above it.

**Pass, in each seed:** for at least 7 of the 9 goal columns the amplitude is
at least 2 Hz and larger than |d| (so the steering changes sign as the bump
passes the goal), and the phase at which it turns hardest right follows the
goal column: over the 9 columns, the angle between that phase and the
column's angle from the wiring has a mean resultant length of at least 0.8
(a fixed offset, whatever it is, is allowed). 2 Hz is half the DNa02
difference a full odour at one antenna gives (4 Hz), chosen as the least
that would compete with the model's ordinary steering. The amplitude is
reported against the 4 Hz.

### Question 4: what stands in the way

Each of these runs questions 1 to 3 again (5 for none and all), with one
thing undone, as a labelled diagnostic (`--lift`, `LIFTS` in
`packages/brain/scripts/central-complex-lib.ts`):

| Lift | What is undone |
| --- | --- |
| `nodulus` | the noduli's muted inputs given a transmitter: LNO1 GABA (FlyEM's consensus), GLNO acetylcholine (no evidence; the sign that would let it carry a turn) |
| `nodulus-inhibitory` | the same with GLNO glutamatergic |
| `modulators` | central complex neurons muted for a monoamine made excitatory, as Shiu et al. reportedly had them |
| `glutamate-excitatory` | central complex neurons predicted glutamatergic (Delta7, ExR4–6 and FB types) made excitatory |
| `glutamate-muted` | the same neurons muted, to see what their inhibition does |
| `unsaturated` | synaptic saturation undone on connections between central complex neurons |
| `no-adaptation` | spike-frequency adaptation off (one setting for every neuron) |
| `all` | nodulus, modulators, unsaturated and no-adaptation together, glutamate as it is |

A lift under which a question passes that fails at the operating point names
what blocks it; that is the finding, not a fix. Whether a point neuron can
hold the bump is not a lift the engine can make; it is answered by question 1
across the lifts and by the published spiking models (What the fly does).

### Question 5: do the eyes reach it?

Eyes open; a vertical bar 15° wide and full height shown for 1 s at each of
11 azimuths (−150° to 150° in 30° steps) after 2 s of its ground, dark (0) on
white (1) and light (1) on dim (0.2), against the ground alone. Read MeTu
(families 1 to 4) and TuBu01 to TuBu10 by side, the ring neurons of ER2_a–d,
ER4d, ER4m, ER5 and ER3w_b by side, and the E-PG bump.

**Pass:** at least one TuBu type and one ring neuron type on each side
respond (1 Hz above the ground alone at their best azimuth in every seed)
with their best azimuth on their own side, and, at the operating point, an
E-PG bump (mean ≥ 2 Hz) in at least half the presentations. The E-PG phase
by azimuth is reported if there is one.

### The decision, fixed now

- **Go** if questions 1 (pass, not driven only), 2 (movement, and a signal) and
  3 pass at the operating point, or under lifts each of which has its own
  evidence from the fly (a transmitter the literature or FlyEM's ground truth
  gives, say). The recommendation then names what a follow-up would have to
  build and what the body would have to send.
- **No-go** if question 1 or question 3 fails under every lift, `all`
  included; or if they pass only under lifts that no evidence backs (GLNO's
  sign, monoamines as fast excitation, glutamate as excitation, no
  saturation, no adaptation), in which case the recommendation says which
  missing knowledge would decide it.
- Anything else is reported as it falls, question by question, with the
  recommendation weighing it; this rule is not changed after the results.

## Results

Every part, at the operating point and under every lift, seeds 1 to 3, on
`dev` at `b9a88b6d` with the probe of `cafb80aa` (the variants since are
marked). Ranges are over seeds and positions.

### 1. A bump forms only while it is driven

- **1a.** Three neighbouring positions' E-PGs at 30 Hz make a localised bump
  where they were put in 12 of 12 runs (mean 4.9 to 6.8 Hz over the ring,
  length 0.94 to 0.95, 3 positions wide, within 4° of the centre). No
  undriven E-PG fires: the bump is the drive and nothing more. Let go, it is
  gone in the first 250 ms bin in all 12 (**held 0.00 s, against 5 s:
  fail**). In the kick's last 250 ms (seed 1, centred on R3) the P-ENs fire
  at 1.5 and 1.9 Hz (left and right PB), the P-EGs at 1.8 to 2.2, Delta7 at 0
  and 6.9, PFL3 at 0, and the glutamatergic ExR6 at 60 Hz and ExR4 at 12 and
  24.
- **1c and 1b as written** (an even drive of forced spikes) can show nothing:
  a forced spike can't be inhibited or added to, so the ring stays as even as
  its drive (length 0.04 to 0.19) and no ring neuron changes the E-PGs at all
  (0.0 Hz in all 201 runs). See Changes after the protocol.
- **Added after the protocol, the even drive as a bias.** A 10 mV
  depolarisation of every E-PG (9.6 to 11.1 Hz on its own; 7.5, 8 and 9 mV gave
  6.3 to 9.8 Hz) breaks into a bump by itself: localised in 5 or 6 of its 8
  bins in each seed, 3 to 7 positions wide, length 0.53 to 0.76 at the end,
  in a different place in each seed (−45°, −108°, −153°). So the ring has
  a state with a bump, but only while every E-PG is held above threshold:
  1 s after the bias goes, the ring is silent in every seed. One ring neuron
  of the visual types at 30 Hz on that biased ring lowers the E-PG mean by
  −1.3 to +1.2 Hz, inside the run-to-run spread, and leaves no localised bump
  in any of the 201 runs: no ring neuron places the bump. Their wiring says
  the same: each spreads its synapses nearly evenly around the ring (The
  circuit, above), as a ring neuron would before experience had shaped its
  synapses (Fisher et al. 2019; Kim et al. 2019).
- **1d, added after the protocol.** Every E-PG depolarised by 3, 5, 6 or 6.5 mV
  (below the 7 mV threshold), then kicked as in 1a: held 0.00 s at every bias
  and seed. Even a ring a quarter of a millivolt from firing doesn't keep the
  bump.

### 2. Nothing moves the bump

- **2b, the eyes under rotation.** A grating turning clockwise raises PS196_b
  on the right over the left by 5.0 to 7.0 Hz (and DNa02's difference by 12.0
  to 16.0 Hz); turning anticlockwise, by −0.3 to +0.5 Hz (DNa02 −3.8 to +3.0).
  So the one rotation signal there is comes in one direction only. GLNO, the
  cells PS196_b feeds and the P-ENs' largest input, stays at 0 Hz (at most
  0.5 Hz on one side with the ring driven evenly), as do the P-ENs, LNO1,
  LNO2, LNOa and LCNOpm; LCNOp and LPsP move by 1.5 Hz at most, with no
  consistent sign. No cell
  differs by 1 Hz with the sign reversing in all three seeds.
- **2c, the brain's own turns.** Over 60 s at rest, no pair's right-minus-left
  rate correlates with DNa02's at |r| above 0.17 (LNO1, LNO2, LNOa, LCNOp,
  PS196_b, LPsP); GLNO, LCNOpm and the P-ENs are silent throughout. No signal
  (**fail**).
- **2d, a bump pushed.** With the kick let go there is no bump left to move
  (0 Hz at the end, every bias and seed). With it held, one PB half's P-ENs
  depolarised by 6 mV fire at 10.6 to 21.0 Hz against 1.0 to 1.6 without,
  and the bump moves −5° to +1°, recruiting no new position; at 3 mV, −4° to
  +3°. Moved 45° the way the wiring says in 0 of 6 runs in every condition
  (**fail**).

### 3. PFL3 compares heading and goal; the steering is too weak to use

- **DNa02.** In no seed does any goal column steer by 2 Hz both ways: 0 of 9
  in each (**fail**). The fitted DNa02 amplitude over the bump's position is
  0.08 to 2.01 Hz, on offsets of −4.6 Hz (seed 1) and −21.6 Hz (seed 2) that
  are the visual background's leftward lean; in seed 3 DNa02 hardly fires in
  this window (amplitude 0.34 Hz at most). How well its phase follows the
  goal: resultant length 0.91, 0.69 and 0.42.
- **PFL3**, reported, not judged: with a goal, PFL3's right-minus-left
  difference varies with the bump's position by 0.73 to 1.42 Hz (0.00 to 0.03
  without one), and the phase at which it favours the right follows the goal
  column at a fixed offset: over the 9 columns, resultant length 0.98 in every
  seed, 87° from the column's angle on average (0.97 to 0.98 under every lift
  but the two glutamate ones and `all`). So the heading-against-goal
  comparison is in the wiring and works: the heading it would hold (the
  phase less 90°, the right turn moving the bump to falling position) is
  within a few degrees of each column's angle from the wiring. But about 1
  Hz of PFL3 difference, from FC2 and E-PG both at 30 Hz, is a quarter of
  what a full odour at one antenna gives DNa02 (4 Hz), and in DNa02 it is lost
  under the background's swings.

### 4. No lift opens the way

| Lift | 1a: localised while driven, held after | 1c bias: bump while biased, after | 2: moved, signal | 3: columns ≥ 2 Hz (per seed), DNa02 follows |
| --- | --- | --- | --- | --- |
| none | 12/12, 0.00 s | 5–6 of 8 bins, silent | 0 of 6, none | 0, 0, 0; 0.42–0.91 |
| `nodulus` | 12/12, 0.00 s | 2–4 of 8, at 7 to 27 Hz; seed 1 still 19 Hz 1 s after | 0 of 6, none (GLNO 0 Hz under rotation) | 3, 0, 7; 0.09–0.33 |
| `nodulus-inhibitory` | 12/12, 0.00 s | 3–5 of 8, silent | 0 of 6, none | 0, 0, 0; 0.41–0.89 |
| `modulators` | 12/12, 0.00 s | 7 of 8, silent | 0 of 6, none | 0, 0, 0; 0.57–0.94 |
| `glutamate-excitatory` | 0/12: the ring at 267 to 289 Hz, all 16 positions, and stays there | seizure (257 to 268 Hz) | 0 of 6 | 0, 0, 0; 0.13–0.41 |
| `glutamate-muted` | 0/12: the ring at 196 to 201 Hz, and stays there | seizure (193 to 200 Hz) | 0 of 6 | 0, 0, 0; 0.29–0.47 |
| `unsaturated` | 12/12, 0.00 s | 6–7 of 8, silent | 0 of 6, none | 0, 0, 0; 0.32–0.88 |
| `no-adaptation` | 12/12, 0.00 s | 7 of 8, silent | 0 of 6, none | 0, 0, 0; 0.31–0.94 |
| `all` | 11/12, 0.00 s; in seed 2 the ring seizes at about 100 Hz a second later | seizure (99 to 120 Hz) | 0 of 6; GLNO and the P-ENs seize (110 to 324 Hz) in some runs, either direction | 0, 0, 0; 0.12–0.80 |

- **The nodulus lift.** With GLNO excitatory, DNa02 swings by 3 to 10 Hz with
  the bump's position, goal or none, which passes the amplitude bound for 3
  and 7 columns in two seeds but follows no goal (resultant 0.09 to 0.33).
  Taken apart (`glno-excitatory`, added after the protocol), GLNO alone does
  it: DNa02 swings by 3.1 to 7.1 Hz with no goal, 3, 0 and 8 columns pass
  the amplitude bound, and its phase follows no goal (resultant 0.03 to
  0.24); DNa02's difference spans up to 43 Hz over the bump's positions
  (−33 to +22 Hz in all), against at most 7.3 Hz at the operating point. GLNO's loop with the
  P-ENs (W4) can run away, as 2b catches it under `all` (GLNO and the P-ENs
  at 110 to 324 Hz): a loop out of control, not a heading read out.
- **Glutamate.** Made excitatory or muted, the central complex's glutamatergic
  neurons (Delta7, ExR4–6, the FB types) no longer hold it back, and the ring
  seizes and stays seized after the drive. As it is, their inhibition keeps
  it silent. Between the two there is no setting of this one switch where the
  ring holds activity and stays local.
- **Saturation and adaptation** change nothing measurable: the bump dies as
  fast without either, and PFL3 follows the goal as well
  (resultant 0.98 at 86° to 88° from the column's angle in all three seeds,
  both lifts), no more strongly.
- **Monoamines** made fast and excitatory leave every question where it was.

### 5. The eyes don't reach it

A dark or light bar at any azimuth changes nothing anywhere along the
anterior visual pathway: MeTu, TuBu01–10 and every ring neuron type read
0.0 Hz above the ground alone, in every seed, both sides, both contrasts,
and no E-PG fires (**fail**). The bar reaches the lamina and the medulla's
relays (seed 1, the right eye, a dark bar at 60°: L3 12.8 Hz, L1 and L2 3.0,
Tm9 2.1, Tm1, Tm2 and Mi1 0.7 to 0.8; a light bar: Mi1 1.6, L1 0.7; all 0
without it), but not Dm2 or Mi15, which give MeTu1 and MeTu3c 42% and 59% of
their input synapses (`--part wiring`, W3): both stay at 0 Hz. The MeTu cells
do fire (MeTu1 0.4 Hz, MeTu3 0.5 there), but that is the visual background,
which drives every visual projection neuron (brain README, Spontaneous
behaviour), identically with and without the bar; at that rate the TuBu
neurons stay silent. Under `all`, some ring neurons answer a bar straight ahead by 11 to
66 Hz, as much from the far side as their own (ER2_a left 15.0 Hz at the
contralateral 90°), where the ring is near seizure; the TuBu neurons still
answer by 1 Hz at most.

## What blocks each step

In the model's own terms, from the runs above:

1. **Recurrent excitation is too weak for a bump to hold itself.** The fly's
   bump rests on local excitation around the ring (E-PG → P-EN and P-EG → E-PG)
   and inhibition across it (Kim et al. 2017; Kakaria & de Bivort 2017). Here
   E-PGs at 30 Hz bring their P-ENs to 1.5 to 2 Hz, and P-ENs driven to 10 to
   21 Hz recruit no new E-PG. A P-EN → E-PG connection has 40 synapses on
   average, 28 after saturation: one spike moves an E-PG by about 1.4 mV
   (0.275 mV a synapse, 0.177 at the membrane's peak; brain README, The
   operating point) against a 7 mV threshold, so it takes five P-EN spikes
   together. Undoing saturation brings it to 2 mV and changes nothing.
   Kakaria & de Bivort's spiking model, with the same rest and threshold,
   held a bump indefinitely with connections of 20 unit currents each, whatever
   the overlap: the point neuron is not what fails, the strength of the
   loop at this operating point is, and no measurement gives the right one.
2. **The inhibition is all or nothing.** The P-ENs' inputs include the
   glutamatergic ExR4 (9%), Delta7 (9%) and ExR6 (7%), which fire at up to 60 Hz
   under a bump (ExR6; ExR4 12 to 24, Delta7 0 to 7). Glutamate counted as inhibitory is right for Delta7 as far
   as it is known (VGlut, GluClα proposed: Turner-Evans et al. 2020), though
   Delta7 "may excite the P-EN2" there; for ExR4 and ExR6 nothing says.
   Either way round, muted or excitatory, the ring seizes: the network has
   no state between silent and saturated that this switch reaches.
3. **The turn signal is muted, and wouldn't arrive.** GLNO, the P-ENs' largest
   input (21%), has no transmitter here or in FlyEM's call ("unclear"), and
   Hulse et al. give none. Given one, it still doesn't fire under rotation:
   PS196_b's 5 to 7 Hz, one way only, don't bring it to threshold. Given
   acetylcholine, its loop with the P-ENs (3,500 synapses one way, 16,400 the
   other) runs away when the bump sits at some positions.
4. **The eyes stop in the medulla.** Dm2 and Mi15, MeTu's main inputs, don't
   answer a bar, so no position reaches the tubercle or the ring neurons; and
   the ring neurons' synapses onto the E-PGs carry no map of the world, which
   in a fly experience writes there by plasticity this model doesn't have
   (Fisher et al. 2019; Kim et al. 2019).
5. **The read-out is there but faint.** PFL3 → DNa02 is direct (356 and 380
   synapses), as in the fly (Rayshubskiy et al. 2025), and PFL3's difference
   follows the goal as Mussells Pires et al. (2024) and Westeinde et al.
   (2024) describe; at 1 Hz it can't compete with the visual projection
   neurons' direct drive of DNa02, which is all the steering this model has.
6. **Monoamines** (EL, ExR2, ExR3, PFGs, PFR_a and FB types, muted for being
   slow) don't stand in the way of any of it.

## Recommendation: no-go

By the rule fixed before measuring: question 1 fails under every lift, `all`
included, and so does question 3. A follow-up that gave the fly a heading
the brain itself keeps can't be built on this operating point. A bump would
have to be held by something outside the network, which the project's rules
don't allow, or the central complex's loop strengthened by a factor nobody
has measured, which they don't allow either.

What would decide it, if anyone takes it up again:

- **A measured strength for the ring's recurrent synapses**, or E-PG and P-EN
  rates in a bump to fit the loop against (no E-PG rate in Hz was found;
  P-ENs fire at 3.9 Hz standing and change by 5.6 Hz with turning:
  Turner-Evans et al. 2017). The optic lobe's graded relays got a factor
  derived from one relay's response (brain README, The operating point); a
  stand-in for the E-PG → P-EN → E-PG loop would need a measurement of the same
  kind, and a fix for the seizures that appear once its inhibition gives
  way.
- **GLNO's transmitter.** The P-ENs' turn input hangs on it.
- **Dm2 and Mi15 answering light**, so the anterior visual pathway carries a
  bar's position, and ring neuron plasticity to map it onto the ring.
- **What the body would send**: the fly's own turning, as the sense a fly has
  of it (the visual rotation it already sees, and the proprioceptive and
  efference signals that reach the noduli in a fly, which the data doesn't
  identify beyond PS196_b's inputs), would have to reach GLNO; nothing it sends
  now does.

The finding worth keeping: PFL3's comparison works. If a heading were ever
held, the goal-directed steering read out from it would point the right way.

## Changes after the protocol

- **1b and 1c as written could show nothing.** The diagnostic inputs fire
  their neurons directly (brain README, Neuron model), so an evenly forced ring
  can't be shaped by inhibition or recurrence. Both are reported as written,
  and again with the even drive given as a depolarisation (the bias whose
  mean rate came nearest the protocol's 10 Hz, from 7.5, 8, 9 and 10 mV; the
  script prints the calibration). Their criteria are unchanged; they had
  none to pass.
- **1d** (a kick on a ring depolarised below threshold) was added to see how
  far the ring is from holding a bump.
- **PFL3's own phase-following** is printed beside DNa02's in question 3
  (`steer`); the runs were repeated to print it, with the same results.
- **`glno-excitatory`** was added to tell apart the nodulus lift's two
  changes.
- The first launch of the runs started all 20 at once; it was stopped and
  run again four at a time. Nothing from it is reported.

## Reproducing

```sh
node packages/brain/scripts/central-complex.ts --part wiring
node packages/brain/scripts/central-complex.ts --part bump  --lift none --seeds 1,2,3
node packages/brain/scripts/central-complex.ts --part move  --lift none
node packages/brain/scripts/central-complex.ts --part steer --lift none
node packages/brain/scripts/central-complex.ts --part eyes  --lift none
```

`--lift` takes any name in the table above. Raw outputs stay out of git.
