# Optional menu semantics experiment

Status: exploration, draft; requires an explicit architecture decision and real VoiceOver acceptance testing.

Architecture rule 5 protects two things: the Apple TV's JavaScriptCore host has no DOM, and the canvas is the sole visible UI and test-state publisher. The proposal adds a host-only semantic projection. Menu state and actions remain in the canvas screens; adapters may expose that state to an operating system without drawing anything. No simulation state is controlled through the projection. Existing canvas data-* tests remain valid.

The native adapter uses the same serializable projection, behind optional `__native.accessibility`. UIKit supplies the VoiceOver and Reduce Motion preferences; native elements activate existing menu outcomes and use the existing tvOS keyboard for fields. Password text is masked before serialization to the host. UIKit callbacks are handed to the JavaScript thread; UIKit elements are changed on the main thread. This is a prototype, syntax-checked against the tvOS SDK, with no claim of successful VoiceOver device testing.

The browser adapter creates native buttons, inline single-selection lists, ranges and text fields in a clipped tree. It is always discoverable: browsers cannot reliably detect assistive technology. It synchronizes on menu events, not frames. To reject the exception, remove the browser adapter's bootstrap call and import; the game still works. The game/model do not import DOM adapter code.

Proposed rule-5 wording for the owner's decision: “Everything visible is drawn in engine. Hosts may optionally mirror the menu model into platform accessibility controls; the game must run without that adapter, native JavaScriptCore must not depend on DOM, and canvas data-* state remains the test interface.” This document proposes the exception; it does not amend the architecture rule.

Reduce Motion: System/On/Off setting, with the browser media query feeding the system value. The controller holds the director's current view instead of updating it, and place changes use an opaque cut while incremental construction finishes. Camera source is deliberately untouched; coordinate the controller policy with the camera branch before adoption. This policy also stops automatic following, including in play.

Colour audit: brain status is written in words already; a locked room has a padlock, not just a coloured mark. Occupancy pips convey number by count. The room-place dot has no visible alternative in the original canvas: the semantic name adds the place, occupancy and password requirement. The remaining visual colour-only place/player identifiers need a coordinated menu design change; a screen reader label does not fix colour blindness for sighted players.

## Rubric

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

Evidence and scores will be recorded here. Reviewers receive only the rubric, neutral evidence sets and the driver, without the author's rationale or earlier scores. Scores reflect tested behavior, not promised platform support.

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

