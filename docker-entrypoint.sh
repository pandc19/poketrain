#!/bin/sh
# Applies pending Prisma migrations, then starts the app. A failed migration stops the
# container, so Coolify keeps the previous version running instead of switching over.
set -e
if [ "${SKIP_MIGRATIONS:-}" != "1" ]; then
  echo "[entrypoint] prisma migrate deploy"
  (cd /opt/migrate && node node_modules/prisma/build/index.js migrate deploy)
fi
exec "$@"
