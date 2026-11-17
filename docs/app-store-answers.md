# App Store questionnaires — draft answers

Audit date: 16 November 2026. These are submission drafts, not an assurance of legal compliance. Have a lawyer review the texts, verify the final signed build and live hosting practices, and answer the current App Store Connect form. Apple computes regional age ratings; do not promise a particular age label.

## App Privacy

Answer **Yes, data is collected**. Online retains pseudonymous room records; no account does not mean no data collection. No tracking; no advertising, advertising measurement, data brokerage, analytics or product personalisation. Every affirmative data type below is for **App Functionality** (including security). Do not claim the optional-disclosure exception for Online: it is ongoing functionality and does not display an account name alongside each submission.

| Data type | Draft selection and reason | Linked to user? |
| --- | --- | --- |
| Identifiers → Device ID | Yes. Random persistent per-install/browser key sent to rejoin rooms, stored server-side as a hash. Hashing does not anonymise a persistent key. | Yes, linked to the device's room records, even with no real name. |
| User Content → Gameplay Content | Yes. Last fly pose/location, consumption and room/world choices are saved; transient movement and tool state are relayed. | Yes, connected to the room key/slot. |
| User Content → Other User Content | Yes. Free-form room names are saved and may be listed publicly. Passwords are supplied to join, but stored as salted verifiers. | Yes, associated with the creator/room. |
| Diagnostics → Other Diagnostic Data | Yes, conservatively, for IP-based abuse prevention and operational/access logs, request times and error information. No crash or performance telemetry upload SDK. | Yes, conservatively, since IP/room events can be correlated; verify actual hosting logs. |
| Location → Coarse Location | Yes for a shared listing that includes WeatherKit-enabled tvOS. Apple receives a rounded fix for weather. Time zone/offset and derived sunrise/sunset sent to room servers can suggest a broad region. | Yes, conservatively for the shared app disclosure: Online records include the zone and derived world settings against room/device records. WeatherKit coordinates themselves are never sent to our server or joined to our room keys. |
| Location → Precise Location | No. The native fix is rounded to two decimal places before it leaves the app; no precise coordinates are saved by the app. | Not applicable. |
| Contact info, contacts, sensitive info, health/fitness, payment info, purchases, browsing/search history, advertising data, photos/video, audio, emails/text messages, customer support content, environment scanning, body/head/hands data | No app collection in the audited build. Virtual fly/pointer/camera coordinates describe a simulated world, not scans of the person or their room. App Store purchases and user-enabled system diagnostics are handled by Apple. Contacting support is outside the app and needs a separate operator process. | Not applicable. |

Apple defines collection in terms of off-device access beyond serving a request in real time. Weather coordinates used solely for a real-time WeatherKit response may qualify for exclusion if Apple's actual handling satisfies that definition; **do not remove coarse location from this conservative draft without verifying the service and derived room data**. IPs are not used for geolocation by our code. Their disclosure category follows their actual abuse-prevention/logging use; confirm the form's available categories and hosting setup before submission.

Policy URL: <privacy policy URL>. Privacy choices/deletion contact: <contact email>. Replace <operator name>. Do not select “Data Not Collected”. Existing `PrivacyInfo.xcprivacy` files declare required-reason API uses, not the whole label; reconcile them against these answers before shipping. Hosting/backup retention remains a release blocker until verified and reflected in `docs/privacy.md`.

Sources: [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/) (collection, identifiers, free-form text, IP use and location precision); [Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/). Choices above are our conservative interpretation of the audited code, not Apple's certification.

## Age-rating questionnaire

| Question/group | Draft answer | Code/content reasoning |
| --- | --- | --- |
| Parental controls; age assurance | No; No | No in-app age gate, age-range API or parental control system. OS controls are separate. |
| Unrestricted web access | No | No general browser. Fixed policy/credit URLs and room invitations are not a freely browsable web feature. |
| User-generated content | Yes | User-authored names are distributed through the public Online room list, despite no chat/uploads. |
| Messaging and chat | Yes, conservatively for public posting of room names | No chat channel, but user-authored names appear publicly. Apple's definition includes public posting; do not hide the name field behind a “no chat” claim. Explain this limited functionality to App Review. |
| Social media | No | Room discovery has no feed, likes, comments, amplification or following. |
| Social media disabled for under 13 | No / not applicable | No social-media function or age-range gating; do not claim a control not implemented. |
| Advertising | No | No ads. |
| Profanity or crude humour | None in authored content | Room names are user input and not filtered; UGC is disclosed separately. No promise of moderated or child-safe names. |
| Horror or fear themes | None | Mild weather and a looming shadow startle a fly; no horror narrative or frightening authored imagery. |
| Alcohol, tobacco or drug use/references | **Frequent** | Bar is a selectable, persistent scene with beer, cocktails and bottle shelves; restaurant also has drinkware. Not merely a fleeting reference. No smoking/drug feature. |
| Medical or treatment information; health/wellness topics | None; No | The neuroscience model is entertainment/explanation, not medical advice or a health tool. |
| Mature or suggestive themes; sexual content/nudity; graphic sexual content/nudity | None for all | Biological command names in technical docs are not sexual imagery or an adult narrative. |
| Cartoon/fantasy violence | Infrequent | Ball impacts, startles, falls and a fly being knocked about; no combat, injury depiction, blood or death objective. Use this conservative answer rather than treating all impacts as absent. |
| Realistic violence; prolonged graphic/sadistic realistic violence; guns/other weapons | None for all | No such content or tools. |
| Contests | None | No scores against others, prizes or competitive ranking. |
| Simulated gambling; gambling | None; No | No bets, casino mechanics or prizes. |
| Loot boxes | No | No random paid rewards or in-app purchases. |
| Override, Kids Category, age suitability | Do not opt into Kids Category or lower a generated rating | Public unfiltered room names and persistent alcohol scenery require an honest generated rating. Review any remaining form-specific questions against the submitted build. |

Apple's current [age-rating definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions) are the source for interpreting the questions. **Frequent alcohol references may produce 18+ globally on OS 26+**, and regional/older OS labels differ. This is a consequence of the existing bar scene, not a recommendation to misclassify it. Changing that content or adding moderation is outside this paperwork change. Public room-name safety and App Review's UGC requirements need separate owner/legal review before submission.

## Audit map

Network: `apps/web/src/brain/{create,download}.ts`, `offline/sw.ts`, `online/{socket,connection,invite}.ts`, `game.ts` (`roomSocket`); native `apps/tvos/src/SocketBridge.mm`; `apps/tvos/weather/{WeatherKit/Service,Shared/OutsideWeather}.swift`. Native iOS `BundleSchemeHandler.swift` serves bundle resources, not an upload endpoint.

Payload/persistence: `packages/net/src/protocol.ts`; `apps/server/src/{server,tables,table,lock,log}.ts`; `compose.yaml`, `Caddyfile`, `Dockerfile`. `TABLE_IDLE` is 30 days, `LISTED_IDLE` one day, `ADDRESS_KEPT` one hour. Docker logs rotate by bytes, not days. Caddy access logging is enabled.

Local storage: `apps/web/src/settings.ts` (`flies.settings`, `.shelf`, `.learned`, `.table`, `.day`); `quality.ts` (`flies.quality`); `game.ts` (`flies.reloaded` in sessionStorage); `offline/sw.ts` page cache and `brain/download.ts` data/module caches; native `apps/tvos/src/Host.mm` and Swift weather `UserDefaults`. No cookie-based tracking, advertising identifier, analytics SDK, geolocation in web/iOS, camera or microphone access was found.
