import { releasePaperwork, shippedDependencyGuard } from "./scripts/notices.ts";
import path from "node:path";
import { defineConfig } from "vite";
import { appSite, brain, webApp } from "./scripts/webBuild.ts";

// The web build: the same game that the Apple TV app runs, in a browser, as
// plain files that work from any static host and from any folder on it
// (docs/web.md). The packed connectome and the neurons' positions
// (packages/brain/data, not in git) go with it as data files in parts; the
// Apple TV app bundles its own copy of the connectome for the native brain.
export default defineConfig({
  root: path.join(import.meta.dirname, "apps/web"),
  publicDir: path.join(import.meta.dirname, "apps/web/public"),
  base: "./",
  build: {
    outDir: path.join(import.meta.dirname, "dist"),
    emptyOutDir: true,
    target: "es2022",
    // The game, and Drive (car.html): the car the fly can take the wheel of.
    rolldownOptions: { input: { index: path.join(import.meta.dirname, "apps/web/index.html"), car: path.join(import.meta.dirname, "apps/web/car.html") } },
  },
  worker: { format: "es", plugins: () => [shippedDependencyGuard()] },
  // The iPhone and iPad app's room server and invitations (apps/web/src/online/invite.ts): the site's unless set.
  define: appSite(),
  // Tables with others: the room server (npm run rooms) on the same origin, as the site's web server has it.
  server: { proxy: { "/rooms": { target: `ws://localhost:${process.env.ROOMS_PORT ?? 8787}`, ws: true } } },
  plugins: [brain(), releasePaperwork(), webApp()],
});
