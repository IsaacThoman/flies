# Steering from recordings

The body turns the fly in proportion to the brain's `turn` (DNa02, right minus
left; `packages/body/src/behavior.ts`). Its gain, cap and smoothing were
chosen. This page replaces them, where the data allow, with the relation
measured between the same neurons and the turns of walking flies, and records
what the data don't allow.

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
they are seen. The brain-only diagnostics (`scripts/report.ts`, turn events)
don't involve the body and can't change.
