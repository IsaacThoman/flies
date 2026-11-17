# Privacy policy — flies

<!-- Owner draft: complete the publication build variables and confirm hosting retention before release. This note is not shipped. -->

16 November 2026. Operator: <operator name>. Privacy contact: <contact email>.

flies simulates a fruit fly on your device. It has no accounts, advertising, analytics, tracking SDKs, or app telemetry uploads. It does not ask for your name, email, contacts, photos, microphone or camera. The fly's eyes see the simulated world, not your camera. The app does not sell personal data or use it for advertising.

## Playing alone and the website

The simulation runs locally. The website downloads the game, connectome and simulation module from its host. Like any web request, this reveals your IP address, requested URL, browser/device information in request headers and request time to the host and its network providers. A room invitation in a URL can also reach access logs. The supplied web-server configuration enables access logs; container logs rotate at 10 MB per file, up to three files per service, rather than on a time schedule. Upstream hosting providers may keep separate logs. Their retention and any backups must be confirmed before release; this draft cannot promise an unverified deletion period.

The iPhone, iPad and Apple TV apps bundle the game and its brain data. Playing alone in those apps needs no room server. Apple TV weather is a separate optional network feature described below. Platform services, including app downloads, purchases and system diagnostics that you choose to share with Apple, follow Apple's own policies; flies has no purchase account or payment form of its own.

## Online rooms

Opening Online connects to the room server to browse listed rooms. Joining a room, creating one or resuming a saved room sends a randomly generated device key and room code. Creating a room also sends its name, whether to list it publicly, its place, lighting and weather choices, local time zone and clock offset. A password is sent when creating or unlocking a locked room. Use the supplied secure service; a developer-configured unencrypted server would expose these messages on the network.

While connected, your device sends your simulated fly's position, orientation, velocity, pose and activity flags, timing and sequence information, food eaten, and your tools' actions. When your hand is visible, it also sends your pointer, virtual camera position, tool and variant. These are positions in the game, not your real location. Shared events include food, balls, bubbles, visitors, place, light and weather changes, leaving and removing a player. Your brain's neuron activity is not uploaded.

The server relays game state to the other players in that room. Listed rooms expose their name, code, place, player count and locked status to anyone browsing Online. Other players see your fly and tools, not your device key, IP address or password. A room link or code is an invitation; anyone with it may try to join. Locked rooms also require a password for an unfamiliar device. Do not put personal information in a room name. There is no text, voice or video chat.

The room server sees your IP address. It keeps address-based connection and password-attempt/new-room rate limits in memory while connected and for about one hour after your last connection closes; cleanup runs about every two seconds. Those rate-limit addresses are not written to its table file. The web proxy's access logs are separate and can contain IP addresses.

## What the server keeps

With persistence enabled (as in the supplied deployment), the room server writes a current snapshot every 30 seconds and at shutdown. It contains room codes and names, listed status, creation time, world seed and place, shared food and consumption totals, world settings, time zone and offset, hashed device keys (including the starter and removed players), player slots, last-seen times, and each fly's last position, heading and airborne state. Passwords are stored as salted scrypt verifiers, not plaintext. The raw device key and password are received to join; they are not stored in the snapshot. The server does not save a full motion history, neuron activity or the transient pointer/camera stream.

An unlisted room expires after 30 days without a connected player or a recent visit; a listed room expires after one day. Expiry is checked by the running server and removed snapshots are saved on its next write. While the server is stopped, its file remains until it runs and expires the room. Leaving a room does not immediately erase its saved record. Without a data directory, room records last only in process memory. Rate-limit records disappear when the server restarts.

Operational logs include timestamps, room names when created, short hashes of room codes, player slot numbers, joins, departures, removals and errors. They do not intentionally log passwords or raw device keys. The supplied container logging uses the size-based rotation described above, with no fixed time limit. There is no automatic backup-retention policy in this repository. Before release the operator must confirm hosting logs and backup retention and update this policy accordingly.

## Storage on your device

Local storage keeps settings, recent tool choices and their times, learned button hints, today's fly activity totals, a graphics-quality level, and the random device key and last room code used to reconnect. The app does not store room passwords itself; your system's password manager may offer to save or fill them. A session-storage flag prevents repeated automatic reloads after an error and lasts for the browser session.

The web version uses a service worker and browser caches to keep the page, scripts, images, connectome and WebAssembly simulation available offline. Old page versions and superseded brain parts are removed on update. Cached files and preferences otherwise stay until replaced, evicted by your browser/device, or cleared by you. The native apps keep equivalent preferences in app storage; Apple TV uses UserDefaults for its saved game settings. The iOS shell also keeps its haptics preference locally. Developer test launches can write diagnostic state to a local report log, replaced at each such launch; the app does not upload that log. These local records are not uploaded as analytics. The room key and code are used when reconnecting Online.

## Apple TV weather

Only Apple TV builds with WeatherKit enabled request location permission. With your permission and real weather enabled in Settings, Core Location obtains a fix at roughly kilometre accuracy; coordinates are rounded to two decimal places before being sent to Apple's WeatherKit for conditions, sunrise and sunset. Coordinates stay in native memory, are reused for up to six hours, are not saved by flies, and are not passed to the game JavaScript or the room server. Weather requests normally occur about every 20 minutes while active, respecting expiry, with retries after errors. The app also requests Apple's weather attribution.

The latest weather conditions and fetch time are saved locally for the next launch, without coordinates and without an app-set expiry. Online rooms use a shared simulated forecast, not WeatherKit conditions or local sunrise/sunset. Creating a room sends the chosen weather/light settings and your device’s configured time zone and UTC offset so everyone shares its clock. The time zone may suggest a broad region, but no location fix or WeatherKit result is sent to the room server. WeatherKit's handling of requests is governed by [Apple's privacy policy](https://www.apple.com/legal/privacy/). Deny location in tvOS Settings or turn real weather off in the game's Settings to use its made-up forecast. iPhone, iPad and web builds do not request your real location.

## Your choices and questions

You can leave a room from Online, and play alone. A saved room may reconnect at launch until you leave it. Clear the website's site data to remove its preferences, room key and offline caches; removing the installed app clears its local app data subject to your system's backup and restore settings. Revoking location permission stops future location requests. Contact <contact email> about privacy, access or deletion of server records, providing the room code privately if relevant. No account deletion is needed because there are no accounts. Do not send a room password or your device key.

Changes to network features, hosting retention or this policy will be reflected here with an updated date.
