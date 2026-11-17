# Optional browser menu semantics

The canvas menus have no accessible controls. This browser adapter exposes the existing menu state as native buttons, inline selection lists, ranges and text fields, with actions routed through the same menu outcomes and stable identities as the canvas. A player can start play, change a setting, create or join a room, recover from a wrong password and leave.

## Switch and scope

The adapter is **off by default**. Open the game with `?accessibility=1` (or append `&accessibility=1` to a room URL) to enable it. Without that explicit value, no semantic tree or host subscription is created. This permits landing the implementation while the owner decides on the DOM exception. Remove the bootstrap import/call to remove the adapter.

This PR covers the browser mirror and an Open menu control during play. Native tvOS accessibility, Reduce Motion and the visual colour audit are follow-up work. The extended prototype is preserved in the exploration history, not in this PR's final diff. Follow-up PRs must branch from current origin/dev.

## Architecture decision

Rule 5 protects the TV's JavaScriptCore host, which has no DOM, and keeps all visible UI and test-state publication in the canvas. The projection has no DOM dependency. The browser-only adapter is optional, owns its elements and focus, and synchronizes on menu changes rather than frame callbacks. The game retains all menu actions, room validation and simulation decisions. Canvas data-* remains the test interface.

Proposed wording for the owner's decision: “Everything visible is drawn in engine. Hosts may optionally mirror the menu model into platform accessibility controls; the game must run without that adapter, native JavaScriptCore must not depend on DOM, and canvas data-* state remains the test interface.” The architecture rule itself is unchanged.

The adapter uses the stable action/removal identities from #102, Unicode/composition behavior from #100, and unavailable/reconnecting/version states from #119. Password fields remain protected; secret values are never added to live announcements. Keyboard focus uses the existing canvas ring. There is no sound or new visible caption.

## Checking it

`npm run e2e:accessibility` builds and serves the page, checks the default-disabled entry, then performs the tasks at the explicit opt-in URL through accessible names and keyboard input. `--browser webkit` uses Option-Tab, with `WEBKIT_PATH` pointing to an installed Playwright WebKit. The test records trees, checks wrong-password and navigation focus, changes occupancy under the focused room, checks supplementary Unicode, records zero idle semantic DOM mutations, and compares paused full-page screenshots with/without the semantic tree. The paired screenshots isolate DOM paint from the moving canvas.

axe-core is a small dev-only dependency, excluded from the game bundle. The audit retains the existing viewport zoom violation and fails on additional A/AA violations. axe and browser-engine automation do not establish VoiceOver speech, rotor behavior, iPhone/iPad app behavior or native tvOS support; actual assistive-technology acceptance remains follow-up validation.

## Blind exploration history

The following tables retain the requested record of the broader experiment. They are historical scores across the original seven criteria, including work now deferred. Fresh reviewers received only neutral built sets, the rubric, runtime artifacts and drivers; they were not given earlier scores or implementation rationale.

## Historical exploration rubric

Each criterion is 0–10. Ten means:

| Criterion | Evidence required for 10 |
| --- | --- |
| Independent tasks | Start play; change a setting; create, join and leave rooms using only accessibility tree and keyboard; Safari/iOS VoiceOver and tvOS validated |
| Names and values | Concise current values; distinct rooms; place, occupancy, password requirement; no exposed secret |
| Focus and announcements | Stable navigation and focus return; errors and room state announced without chatter |
| Sighted/performance | Identical ordinary screenshots; no added per-frame work without assistive technology; existing input behavior intact |
| Separation | Small removable host adapters; game/menu logic independent of DOM |
| Reduce Motion | System preference and override; no automatic camera motion or veil fades |
| Colour | Place, lock and status understandable without colour semantically and visually |

## Blind review log

These scores describe the earlier full-scope prototypes; tvOS and motion prototypes are deferred from this PR. Reviewers receive only the rubric, neutral evidence sets and the driver, without the author's rationale or earlier scores. Scores reflect tested behavior, not promised platform support.

### Baseline (duplicate decoy)

Private key: K7 = Q2 = untouched origin/dev c53a64c043cf (source archive at experiment start). Order Q2, K7. All reviewers found identical bytes and tied the sets; no reviewer separated duplicates by more than one point.

| Reviewer | Tasks | Names | Focus | Sighted/cost | Separation | Motion | Colour | Mean | Ranking |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 0 | 0 | 0 | 2 | 0 | 0 | 1 | 0.43 | Tie |
| 2 | 0 | 1 | 0 | 3 | 0 | 0 | 2 | 0.86 | Tie |
| 3 | 0 | 0 | 0 | 2 | 0 | 0 | 1 | 0.43 | Tie |

