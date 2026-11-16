# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/body/package.json packages/body/package.json
COPY packages/brain/package.json packages/brain/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/fly/package.json packages/fly/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/world/package.json packages/world/package.json
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS brain
# Keep the public downloads and hash-checked anatomy pack across game edits.
COPY packages/brain/src/ packages/brain/src/
COPY packages/brain/scripts/fetch.ts packages/brain/scripts/fetch.ts
RUN npm run brain:fetch

FROM brain AS build
COPY . .
ARG FLY_SITE_URL
RUN --mount=type=cache,target=/app/node_modules/.cache npm run build

FROM caddy:2.11-alpine AS web
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/ /srv/
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]
