# Touch feel experiment

Scope: browser touch and the iPhone/iPad shell; no sound, changes to the
brain, camera implementation, signing, or menu artwork.

## Rubric

Independent reviewers score each criterion from 0 to 10. A 10 means:

| Criterion | A 10 |
| --- | --- |
| Intent recognition | Deliberate taps act once at the intended point; drags, cancelled touches and multi-touch never trigger stray tools or HUD actions. |
| Comfort and reach | Frequently used controls fit a portrait thumb's lower reach, with distinct targets at least 44 CSS pixels across; tablet layouts remain comfortable. |
| Visibility and safety | Feedback remains visible around a fingertip; controls avoid safe areas, the home indicator, keyboard, and system edges. |
| Platform conventions | Taps commit on release, moving away cancels a button, pinch and two-finger translation compose predictably, and interruptions release tools. |
| Responsiveness | Visible tool/camera response within one rendered frame of the relevant input, without extra waits. |
| Orientation and resize | Turning or resizing, including Split View and keyboards, keeps controls usable and cannot commit an obsolete gesture. |
| Other inputs | Mouse, trackpad, remote, keyboard and gamepad retain their behavior and their checks pass. |

## Evidence and limits

Use `scripts/play.ts`'s real CDP touch driver and the real brain. Test 390×844
and 430×932 phones in both orientations, 820×1180 and 1180×820 tablets,
and 507×820 and 375×820 Split View windows. Supply safe-area insets explicitly
in browser emulation. Annotated strips mark input locations and timing;
geometry and event measurements accompany them. Browser emulation cannot
verify OS edge gestures or actual haptic feel; the simulator cannot play
haptics either. Those require a physical device.

## Rounds

Pending baseline evidence and three blind independent reviews.
