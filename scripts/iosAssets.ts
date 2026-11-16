// The iPhone and iPad app's asset catalog, from the images in assets/ios (assets/README.md): the
// icon, with its dark-appearance variant, and the launch image, written into
// apps/ios/src/generated/Assets.xcassets for scripts/ios.ts.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The icon set project.yml names, and the image set src/Launch.storyboard shows.
const ICON_SET = 'AppIcon';
const LAUNCH_SET = 'Launch Image';

function contents(dir: string, json: object = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify({ ...json, info: { author: 'xcode', version: 1 } }, null, 2));
}

export function writeIosAssetCatalog(assets: string, catalog: string) {
  rmSync(catalog, { recursive: true, force: true });
  contents(catalog);
  const icon = path.join(catalog, `${ICON_SET}.appiconset`);
  contents(icon, { images: [
    { idiom: 'universal', platform: 'ios', size: '1024x1024', filename: 'icon.png' },
    { idiom: 'universal', platform: 'ios', size: '1024x1024', filename: 'icon-dark.png', appearances: [{ appearance: 'luminosity', value: 'dark' }] },
  ] });
  for (const file of ['icon.png', 'icon-dark.png']) cpSync(path.join(assets, file), path.join(icon, file));
  // One picture for every screen: the launch screen crops it to the screen's shape.
  const launch = path.join(catalog, `${LAUNCH_SET}.imageset`);
  contents(launch, { images: [{ idiom: 'universal', filename: 'launch.png', scale: '2x' }] });
  cpSync(path.join(assets, 'launch.png'), path.join(launch, 'launch.png'));
}
