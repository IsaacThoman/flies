# Assets

Images the Apple TV app is built from. `npm run tvos -- build` turns them into the app's asset
catalog (`scripts/tvosAssets.ts`). The ones here now are placeholders drawn by
`npm run tvos:art` (`scripts/placeholder-art.ts`); replace the files, keeping their names and
sizes, and the next build picks them up.

| Path | What | Sizes |
| --- | --- | --- |
| `tv-icon/<size>/` | The home-screen icon, in layers numbered back to front (`1-sky.png`, `2-berry.png`, `3-fly.png`). tvOS moves them apart for the parallax effect. Two to five layers; the back one opaque, the others transparent. | `1280x768` (App Store), `400x240` and `800x480` (home screen, 1x and 2x) |
| `top-shelf/standard/` | The Top Shelf banner, shown above the top row when the app is in it: `top-shelf.png`, `top-shelf@2x.png`. tvOS may crop the edges. | 1920×720, 3840×1440 |
| `top-shelf/wide/` | The wide Top Shelf banner, the same way. | 2320×720, 4640×1440 |
| `splash/` | The launch image, which stays up until the game says it is ready. | `splash-1920x1080.png`, `splash-3840x2160.png` |