Mean 0.57. Empty accessibility tree blocks discovery of all tasks. Reviewers explicitly gave zero for unverified platform/architecture/motion claims. Response: expose the existing model, preserve keyboard defaults, collect task transcripts and test motion. Do not infer VoiceOver support from Chromium alone.

## Verification method and boundaries

`node apps/web/e2e/accessibility.e2e.ts` builds and serves the real game, runs an actual room server with a locked-room fixture, and drives task actions through accessibility names and Tab/Enter/typing only. It dumps Playwright's `ariaSnapshot` (the accessibility snapshot API in Playwright 1.58) and uses axe-core as a small dev-only dependency to catch missing names, roles, and invalid ARIA. axe is not bundled in the game and cannot establish usability or VoiceOver behavior. The baseline also includes Chromium's full accessibility tree through CDP. Canvas data-* state is still the game's test clock, never a source for accessible labels or actions.

Browser tree tests do not prove Safari VoiceOver, WKWebView touch exploration, virtual cursor order, rotor behavior, speech timing or tvOS remote focus. Those are explicit acceptance gaps, as are sighted colour-blind room-place/player identification and the camera branch's preferred reduced-motion framing. No sound has been added.

The first axe run caught the existing viewport (`maximum-scale=1, user-scalable=no`), a WCAG zoom violation. The task audit retains it in raw evidence and fails on any additional A/AA rule violations. The adapter does not change the viewport or the touch branch's zoom behavior; adopting accessible page zoom requires coordinating that work.

Keyboard testing rejected a clipped popup `<select>`: its native popup could not change the value reliably in Chromium. Choices use native inline single-selection lists so options and current selection are present in the tree without a popup. WKWebView/VoiceOver behavior remains an acceptance test, not an inference from Chromium.

### Round 1

Key: K7 = untouched build; M4 = semantic host adapters at d9004460. Evidence order randomized separately per reviewer.

| Reviewer | Set | Tasks | Names | Focus | Sighted/cost | Separation | Motion | Colour | Mean | Ranking |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | K7 | 0 | 0 | 0 | 4 | 2 | 0 | 2 | 1.14 | M4 > K7 |
| 1 | M4 | 7 | 8 | 7 | 7 | 8 | 8 | 6 | 7.29 | M4 > K7 |
| 2 | K7 | 0 | 0 | 0 | 5 | 2 | 0 | 2 | 1.29 | M4 > K7 |
| 2 | M4 | 8 | 8 | 7 | 7 | 8 | 8 | 7 | 7.57 | M4 > K7 |
| 3 | K7 | 0 | 0 | 0 | 4 | 0 | 0 | 1 | 0.71 | M4 > K7 |
| 3 | M4 | 8 | 8 | 7 | 6 | 8 | 8 | 5 | 7.14 | M4 > K7 |

M4 mean **7.33**, K7 mean 1.05. All three ranked M4 higher. The independent regression reviewer found no demonstrated M4 regression; zoom restriction is shared. Each reviewer inspected built artifacts and transcripts; independent reruns were blocked by occupied heavy slots. Orders: 1: set-K7, set-M4; 2: set-K7, set-M4; 3: set-K7, set-M4; 4: set-M4, set-K7.

Highest-value findings: retain room destination on password errors and place/occupancy/lock context at a joined room; verify list churn, focus returns, screensaver and veil transitions. Response: contextual semantic state and those black-box checks, plus a WebKit attempt. Zoom and sighted place dots remain separate adoption work. The full suite also caught a shifted Place row; Reduce Motion was moved after existing rows rather than changing the tests' expectations.

### Round 2

Key: M4 = d9004460 artifact; S9 = contextual-room/Watch corrections (game content represented by cd23d394). Orders randomized independently.

| Reviewer | Set | Tasks | Names | Focus | Sighted/cost | Separation | Motion | Colour | Mean | Ranking |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | M4 | 8 | 6 | 7 | 6 | 8 | 7 | 6 | 6.86 | S9 > M4 |
| 1 | S9 | 8 | 8 | 8 | 6 | 8 | 10 | 6 | 7.71 | S9 > M4 |
| 2 | M4 | 8 | 6 | 7 | 7 | 8 | 9 | 5 | 7.14 | S9 > M4 |
| 2 | S9 | 8 | 9 | 8 | 7 | 8 | 9 | 6 | 7.86 | S9 > M4 |
| 3 | M4 | 8 | 7 | 7 | 7 | 8 | 6 | 5 | 6.86 | S9 > M4 |
| 3 | S9 | 8 | 9 | 8 | 7 | 8 | 10 | 7 | 8.14 | S9 > M4 |

