// The service worker: keeps the page and everything it loads (the build
// lists them, scripts/webBuild.ts) so the fly opens again without a network.
// The page is asked for from the network first, so a new version shows as
// soon as there is one; the files it loads have their contents in their
// names, so a kept copy is always right. The brain is not here: the page
// keeps it itself (brain/download.ts), with its own progress and checks.
//
// A new version waits until every tab of the old one has closed, so a page
// left open as a wallpaper keeps the files it was started with.

declare const __FLY_PRECACHE__: string[];
declare const __FLY_VERSION__: string;

const worker = self as unknown as ServiceWorkerGlobalScope;
const PAGE_CACHE = "fly-page-";
const CACHE = `${PAGE_CACHE}${__FLY_VERSION__}`;
/** Long enough for a slow connection to answer, short enough that a dead one doesn't hold the page up. */
const PAGE_TIMEOUT_MS = 4000;
/** The brain's parts, beside the page wherever it lives: the page fetches and keeps those itself. */
const BRAIN = new URL("brain/", worker.registration.scope).pathname;

worker.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(__FLY_PRECACHE__)));
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PAGE_CACHE) && key !== CACHE).map((key) => caches.delete(key)))));
});

worker.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== worker.location.origin || url.pathname.startsWith(BRAIN)) return;
  if (request.mode === "navigate") {
    event.respondWith(page(request));
    return;
  }
  event.respondWith(caches.match(request, { cacheName: CACHE }).then((kept) => kept ?? fetch(request)));
});

/** The page from the network, or the kept one if the network fails, is too slow, or answers with an error (a host that is up but failing). */
async function page(request: Request): Promise<Response> {
  const policy = /\/privacy(?:\/|\/index\.html)?$/.test(new URL(request.url).pathname);
  const kept = () => caches.match(policy ? "privacy/index.html" : "./", { cacheName: CACHE });
  const fresh = fetch(request);
  // Answered or not, it may still settle after the kept page is used.
  fresh.catch(() => {});
  const late = new Promise<undefined>((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS));
  try {
    const first = await Promise.race([fresh, late]);
    if (first?.ok) {
      if (policy) {
        try {
          const cache = await caches.open(CACHE);
          await cache.put("privacy/index.html", first.clone());
        } catch { /* A full cache must not hide the policy available from the network. */ }
      }
      return first;
    }
    return (await kept()) ?? first ?? (await fresh);
  } catch {
    return (await kept()) ?? Response.error();
  }
}
