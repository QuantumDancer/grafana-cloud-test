# syntax=docker/dockerfile:1

# --- build ------------------------------------------------------------
# Compiles the app and produces both the servable bundle and its source
# maps. Kept as its own stage (rather than building straight into the nginx
# stage) purely so the maps can be pulled out of `dist/` before the runtime
# stage ever copies it — see the `sourcemaps` stage below.
FROM node:24-alpine AS build
WORKDIR /app

# Corepack ships with Node and pins pnpm to the version recorded in
# package.json's packageManager field once one is added; until then this
# grabs a modern pnpm explicitly rather than relying on whatever corepack's
# default happens to be.
RUN corepack enable && corepack prepare pnpm@11 --activate

# Installing from the lockfile before copying the rest of the source means
# `pnpm install` only re-runs on a real dependency change, not on every code
# edit — meaningfully faster iterative builds.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# vite.config.ts's build.sourcemap:true put a .map next to every emitted
# asset; move them out so the next stage's `COPY --from=build /app/dist`
# never sees them. CI's separate source-map upload step reads from the
# `sourcemaps` export stage below instead.
RUN mkdir /sourcemaps && find dist -name '*.map' -exec mv {} /sourcemaps \;

# --- sourcemaps ---------------------------------------------------------
# Not part of the runtime image at all — a buildkit export target so CI can
# pull just the maps out without shipping them in the served image, e.g.:
#   docker build --target sourcemaps --output type=local,dest=./sourcemaps .
FROM scratch AS sourcemaps
COPY --from=build /sourcemaps /

# --- runtime -------------------------------------------------------------
# nginx-unprivileged already runs as a non-root user on port 8080 with
# writable paths pre-arranged for that user, so no manual USER/chown
# juggling is needed here.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

COPY docker/docker-entrypoint.sh /docker-entrypoint.d/50-spyglass-config.sh
# The base image's own entrypoint already runs every executable script under
# /docker-entrypoint.d/ before starting nginx, in filename order — the `50-`
# prefix just gives config generation an explicit, obvious place in that
# sequence relative to any scripts the base image ships.
RUN chmod +x /docker-entrypoint.d/50-spyglass-config.sh

EXPOSE 8080
