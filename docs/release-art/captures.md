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
The production server `Table` and production `Online` clients exchange their actual wire messages
through queued in-process sockets, advanced on the same clock. This is a local deterministic
transport for an actual multiplayer simulation, not fake players or duplicated rendered flies.
It doesn't demonstrate Internet latency or real remote human players.

Each JSON record stores dimensions, simulation frames, neuron count, actual activity, consumption,
take-offs and peer count. Repeatability is within the same Chromium/GPU renderer; cross-GPU PNG
byte identity is not promised.

Landscape sizes are from [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/):
iPhone 6.9-inch 2868×1320, iPad 13-inch 2752×2064, TV 1920×1080 and 3840×2160.

Phone captures use a 956×440 CSS viewport at 3×, and iPad uses 1376×1032 at 2×, with
coarse touch input. TV captures use the actual 640×480 game buffer stretched to 16:9,
with the remote's interface. There are no promotional overlays or retouched game pixels.
`--verify` repeats each selected capture in a fresh page and fails if PNG bytes differ.
