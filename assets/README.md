# Assets

Images the Apple TV app, the web build and the iPhone and iPad app are made with. `npm run tvos
-- build` turns the TV's into the app's asset catalog (`scripts/tvosAssets.ts`); `npm run build`
gives the web's (`web/`) hashed names and lists them in the web app manifest
(`scripts/webBuild.ts`); `npm run ios -- build` turns the iPhone and iPad's (`ios/`) into that
app's asset catalog (`scripts/iosAssets.ts`). They are rendered from the game itself by `npm run
tvos:art` (`scripts/art.ts`, which drives `apps/web/art.html` in a headless Chromium): the same
table, light and fly, at full size with 4× multisampling, so they change when the game's look
does. Run it again after changing the scene; `--out <dir>` writes them somewhere else to look at
first, and `--only <path>` renders just the files whose paths start with it (`--only web/` for
the web's, `--only ios/` for the iPhone and iPad's).

- **Icon**: the fly close up on the napkin, the hills and trees beyond. Back to front: `1-sky`
  (the backdrop: sky, hills, lake; opaque), `2-table` (the table and the picnic, transparent
  where the sky was), `3-fly` (the fly alone, transparent).
- **Top Shelf**: a wide, low look across the napkin on a morning, the strawberry to one side
  and the cherries to the other.
- **Launch image**: what the loading screen shows behind its panel, with the wordmark where the
  loading screen draws it, so the one gives way to the other.
- **iPhone and iPad icon**: the fly close up on the napkin, square and opaque, and the same at
  night for the dark appearance.
- **iPhone and iPad launch image**: the picnic with the fly in the middle of a square, which the
  launch screen crops to the screen's shape; no wordmark, since where the loading screen draws it
  depends on the screen.

| Path | What | Sizes |
| --- | --- | --- |
| `tv-icon/<size>/` | The home-screen icon, in layers numbered back to front (`1-sky.png`, `2-table.png`, `3-fly.png`). tvOS moves them apart for the parallax effect. Two to five layers; the back one opaque, the others transparent. | `1280x768` (App Store), `400x240` and `800x480` (home screen, 1x and 2x) |
| `top-shelf/standard/` | The Top Shelf banner, shown above the top row when the app is in it: `top-shelf.png`, `top-shelf@2x.png`. tvOS may crop the edges. | 1920×720, 3840×1440 |
| `top-shelf/wide/` | The wide Top Shelf banner, the same way. | 2320×720, 4640×1440 |
| `splash/` | The launch image, which stays up until the game says it is ready. | `splash-1920x1080.png`, `splash-3840x2160.png` |
| `web/icon-192.png`, `web/icon-512.png` | The web app's icon: the fly close up on the napkin, square, full bleed. | 192×192, 512×512 |
| `web/icon-maskable-512.png` | The same framed looser, for launchers that cut icons to a circle or a squircle (the fly inside the middle 80%). | 512×512 |
| `web/apple-touch-icon.png` | The icon an iPhone or iPad puts on its home screen. | 180×180 |
| `web/favicon.png` | The browser tab's icon: the fly alone, from nearly above, transparent. | 64×64 |
| `web/preview.png` | The picture a link to the site shows in chats and feeds: the launch image's shot, with the wordmark. | 1200×630 |
| `ios/` | The iPhone and iPad app's icon, the web app's at full size (`icon.png`) and at night for the dark appearance (`icon-dark.png`), and its launch image (`launch.png`). | 1024×1024; 2048×2048 |
