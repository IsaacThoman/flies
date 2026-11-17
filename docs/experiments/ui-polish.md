# UI hill climb

Scope: title, Settings, About, Online, HUD, tool shelf and corner layout. No sound, gameplay changes, camera edits or Online default-room changes.

## Rubric

Each criterion is scored independently from 0 to 10 by three fresh blind reviewers. A 10 means:

| Criterion | A 10 looks like |
| --- | --- |
| Clarity | The next action and current value are immediately apparent, with only necessary text. |
| Polish | Consistent glass, spacing, alignment and readable type hierarchy throughout. |
| Remote navigation | Predictable directional focus, short paths, no traps or unnecessary steps. |
| Pointer and touch | Every target is at least 44 CSS pixels on touch, visibly actionable, and hover never shows keyboard focus. |
| Fit | Every screen fits TV 1920×1080, desktop 1440×900, phone 390×844 / 844×390 and iPad 1024×1366 without clipping or crowding. |
| Legibility | Labels, values and selected states are easy to read from a TV couch and a phone. |
| No redundancy | Each screen and action has a distinct purpose; repeated labels add no navigation burden. |
| Accessibility | Adequate contrast, explicit selection and state cues independent of colour. |

## Method

Screenshots are driven by `scripts/play.ts` against a local room server, with the real brain and renderer. Evidence sets have neutral names; each review receives only the rubric and evidence. Version order is randomized separately for each reviewer. Navigation counts start on the title with Play focused and Settings' first tab selected. Each directional press, activation, click or tap counts once; counts stop when the setting has focus (remote) or can be changed (pointer/touch). Screenshots and raw traces live outside the feature branch. Images are published only on `pr-assets-ui-polish`.

## Rounds

Baseline key: `set-K7`. All 75 requested screenshots captured with the real renderer and brain. Extra traces enumerate every setting at every shape, including the host-only Real weather option.

| Baseline reviewer | Clarity | Polish | Remote | Touch | Fit | Legibility | Redundancy | Accessibility | Mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 7 | 7 | 7 | 6 | 7 | 6 | 8 | 6 | 6.75 |
| 2 | 8 | 8 | 7 | 6 | 7 | 7 | 8 | 7 | 7.25 |
| 3 | 7 | 8 | 8 | 6 | 7 | 7 | 8 | 6 | 7.13 |

Baseline mean: **7.04/10**.

The recurring problems were Back overlapping the landscape New room form, touch targets under 44 CSS pixels, disappearing Settings tabs during scrolling, ambiguous overlay labels, and small low-contrast diagnostic captions.

### Round 1 · blind comparison pending

Key: `set-K7` = baseline, `set-R8` = candidate. The order is randomized independently for each of three scorers and a separate regression-only reviewer. A preparatory tab design was rejected without scoring because it added phone taps; the submitted candidate retains direct tab targets.

Reserved the Online heading at every layout tier; pinned the Settings tab strip while its rows scroll; replaced tiny more links with separated arrow buttons; enlarged HUD targets and narrowed the shelf divider to meet 44 CSS pixels at the requested phone sizes; kept small tab labels from shrinking below 12 design units; added a selection underline independent of colour; clarified overlay/vision labels; increased About's reading size and corner-stat caption contrast.

New tests cover the measured defects. Settings now cycles vertically, so X-ray takes six remote inputs to reach rather than twelve; tab widths follow their labels so all three remain directly tappable on the requested phone sizes. Tab measurements are cached outside steady redraws. Setting values and meanings are unchanged. No simulation, camera, sound or default-room logic changes. A live overlay preview was deferred: it would add another representation to an already crowded small screen; labels and the existing actual overlays are the first experiment.
