// The Apple TV app's asset catalog, from the image files in assets/ (assets/README.md): the
// layered home-screen icon, the Top Shelf banners and the launch image, written into
// apps/tvos/src/generated/Assets.xcassets for scripts/tvos.ts.
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The brand assets project.yml names as the app icon, and the image set its UILaunchScreen names.
const ICON_SET = 'App Icon & Top Shelf Image';
const SPLASH_SET = 'Launch Image';
const ICON_STACKS = [
  { name: 'App Icon - App Store', size: '1280x768', scales: { '1x': '1280x768' } },
  { name: 'App Icon', size: '400x240', scales: { '1x': '400x240', '2x': '800x480' } },
];
const TOP_SHELF_SETS = [
  { name: 'Top Shelf Image', variant: 'standard', role: 'top-shelf-image', size: '1920x720' },
  { name: 'Top Shelf Image Wide', variant: 'wide', role: 'top-shelf-image-wide', size: '2320x720' },
];
const SPLASH = { '1x': 'splash-1920x1080.png', '2x': 'splash-3840x2160.png' };

function contents(dir: string, json: object = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify({ ...json, info: { author: 'xcode', version: 1 } }, null, 2));
}

/** An image set of tvOS images, copied from `files` (scale to source path). */
function imageSet(dir: string, files: Record<string, string>) {
  mkdirSync(dir, { recursive: true });
  const images = Object.entries(files).map(([scale, source]) => {
    const filename = `image@${scale}.png`;
    cpSync(source, path.join(dir, filename));
    return { idiom: 'tv', filename, scale };
  });
  contents(dir, { images });
}

export function writeAssetCatalog(assets: string, catalog: string) {
  rmSync(catalog, { recursive: true, force: true });
  contents(catalog);
  const brand = path.join(catalog, `${ICON_SET}.brandassets`);
  // assets/tv-icon numbers the layers back to front (1-sky.png, ...); a stack lists them front to back.
  const icon = path.join(assets, 'tv-icon');
  const layers = readdirSync(path.join(icon, ICON_STACKS[0].size)).filter((f) => f.endsWith('.png')).sort().reverse().map((f) => path.basename(f, '.png'));
  if (layers.length < 2) throw Error(`A tvOS icon needs two to five layers; ${path.join(icon, ICON_STACKS[0].size)} has ${layers.length}`);
  for (const stack of ICON_STACKS) {
    const dir = path.join(brand, `${stack.name}.imagestack`);
    contents(dir, { layers: layers.map((layer) => ({ filename: `${layer}.imagestacklayer` })) });
    for (const layer of layers) {
      contents(path.join(dir, `${layer}.imagestacklayer`));
      imageSet(path.join(dir, `${layer}.imagestacklayer/Content.imageset`),
        Object.fromEntries(Object.entries(stack.scales).map(([scale, size]) => [scale, path.join(icon, size, `${layer}.png`)])));
    }
  }
  for (const shelf of TOP_SHELF_SETS) {
    const dir = path.join(assets, 'top-shelf', shelf.variant);
    imageSet(path.join(brand, `${shelf.name}.imageset`), { '1x': path.join(dir, 'top-shelf.png'), '2x': path.join(dir, 'top-shelf@2x.png') });
  }
  contents(brand, { assets: [
    ...ICON_STACKS.map((stack) => ({ filename: `${stack.name}.imagestack`, idiom: 'tv', role: 'primary-app-icon', size: stack.size })),
    ...TOP_SHELF_SETS.map((shelf) => ({ filename: `${shelf.name}.imageset`, idiom: 'tv', role: shelf.role, size: shelf.size })),
  ] });
  imageSet(path.join(catalog, `${SPLASH_SET}.imageset`),
    Object.fromEntries(Object.entries(SPLASH).map(([scale, file]) => [scale, path.join(assets, 'splash', file)])));
}
