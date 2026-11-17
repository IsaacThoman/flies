# Greenhouse experiment: blind review log

The place is a 640 × 400 mm potting bench. The rendered set and collision tops share the world's height functions. Plants are solid crown approximations, with their visible leaf surfaces constrained close to those crowns.

## Rubric

Each criterion is scored independently from 0 to 10. A 10 means:

| # | Criterion | Target |
| --- | --- | --- |
| 1 | Believability and beauty | A coherent, inviting fly habitat with convincing details. |
| 2 | Composition | Every shared shot and the whole view is compelling and readable. |
| 3 | Light and weather | Five distinct times, convincing rain, glass, shafts and dawn condensation. |
| 4 | Materials | Convincing terracotta, wet wood, glass, foliage, fruit and water near and far. |
| 5 | Scale | Plausible human objects and rewarding detail beside a 2.5 mm fly. |
| 6 | World alignment | Supporting surfaces, food and solid crowns agree with the visible set. |
| 7 | TV budget | Roughly 30 draws, short construction steps, no recurring frame allocations. |
| 8 | Artefacts | No gaps, floating props, clipping, faceting, sorting or shader failures. |

## Method

Every panel uses fresh independent reviewers, neutral set names, different presentation orders, absolute scores, and a forced ranking. Later panels include a reviewer concentrating on comparative defects and regressions. The windowsill is an unlabelled reference, not a greenhouse candidate. The first panel also contains a byte-identical decoy. A candidate counts as progress only when the panel's scores and ranking prefer it. Losing candidates are rejected. The stopping limits are a mean of 9, eight rounds, or two consecutive rounds without progress.

The evidence grid is fixed: whole, wide, follow, close and above, each at morning, noon, golden, dusk and night, plus noon rain, overcast and mist. Static images cannot establish temporal stability. Browser build measurements are not Apple TV timings. Source snapshots preserve the version actually rendered; their commit identifiers can precede later rebases.

The capture harness holds the fly at the documented start for visual comparison. In the windowsill reference it retained a prior feeding banner/sense readout; those values do not validate the reference's native food. The world/food contract tests and fuzzers, rather than a frozen capture's HUD, establish interaction correctness. The reference's wide-view issue was observed, not changed in this experiment.

## Round 1

Key: `M4` = baseline (486f059); `T2` = identical baseline decoy; `B8` = windowsill reference.

| Reviewer | Set | Scores (criteria 1–8) | Mean | Forced ranking |
| --- | --- | --- | ---: | --- |
| 1 | M4 | 5.5, 5.5, 6, 5, 7, 8, 5, 6.5 | 6.06 | B8 > M4 = T2 |
| 1 | B8 | 8, 6, 7.5, 7.5, 8, 6.5, 6, 5.5 | 6.88 | B8 > M4 = T2 |
| 1 | T2 | 5.5, 5.5, 6, 5, 7, 8, 5, 6.5 | 6.06 | B8 > M4 = T2 |
| 2 | T2 | 6, 6, 6, 5, 7, 8, 5, 7 | 6.25 | B8 > T2 = M4 |
| 2 | M4 | 6, 6, 6, 5, 7, 8, 5, 7 | 6.25 | B8 > T2 = M4 |
| 2 | B8 | 8, 5, 7, 8, 8, 6, 6, 5 | 6.62 | B8 > T2 = M4 |
| 3 | B8 | 7.5, 6.5, 6.5, 7, 7.5, 6, 6, 7 | 6.75 | B8 > T2 = M4 |
| 3 | T2 | 5, 5, 6, 4.5, 6, 7.5, 5, 5.5 | 5.56 | B8 > T2 = M4 |
| 3 | M4 | 5, 5, 6, 4.5, 6, 7.5, 5, 5.5 | 5.56 | B8 > T2 = M4 |

Baseline. Duplicate scores match exactly for all three reviewers; no extra noise panel was needed.

## Round 2

Key: `V6` = baseline (486f059); `J3` = staged set (c7b7196); `R9` = windowsill reference.

