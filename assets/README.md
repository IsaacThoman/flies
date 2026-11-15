# Assets

Images the Apple TV app is built from. `npm run tvos -- build` turns them into the app's asset
catalog (`scripts/tvosAssets.ts`). They are rendered from the game itself by `npm run tvos:art`
(`scripts/art.ts`, which drives `apps/web/art.html` in a headless Chromium): the same table, light
and fly, at full size with 4× multisampling, so they change when the game's look does. Run it
again after changing the scene; `--out <dir>` writes them somewhere else to look at first, and
`--only <path>` renders just the files whose paths start with it.

- **Icon**: the fly close up on the napkin, the hills and trees beyond. Back to front: `1-sky`
  (the backdrop: sky, hills, lake; opaque), `2-table` (the table and the picnic, transparent
  where the sky was), `3-fly` (the fly alone, transparent).
- **Top Shelf**: a wide, low look across the napkin on a morning, the strawberry to one side
  and the cherries to the other.
- **Launch image**: what the loading screen shows behind its panel, with the wordmark where the
  loading screen draws it, so the one gives way to the other.

| Path | What | Sizes |
| --- | --- | --- |
| `tv-icon/<size>/` | The home-screen icon, in layers numbered back to front (`1-sky.png`, `2-table.png`, `3-fly.png`). tvOS moves them apart for the parallax effect. Two to five layers; the back one opaque, the others transparent. | `1280x768` (App Store), `400x240` and `800x480` (home screen, 1x and 2x) |
| `top-shelf/standard/` | The Top Shelf banner, shown above the top row when the app is in it: `top-shelf.png`, `top-shelf@2x.png`. tvOS may crop the edges. | 1920×720, 3840×1440 |
| `top-shelf/wide/` | The wide Top Shelf banner, the same way. | 2320×720, 4640×1440 |
| `splash/` | The launch image, which stays up until the game says it is ready. | `splash-1920x1080.png`, `splash-3840x2160.png` |
