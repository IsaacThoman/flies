# Weather experiment

This records the reviewed weather step. Weather reaches the fly only through existing senses;
there is no sound and no brain or cold-response change. The place-specific
scope excludes the bar and restaurant scenes.

## Rubric

Each criterion is scored 0–10 by independent readers of neutral evidence
sets and source snapshots. A 10 means:

| Criterion | What earns 10 |
| --- | --- |
| Beauty | Distinct convincing heavy sheets, gusts, storm skies and drifting snow, day/night in each place |
| Transitions | Continuous clouds, precipitation and phase changes; manual and real-weather fallback both hold up |
| Lightning | Brief irregular scene/cloud illumination, occasional distant fork, shared eye lighting, silent |
| Snow | Thin exposed-surface dusting grows, persists, melts gradually and leaves wetness |
| Windows | Readable outdoor precipitation and frost on lab/windowsill panes, with shared light in bar/restaurant |
| Budget | At most about two added draws; instancing, no new frame allocations; measured CPU/frame and draw counts |
| Honesty | Only rain touch, wind and eye light; ON-pathway and cold limitations explicit |
| Regressions | Existing four weathers, network, fallback and tests retain their behavior |

## Baseline

C6 is the starting `dev` source, captured in the normal follow view with the
eye inset. WeatherKit-like conditions drive 40 cases: five places × day/night
× heavy rain/thunderstorm/snow/sleet. Three independent assessments saw only
the rubric, evidence and source paths. No author score is used.

| Criterion | Reader 1 | Reader 2 | Reader 3 |
| --- | ---: | ---: | ---: |
| Beauty | 3 | 4 | 3 |
| Transitions | 6 | 6 | 6 |
| Lightning | 0 | 0 | 0 |
| Snow | 0 | 0 | 0 |
| Windows | 4 | 4 | 3 |
| Budget | 5 | 5 | 6 |
| Honesty | 7 | 7 | 8 |
| Regressions | 7 | 8 | 8 |
| Mean | 4.00 | 4.25 | 4.25 |

Mean across readers: **4.17/10**. The worst problems agreed across readers:
snow became mist, thunderstorms had no lightning, and heavy rain saturated
the light-rain effect. They also found missing transition evidence and poor
window framing. The capture helper's untyped annotations caused a lint
failure in the evidence snapshot; that helper was not a shipping source
file. The repository now has the typed `scripts/weatherEvidence.ts`.

## Evidence and measurements

PNG/GIF artifacts live only on the orphan `pr-assets-weather-storm-snow`
branch and are embedded in the draft PR. Canvas `frameMs` is desktop
JavaScript CPU/frame; it is not a TV hardware result or GPU duration. Total
draw samples include occasional eye-cubemap work. Controlled two-pass draw
measurements are kept separate, excluding eyes, UI and environment rebuilds.

The first implementation's 40 cases had no captured console errors and
sampled 0.56–0.98 ms desktop JS/frame. Snow/sleet state is integrated over
90 simulated seconds before those captures; the body and brain clocks are
not scaled. A matching Whole table baseline is captured separately because
changing a stored view variant alone did not actuate the camera.

Further blind comparison scores, rankings, the neutral-set key and accepted
or rejected changes are recorded below as each round concludes.

## Round 1

Key: C6 = starting `dev`; R4 = implementation at `83fa624`. Each reader's
order was independently randomized: C6/R4, C6/R4, C6/R4; the separate
regression assessment received R4/C6. The identical order among the three
scorers was the outcome of the random choices, not a chronological label.

| Criterion | C6 reader 1 | R4 reader 1 | C6 reader 2 | R4 reader 2 | C6 reader 3 | R4 reader 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Beauty | 3 | 5 | 3 | 5 | 3 | 5 |
| Transitions | 7 | 6 | 6 | 6 | 7 | 7 |
| Lightning | 0 | 6 | 0 | 6 | 0 | 6 |
| Snow | 0 | 6 | 0 | 6 | 0 | 6 |
| Windows | 3 | 4 | 3 | 5 | 2 | 4 |
| Budget | 7 | 6 | 5 | 7 | 6 | 7 |
| Honesty | 6 | 9 | 6 | 9 | 6 | 9 |
| Regressions | 7 | 6 | 8 | 7 | 8 | 8 |
| Mean | 4.125 | 6.000 | 3.875 | 6.375 | 4.000 | 6.500 |

Paired means: **C6 4.00 → R4 6.29**. All three forced rankings preferred
R4. The separate regression assessment also ranked R4 first. The feature
set was accepted for refinement. Different camera/inset settings limit
visual and timing attribution; subsequent evidence adds matched views and
controlled draws rather than treating the aggregate numbers as deltas.

The highest-value problems were wire-like heavy rain with a saturated
sheet selector, broad snow recolouring, missing event footage, and window
framing. The regression assessment additionally found an unchanged protocol
version despite changed weather semantics, non-divisible heavy-rain wrap
sizes, and snow drift multiplying elapsed time by the current wind.

Round-two changes keep rain boxes fixed and add instances within the same
draw; shorten and fade very close heavy streaks; integrate snow travel with
a mathematically compatible wrap; add patchy, rough snow with container
shelter tests and distance filtering; gather clouds before precipitation;
frost each pane edge; vary occasional forks; and introduce protocol 4 so
mixed forecast versions are refused explicitly. No cold-response stand-in
was added. A prototype snow pattern produced distant moiré in captures and
was filtered before the round-two evidence was frozen; it was not scored.

The source was then rebased onto `dev` (`b8d87399`). The frozen comparison
snapshot predates that rebase and remains isolated, including its package
resolution. The rebased feature diff leaves the excluded areas unchanged.

## Validation record

The first full run passed all ordinary tests (725 passed, four skipped),
lint and typecheck. One unchanged brain CPU budget failed at 0.535 CPU s per
simulated second against 0.5. It is recorded as a failure, not waived by the
weather's small measured CPU cost. A targeted rerun and touched e2e runs
follow after the final source changes.


The focused keyboard/WeatherKit e2e passes on the rebased implementation,
as do pointer e2e and shared-table e2e (89 draws and 415,475 triangles at
most across its tested screen shapes). The broader play suite failed when
its menu-to-play sequence returned to the title during tool selection; this
is an unresolved failure, not reported as the separately documented X-ray
issue.

A targeted brain-budget rerun measured 0.566 CPU s/s and failed. The full
post-rebase run again passed all ordinary tests, lint and typecheck but
failed that budget at 0.615 against 0.5. Brain code and its budget test have
no feature-branch diff from dev; no threshold was relaxed. These failures
remain visible to the maintainer. No TV hardware was used.


## Maintainer handoff

The owner changed the process to ready validated steps without waiting on
GitHub CI. `origin/dev` was merged into this branch with a merge commit;
conflict resolution retained dev's antenna description and network
hardening while preserving the shared weather extension. Typecheck, lint
and 117 area tests passed on that integration. Earlier full-run failures
above are historical results from before this merge; no budget was relaxed.

The completed first comparison unanimously beat the baseline. Two second
comparison scorers have returned 7.875 and 7.625 for T7 and its identical
decoy, with both ranking them above J9; the remaining assessments are pending.
They found no decoy scoring discrepancy. The pending rain-veil, near-flake
and melt-trail experiments are preserved separately and excluded from this
handoff. Further climbing uses a new branch and PR, with newly spawned
reviewers at high reasoning effort.
