# Self-hosting Flies

The image builds the web game and serves only `dist/` with Caddy. Node runs
during the build, never in the web container. Both `linux/amd64` and
`linux/arm64` are supported. Nothing is deployed by the repository itself.

## First start

Use a Linux server with Docker Engine, the Compose v2 plugin and Git installed.
Allow inbound TCP 80 and 443, and UDP 443 for HTTP/3. Point the DNS A record
for `flies.isaacthoman.com` at the server; add an AAAA record only if its IPv6
address is reachable too. These ports must be free on the server.

```sh
git clone --branch dev https://github.com/IsaacThoman/flies.git
cd flies
cp .env.example .env
# Edit .env: FLIES_DOMAIN=flies.isaacthoman.com, ACME_EMAIL=your email,
# FLY_SITE_URL=https://flies.isaacthoman.com/
docker compose up -d --build --wait
```

Private repository access uses your own Git credentials. `.env` is ignored
by Git and excluded from the image. `FLIES_DOMAIN` is the site address, with
no path; `FLY_SITE_URL` is optional and supplies absolute social-preview URLs
at build time. Caddy obtains and renews a Let's Encrypt certificate, redirects
HTTP to HTTPS, and offers HTTP/2 and HTTP/3. Keep `caddy_data` and
`caddy_config`: they hold certificates, keys and Caddy state. Do not run
`docker compose down -v` on the server unless you intend to erase them.

```sh
docker compose ps                 # web should be healthy
docker compose logs --tail=100 web
curl -I https://flies.isaacthoman.com/
```

The health check reads the built entry file over a container-only loopback
listener. Check the public URL too: container health does not prove DNS,
firewall rules or certificate issuance. Caddy logs requests and TLS errors
to the container log, rotated at 3 × 10 MB.

Plan for 2 GiB RAM and 4 GiB free disk for Node, npm and Docker's build
cache, plus room for a rollback image. Serving needs far less: the site is
about 17 MB, and the fly's simulation runs in each visitor's browser. A
small server is sufficient; budget bandwidth for about 14.2 MB per first
brain download. No database is needed.

## Updates and rollback

Before an update, note `git rev-parse HEAD` and save the current image:

```sh
docker image tag flies-web:local flies-web:rollback
git pull --ff-only && docker compose up -d --build --wait
```

The second line is the update command. npm dependencies and the fetched brain
are separate cached layers, so ordinary game edits do not download them
again. The brain layer includes `anatomy.bin`: its packer uses only npm
dependencies, and both public downloads are hash checked. A failed download
or annotation pack fails the build rather than publishing a partial image;
retry the build. No host Node installation or local brain data is needed.

To roll back, restore the saved revision's Compose settings and image:

```sh
git switch --detach <previous-sha>
docker image tag flies-web:rollback flies-web:local
docker compose up -d --no-build --pull never --force-recreate --wait
```

Keep the same `.env` and volumes. Use `git switch dev` before the next update.
Do not prune the rollback image until you no longer need it. Existing tabs
keep their service worker until closed; close all Flies tabs and reopen to
see a new or rolled-back version.

## Local check

In `.env`, set `FLIES_DOMAIN=http://localhost`, `FLY_SITE_URL=http://localhost/`
and leave `ACME_EMAIL` empty. Then run `docker compose up -d --build --wait`
and open `http://localhost/`. Plain HTTP on localhost is a secure context
for the browser cache and service worker. Alternatively, `FLIES_DOMAIN=localhost`
uses Caddy's internal HTTPS certificate; the browser needs to trust its local
CA. No public certificate is requested for either local address.

`HTTP_PORT` and `HTTPS_PORT` can change the published ports for local tests.
For example, with `HTTP_PORT=18080`, use `http://localhost:18080/` and set
`FLY_SITE_URL` accordingly. Use the default 80/443 in production.

After `npm install` and installing Playwright Chromium
(`npx playwright install chromium`), copy the running image's files to a
scratch directory and check them. Use the image's files because different
Node/zlib versions can produce different compressed brain hashes:

```sh
deploy_dist=$(mktemp -d)
docker compose cp web:/srv/. "$deploy_dist"
node scripts/checkDeploy.ts --url http://localhost/ --dir "$deploy_dist"
```

This checks every built file's cache and MIME headers, uncompressed brain
and PNG responses, gzip JavaScript, byte-range contents, SPA fallback and
missing assets, then loads the real brain with progress and reloads fully
offline from the service worker and brain cache. To inspect headers by hand,
use `curl -I` on `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` and the
actual hashed paths under `dist/assets/` and `dist/brain/` (see
[the web build](web.md#what-to-upload)). The brain's WebAssembly module
(`brain/fly-brain.0.<hash>.wasm`, committed, so the image needs no toolchain
for it) is served as `application/wasm` and may be compressed; the
connectome's parts never get a `Content-Encoding` header.

## The room server slot

Caddy already proxies `/rooms` and `/rooms/*`, preserving the path and
query, including WebSocket upgrades. Add a Compose service named `rooms`
that listens on `0.0.0.0:3000`; it needs no public port. The browser connects
to `wss://flies.isaacthoman.com/rooms` on the site's origin. Set `ROOMS_HOST`
and `ROOMS_PORT` in `.env` to use a different service name or internal port.
No Caddy edit or web rebuild is needed for the default slot.

There is deliberately no `depends_on`: Caddy starts and the game works
without the service. Until it exists, only `/rooms` returns 502. There is
no room server in this change.
