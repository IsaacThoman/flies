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

Tradeoff retained: the complete reader is embedded eagerly for offline native use. Its JSON is about 152 KB raw / 20 KB gzip; the Apple TV has no module loader. Sequential previous/next navigation and a page count keep the screen small. A separate component index was deferred to keep this About change contained; every section is reachable with bounded remote presses and tested at all layout shapes. No native brain source or binary was changed.

Validation note: the first full `npm test` completed its main 742-case run (738 passed, 4 skipped), then reached the fairness time limit during its separate CPU-budget tail. It was stopped and the slot released. A complete retry will pause CPU work across cooldowns if needed, rather than hold a slot longer than ten minutes. No code failure was observed in that interrupted run.
