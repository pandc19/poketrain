# Built by Coolify on the droplet (push to main -> build -> deploy).
# Stages: deps -> build (next build, standalone output) -> runner.

FROM node:24-slim AS base
# openssl: Prisma's engines; ca-certificates: outbound HTTPS (AI providers); curl: Coolify's
# own health check runs curl/wget inside the container and the slim image has neither.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, which needs the schema and the config.
COPY prisma ./prisma
COPY prisma.config.ts ./
# prisma.config.ts reads DATABASE_URL even for `generate`; the value is never used to connect.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ is empty and git does not track empty directories, so a clone lacks it.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
# Cap V8's heap so the build stays inside a small droplet's RAM + swap.
ENV NODE_OPTIONS=--max-old-space-size=1024
RUN npm run build

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

# The app itself: Next's traced standalone output.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Migration tooling, kept apart from the app: Prisma CLI + schema + migrations + config.
COPY --from=migrate-tools /opt/migrate /opt/migrate
COPY --from=build /app/prisma /opt/migrate/prisma
COPY --from=build /app/prisma.config.ts /opt/migrate/prisma.config.ts

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /app /opt/migrate

USER node
EXPOSE 3000
# Coolify keeps the old container serving until the new one is healthy (it runs its own curl
# check against /api/health, so curl must stay installed). The start period covers
# `prisma migrate deploy`.
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
