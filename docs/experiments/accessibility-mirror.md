# Optional menu semantics experiment

Status: exploration, draft; requires an explicit architecture decision and real VoiceOver acceptance testing.

Architecture rule 5 protects two things: the Apple TV's JavaScriptCore host has no DOM, and the canvas is the sole visible UI and test-state publisher. The proposal adds a host-only semantic projection. Menu state and actions remain in the canvas screens; adapters may expose that state to an operating system without drawing anything. No simulation state is controlled through the projection. Existing canvas data-* tests remain valid.

The browser adapter creates native buttons, selects, ranges and text fields in a clipped tree. It is always discoverable: browsers cannot reliably detect assistive technology. It synchronizes on menu events, not frames. To reject the exception, remove the browser adapter's bootstrap call and import; the game still works. The game/model do not import DOM adapter code.

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
