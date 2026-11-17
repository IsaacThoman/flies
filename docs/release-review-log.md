# Release paperwork review log

Score each criterion 0–10. A 10 means:
1. Licence completeness/correctness: all shipped npm, copied source, fonts, runtime components covered with exact required notices; verify five components against actual package licence files; missing-notice guard works.
2. CC-BY compliance: named FlyEM male CNS creators/source, licence URL and full terms, clear modification/repacking statement for wiring and anatomy; scientific model citation exact.
3. Privacy accuracy: network/storage code audit agrees with plain policy including WeatherKit location, all Online payloads, IP handling, persistence/retention, browser storage/caches and no analytics; App Privacy and age answers reasoned.
4. Non-lawyer clarity: concise accessible explanations, readable legal notices and actionable placeholder/release notes.
5. Store copy: honest, appealing, matches implemented simulation and labelled stand-ins, all Apple field limits satisfied, reviewer can use Online without account.
6. Acknowledgements usability: reachable from About, tidy minimal navigation, readable on TV/phone; remote scroll/back and touch work; all notices available offline.
Return scores per criterion for each evidence set, three worst problems and one idea. If multiple sets, force-rank them with reasons. Read-only review; do not modify files or start heavy processes.

## Evidence and rounds

Baseline source: `origin/dev` at bd88a01870788b3dafd8983ad537fc77ff43dc54. Three fresh independent source assessments complete. Baseline lacks screenshots because the shared heavy-work slots were occupied; rendered evidence is required for the UI rounds below.


| Baseline reviewer | Licences | CC-BY | Privacy | Clarity | Store | UI | Mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 1 | 3 | 2 | 3 | 1 | 2 | 2.00 |
| B | 1 | 3 | 1 | 3 | 2 | 2 | 2.00 |
| C | 2 | 4 | 1 | 4 | 1 | 2 | 2.33 |

Baseline mean: 2.11/10. Reviewers independently found missing distribution notices, outdated “no data collected”/network claims and no store packet. They also found stale hunger/flight statements in About. The implementation addresses those findings, including the privacy manifests and release instructions. Build-only packages were checked against their licences but were not included merely because they were installed.

Rejected: a blanket “no data collected” answer; claiming a low age rating despite persistent alcohol imagery; downloading fonts; one enormous scroll containing every licence. The reader instead pages between individual documents. Source copies deliberately cover linked WASI runtime licences conservatively; no brain C++ source or binary is changed.

## Source comparison

Neutral key: L8 = baseline source; Q2 = the first paperwork snapshot. All three independent reviewers ranked Q2 above L8. This comparison used alternating presentation order, rather than a random draw, and source evidence without renders; its scores are recorded for transparency but are not used for the stopping decision. The next comparison uses a fresh randomized key, rendered evidence and a duplicate control.

| Reviewer | Q2: licences / CC-BY / privacy / clarity / store / UI | Q2 mean | L8 scores | Ranking |
| --- | --- | ---: | --- | --- |
| A | 9 / 10 / 8 / 9 / 9 / 9 | 9.00 | 1 / 3 / 0 / 2 / 0 / 2 | Q2 > L8 |
| B | 8 / 10 / 7 / 8 / 9 / 8 | 8.33 | 1 / 3 / 0 / 2 / 0 / 2 | Q2 > L8 |
| C | 9 / 10 / 7 / 8 / 9 / 9 | 8.67 | 2 / 3 / 0 / 3 / 0 / 2 | Q2 > L8 |

Q2 mean: 8.67/10. The regression reviewer also ranked Q2 above L8, with Q2 scores 9 / 10 / 7 / 8 / 9 / 8 (8.50); this separate review is not included in the three-reviewer mean.

Accepted findings: remove an unsupported claim that WeatherKit-derived weather/sun times reach rooms; reconcile older platform privacy docs; distinguish Apple's real-time WeatherKit flow from Online's retained time-zone configuration; preserve the exact upstream V8 14.6.202 BSD licence as well as the source header; reject inherited registry properties; traverse workspace/optional dependencies and fail closed on nested versions; hash fixed-name legal documents into the offline cache version and refresh policy copies on successful navigation. Reader hints now name scrolling and notice switching. Render inspection also found hard-wrapped licence lines and phone-keyboard hints overlapping the footer; paragraph reflow and a reserved hint area address them.

Tradeoff retained: the complete reader is embedded eagerly for offline native use; the Apple TV has no module loader. The final inventory has 29 sections, with JSON of 173,496 bytes raw / 22,201 bytes gzip. Sequential previous/next navigation and a page count keep the screen small. A separate component index was deferred to keep this About change contained; every section is reachable with bounded remote presses and tested at all layout shapes. No native brain source or binary was changed.

Validation note: the first full `npm test` completed its main 742-case run (738 passed, 4 skipped), then reached the fairness time limit during its separate CPU-budget tail. It was stopped and the slot released. A complete retry will pause CPU work across cooldowns if needed, rather than hold a slot longer than ten minutes. No code failure was observed in that interrupted run.