| Reviewer | Set | Scores (criteria 1–8) | Mean | Forced ranking |
| --- | --- | --- | ---: | --- |
| 1 | J3 | 6.5, 5.5, 6, 5.5, 7, 8.5, 9, 7.5 | 6.94 | R9 > J3 > V6 |
| 1 | R9 | 8.5, 6, 7.5, 8, 8.5, 8, 6, 7.5 | 7.50 | R9 > J3 > V6 |
| 1 | V6 | 6, 5.5, 6, 5, 7, 8.5, 5, 5 | 6.00 | R9 > J3 > V6 |
| 2 | V6 | 5.5, 5.5, 6, 4.5, 6.5, 8.5, 5, 5.5 | 5.88 | R9 > J3 > V6 |
| 2 | J3 | 6, 5.5, 6, 5.5, 6.5, 8.5, 9, 7.5 | 6.81 | R9 > J3 > V6 |
| 2 | R9 | 8.5, 6, 7.5, 8, 8, 7.5, 5.5, 6 | 7.12 | R9 > J3 > V6 |
| 3 | R9 | 7.5, 4.5, 7, 7, 7, 6, 5.5, 4.5 | 6.12 | J3 > R9 > V6 |
| 3 | V6 | 5, 5.5, 6, 4.5, 6, 7.5, 4.5, 5 | 5.50 | J3 > R9 > V6 |
| 3 | J3 | 5.5, 5.5, 6, 5.5, 6, 7.5, 8.5, 6.5 | 6.38 | J3 > R9 > V6 |
| 4 | R9 | 8, 5.5, 7, 7.5, 7.5, 7.5, 6, 7.5 | 7.06 | R9 > J3 > V6 |
| 4 | J3 | 5.5, 6, 6, 5.5, 6.5, 8, 8, 7 | 6.56 | R9 > J3 > V6 |
| 4 | V6 | 5, 6, 6, 4.5, 6.5, 8, 4.5, 4.5 | 5.62 | R9 > J3 > V6 |

Accepted. All four reviewers score and rank the staged set above the baseline. Kept staged construction, reduced sampling, distance-filtered paint and separated water.

## Round 3

Key: `C8` = staged set (c7b7196); `F2` = leaf/feeding detail (a6470e5); `D4` = windowsill reference.

| Reviewer | Set | Scores (criteria 1–8) | Mean | Forced ranking |
| --- | --- | --- | ---: | --- |
| 1 | D4 | 7.5, 6.5, 7, 6.5, 7.5, 6.5, 5, 7 | 6.69 | D4 > F2 > C8 |
| 1 | F2 | 5.5, 5.5, 6.5, 4.5, 6, 8, 8.5, 6 | 6.31 | D4 > F2 > C8 |
| 1 | C8 | 5, 5, 6.5, 4, 5.5, 8, 9, 5.5 | 6.06 | D4 > F2 > C8 |
| 2 | C8 | 6, 6, 6.5, 5.5, 6.5, 8.5, 9, 7.5 | 6.94 | D4 > F2 > C8 |
| 2 | D4 | 8, 6, 8, 8, 8, 7, 5, 6 | 7.00 | D4 > F2 > C8 |
| 2 | F2 | 6.5, 6.5, 6.5, 6, 7, 8, 8, 7 | 6.94 | D4 > F2 > C8 |
| 3 | F2 | 6, 6, 6.5, 5.5, 7, 8, 8, 7.5 | 6.81 | D4 > F2 > C8 |
| 3 | C8 | 5.5, 5.5, 6.5, 5, 6.5, 7.5, 9, 6.5 | 6.50 | D4 > F2 > C8 |
| 3 | D4 | 8, 6, 8, 8, 8, 6.5, 5.5, 6.5 | 7.06 | D4 > F2 > C8 |
| 4 | C8 | 5.5, 5.5, 6, 4.5, 6.5, 8, 8, 6.5 | 6.31 | D4 > C8 > F2 |
| 4 | F2 | 5.5, 5.5, 6, 5.5, 7, 7.5, 6.5, 6 | 6.19 | D4 > C8 > F2 |
| 4 | D4 | 8, 6, 7.5, 8, 8, 6.5, 5.5, 5 | 6.81 | D4 > C8 > F2 |

Accepted narrowly: three of four rankings prefer F2, and its paired mean exceeds C8. Reviewer 4 rejects the trade because foliage cost outweighs the visual gain; that objection is retained. The next candidate addresses pale foliage and the flat roof projection.

## Round 4

Key: `A3` = leaf/feeding detail (a6470e5); `P7` = framing/glazing light (da8b334); `L6` = staged set (c7b7196); `W2` = windowsill reference.

