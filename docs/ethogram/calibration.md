# Launch-direction experiment

[Card & Dickinson (2008), Performance trade-offs in the flight initiation of
Drosophila, Figure 7 and accompanying Results](https://doi.org/10.1242/jeb.012682)
reports near-equal vertical and horizontal peak accelerations and describes a
roughly 45° launch. This is a mechanical basis for balancing the two impulse
components. It is not a measured 45° mean with a known tolerance. Their animals
were 3-day-old mated females from a wild-derived colony, on an angled pipette;
the model is a male on a flat platform. Transfer of the mechanical approximation
across those conditions is explicit and is not scored as condition-matched
biological agreement.

The proposed mapping rotates the existing launch impulse toward equal horizontal
and vertical components, preserving its norm at every command strength. It
changes neither the threshold/refractory period nor the brain, and does not
supply a threat direction. Launch heading and sustained flight remain existing
body stand-ins. No speed is fitted to the female cohort's 0.48 m/s: that value
is the mean over the **first 2 ms**, not a point sample at 5 ms. The optical
battery's frame-end velocity cannot substitute for it.

An isolated body-only command sweep, with no wings or threat and a 1 ns step
to approximate the initial impulse, measured:

| Command strength | Existing speed (mm/s) | Existing angle | Balanced speed (mm/s) | Balanced angle |
|---|---:|---:|---:|---:|
| 0 | 412.31055 | 67.16635° | 412.31055 | 45.00000° |
| 0.25 | 485.41218 | 65.01876° | 485.41219 | 45.00000° |
| 0.5 | 559.01698 | 63.43495° | 559.01698 | 45.00000° |
| 0.75 | 632.94943 | 62.22038° | 632.94943 | 45.00000° |
| 1 | 707.10677 | 61.26020° | 707.10677 | 45.00000° |

The <0.000003 mm/s differences come from gravity during the tiny integration
step; the prescribed impulse norm is identical. This sweep validates mechanics,
**not autonomous behaviour**. The real-brain optical cohorts must establish
whether response probability/timing, frame-end motion and flight regress.
No change is accepted solely for reproducing a 45° constant. Blind reviewers
must judge the source transfer, energy preservation and independent outcomes.

Targeted motion/ethogram suites at this candidate: 43 passed. The current candidate full functional suite passed 781 tests (two optional
data/toolchain skips); lint and typecheck passed. The all-senses brain budget
failed at 0.520 versus 0.500 CPU s/s; identical dev brain sources failed at
0.546. The graphical play e2e passed, including neural takeoff, at a maximum
90 draws and 350,627 triangles. Paired optical evidence and the blind decision
remain required.
