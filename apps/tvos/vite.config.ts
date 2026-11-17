import { releasePaperwork, shippedDependencyGuard } from "../../scripts/notices.ts";
// The page the Apple TV app runs, as one classic script (game.js) for the JavaScriptCore host,
// which has no module loader: the game's own entry (apps/web/src/main.ts) with everything
// inlined, or another entry such as the test scene (TVOS_ENTRY). Built by `node scripts/tvos.ts
// build` into apps/tvos/dist/, with the web build's public files beside it.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { appSite } from '../../scripts/webBuild.ts';

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

export default defineConfig({
  plugins: [releasePaperwork()],
  root: root('apps/web'),
  publicDir: root('apps/web/public'),
  // Classic scripts have no import.meta; the host's page URL stands in for the script's.
  // The app's room server and the site its invitations open (apps/web/src/online/invite.ts).
  define: { 'import.meta.url': JSON.stringify('http://fly.local/game.js'), ...appSite() },
  worker: { format: 'iife', plugins: () => [shippedDependencyGuard()] },
  build: {
    outDir: root('apps/tvos/dist'),
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    // One script by design: the host has no module loader.
    chunkSizeWarningLimit: 8192,
    rolldownOptions: {
      input: process.env.TVOS_ENTRY ?? root('apps/web/src/main.ts'),
      output: { format: 'iife', entryFileNames: 'game.js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
});