S9 mean **7.90**, M4 6.95. All three ranked S9 higher. Independent runs reproduced the keyboard Watch failure in M4 and confirmed the S9 correction, room context and occupancy-focus continuity. The regression reviewer found no demonstrated S9 regression. Orders: 1: set-M4, set-S9; 2: set-S9, set-M4; 3: set-M4, set-S9; 4: set-S9, set-M4.

Findings: semantic DOM focus lacked a visible canvas ring; both artifacts counted supplementary Unicode characters as UTF-16 units; place is still colour-only visually; zoom remains disabled. Response: use the existing canvas focus ring and preserve it through list rebuilds; follow the Unicode/composition fix now landed on dev; rebase on the current menu-target and whole-place changes. The integration artifact passes the keyboard task driver in Chromium and WebKit (Option-Tab for WebKit). Those engine checks are not VoiceOver tests. No viewport or room-rendering redesign was attempted because they overlap the touch/menu branches and need an explicit owner decision.

A reviewer rerun encountered the shared driver disappearing during rebase; supplied runtime evidence remained available. Later sets carry frozen self-contained drivers to avoid that race. Two other reviewers completed independent runs; supplementary-character assertions were bypassed in their scratch drivers for these historical artifacts and retained as real findings, not hidden.

### Round 3

Key: S9 = prior room-context artifact; T2 = integration/focus/Unicode artifact at 527f53e0, rebased on dev 2f1d4a09. The native camera source changes in the base are upstream; this feature still does not edit camera.ts. Each set now carries a frozen driver.

| Reviewer | Set | Tasks | Names | Focus | Sighted/cost | Separation | Motion | Colour | Mean | Ranking |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | S9 | 7 | 8 | 7 | 6 | 8 | 10 | 5 | 7.29 | T2 > S9 |
| 1 | T2 | 7 | 9 | 8 | 7 | 8 | 10 | 5 | 7.71 | T2 > S9 |
| 2 | S9 | 8 | 8 | 6 | 6 | 8 | 10 | 6 | 7.43 | T2 > S9 |
| 2 | T2 | 8 | 9 | 8 | 7 | 8 | 10 | 6 | 8.00 | T2 > S9 |
| 3 | S9 | 7 | 8 | 6 | 7 | 9 | 9 | 5 | 7.29 | T2 > S9 |
| 3 | T2 | 7 | 9 | 8 | 8 | 9 | 9 | 5 | 7.86 | T2 > S9 |

T2 mean **7.86**, S9 7.33 within this paired review. All three independently ran the frozen drivers in WebKit and preferred T2. Cross-round absolute means vary with reviewer calibration; paired controls show the improvement. Orders: 1: set-S9, set-T2; 2: set-T2, set-S9; 3: set-S9, set-T2; 4: set-S9, set-T2.

Findings are now concentrated on the shared colour-only place dot, disabled page zoom, absent actual VoiceOver/native acceptance, and unmeasured no-AT CPU overhead. The keyboard focus ring and 24 supplementary-character name limit were independently reproduced. No new UI redesign is justified inside this adapter-only branch. A small subsequent correction makes failed-brain status truthful and announces retry immediately; it has a focused regression test. Follow-up controls will check whether fresh blind assessments find further progress without changing the shared visual/host policies.




## Current scoped acceptance

The owner's updated process narrowed this PR to the browser mirror, with tvOS, Reduce Motion and visual colour work deferred. The branch contains merge commits from current dev, including #102, #100 and #119. No adapter is installed unless the URL explicitly contains `accessibility=1`.

Two fresh blind reviewers have independently completed all tasks in Chromium and WebKit on the narrowed built artifact, with no blockers; each reported 9/10 overall. Their per-area scores were task completion 10/10, names/values 10/10, focus/errors 9/10 and 10/10, isolation 10/10 and 9/10, separation 9/10. A third scoped review is running. These are browser-engine results; actual VoiceOver remains unverified.

Local checks after the merge: typecheck and lint passed; 52 focused tests passed; the full test command passed with 891 unit tests passed and four optional skips. Its budget stage passed one test and skipped three on the calibrated reference's contention guard (reference load exceeded 4.8 ms), with no failures. Earlier full runs passed all four budgets. The browser task suite passed in Chromium and WebKit; the standard play, pointer/touch, web lifecycle and online-table suites passed during the preceding integration. The known page-zoom axe violation remains recorded.

The prototype's camera/native/colour work is preserved for follow-up PRs based on latest origin/dev. This PR can land with its switch off while the owner decides on the DOM exception.
