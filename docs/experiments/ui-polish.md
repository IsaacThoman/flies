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

| Round 2 scorer | Set | Clarity | Polish | Remote | Touch | Fit | Legibility | Redundancy | Accessibility | Mean | Rank |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| K | R8 / T5 | 7 | 8 | 8 | 7 | 7 | 7 | 7 | 7 | 7.25 | tied |
| K | M4 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 7 | 7.88 | 1 |
| L | R8 / T5 | 7 | 8 | 8 | 8 | 8 | 8 | 8 | 7 | 7.75 | tied |
| L | M4 | 8 | 8 | 8 | 9 | 9 | 8 | 9 | 8 | 8.38 | 1 |
| M | R8 | 7 | 7.5 | 7.5 | 7 | 6.5 | 7 | 7.5 | 7 | 7.13 | 3 |
| M | T5 | 7 | 7.5 | 7.5 | 7 | 7 | 7 | 7.5 | 7 | 7.19 | 2 |
| M | M4 | 8.5 | 8.5 | 7.5 | 8.5 | 8 | 8 | 8.5 | 7.5 | 8.13 | 1 |

**Accepted: M4, 8.13/10**, unanimously ranked first. All 82 duplicate PNGs and UI source files match. K and L score the decoy identically; M differs by 0.5 on Fit, below the >1 noise threshold. M describes a camera-marker difference between identical images; that claim is unsupported, so it does not drive a code change. No additional scorers are required by the stated decoy rule.

The regression-only review flags the larger iPad stats panel obscuring more of the world and the smaller landscape heading. Keep the shorter heading to preserve four visible settings; next test a grid preference that avoids a much taller panel for a marginal type-size gain. The strongest remaining concerns are faint inactive anatomy, unexplained occupancy dots, tool discovery, and tight focus decoration.

### Round 3 · preparation

Use a contrasting backdrop behind anatomical tissue, without touching neural colours or activity. Replace room-occupancy pips with cached numeric counters, strengthen room subtitles, inset the focus decoration, and prefer the shorter stats grid unless the taller grid gives materially larger type. Put Settings and Online ahead of About: Settings then takes one fewer remote press, while About remains one click/tap away. Both versions are rendered again on the same rebased `dev` to keep camera and sleep updates out of the comparison.

The new phone code-entry browser check passes, as does the complete Play e2e suite, including nervous-system and X-ray steps. A rebased full functional run has zero failures; the unchanged brain budget remains narrowly over at 0.508 s/s. The new test's required `dataDir` type was corrected and typecheck passes afterward. Its check is included in `npm run e2e`.

Round 3 key: C6 is M4 re-rendered on current `dev`; V9 is the candidate. Orders: P V9/C6; Q V9/C6; R C6/V9; S (regressions) V9/C6. Fresh scorers use `high` effort. Candidate navigation traces show five to nine remote inputs including adjustment, with X-ray reachable in five rather than six. Seventy-seven targeted tests pass; lint and typecheck pass. Comparative review is pending.

| Round 3 scorer | Set | Clarity | Polish | Remote | Touch | Fit | Legibility | Redundancy | Accessibility | Mean | Rank |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P | C6 | 7 | 7 | 7 | 9 | 8 | 6 | 8 | 6 | 7.25 | 2 |
| P | V9 | 8 | 8 | 8 | 9 | 8 | 8 | 8 | 8 | 8.13 | 1 |
| Q | C6 | 7 | 7 | 7 | 9 | 8 | 6 | 8 | 6 | 7.25 | 2 |
| Q | V9 | 8 | 8 | 8 | 9 | 8 | 7 | 8 | 7 | 7.88 | 1 |
| R | C6 | 8 | 7.5 | 7.5 | 8 | 7.5 | 7 | 8 | 7 | 7.56 | 2 |
| R | V9 | 8.5 | 8 | 8 | 8 | 7.5 | 8 | 8 | 8 | 8.00 | 1 |

**Accepted: V9, 8.00/10**, unanimously ranked first. Its paired reference averages 7.35: the fresh cohort's absolute calibration is lower than round 2, but each scorer gives the candidate a higher score and rank. The regression review confirms the two extra About presses and smaller iPad figures in exchange for less scene occlusion. Remaining problems: landscape corner labels, title footer spacing, field affordances, and repeated activity captions. Browser lifecycle/offline and phone code-entry checks pass.

### Round 4 · preparation

Reserve the title's footer in portrait layouts. Underline editable values without adding instructional text. Scale the anatomical panel's heading for its actual CSS size. Allow corner panels to use space occupied by remote hints only when those hints are absent, relaying out on input-mode changes rather than allocating each frame. During play the stats identify their contents; when watching they retain the activity caption that the hidden HUD would otherwise supply. Tests cover both hint modes across the existing full geometry matrix.