## Randomized rendered comparison — stopping criterion met

Private key, disclosed after reviews: AAED = original baseline; 4E99 = first paperwork snapshot; 96E7 = corrected snapshot at `0d0319e`; 4322 = byte-identical duplicate of 96E7. Each reviewer received only the rubric, source/render evidence paths and read-only instructions. No earlier scores, author rationale, preferred result or stopping threshold were supplied. Three fresh independent reviewers and a separate fresh regression reviewer inspected the real PNGs and source.

| Reviewer | 96E7 scores: licences / CC-BY / privacy / clarity / store / UI | 4322 duplicate | 4E99 scores | AAED scores | Ranking |
| --- | --- | --- | --- | --- | --- |
| A | 9 / 10 / 9 / 9 / 9 / 9 | identical | 7 / 10 / 7 / 8 / 8 / 8 | 1 / 3 / 0 / 3 / 0 / 1 | 96E7 = 4322 > 4E99 > AAED |
| B | 9 / 10 / 9 / 9 / 9 / 9 | identical | 7 / 10 / 7 / 8 / 8 / 8 | 1 / 3 / 0 / 3 / 0 / 0 | 96E7 = 4322 > 4E99 > AAED |
| C | 8 / 10 / 9 / 9 / 9 / 9 | identical | 6.5 / 10 / 7 / 8.5 / 8.5 / 8 | 1 / 3 / 0 / 2 / 0 / 1 | 96E7 = 4322 > 4E99 > AAED |

The corrected snapshot scored **9.11/10** (55, 55 and 54 of 60); 4E99 scored 8.03/10 and AAED 1.22/10 in this comparison. The duplicate control received identical scores in every criterion from every reviewer, so the five-reviewer noise expansion was unnecessary. All three reviewers ranked the corrected snapshot above the preceding snapshot. This meets the specified mean-at-least-nine stopping rule without author scoring.

The regression-only reviewer confirmed the duplicate and found the intended tradeoff: the stable pane always reserves hint space, including in touch mode. It therefore shows fewer lines on a phone, but changing input methods cannot place keyboard hints over the navigation footer. This tradeoff is retained. A separate component index remains deferred; the reader's sequential navigation, scroll and back controls were readable in the renders.

A reviewer found a required embedded Earcut notice missing from Three.js's top-level MIT text. This was corrected after the scored snapshot, without assigning a higher score or starting another reviewer just for a small finding. The follow-up also inventories other explicit embedded ports/references, preserves their verified upstream terms, and pins installed source hashes and the package version so upgrades require an audit. The additional notice entries use the same reader and receive the same generated-file and all-sections layout checks. These follow-up additions are not represented as separately blind-scored work.

Remaining release work is intentional and external to this code change: fill owner/contact/support/service placeholders, verify deployment log and backup retention, confirm signed-device WeatherKit attribution, and obtain legal review. No personal owner email or address was inserted. The PR stays draft and must not be merged by this experiment.


Randomized presentation orders: A = AAED, 4322, 96E7, 4E99; B = AAED, 96E7, 4322, 4E99; C = 96E7, 4E99, AAED, 4322; regression = 4E99, 4322, AAED, 96E7. The source-only comparison's orders were Q2/L8, L8/Q2, Q2/L8 and L8/Q2 respectively.

## Final validation

The final full `npm test` ran 745 main tests: 741 passed, four skipped for unavailable optional data/toolchain, none failed. Its separate CPU-budget tail ran four tests: three passed and `packages/brain/src/cost.budget.ts` failed. Full-input cost was 0.646 normalized CPU seconds per simulated second against the 0.5 limit; construction and resting cost were within bounds. Therefore **`npm test` exits 1 and is not green**. An earlier complete run and an isolated rerun also exceeded this budget. Brain, native brain and CPU-calibration sources match the rebased `dev` base at `4a7db80`; no performance threshold was weakened. This remains an unresolved check outside the paperwork change.

`npm run lint`, `npm run typecheck`, the production web build checks, and the tvOS JavaScript build passed. Generated notices match the tvOS output byte for byte; both privacy manifests pass `plutil -lint`. All three affected browser suites passed: `play.e2e.ts`, `pointer.e2e.ts` and `web.e2e.ts`. They exercise remote/touch acknowledgement navigation and the static policy's online update followed by offline navigation. Targeted notice/layout checks passed (21 tests), including all 29 sections, dependency-guard failures, pinned embedded-source changes and policy-only cache invalidation. `npm run notices:check` and `git diff --check` passed.

Final TV/phone PNGs were refreshed after the embedded-notice correction. They are real browser canvas renders, not signed-device screenshots. Only images are published on the parentless assets branch. Heavy commands used the shared slots, released between batches with the required cooldown; no simulator or physical Apple TV was used.

The strongest result is that the same complete notices are generated into the builds and available offline through the game's existing remote/touch UI. This is useful release preparation, but the draft is not ready for release: the failing performance check, owner/deployment answers, signed-device verification and legal review remain visible handoff items.
