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

### Round 1 · accepted

Key: `set-K7` = baseline, `set-R8` = candidate. The order is randomized independently for each of three scorers and a separate regression-only reviewer. A preparatory tab design was rejected without scoring because it added phone taps; the submitted candidate retains direct tab targets.

Reserved the Online heading at every layout tier; pinned the Settings tab strip while its rows scroll; replaced tiny more links with separated arrow buttons; enlarged HUD targets and narrowed the shelf divider to meet 44 CSS pixels at the requested phone sizes; kept small tab labels from shrinking below 12 design units; added a selection underline independent of colour; clarified overlay/vision labels; increased About's reading size and corner-stat caption contrast.

New tests cover the measured defects. Settings now cycles vertically, so X-ray takes six remote inputs to reach rather than twelve; tab widths follow their labels so all three remain directly tappable on the requested phone sizes. Tab measurements are cached outside steady redraws. Setting values and meanings are unchanged. No simulation, camera, sound or default-room logic changes. A live overlay preview was deferred: it would add another representation to an already crowded small screen; labels and the existing actual overlays are the first experiment.

| Round 1 scorer | Set | Clarity | Polish | Remote | Touch | Fit | Legibility | Redundancy | Accessibility | Mean | Rank |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | K7 | 7 | 7 | 7 | 7 | 6.5 | 7 | 8 | 6.5 | 7.00 | 2 |
| A | R8 | 8 | 8 | 8.5 | 9 | 8 | 7.5 | 8 | 7.5 | 8.06 | 1 |
| B | K7 | 7 | 7.5 | 7 | 6 | 7 | 7 | 8 | 6.5 | 7.00 | 2 |
| B | R8 | 8 | 8 | 8.5 | 8.5 | 8 | 7.5 | 8 | 8 | 8.06 | 1 |
| C | K7 | 7 | 7.5 | 6.5 | 6 | 7 | 7 | 8.5 | 6.5 | 7.00 | 2 |
| C | R8 | 8 | 8 | 8 | 8.5 | 8 | 7.5 | 8.5 | 8 | 8.06 | 1 |

**Accepted: R8, 8.06/10**, unanimously ranked first. Independent coin flips happened to give all four reviewers K7 then R8; the private order record preserves the draw. The separate regression reviewer found three tradeoffs: landscape Settings exposes three rather than four settings, small phone tool glyphs shrink, and larger About text needs scrolling sooner. Those findings drive the next candidate. The strongest verified result is X-ray's remote path dropping from 12 inputs to 6, with no setting-value changes.

### Round 2 · blind comparison pending

Key: `R8` is the accepted candidate, `T5` is an identical decoy, `M4` is the candidate being scored. Reviewer orders: K: T5/M4/R8; L: R8/T5/M4; M: R8/T5/M4; N (regressions): R8/M4/T5. Reviewers receive only neutral evidence paths and the rubric.

Add an inline Join action to Code without another menu row; retain Return submission. Room rows name their place as well as showing its colour. Tighten short-screen navigation while reserving the footer, restore idle tool-icon size, shorten redundant About introduction text, make footer hints match the current action, and enlarge the standard diagnostic grid. Signal values and neural activity remain unmodified. Include matched code-filled and reserved-keyboard-area captures for the two phone shapes. The keyboard itself is not emulated.

Deferred: brighten inactive neural tissue or add explanatory captions to tools. The former changes a biological visualization outside this UI experiment, and the latter adds on-screen text before testing whether the existing icons and concise actions suffice. A live settings preview remains deferred to avoid an additional representation on small screens.

### Validation so far

Functional suite: 726 tests, zero failures, four skips. Lint and typecheck pass. `npm test` fails in the separate, unchanged brain CPU budget: 0.607 M5 Pro CPU s/s against 0.5; an isolated retry gives 0.543. No threshold or brain code was changed. Final validation follows the selected candidate.