Round 4 key: H2 is the candidate; V9 is the accepted reference. Orders U/V/W: H2/V9; X (regressions): V9/H2. All reviewers are fresh, independent and high-effort, with only the rubric and neutral evidence. Every screen has five-size renders and setting navigation traces.

| Round 4 scorer | Set | Clarity | Polish | Remote | Touch | Fit | Legibility | Redundancy | Accessibility | Mean | Rank |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| U | V9 | 7 | 7 | 8 | 8 | 8 | 7 | 7 | 7 | 7.38 | 2 |
| U | H2 | 8 | 8 | 8 | 9 | 9 | 8 | 9 | 8 | 8.38 | 1 |
| V | V9 | 7 | 7 | 8 | 8 | 8 | 7 | 8 | 7 | 7.50 | 2 |
| V | H2 | 8 | 8 | 8 | 9 | 9 | 8 | 9 | 7 | 8.25 | 1 |
| W | V9 | 7 | 7 | 8 | 7 | 7 | 7 | 8 | 7 | 7.25 | 2 |
| W | H2 | 8 | 8 | 8 | 8 | 8 | 7 | 9 | 7 | 7.88 | 1 |

**Accepted: H2, 8.17/10**, unanimously ranked first, against a paired reference mean of 7.38. The regression review flags taller phone-landscape corner panels consuming more play space; they remain clear of controls and provide larger text. Remaining concerns: unexplained tool icons, unused space below short Settings pages, dense About copy and contrast of white text on selected cyan buttons.

The owner's later process instruction supersedes the initial draft-only rule: merge current dev with a merge commit, preserve dev's behavior, run local typecheck/lint/area tests, then mark a validated PR ready for the merge shepherd without waiting on GitHub CI. `origin/dev` was merged at 1ebc3a44, preserving its menu identities, text entry, held input, Online failure states and other behavior. Code Join retains field identity and rejects stale targets. Local targeted UI tests: 100 pass. Typecheck and lint pass. A helper removed upstream was removed from the new e2e check; openGame now supplies that screensaver setup itself. The unreviewed next candidate is held outside this PR for a new branch after landing.

### Round 5 · accepted discovery and spacing step

Key: J3 is H2 rendered on a matched base, D4 is its identical decoy, L8 is the candidate. Orders Y/Z: J3/D4/L8; AA and regression BB: L8/D4/J3. All reviewers are freshly spawned with high effort, with only rubric and neutral evidence. Each set has 87 screenshots: every original screen at five shapes, plus a feather-hover state. All corresponding decoy PNGs, navigation and supplied source match byte for byte. All three scorers give the duplicate identical scores; no extra scorers are required.

| Round 5 scorer | Set | Clarity | Polish | Remote | Touch | Fit | Legibility | Redundancy | Accessibility | Mean | Rank |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Y | J3 / D4 | 8 | 8 | 8 | 8 | 8 | 7.5 | 8 | 7 | 7.81 | tied |
| Y | L8 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 7.5 | 8 | 7 | 8.13 | 1 |
| Z | J3 / D4 | 8 | 8.5 | 8.5 | 8.5 | 9 | 8.5 | 8.5 | 8 | 8.44 | tied |
| Z | L8 | 9 | 9 | 9 | 9 | 9 | 8.5 | 8.5 | 8 | 8.69 | 1 |
| AA | J3 / D4 | 7 | 7 | 8 | 7 | 8 | 8 | 9 | 7.5 | 7.69 | tied |
| AA | L8 | 8 | 8 | 8.5 | 9 | 8.5 | 8 | 9 | 7.5 | 8.31 | 1 |

**Accepted: L8, 8.38/10**, unanimously ranked first, against a paired reference of 7.98. Settings trims unused glass without moving headers, tabs or rows. About takes Up + Select instead of four Down + Select. The shelf shows a tool name on hover or touch-down without selecting it until tap release. The regression reviewer notes that the preview replaces the current-tool caption and that the panel's bottom moves between tabs; keep those tradeoffs explicit in subsequent work. Main concerns remain dense About copy, white text contrast and small secondary diagnostics.

An initial, unscored capture exposed a row-count bug in trimming. It used the menu's already-clamped row count and left the panel unchanged. The saved full row count now drives trimming, the test requires a strictly shorter panel, and all candidate screenshots were recaptured before review.

The owner now requests one ready PR per validated step. This step is on feat-ui-discovery, created from current origin/dev. It carries #77 as its validated foundation until the shepherd lands that PR; the additional implementation is confined to seven UI/control/test files. Latest dev behavior, scientific caveats, acknowledgements and mutation coverage are preserved. Typecheck/lint and targeted UI tests pass, as do Play and pointer e2e. The full run on the foundation exits 0 with 875 functional passes, four skips, and three contention-calibrated budget skips. No CPU threshold was edited.
