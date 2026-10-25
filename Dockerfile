# Built by Coolify on the droplet (push to main -> build -> deploy).
# Stages: build (npm ci, next build, standalone output) -> runner.

FROM node:24-slim AS base
# openssl: Prisma's engines; ca-certificates: outbound HTTPS (AI providers).
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
# Dependencies first, from the manifests alone, so this layer is rebuilt only when they change
# (not on a schema or source edit). Scripts are skipped here; the only one the app needs is
# `prisma generate` (the package's postinstall), run below once the schema is copied.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
# prisma.config.ts reads DATABASE_URL even for `generate`; the value is never used to connect.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
COPY . .
# public/ is empty and git does not track empty directories, so a clone lacks it.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
# Cap V8's heap so the build stays inside a small droplet's RAM + swap. Raise it if the droplet
# gets more RAM.
ENV NODE_OPTIONS=--max-old-space-size=1024
# Turbopack's build cache lives in .next/cache; the mount keeps it between builds (and out of the
# image layers). .next/standalone and .next/static are outside it, so they stay in the layer.
RUN --mount=type=cache,target=/app/.next/cache npm run build

# Prisma CLI + config deps only (they are devDependencies, so not in the standalone trace),
# pinned to the versions in package-lock.json.
FROM base AS migrate-tools
COPY package-lock.json /tmp/package-lock.json
WORKDIR /opt/migrate
RUN PRISMA=$(node -p "require('/tmp/package-lock.json').packages['node_modules/prisma'].version") \
  && DOTENV=$(node -p "require('/tmp/package-lock.json').packages['node_modules/dotenv'].version") \
  && npm init -y >/dev/null \
  && npm install --omit=dev --no-audit --no-fund prisma@$PRISMA dotenv@$DOTENV

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The app and the migration tooling belong to `node`. Each COPY sets that itself (a recursive
# chown afterwards would duplicate every file into a new layer); the two roots are made here.
RUN mkdir -p /opt/migrate && chown node:node /app /opt/migrate

# The app itself: Next's traced standalone output.
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static
COPY --chown=node:node --from=build /app/public ./public

# Migration tooling, kept apart from the app: Prisma CLI + schema + migrations + config.
COPY --chown=node:node --from=migrate-tools /opt/migrate /opt/migrate
COPY --chown=node:node --from=build /app/prisma /opt/migrate/prisma
COPY --chown=node:node --from=build /app/prisma.config.ts /opt/migrate/prisma.config.ts

COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3000
# Coolify keeps the old container serving until the new one is healthy. The check runs with node,
# so the image needs no curl; Coolify's own health check is off (it would need curl or wget here).
# The start period covers `prisma migrate deploy`.
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