| Reviewer | Set | Scores (criteria 1–8) | Mean | Forced ranking |
| --- | --- | --- | ---: | --- |
| 1 | P7 | 6.5, 6.5, 7, 6, 7, 9, 9, 7.5 | 7.31 | W2 > P7 > A3 > L6 |
| 1 | L6 | 5.5, 5.5, 6, 5, 6.5, 8, 9.5, 6.5 | 6.56 | W2 > P7 > A3 > L6 |
| 1 | W2 | 8.5, 8, 8, 8, 8.5, 8, 6.5, 8 | 7.94 | W2 > P7 > A3 > L6 |
| 1 | A3 | 6, 5.5, 6, 5.5, 7, 8, 8.5, 7 | 6.69 | W2 > P7 > A3 > L6 |
| 2 | A3 | 6, 6, 6.5, 5, 6, 8, 8.5, 6 | 6.50 | P7 > W2 > A3 > L6 |
| 2 | P7 | 6.5, 6.5, 7, 5.5, 6, 8.5, 9, 7 | 7.00 | P7 > W2 > A3 > L6 |
| 2 | L6 | 5.5, 5.5, 6.5, 4.5, 5.5, 8, 9, 6 | 6.31 | P7 > W2 > A3 > L6 |
| 2 | W2 | 8, 6, 8, 7.5, 8, 7, 5.5, 5.5 | 6.94 | P7 > W2 > A3 > L6 |
| 3 | W2 | 7.5, 7, 6.5, 6.5, 7, 8, 6, 7 | 6.94 | W2 > P7 > A3 > L6 |
| 3 | A3 | 5.5, 5, 5.5, 4.5, 6, 8, 8, 6 | 6.06 | W2 > P7 > A3 > L6 |
| 3 | P7 | 6, 6, 6, 5, 6, 9, 8.5, 7 | 6.69 | W2 > P7 > A3 > L6 |
| 3 | L6 | 5, 5, 5.5, 4, 5.5, 8, 9, 5 | 5.88 | W2 > P7 > A3 > L6 |
| 4 | L6 | 5.5, 5, 6, 4.5, 6, 8, 8.5, 6.5 | 6.25 | W2 > P7 > L6 > A3 |
| 4 | W2 | 8, 7.5, 7.5, 7.5, 8, 7.5, 5, 7.5 | 7.31 | W2 > P7 > L6 > A3 |
| 4 | A3 | 5.5, 5, 6, 4.5, 6.5, 8.5, 6.5, 6 | 6.06 | W2 > P7 > L6 > A3 |
| 4 | P7 | 6.5, 6, 6.5, 5.5, 6.5, 9, 7, 7 | 6.75 | W2 > P7 > L6 > A3 |

Accepted. All four reviewers prefer P7 to the preceding greenhouse candidates. Kept roof/wall light intersections, sealed gables, corrected foliage colour and the pool radius. The wide-camera tomato obstruction remains a concrete failure to address.

## Round 5

Key: `U4` = layout/arched handle (f649fe6); `H2` = framing/glazing light (da8b334); `Z7` = staged set (c7b7196); `E9` = windowsill reference.

| Reviewer | Set | Scores (criteria 1–8) | Mean | Forced ranking |
| --- | --- | --- | ---: | --- |
| 1 | Z7 | 5, 4.5, 5.5, 4.5, 6, 7, 7, 5.5 | 5.62 | E9 > U4 > H2 > Z7 |
| 1 | U4 | 6, 6, 6.5, 5.5, 7, 8, 6, 7 | 6.50 | E9 > U4 > H2 > Z7 |
| 1 | E9 | 8, 8, 7, 7, 8, 5, 4, 7 | 6.75 | E9 > U4 > H2 > Z7 |
| 1 | H2 | 5.5, 5, 6.5, 5, 6.5, 7.5, 6, 6 | 6.00 | E9 > U4 > H2 > Z7 |
| 2 | H2 | 6, 5, 6, 6, 6, 8, 8, 6 | 6.38 | E9 > U4 > H2 > Z7 |
| 2 | E9 | 8, 8, 7, 8, 8, 6, 5, 8 | 7.25 | E9 > U4 > H2 > Z7 |
| 2 | Z7 | 5, 5, 5, 4, 5, 7, 9, 5 | 5.62 | E9 > U4 > H2 > Z7 |
| 2 | U4 | 7, 7, 6, 6, 7, 8, 8, 7 | 7.00 | E9 > U4 > H2 > Z7 |
| 3 | U4 | 6, 7, 6, 5, 7, 8, 7, 7 | 6.62 | E9 > U4 > H2 > Z7 |
| 3 | H2 | 6, 5, 6, 5, 7, 7, 7, 5 | 6.00 | E9 > U4 > H2 > Z7 |
| 3 | E9 | 8, 8, 8, 7, 8, 7, 6, 7 | 7.38 | E9 > U4 > H2 > Z7 |
| 3 | Z7 | 5, 4, 5, 4, 6, 6, 8, 5 | 5.38 | E9 > U4 > H2 > Z7 |
| 4 | E9 | 8, 6, 5, 7, 7, 7, 6, 8 | 6.75 | U4 > H2 > E9 > Z7 |
| 4 | Z7 | 5.5, 4.5, 6.5, 5, 6, 7, 8, 6.5 | 6.12 | U4 > H2 > E9 > Z7 |
| 4 | H2 | 6.5, 5.5, 7, 6, 6.5, 8, 7, 7.5 | 6.75 | U4 > H2 > E9 > Z7 |
| 4 | U4 | 7, 7, 7, 6, 6.5, 7.5, 7, 8 | 7.00 | U4 > H2 > E9 > Z7 |

