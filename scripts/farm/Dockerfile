ARG PLAYWRIGHT_VERSION=1.58.2
FROM node:24-bookworm AS node
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
COPY --from=node /usr/local/ /usr/local/
RUN apt-get update && apt-get install -y --no-install-recommends clang libclang-rt-18-dev && rm -rf /var/lib/apt/lists/*
