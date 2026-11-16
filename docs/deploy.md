# Self-hosting Flies

The web image builds the web game and serves only `dist/` with Caddy. Node
runs during its build, never in the web container; the room server for
tables with others is a second, small Node service (below). Both `linux/amd64` and
`linux/arm64` are supported. Nothing is deployed by the repository itself.

There are two ways to run it. [Coolify](#coolify) builds and runs
`compose.yaml` behind its Traefik, for production and for each pull request.
On [your own host](#first-start), `docker compose` also merges
`compose.override.yaml`, which publishes the site on a host port for your own
reverse proxy and names the images for rollback. `compose.yaml` publishes no
port and fixes no image tag or container name, so that previews never
collide with production. `node scripts/checkCompose.ts`, run in CI, keeps it
that way.

## Coolify

Coolify v4 with its default Traefik proxy.

1. **New resource**: your private repository through Coolify's GitHub App
   (its webhooks are what start previews), branch `main`, build pack
   **Docker Compose**, Docker Compose location `/compose.yaml`. Leave **Raw
   Docker Compose Deployment** off: Coolify then names each preview's
   services, volumes and network apart from production's and writes the
   Traefik routes.
2. **Domains**: give `web` `https://flies.isaacthoman.com`. It answers on
   port 80, which `expose` tells Coolify, so the domain needs no `:80`. Give
   `rooms` no domain: `web` proxies `/rooms` to it.
3. **Advanced**: turn **Gzip compression** off. Caddy already compresses what is
   worth it, and Traefik would gzip the brain's parts again, which are gzip
   files already, without their lengths or byte ranges. Leave **Connect to
   Predefined Network** off and container names Coolify's own: on the shared
   `coolify` network, `rooms` could name another application's container.
4. **Environment variables**: none are needed. Coolify supplies
   `SERVICE_URL_WEB`, the address each build bakes in for link previews
   (`FLY_SITE_URL` overrides it; don't set it, or every preview gets
   production's). Behind Cloudflare (proxied DNS or a tunnel) set
   `CLIENT_IP_HEADERS=CF-Connecting-IP X-Forwarded-For` (see
   [visitors' addresses](#visitors-addresses)). Once the Team ID is known,
   set `APPLE_TEAM_ID` as a build variable ([the iPhone and iPad app's
   links](#the-iphone-and-ipad-apps-links)).
5. **Deploy**, and check `https://flies.isaacthoman.com/`. Coolify shows a
   service healthy when its Docker health check passes: `web` serves its
   entry file to itself on `127.0.0.1:8080/healthz`, and `rooms` answers
   `/health` on its port.

Traefik passes the WebSocket upgrades on `/rooms` without settings, and its
idle limits don't close a table: the room server pings every connection each
15 s. Its tables are in the volume Coolify names `<uuid>_rooms-data`
(Persistent Storage). Keep it across deploys, and don't tick volume deletion
if you delete the resource.

If Cloudflare reaches the server over plain HTTP (a tunnel to port 80, or
Flexible SSL), enter the domain as `http://…` so that Traefik doesn't
redirect it back to HTTPS in a loop; Cloudflare gives visitors HTTPS.

### Pull request previews

Turn on **Preview Deployments** in the resource's settings, with a URL
template under a wildcard DNS name, such as `{{pr_id}}.flies.example.com`.
Each pull request's preview gets its own build at its own address (baked in
as its `SERVICE_URL_WEB`), its own containers and network, and its own empty
rooms volume, `<uuid>_rooms-data-pr-<n>`. Coolify renames a preview's
services `<name>-pr-<n>`, and its `web` reaches `rooms-pr-<n>`, read from
`COOLIFY_BRANCH` (the Caddyfile), never production's rooms. Closing the pull
request removes the preview's containers but leaves that volume; remove it
with `docker volume rm <uuid>_rooms-data-pr-<n>`.

## First start

Flies sits behind your own reverse proxy, which terminates HTTPS for
`flies.isaacthoman.com`. Use a Linux server with Docker Engine, the Compose
v2 plugin and Git installed. Caddy in the web container answers plain HTTP,
for any host name, on `HTTP_PORT` (8080 unless set, so it can share a host
with a proxy on 80 and 443), which `compose.override.yaml` publishes.

```sh
git clone --branch main https://github.com/IsaacThoman/flies.git
cd flies
cp .env.example .env
# Edit .env: FLY_SITE_URL=https://flies.isaacthoman.com/, HTTP_PORT if 8080 is taken,
# and, once known, APPLE_TEAM_ID (see The iPhone and iPad app's links)
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

It must also pass on each visitor's address: see
[visitors' addresses](#visitors-addresses).

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

## Visitors' addresses

The room server limits password guesses and new rooms by address, so it
must see each visitor's own. Caddy believes `X-Forwarded-For` only from
`TRUSTED_PROXIES` (Caddy's [`trusted_proxies`](https://caddyserver.com/docs/caddyfile/options#trusted-proxies)
ranges: `private_ranges` unless set). It reads the header from the right, so
a visitor cannot claim another address, and hands the rooms service just the
visitor's. Without the right setting, every visitor counts as the proxy, and
one person's guesses lock everyone out.

- **Coolify**: Traefik reaches `web` over a Docker network, inside
  `private_ranges`, and replaces any `X-Forwarded-For` a visitor sends with
  the address it sees. Nothing to set.
- **Your own proxy** on the same host, through Docker's bridge, or on the LAN
  is inside `private_ranges` too. If it reaches the server from a public
  address, set it, for example `TRUSTED_PROXIES=203.0.113.7/32`, with spaces
  between several.
- **Behind Cloudflare**, the address the proxy sees is Cloudflare's or the
  tunnel's. Set `CLIENT_IP_HEADERS=CF-Connecting-IP X-Forwarded-For` (Caddy's
  [`client_ip_headers`](https://caddyserver.com/docs/caddyfile/options#client-ip-headers):
  the first one present names the visitor), and let the server be reached only
  through Cloudflare, since anyone who reaches it directly could send that
  header.

A visitor whose own address is private (on your LAN) is counted as the
proxy.

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
`X-Forwarded-For` (`TRUST_PROXY=1`; see [visitors' addresses](#visitors-addresses)). It
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
The iPhone and iPad app reaches the same `wss://flies.isaacthoman.com/rooms`
(docs/ios.md, "Tables with others").

## The iPhone and iPad app's links

With `APPLE_TEAM_ID` set (a build variable in Coolify, or in `.env`), the build writes
`/.well-known/apple-app-site-association`: the site's side of the app's
Associated Domains. It says that a table's link (`/?table=<code>`, and nothing
else on the site) opens the Flies app where it is installed, and that the
site's passwords are the app's too, for AutoFill. It names the app as
`<APPLE_TEAM_ID>.com.isaacthoman.flies`. The Team ID is on
[the developer account](https://developer.apple.com/account) under
Membership details: ten capital letters and digits. It is the owner's to give;
nothing here guesses it.

```sh
# Coolify: add APPLE_TEAM_ID=<the Team ID> to the environment variables, and redeploy.
# By hand: put it in .env, then
docker compose up -d --build --wait
curl -i https://flies.isaacthoman.com/.well-known/apple-app-site-association
```

That must answer 200 with `Content-Type: application/json` and no redirect,
as Apple requires; Caddy serves it so (the file has no extension), and never
answers that path with the game's page. Left blank, the build writes no file
and the path is a 404: phones then open table links in Safari, which plays
them as well. A value that isn't a Team ID stops the build rather than
publish an association that names nobody. Apple's devices fetch the file
through Apple's CDN, which can take hours to see a change. The app's own side
is a build flag and a capability in the developer account (docs/ios.md,
"On a device, and in TestFlight").

`scripts/checkDeploy.ts` checks the file's type when the build has one, and
that the path is a 404 when it doesn't.