Accepted. All four reviewers prefer U4 to H2. Moving the tomato clears the shared wide view; the arched handle resolves the disconnected top bar. One reviewer notes a regression in the tomato bruise marking; the following surface candidate corrects its positional selection.

## Round 6

Key: `S8` = surface/normals/full framing (9f62ebde); `K2` = layout/arched handle (f649fe6); `Y6` = framing/glazing light (da8b334); `C3` = windowsill reference.

| Reviewer | Set | Scores (criteria 1–8) | Mean | Forced ranking |
| --- | --- | --- | ---: | --- |
| 1 | Y6 | 6, 5.5, 6.5, 5, 7, 7, 7, 6 | 6.25 | S8 > C3 > K2 > Y6 |
| 1 | S8 | 6.5, 6.5, 6.5, 6, 7, 8, 7, 6.5 | 6.75 | S8 > C3 > K2 > Y6 |
| 1 | C3 | 8, 8, 7.5, 7.5, 8, 5, 4, 7 | 6.88 | S8 > C3 > K2 > Y6 |
| 1 | K2 | 6.5, 6, 6.5, 5.5, 7, 7.5, 7, 6.5 | 6.56 | S8 > C3 > K2 > Y6 |
| 2 | K2 | 6, 7, 6, 5, 7, 8, 8, 7 | 6.75 | C3 > S8 > K2 > Y6 |
| 2 | Y6 | 6, 5, 6, 5, 7, 7, 8, 5 | 6.12 | C3 > S8 > K2 > Y6 |
| 2 | S8 | 7, 8, 6, 6, 7, 9, 8, 7 | 7.25 | C3 > S8 > K2 > Y6 |
| 2 | C3 | 8, 8, 8, 8, 8, 6, 5, 7 | 7.25 | C3 > S8 > K2 > Y6 |
| 3 | C3 | 8, 7, 6, 7, 7, 6, 5, 7 | 6.62 | S8 > C3 > K2 > Y6 |
| 3 | K2 | 6, 6, 7, 5, 6, 7, 8, 6 | 6.38 | S8 > C3 > K2 > Y6 |
| 3 | Y6 | 5, 4, 7, 5, 6, 7, 8, 4 | 5.75 | S8 > C3 > K2 > Y6 |
| 3 | S8 | 6, 7, 7, 6, 7, 8, 8, 7 | 7.00 | S8 > C3 > K2 > Y6 |
| 4 | S8 | 7, 7, 7, 6, 7, 8, 7, 7 | 7.00 | S8 > C3 > K2 > Y6 |
| 4 | C3 | 8, 8, 7, 8, 8, 5, 5, 7 | 7.00 | S8 > C3 > K2 > Y6 |
| 4 | K2 | 6, 6, 7, 5, 7, 7, 7, 6 | 6.38 | S8 > C3 > K2 > Y6 |
| 4 | Y6 | 5, 4, 7, 5, 6, 6, 7, 5 | 5.62 | S8 > C3 > K2 > Y6 |

Accepted. All four reviewers score and rank S8 above K2. Three also rank it above the reference on the combined rubric, while the reference retains stronger beauty/material scores. Kept shared leaf normals, lower-frequency irregular grain, calmer clay/paint, the corrected tomato-mark selector, complete whole-bench framing and a full liquid tasting footprint.

## Validation

- Baseline full test suite, lint and typecheck passed. The browser play suite passed, including every registered place.
- Body, seed 42, 1,800 simulated seconds: 41,409 steps, 30 starts and 60 recovery probes, passed.
- Life, seed 42, 1,800 simulated seconds: 51,425 steps, 174 meals, 25 take-offs and 12 carries, passed.
- Following the layout/handle change, body seed 42 passed another 1,800 seconds: 41,810 steps, 30 starts and 60 probes. Revised-layout life seeds 42 and 43 each passed 900 seconds (1,800 seconds total), recording 204 meals and 24 take-offs. A separate long attempt was stopped at the 10-minute heavy-slot limit with no assertion failure, and is not counted as a completed pass. Subsequent blind panels and final integration checks remain in progress.

Images are held only on the orphan `pr-assets-place-greenhouse` branch and embedded in the draft PR. No screenshots or recordings belong in this branch.
