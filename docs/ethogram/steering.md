# Steering from recordings

The body turns the fly in proportion to the brain's `turn` (DNa02, right minus
left; `packages/body/src/behavior.ts`). Its gain, cap and smoothing were
chosen. This page set out to replace them, where the data allow, with the
relation measured between the same neurons and the turns of walking flies.

**The data don't allow it, and the mapping stays as it was.** Three of the
four paired recordings give usable spikes, and in those three the gain while
walking agrees from fly to fly: 6.4 ± 1.5 °/s per Hz of right-minus-left
difference, about 110 ms later. But the model's rate readout predicts a
held-out fly's turning poorly (R² 0.05 to 0.23). The recording chosen in
advance to be held out can't be used at all: its cells sat above the paper's
−33 mV limit for all but about a minute. By the rule fixed before the fit, no
transfer. What the data do say: the present gain, 3 rad/s at 40 Hz (4.3 °/s
per Hz), is within a factor of 1.5 of the measured one, and nothing in these
recordings relates DNa02, or anything else read here, to walking speed.

## The source

Rayshubskiy A, Holtz SL, Bates AS, Vanderbeck QX, Serratosa Capdevila L,
Rockwell V, Wilson RI (2025) Neural circuit mechanisms for steering control in
walking *Drosophila*. [eLife 13: RP102230](https://doi.org/10.7554/eLife.102230).
Data: [Harvard Dataverse doi:10.7910/DVN/0NCLP1](https://doi.org/10.7910/DVN/0NCLP1)
(version 1.2). Analysis code: the authors' MATLAB
[primary repository](https://github.com/SashaRayshubskiy/eLife_102230_analysis_code)
and Python
[secondary repository](https://github.com/wilson-lab/rayshubskiy_elife_102230_secondary_analysis_code)
(commit 7e28953).

What was read in the paper itself (the eLife XML), not recalled:

- Whole-cell recordings from DNa02 on both sides of the brain at once in four
  flies, walking on a 6.35 mm air-supported ball (Results, "Right-left
  differences in descending neuron activity predict rotational velocity";
  Figure 3). Rotational velocity "was consistently related to the difference
  in right-left firing rates", "essentially linear through its entire dynamic
  range, and was consistent across paired recordings", forward and backward
  walking alike (Figure 3—figure supplement 1).
- DNa02's rate-to-rotation filter is biphasic, transient; on average behaviour
  follows neural activity by about 150 ms, which "may reflect a biological
  delay and/or the inertia of the spherical treadmill" (Figure 2).
- Rate and forward velocity: increases in DNa02 "were not consistently followed
  by large changes in forward velocity" (Figure 2C).
- Flies: virgin females 1–2 days old, head fixed, the cuticle and sheath over the
  brain opened. "Steering responses to sensory stimuli were larger and more
  consistent in intact flies, as compared to flies used for electrophysiology"
  (Methods, Spherical treadmill).
- Ball: two optical sensors read at 10 kHz, Butterworth low-passed and
  downsampled to 100 Hz, calibrated against a motor-driven ball at six speeds.
  Electrophysiology: 10 kHz, low-passed at 5 kHz.
- Two rate pipelines, which is where the earlier audit's bin-width question came
  from (Methods, "Data analysis - electrophysiology data preprocessing"):
  Figures 2F–H and 3B–C (rate against rotation, binned) use MATLAB `findpeaks`
  on relative prominence, 10 ms bins and a 30 ms exponential window; Figures
  1–3D, E (linear filters) use a 100 Hz high-pass, a rolling median absolute
  deviation, SciPy `find_peaks` with a prominence chosen per recording and
  neuron, then "binned at 1.25 ms and smoothed by convolving with a 2.5 ms
  Gaussian kernel". The archived notebook (`import_preprocess_data.ipynb`) uses
  12.5 ms and 25 ms. The text and the code differ by exactly ten, so one of them
  has a slipped decimal point; which one can't be told from the publication.
  It doesn't matter here: this calibration counts spikes and smooths them the
  way the model's readout does (below), so neither published smoothing enters
  it.
- Units, from the code: the primary repository converts sensor output with
  0.000436 per °/s for yaw and 0.00636 per mm/s for forward
  (`convert_yaw_to_degrees.m`, `convert_fwd_to_mms.m`). The Dataverse files
  were made with older constants: the secondary notebook multiplies the files'
  yaw by 0.000395/0.000436 and their forward by 0.0051/0.000436 to "get
  accurate degrees/s", with a note to "temporarily undo the scaling on lateral
  and yaw until Sasha gets to the bottom of the signal differences". So the
  files' yaw is in °/s on the 0.000395 calibration and their forward in mm/s on
  0.0051. The authors' final constants are taken here (yaw × 0.906, forward ×
  0.0051/0.00636 = 0.802), and the slope on the files' own values is reported
  beside it: about 10% on rotation is unresolved.
- Which channel is which: the notebook gives `ephys_A` as the left DNa02 and
  `ephys_B` as the right. Neither the files nor the code state the sign of
  yaw.

## Protocol

Fixed on 2026-11-18, before any spike, rate or fit was computed. Before it
was written the four files were downloaded and checked against Dataverse's
MD5s, and the variables of one (a2_d_13) were listed with their sizes and
ranges; nothing else was looked at.

### Recordings and exclusions

The four paired DNa02 recordings: a2_d_08, a2_d_12, a2_d_13, a2_d_14
(Dataverse file ids 11634638, 11634639, 11634640, 11634641). Excluded
samples, as the authors excluded them: while the optogenetic stimulus channel
is at 5 V and for 0.25 s after (`get_non_stim_inds` in the secondary
repository), and any second in which either cell's spike-free membrane
potential (a 40 ms running median) is above −33 mV (paper, Data inclusion).

### Spikes, per cell, with their own checks

High-passed at 100 Hz (first-order Butterworth, run forward and backward), divided
by a rolling median absolute deviation (1 s windows, ×1.4826); spikes are local
maxima above a threshold θ, at least 2 ms apart. θ is set for each cell at the
lowest point of the histogram of local-maximum heights between 4 and 20 MAD
(0.25 MAD bins), the gap between noise and spikes. A cell passes if:

1. its spike count moves less than 10% when θ is lowered or raised by 20%;
2. its mean rate over the recording is between 1 and 100 Hz;
3. it fires faster while the fly walks forward than while it doesn't (the
   paper's cells are hyperpolarized when the fly stops, Figures 1D and 3A).

A recording counts only if both its cells pass.

### Amendment to the spikes, before the fit

The detector above failed its own checks in six of the eight cells (Results):
divided by a running median absolute deviation, a spike's height shifts with
how fast the cell fires, and the histogram of heights has no stable gap.
Under the protocol as written D1 fails, since only a2_d_13 passes. That result
stands and is reported. Before any fit on the other recordings, the detector
was replaced after looking only at the heights of the raw voltage's local
maxima in each cell, over included time. All eight show noise and spikes
separated by a gap between 1.75 and 3 mV:

- a spike is a local maximum of the raw voltage that rises at least θ above the
  lowest point of the 3 ms before it and falls back by at least half that rise
  within the 3 ms after, at least 2 ms from the next;
- θ is found as before, at the gap, in 0.25 mV bins from 1 to 15 mV;
- the three checks are unchanged, taken over included time.

Seen before this amendment: the registered detector's counts and rates in all
eight cells, and the fit on a2_d_13 alone, the only recording that passed
(walking slope 7.4 °/s per Hz at τ 0 and d 120 ms, R² 0.08). Nothing else in
the protocol changes.

### Rates, states and the yaw sign

Each cell's rate is the model's readout applied to its spikes: exponential
smoothing with a 150 ms time constant (`packages/brain/src/io.ts`, `tau: 150`),
sampled at the ball's 100 Hz. Δ = right − left, in Hz, as the brain's `turn`
is before it is divided by 40 Hz.

Forward velocity is smoothed with a centred 250 ms boxcar. Forward walking:
above 1 mm/s; backward: below −1 mm/s; not walking: between.

The sign of yaw that counts as rightward is chosen once for all four flies:
the one that makes the pooled correlation of Δ and yaw positive, since the
paper establishes that DNa02 turns the fly toward its own side and the files
don't say. These data therefore check the size and consistency of the relation,
not its direction.

### The fit

yaw(t) = a + g · L(Δ)(t − d), where L is a causal first-order low-pass with
time constant τ (τ = 0 is none) and d a pure delay, τ and d each on a 0 to
300 ms grid in 10 ms steps, fitted by least squares within each fly in its
forward-walking samples, with an intercept a for each fly (its own turning
bias, which the body doesn't take: the model has its own). From training
flies: τ and d where the mean of their R² is highest, and g the mean of their
slopes at those τ and d. The same τ and d give the slope while not walking,
and while walking backward where a fly has at least 30 s of it.

Also reported for each fly, as description: the slope with no filter or delay;
the lag of the peak cross-correlation of Δ and yaw; a ridge-regularised linear
filter from Δ (spikes counted in 10 ms bins) to yaw over −0.5 to +1 s, its
peak, whether it is biphasic, and its sum (the gain for a sustained
difference); each cell's mean rate walking and not walking; and the
relation of the two cells' mean rate to forward velocity while walking forward
(slope, correlation).

### Held out

The primary held-out recording is a2_d_14 (the last of the four in the
published list; chosen before any fit). The parameters are fitted on the
other three and predict a2_d_14's forward-walking yaw. Reported: R² of the
prediction after removing each series' mean (the fly's bias isn't predicted),
and the calibration slope b, the least-squares slope of the actual yaw on the
predicted. The same for the present body mapping (3 rad/s at Δ = 40 Hz,
first-order smoothing at 12/s) on the same samples. All four leave-one-out
folds are reported as well; the decision rests on the primary one.

### What decides

The body takes the measured walking relation if all three hold:

- **D1.** At least three recordings pass the spike checks.
- **D2.** The walking slope g has the same sign in every passing fly, and its
  coefficient of variation across them is at most 0.5.
- **D3.** On a2_d_14, held out: R² at least 0.2 and b between 0.67 and 1.5.

Otherwise the present mapping stays and this page says why.
The slope while not walking replaces `STANDING_TURN` only if it too meets D2
and D3 on the not-walking samples; otherwise `STANDING_TURN` stays, labelled
as chosen.

### How the model's rates are treated

Decided here, before the scorecard was looked at: the relation is applied
in hertz as measured. The model's DNa02 fires about a third as fast as a fly's
(packages/brain/README.md, Resting activity: 1.3 to 2.0 Hz standing and about
10 walking, against about 5 and 25 to 30), so its right-left differences are
smaller too, and so will its turns be. Nothing rescales the model's rates or
the gain to make up for it. The brain's command saturates at ±40 Hz, so the
body's fastest turn becomes g × 40 Hz: a consequence of the command's range,
not a fitted cap. How often the model reaches it is reported.

### What doesn't transfer, whatever the fit

Females on a ball, head fixed and dissected, and a male walking free.
Rotation on a ball is the fly turning a 6.35 mm sphere it holds, with the
sphere's inertia in the lag; a free fly turns its own body. The paper says the
recorded flies steer less than intact ones. Sex differences in DNa02's gain
aren't known. So a transferred gain is the best measured number there is, not
a free male's; the page says so wherever it is used.

### Walking speed

No change unless a recording relates a forward-walking descending neuron's
firing rate, in spikes per second, to walking speed. What was looked for and
found is reported under Results. No gain is set to reach a speed.

### Afterwards, as observations

The scorecard's free hour, before (dev) and after (this branch), seeds 1, 2 and
3, same options: `node scripts/ethogram.ts --assay free --hours 1 --seeds 1,2,3`
(the open 43 mm disc, 06:00 held, 60 s burn-in). Reported for each seed:
walking and activity fractions, walking bouts (mean, rate), median and 90th
percentile ground yaw speed, saccades (count, median duration, mean angle),
median walking speed, outer-half occupancy and take-offs; and how often the
brain's `turn` is at its ±1 limit. None is a target: no constant changes after
they are seen. The brain-only diagnostics (`packages/brain/scripts/report.ts`, turn events)
don't involve the body and can't change.

## Results

`node packages/body/scripts/steering.ts` reproduces every number here (about
20 s and 4 GB of memory once the files are downloaded).

### Spikes

Threshold θ, spikes counted at 0.8θ, θ and 1.2θ, mean rate, and rate walking
forward and not; included time only for the amended detector.

| Recording | Included | Cell | Registered detector (MAD units) | Amended detector (mV) |
|---|---|---|---|---|
| a2_d_08 | 1,556 of 3,450 s | left | θ 5.63: 23,016 / 18,087 / 13,376, fails | θ 2.13: 6,672 / 6,299 / 6,051; 4.0 Hz, 7.7 walking, 2.1 not; passes |
| | | right | θ 14.63: 1,522 / 494 / 166, fails | θ 2.63: 5,322 / 5,110 / 4,981; 3.3 Hz, 4.5 walking, 2.6 not; passes |
| a2_d_12 | 501 of 1,494 s | left | θ 13.88: 1,293 / 399 / 130, fails | θ 2.38: 4,065 / 4,058 / 4,054; 8.1 Hz, 15.6 walking, 3.7 not; passes |
| | | right | θ 4.88: 17,374 / 15,511 / 13,753, fails | θ 3.13: 4,031 / 4,000 / 3,958; 8.0 Hz, 14.6 walking, 4.1 not; passes |
| a2_d_13 | 535 of 575 s | left | θ 7.38: 739 / 696 / 658; 1.2 Hz; passes | θ 2.13: 750 / 741 / 734; 1.4 Hz, 2.6 walking, 0.7 not; passes |
| | | right | θ 7.63: 2,103 / 2,049 / 1,969; 3.6 Hz; passes | θ 2.88: 1,920 / 1,910 / 1,900; 3.6 Hz, 6.1 walking, 2.2 not; passes |
| a2_d_14 | 52 of 1,446 s | left | θ 5.63, fails (no faster walking) | θ 2.38: 4 spikes; fails |
| | | right | θ 4.88, fails (no faster walking) | θ 1.88: 97 spikes; walking 1.2, not 1.8 Hz; fails |

Most of what's excluded is the paper's own −33 mV rule: a2_d_14's right cell
sat between −18 and −26 mV for its first ten minutes and its left cell above
−33 mV for its last nine; in a2_d_08 and a2_d_12 the right and left cells
drift above it late in the recording. The optogenetic stimulus channel is on
4.3% of every recording, in pulses about every 11.5 s.

As registered, only a2_d_13 passes, so **D1 fails under the protocol as
written**. With the amended detector a2_d_08, a2_d_12 and a2_d_13 pass, and
a2_d_14 doesn't: D1 holds, with three.

These cells fire slower than the paper's single-cell figure the brain README
quotes (25 to 30 Hz walking): 2.6 to 15.6 Hz walking forward and 0.7 to 4.1
not, cell by cell. That is a note on these three flies, not a re-reading of
that figure.

### The relation, walking forward

The files' own sign already makes Δ and yaw agree, so by the paper's
ipsilateral relation positive yaw in the files is a turn to the right.

| Recording | Walking / not / backward | Slope, no filter | Slope at τ 10 ms, d 110 ms (R², the fly's own bias) | Not walking | Backward | Peak cross-correlation | Linear filter |
|---|---|---|---|---|---|---|---|
| a2_d_08 | 542 / 921 / 94 s | 1.57 °/s per Hz (R² 0.01) | 4.88 (0.07, +2 °/s) | 2.25 (0.11) | 3.89 (0.29) | 130 ms, r 0.26 | largest lobe negative at 40 ms, an opposite one nearly as large after it; sustained gain 3.0 |
| a2_d_12 | 186 / 279 / 36 s | 3.14 (0.05) | 7.92 (0.27, −19 °/s) | 1.20 (0.04) | 6.16 (0.41) | 110 ms, r 0.52 | peak at 160 ms, one-signed; sustained gain 5.5 |
| a2_d_13 | 192 / 316 / 26 s | 2.70 (0.02) | 6.33 (0.08, −92 °/s) | 0.44 (0.01) | (under 30 s) | 120 ms, r 0.28 | peak at 160 ms, biphasic; sustained gain 4.4 |

Between flies, walking: **6.37 ± 1.52 °/s per Hz**, coefficient of variation
0.24, the same sign in all three: **D2 holds**. Fitted on all three, τ 10 ms
and d 110 ms; 0.111 rad/s per Hz; 7.04 °/s per Hz in the files' own units
(the 10% the units leave open). Not walking: 1.30 ± 0.91, CV 0.70, fails D2.

Turning follows the readout by about 110 to 130 ms, beyond the 150 ms the
readout itself already lags spikes by; the filters from spikes peak at 40 to
160 ms, as the paper's do at about 150. Two of the three are biphasic, as the
paper finds DNa02's to be. A causal low-pass on top of the model's readout
adds nothing (τ 0 to 10 ms).

### Held out

| Held out | Trained on | τ, d | Gain | R² | b | Present mapping: R², b |
|---|---|---|---|---|---|---|
| **a2_d_14 (primary)** | – | – | – | can't be computed: its spikes fail | – | – |
| a2_d_08 | 12, 13 | 0, 110 ms | 7.07 | 0.05 | 0.65 | 0.03, 0.83 |
| a2_d_12 | 08, 13 | 0, 120 ms | 5.61 | 0.23 | 1.34 | 0.13, 1.50 |
| a2_d_13 | 08, 12 | 10, 110 ms | 6.40 | 0.08 | 0.90 | 0.05, 1.28 |

**D3 fails.** The primary held-out recording can't be used, and of the
others only a2_d_12 would meet it. The measured gain is about right in all
three (b 0.65 to 1.34), but the readout predicts little of the moment-to-moment
turning: R² at most 0.23. The paper predicts better (Figures 2D, 3D, E) with each cell's own
biphasic filter on a fast rate; the model's readout is a slow one-signed
average, and the body has only that.

The present mapping, applied to the same data, gets the gain about as right
(b 0.83 to 1.50) and predicts a little less (R² 0.03 to 0.13): the measured
slope is half again its 4.3 °/s per Hz, but its 110 ms delay is what buys the
better fit.

### Forward speed

While walking forward, forward speed against the two cells' mean rate: −0.12,
+0.05 and −0.13 mm/s per Hz, r −0.16, +0.07 and −0.10. DNa02 says nothing
about speed here, as the paper found (Figure 2C).

For the model's own speed command, DNg100 (BDN2), no recording of firing rate
against walking speed was found. Bidaye et al. 2020 (Neuron 108: 469) imaged
BPN, a brain neuron of the same forward-walking pathway, with GCaMP6s at
0.5 to 0.9 frames a second: its activity was "high when translational velocity
(VT) was high and angular velocity (VA) was low", "strongly correlated to
walking velocity only in a subset of walking bouts and trials", with no rate
to transfer. A simulation of the nerve cord's connectome finds DNg100 the
strongest driver of rhythmic leg motor activity among the brain's descending
neurons (Pugliese et al., [bioRxiv 10.1101/2025.09.12.675944](https://doi.org/10.1101/2025.09.12.675944),
abstract): a model, not a recorded rate. So walking speed stays as it is:
chosen, 5 to 16 mm/s over the range of `walk`.

### What follows

- The body's turn gain, cap and smoothing stay as chosen
  (`packages/body/src/behavior.ts`: `TURN_RATE` 3 rad/s at full `turn`,
  `STANDING_TURN` 0.35, `COMMAND_SMOOTHING` 12/s) and are labelled chosen.
  The measured walking gain is within a factor of 1.5 of the chosen one;
  were it used it would cap the turn at 255 °/s instead of 172, but that
  is no reason to use it.
- No constant changed, so the game's behaviour and the scorecard are
  unchanged. Walking speed too.
- What would settle it: more paired recordings that hold below −33 mV, or the
  model's readout replaced by one that keeps a spike train's fast changes
  (a brain change, outside this calibration), tested on the held-out fly the
  same way.

### The scorecard, as observations

No constant changed, so there is no after: the free hour on this branch is
the free hour on dev (`b9a88b6d`; the run's commit `76ecec04` adds only the
counter of time at the turn limit), seeds 1, 2 and 3.

| Seed | Walking | Active | Walking bouts (mean, per s) | Median walking speed | Ground yaw speed, median / 90th percentile | Saccades | Outer half | Take-offs | `turn` at ±1 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 39.9% | 53.0% | 1.44 s, 0.278 | 8.65 mm/s | 16.5 / 96.5 °/s | 0 | 68.5% | 0 | 9.4 s |
| 2 | 38.8% | 49.6% | 1.45 s, 0.268 | 8.65 mm/s | 13.5 / 94.5 °/s | 0 | 63.4% | 0 | 8.5 s |
| 3 | 40.1% | 52.7% | 1.45 s, 0.276 | 8.65 mm/s | 16.5 / 99.5 °/s | 0 | 68.3% | 0 | 10.9 s |

The brain's `turn` sits at its ±40 Hz limit for 0.2 to 0.3% of the hour. The
scorecard's own seed 1 at `cb9b9da2` ([current dev](current-dev.md)) differs
(43% walking, 1.88 s bouts, 9.65 mm/s): dev has moved since, and this page
changes none of it.

### What remains uncertain

- Units: the files' yaw is about 10% above the authors' final calibration;
  the gain above uses the final one. Which of the paper's two smoothing
  scales (1.25 or 12.5 ms bins) its filter figures used is still open, and
  doesn't enter here.
- The sign: positive yaw as rightward is inferred from the published
  ipsilateral relation, not stated in the files.
- Three flies, females, head fixed with the brain opened, turning a ball; the
  model is a male walking free. The paper says such flies steer less than
  intact ones.
