# Reproducing the store images

`node scripts/storeShots.ts` writes eight PNGs and capture records per device into `assets/store/`.
`--out <dir>` keeps a trial outside the build inputs. `--only tv-1080/03` selects one device/story prefix.
Use an installed Chromium via `CHROMIUM_PATH`. Fetch the connectome first with `npm run brain:fetch`.

The capture-only page `apps/web/store.html` instantiates the production `Game`, its renderer, eyes,
body and WASM brain. It uses a fixed date, seeded randomness, a fixed 60 Hz simulation and a
synchronous adapter around the production brain. This removes worker scheduling differences. It
retains the game's normal pixel budget and nearest-neighbor presentation: these are screenshots,
not the multisampled, full-resolution renders used for the icons and banners.

Feeding is captured only when the actual brain commands feeding and food is consumed. That shot
starts the fly on the picnic's existing strawberry juice patch. Flight uses the real Swoop tool
and a bounded wait for the brain's take-off. No motor command or firing rate is supplied by the
capture code. A failure to choose the action aborts generation rather than substituting a pose.

The shared-table shot runs three separately seeded WASM brains in three production Game instances.
The production server `Table` runs in Node (`scripts/storeRoom.ts`). The production `Online`
clients exchange their actual wire messages through a queued local browser-to-Node bridge,
advanced on the same fixed clock between frames. This is a local deterministic
transport for an actual multiplayer simulation, not fake players or duplicated rendered flies.
It does not demonstrate Internet latency or real remote human players. Three initial room
positions are staged around the existing strawberry juice patch using the room's saved-position
mechanism. Every subsequent movement and feeding response comes from those brains. A capture-only
group camera frames their actual positions; that framing does not add a group-camera feature to play.

Each JSON record stores dimensions, simulation frames, neuron count, actual activity, consumption,
take-offs and peer count. Repeatability is within the same Chromium/GPU renderer; cross-GPU PNG
byte identity is not promised.

Landscape sizes are from [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/):
iPhone 6.9-inch 2868×1320, iPad 13-inch 2752×2064, TV 1920×1080 and 3840×2160.

Phone captures use a 956×440 CSS viewport at 3×, and iPad uses 1376×1032 at 2×, with
coarse touch input. TV captures use the actual 640×480 game buffer stretched to 16:9,
with the remote's interface. There are no promotional overlays or retouched game pixels.
`--verify` repeats each selected capture in a fresh page. Simulation records and a fingerprint
of body position/velocity, motor commands, neural region rates and eye input must match exactly.
PNGs are compared byte for byte first. Where GPU glass/nerve rasterization rounds differently,
the verifier permits at most three channel levels in no more than 0.01% of pixels; larger image
differences fail. Observed differences include one blue level in 12 of 3,785,760 pixels and two channel levels
in 84 pixels of a 4K TV image. The script preserves the first image unchanged.

The eyes read back the real rendered eye views synchronously for capture, then complete their
normal sampling promises before the next step. This prevents GPU fence timing from changing
which visual input reaches a given brain tick. Capture records include completed eye updates.

The eight-story sequence is portrait, feeding on strawberry juice, Swoop flight, dusk X-ray
with its normal nervous-system panel, fly's eyes, the rainy kitchen windowsill, the bar at night,
and three flies at a morning picnic table. The rainy scene starts on the existing window rail
at (66, -110), then runs the real brain for five simulated seconds in the normal Follow view.
Other initial placements are on existing fruit for feeding and sharing. The flight photograph
follows the director's real viewing direction with capture-only framing
within 10.5 mm of the actual fly. Selection requires actual flying activity, beating wings and
more than 4 mm of clearance above a real surface. The bar and sharing use the production
watch mode and wait for its UI fade. Other stories retain the normal play interface.
The game's camera implementation is unchanged; the flight and group photographs use capture-only framing.

The capture URL includes `?alone` so the game's automatic room joining stays off during
recording. The shared-table story explicitly connects its three production clients to the
fixed-clock local room.
