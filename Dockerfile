# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/body/package.json packages/body/package.json
COPY packages/brain/package.json packages/brain/package.json
COPY packages/brain-native/package.json packages/brain-native/package.json
COPY packages/net/package.json packages/net/package.json
COPY apps/server/package.json apps/server/package.json
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
# Coolify's address for the web service, a preview's own in a preview.
ARG SERVICE_URL_WEB
# Optional team override (0 disables app links). The default lives in scripts/appleConfig.ts,
# not Compose: Coolify passes --build-arg KEY for variables it knows (see #52).
ARG APPLE_TEAM_ID
# Public owner details: missing values leave /privacy unpublished.
ARG FLIES_OPERATOR_NAME
ARG FLIES_CONTACT_EMAIL
ARG FLIES_SUPPORT_URL
ARG FLIES_MARKETING_URL
RUN --mount=type=cache,target=/app/node_modules/.cache \
  FLY_SITE_URL="${FLY_SITE_URL:-$SERVICE_URL_WEB}" npm run build

FROM caddy:2.11-alpine AS web
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/ /srv/
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]

# The room server: tables of people's flies over WebSockets at /rooms. Node
# runs its TypeScript as it is; only it, the protocol and the world's shapes
# go in, with their one dependency (ws).
FROM node:24-alpine AS rooms
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/body/package.json packages/body/package.json
COPY packages/brain/package.json packages/brain/package.json
COPY packages/brain-native/package.json packages/brain-native/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/fly/package.json packages/fly/package.json
COPY packages/net/package.json packages/net/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/world/package.json packages/world/package.json
COPY apps/server/package.json apps/server/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace @fly/server --include-workspace-root=false
COPY packages/world/src/ packages/world/src/
COPY packages/net/src/ packages/net/src/
COPY apps/server/src/ apps/server/src/
# A new volume takes this folder's owner, so the server can write its tables there.
RUN mkdir -p /data && chown node:node /data
USER node
ENV PORT=3000 DATA_DIR=/data TRUST_PROXY=1
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/health"]
CMD ["node", "apps/server/src/server.ts"]
