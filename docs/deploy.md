# Self-hosting Flies

The web image builds the web game and serves only `dist/` with Caddy. Node
runs during its build, never in the web container; the room server for
tables with others is a second, small Node service (below). Both `linux/amd64` and
`linux/arm64` are supported. Nothing is deployed by the repository itself.

## First start

Flies sits behind your own reverse proxy, which terminates HTTPS for
`flies.isaacthoman.com`. Use a Linux server with Docker Engine, the Compose
v2 plugin and Git installed. Caddy in the web container answers plain HTTP,
for any host name, on `HTTP_PORT` (8080 unless set, so it can share a host
with a proxy on 80 and 443).

```sh
git clone --branch main https://github.com/IsaacThoman/flies.git
cd flies
cp .env.example .env
# Edit .env: FLY_SITE_URL=https://flies.isaacthoman.com/, and HTTP_PORT if 8080 is taken
docker compose up -d --build --wait
```

Private repository access uses your own Git credentials. `.env` is ignored
by Git and excluded from the image. `FLY_SITE_URL` is optional and supplies
absolute social-preview URLs at build time. `HTTP_PORT` may name an address
too: `127.0.0.1:8080` keeps the port to a proxy on the same host.

### Your reverse proxy

Point it at `http://<server>:8080/` (or your `HTTP_PORT`). It must:

- forward every path to that port, with the original `Host`;
- pass WebSocket upgrades on `/rooms` and `/rooms/*`, without a short idle
  timeout (a table's connection stays open for as long as people play);
- set `X-Forwarded-For` and `X-Forwarded-Proto`.

The site must reach visitors over `https://`: the service worker and the
Cache API, which keep the game and its 14 MB brain for later visits, work
only in a secure context. Plain HTTP is enough on `localhost` alone.

The room server limits password guesses and new rooms by address, so it
must see each visitor's own. Caddy believes `X-Forwarded-For` only from
`TRUSTED_PROXIES` (Caddy's [`trusted_proxies`](https://caddyserver.com/docs/caddyfile/options#trusted-proxies)
ranges: `private_ranges` unless set, which covers a proxy on the same host,
reaching the container through Docker's bridge, or on the LAN). It reads the
header from the right, so a visitor cannot claim another address, and hands
the rooms service just the visitor's. If your proxy reaches the server from
a public address, set it, for example `TRUSTED_PROXIES=203.0.113.7/32`, with
spaces between several. Without that, every visitor counts as the
proxy, and one person's guesses lock everyone out.

Caddy as the proxy, which upgrades WebSockets and sets both headers itself:

```caddyfile
flies.isaacthoman.com {
	reverse_proxy 127.0.0.1:8080
}
```

nginx:

```nginx
# In the http block:
map $http_upgrade $connection_upgrade { default upgrade; "" close; }

server {
    listen 443 ssl;
    http2 on;
    server_name flies.isaacthoman.com;
    # ssl_certificate and ssl_certificate_key as for your other sites

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 1h;
    }
}
```

```sh
docker compose ps                 # web and rooms should be healthy
docker compose logs --tail=100 web
curl -I https://flies.isaacthoman.com/
```

The health check reads the built entry file over a container-only loopback
listener. Check the public URL too: container health does not prove DNS or
your proxy. Caddy logs requests, with each visitor's address, to the
container log, rotated at 3 × 10 MB. It keeps no certificates or state, so
the web container has no volumes. A server that ran an older stack, with
its own certificates, can remove them after the update:
`docker volume rm flies_caddy_data flies_caddy_config`.

Plan for 2 GiB RAM and 4 GiB free disk for Node, npm and Docker's build
cache, plus room for a rollback image. Serving needs far less: the site is
about 17 MB, and the fly's simulation runs in each visitor's browser. A
small server is sufficient; budget bandwidth for about 14.2 MB per first
brain download. No database is needed.

## Updates and rollback

Before an update, note `git rev-parse HEAD` and save the current image:

```sh
docker image tag flies-web:local flies-web:rollback
docker image tag flies-rooms:local flies-rooms:rollback
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
docker image tag flies-rooms:rollback flies-rooms:local
docker compose up -d --no-build --pull never --force-recreate --wait
```

Keep the same `.env` and volumes. Use `git switch main` before the next update.
Do not prune the rollback image until you no longer need it. Existing tabs
keep their service worker until closed; close all Flies tabs and reopen to
see a new or rolled-back version.

## Local check

With `FLY_SITE_URL=http://localhost:8080/` in `.env`, run
`docker compose up -d --build --wait` and open `http://localhost:8080/`.
Plain HTTP on localhost is a secure context for the browser cache and
service worker, so no proxy is needed to try it. Another `HTTP_PORT`, such as
18080, changes the address; set `FLY_SITE_URL` to match.

After `npm install` and installing Playwright Chromium
(`npx playwright install chromium`), copy the running image's files to a
scratch directory and check them. Use the image's files because different
Node/zlib versions can produce different compressed brain hashes:

```sh
deploy_dist=$(mktemp -d)
docker compose cp web:/srv/. "$deploy_dist"
node scripts/checkDeploy.ts --url http://localhost:8080/ --dir "$deploy_dist"
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

## The room server

Tables of people's flies (`docs/online.md`) are the `rooms` service: one Node
process, built from the same `Dockerfile` (its `rooms` stage), that the
first start and every update bring up with the site. It needs nothing beyond
`docker compose up -d --build --wait`, and no settings: Caddy proxies `/rooms`
and `/rooms/*` on the site's own origin, WebSocket upgrades included, to
`rooms:3000`, and browsers connect to `wss://flies.isaacthoman.com/rooms`
through your proxy. It counts visitors by the address Caddy passes on in
`X-Forwarded-For` (`TRUST_PROXY=1`; see [your reverse proxy](#your-reverse-proxy)). It
has no public port, and no `depends_on`: the site works while it is down
(only `/rooms` answers 502 then).

```sh
docker compose ps                    # rooms should be healthy too
docker compose logs --tail=100 rooms # one JSON line an event
docker compose exec rooms wget -qO- http://127.0.0.1:3000/health
```

It keeps its tables in the `rooms_data` volume (`/data/tables.json`), written
every 30 s and when it stops: each room with its name, whether it is listed,
and, for a locked one, a salted scrypt hash of its password (never the
password; nor does the log ever have one). Tables kept by an older server
are read as they are, unlisted and without a password. A new protocol (3,
for rooms) reaches open tabs as a refusal they answer by reloading into the
new site, once. Rolling the rooms back past it forgets nothing, but an older
server would let anyone with a locked room's link in. An update restarts it with SIGTERM: it writes
the tables, tells every connected device it is restarting, and the devices
reconnect to their tables within a couple of seconds. Keep `rooms_data`, and
do not run `docker compose down -v` on the server: deleting it forgets every table and every invitation. The
only optional setting is `ROOMS_PORT`, the internal port, which Caddy and the
service both read. Browsing the list of rooms uses the same `/rooms`
WebSocket, so nothing about the proxy changes for it. Memory and CPU are
small: it relays about 1 KB/s up and 7 KB/s down per player at a table of
eight. Rolling back works as for the site: tag `flies-rooms:local` as `flies-rooms:rollback` before an update.
