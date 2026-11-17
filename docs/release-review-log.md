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
