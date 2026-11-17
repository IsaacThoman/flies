# Self-hosting Flies

The web image builds the web game and serves only `dist/` with Caddy. Node
runs during its build, never in the running web container; the room server for
tables with others is a second, small Node service (below). Both `linux/amd64`
and `linux/arm64` are supported. The repository does not deploy this web stack
automatically.

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

1. **New resource**: your repository through Coolify's GitHub App
   (its webhooks are what start previews), branch `main`, build pack
   **Docker Compose**, Docker Compose location `/compose.yaml`. Leave **Raw
   Docker Compose Deployment** off: Coolify then names each preview's
   services, volumes and network apart from production's and writes the
   Traefik routes.
2. **Domains**: give `web` `https://flies.isaacthoman.com`. It answers on
   port 80, which `expose` tells Coolify, so the domain needs no `:80`. Give
   `rooms` no domain: `web` proxies `/rooms` to it.
3. **Advanced**: turn **Gzip compression** off. Caddy already compresses what is
   worth it. Keep Traefik from compressing the brain parts again: they are
   slices of gzip streams and need intact lengths and byte ranges. Leave **Connect to
   Predefined Network** off and container names Coolify's own: on the shared
   `coolify` network, `rooms` could name another application's container.
4. **Environment variables**: none are needed. Coolify supplies
   `SERVICE_URL_WEB`, the address each build bakes in for link previews
   (`FLY_SITE_URL` overrides it; don't set it, or every preview gets
   production's). Behind Cloudflare (proxied DNS or a tunnel) set
   `CLIENT_IP_HEADERS=CF-Connecting-IP X-Forwarded-For` (see
   [visitors' addresses](#visitors-addresses)). App links are on by default;
   `APPLE_TEAM_ID` overrides the team, or `0` disables them ([the iPhone and
   iPad app's links](#the-iphone-and-ipad-apps-links)). To publish `/privacy`,
   supply the four public [owner build variables](#privacy-publication).
5. **Deploy**, and check `https://flies.isaacthoman.com/`. Coolify shows a
   service healthy when its Docker health check passes: `web` serves its
   entry file to itself on `127.0.0.1:8080/healthz`, and `rooms` answers
   `/health` on its port.

Traefik normally passes WebSocket upgrades on `/rooms` without extra settings.
The room server pings every connection each 15 s; confirm your proxy's
timeouts allow long sessions. Its tables are in the volume mounted at
`/data` by `rooms`. Find its actual name in Coolify's Persistent Storage and
confirm it with `docker volume ls` on the server. Keep it across deploys,
and don't tick volume deletion if you delete the resource.

If Cloudflare reaches the server over plain HTTP (a tunnel to port 80, or
Flexible SSL), enter the domain as `http://…` so that Traefik doesn't
redirect it back to HTTPS in a loop; Cloudflare gives visitors HTTPS.

### Pull request previews

Turn on **Preview Deployments** in the resource's settings, with a URL
template under a wildcard DNS name, such as `{{pr_id}}.flies.example.com`.
Each pull request's preview gets its own build at its own address (baked in
as its `SERVICE_URL_WEB`), its own containers and network, and its own empty
rooms volume. In current Coolify, isolated previews keep their Compose service names and also expose
`<name>-pr-<n>` aliases; shared-network previews rename the services. This
repository's Caddyfile reads `COOLIFY_BRANCH` to reach `rooms-pr-<n>`.
See [Coolify's preview naming rules](https://coolify.io/docs/applications/deployments/preview-deployments#docker-compose-preview-names).
Check cleanup on your installed version after closing a pull request. If
its unused preview volume remains, remove it with
`docker volume rm <preview-volume-name>` after confirming its name with
`docker volume ls` and confirming that no preview needs it. Never remove production's volume.

## First start

Flies sits behind your own reverse proxy, which terminates HTTPS for
`flies.isaacthoman.com`. Use a Linux server with Docker Engine, the Compose v2
plugin and Git installed. Caddy in the web container answers plain HTTP for
any host name on port 80. `compose.override.yaml` publishes it at the host
binding `HTTP_PORT` (8080 unless set, so it can share a host with a proxy on
80 and 443).

```sh
git clone --branch main https://github.com/IsaacThoman/flies.git
cd flies
cp .env.example .env
# Edit .env: FLY_SITE_URL=https://flies.isaacthoman.com/, HTTP_PORT if 8080 is taken,
# app links need no setting (see The iPhone and iPad app's links)
docker compose up -d --build --wait
```

If repository access requires authentication, use your own Git credentials.
`.env` is ignored by Git and excluded from the image. `FLY_SITE_URL` is
optional and supplies absolute social-preview URLs at build time. `HTTP_PORT`
may name an address too: `127.0.0.1:8080` keeps the port to a proxy on the
same host.

### Your reverse proxy

Point it at `http://<server>:8080/` (or your `HTTP_PORT`). It must:

- forward every path to that port, with the original `Host`;
- pass WebSocket upgrades on `/rooms` and `/rooms/*`, without a short idle
  timeout (a table's connection stays open for as long as people play);
- set `X-Forwarded-For` and `X-Forwarded-Proto`.

The site must reach visitors over `https://`: the service worker and the
Cache API, which keep the game and brain for later visits, require
a secure context. Plain HTTP on `localhost` works for local checks.

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

The earlier planning allowance was 2 GiB RAM and 4 GiB free disk for Node, npm
and Docker's build cache, plus room for a rollback image. Earlier size
estimates were about 17 MB for the site and 14.2 MB per first brain download;
the capture date, machine and build revision are unknown. Check the current
build's sizes before budgeting storage or bandwidth. The fly's simulation runs
in each visitor's browser. No database is needed.

## Visitors' addresses

The room server limits password guesses and new rooms by address, so it must
see each visitor's own. Caddy believes `X-Forwarded-For` only from
`TRUSTED_PROXIES` (Caddy's
[`trusted_proxies`](https://caddyserver.com/docs/caddyfile/options#trusted-proxies)
ranges: `private_ranges` unless set). It reads the header from the right, so
with correctly configured trusted proxies it can identify the visitor and hand
the rooms service that address. Without the right setting, every visitor
counts as the proxy, and one person's guesses can exhaust their shared
password-guess budget. The rooms service in turn believes the header from
loopback, private, link-local or carrier-grade NAT peers, and takes its last
valid address. It does not authenticate that peer as Caddy. Keep `rooms`
reachable only by trusted services: a direct caller from those ranges can
supply its own forwarded address.

- **Coolify**: Traefik reaches `web` over a Docker network, normally inside
  `private_ranges`. Confirm that Traefik supplies the visitor's address
  and strips untrusted forwarded headers in your deployment.
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

With the broad `private_ranges` trust setting, a LAN visitor's private
address can be treated as another proxy hop. Use narrower trusted proxy
ranges if LAN visitors must have separate rate limits.

## Updates and rollback

Before an update, note `git rev-parse HEAD` and save the current image:

```sh
docker image tag flies-web:local flies-web:rollback
docker image tag flies-rooms:local flies-rooms:rollback
git pull --ff-only && docker compose up -d --build --wait
```

The third line is the update command. npm dependencies and the fetched brain
are separate cached layers, so ordinary game edits do not download them
again. The brain layer includes `packages/brain/data/anatomy.bin`: its packer uses only npm
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
(`/rooms` and `/rooms/*` fail while its upstream is unavailable).

```sh
docker compose ps                    # rooms should be healthy too
docker compose logs --tail=100 rooms # one JSON line an event
docker compose exec rooms sh -c 'wget -qO- "http://127.0.0.1:$PORT/health"'
```

It keeps its tables in the `rooms_data` volume (`/data/tables.json`), saved
when changed on a 30 s timer, and force-saved when it stops: each room with
its name, whether it is listed, and, for a locked one, a salted scrypt hash of
its password (never the password; nor does the log ever have one). Older
records without listing or password fields load as unlisted and without a
password. The current protocol is 5. Browser tabs can reload on a version
refusal when session storage is available. If the same protocol comes back,
reloads are retried with a delay starting at 30 s and doubling up to 30
minutes. Without session storage, reload manually; bundled native apps need an
app update. Rooms open to everyone were added within protocol 3, but later
protocol changes still require compatible clients.

Rolling the server back to before protocol 3 can discard names, listing flags
and password hashes on its next save, and compatible older clients can enter
by link without a password. Back up the volume before a downgrade. Older
servers may also reject current multi-fly seat records entirely and omit those
tables on their next save.

An update stops the server with SIGTERM: it attempts to save the tables, then
tells connected devices it is restarting. Active clients schedule their first
reconnect attempt after 0.3–1.5 seconds of client update time; recovery also
depends on server and network readiness.

Keep `rooms_data`, and do not run `docker compose down -v` on the server:
deleting it loses saved table state and player-created invitations. The
built-in rooms open to everyone are recreated. Set `ROOMS_PORT` to change the
internal port; Caddy and the service both read it. Other optional stack
settings are listed in `.env.example`. Browsing the list of rooms uses the
same `/rooms` WebSocket, so nothing about the proxy changes for it.

Earlier traffic estimates were about 1 KB/s up and 7 KB/s down per player at a
table of eight; the capture date, machine and workload are unknown. What comes
down grows with the table, about 1 KB/s for each other fly: a full table of 128
is about 127 KB/s down to each device, and about 16 MB/s out of the server. Actual
traffic depends on activity and protocol overhead. Rolling back works as for
the site: tag `flies-rooms:local` as `flies-rooms:rollback` before an update.
By default the iPhone and iPad app reaches the same
`wss://flies.isaacthoman.com/rooms` (docs/ios.md, "Tables with others").

## Privacy publication

The game and its offline acknowledgements work without owner details. By
default the build writes no privacy page: `/privacy`, `/privacy/` and
`/privacy/index.html` answer 404, including in Vite dev/preview. No privacy
link is added to the game. The source policy and store listing in `docs/`
are owner drafts, not public build files.

To publish the policy, set **all four** public build variables in Coolify
(available at build time), or your Compose `.env`, and rebuild/redeploy:

| Variable | Supply |
| --- | --- |
| `FLIES_OPERATOR_NAME` | The public person or organisation responsible for the app. |
| `FLIES_CONTACT_EMAIL` | A public mailbox for privacy questions and deletion requests. |
| `FLIES_SUPPORT_URL` | An HTTPS support page people can use. |
| `FLIES_MARKETING_URL` | An HTTPS page describing the app. |

Missing or blank values leave the policy unpublished. After trimming values,
the build rejects angle brackets and characters below U+0020, checks basic
email syntax, and requires HTTPS URLs without credentials. These checks
cannot recognise every placeholder; supply real owner details.
The name/contact replace the draft markers; support/marketing become links
on the policy. These values are public, not secrets. Runtime container
variables cannot change an already-built page. Docker and Compose pass these
arguments just as they pass `APPLE_TEAM_ID`; a direct `npm run build` reads
them from its environment. Native builds use the same variables if their
bundle should contain the policy.

Before publication, confirm access-log retention at the host and every proxy
or provider, and room-volume backup retention; update `docs/privacy.md` to
match. The supplied logs rotate at 10 MB × three files per service, with no
time-based limit. This does not establish the provider's retention policy.
After deployment, check `/privacy` for the completed public text, or a 404
when disabled. Preserve that 404 instead of rewriting it to the game.

`THIRD_PARTY_NOTICES` and the reader's `apps/web/src/ui/notices.json` are committed generated
files. `npm run notices` regenerates them. Tests and every build reject stale
contents through `checkGenerated()`; builds then emit the same notice text.

## The iPhone and iPad app's links

By default the build writes `/.well-known/apple-app-site-association`: the
site's side of the app's Associated Domains. Its app-link rule matches the
root path with a ten-character `table` query value. It does not validate the
invitation-code alphabet or exclude other query parameters. It also declares
the app for the site's password AutoFill. It names the app as
`PX72AL9366.com.isaacthoman.flies`, using the Apple apps' default team from
`scripts/appleConfig.ts`. No setting is needed for a normal Docker or Coolify
deploy. To use another team, set `APPLE_TEAM_ID` (a build variable in Coolify,
or in `.env`) and rebuild. The Team ID is on [the developer
account](https://developer.apple.com/account) under Membership details: ten
capital letters and digits. It is public, and appears in every signed app.

```sh
docker compose up -d --build --wait
curl -i https://flies.isaacthoman.com/.well-known/apple-app-site-association
```

That must answer 200 with `Content-Type: application/json` and no redirect,
as Apple requires; Caddy serves it so (the file has no extension), and never
answers that path with the game's page. To turn it off, set `APPLE_TEAM_ID=0`
and rebuild/redeploy: the build writes no file
and the path is a 404: phones then open table links in Safari, which plays
them as well. A value that isn't a Team ID stops the build rather than
publish an association that names nobody. Unset or blank uses the default team.
The fallback is inside the build script, so Coolify's build arguments cannot
bypass it. Apple's devices fetch the file
through Apple's CDN, which can take hours to see a change. The app's own side
is enabled by default in TestFlight releases; confirm Associated Domains is
enabled on the App ID (docs/ios.md, "On a device, and in TestFlight"). Set the
repository variable `IOS_LINKS=0` to omit the entitlement from releases.

`scripts/checkDeploy.ts` checks the file's type, contents and absence of redirects
when the build has one, and that the path is a 404 when it doesn't.

<!-- docs-check: generated packages/brain/data/anatomy.bin -->
