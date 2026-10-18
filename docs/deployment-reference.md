# Poké Train Deployment Reference

Last updated: 2026-10-18

Live on a DigitalOcean droplet managed by Coolify Cloud. The branching and release flow is in [deployment.md](deployment.md). The server itself is created by a separate Terraform repo (`shared-infra`) and is shared with other personal apps.

## Architecture

- **Coolify Cloud** is the control plane: dashboard, deployments, env vars, backups schedule. It runs on Coolify's servers and reaches the droplet over SSH (user `root`, key generated in Coolify, port 22). If Coolify Cloud is down, the app and database keep running; only deploys and changes wait.
- **DigitalOcean droplet `shared-apps-1`**: plain Ubuntu 24.04 with Docker, SSH hardened, 2 GB swap, a reserved IP, and a DO Cloud Firewall. Created by `shared-infra`. Everything below runs as Docker containers on it, on Coolify's `coolify` network.
- **Traefik** (Coolify's proxy) terminates TLS (Let's Encrypt) and routes by hostname to the containers.
- **Poketrain app**: one container built from this repo's [Dockerfile](../Dockerfile) (Next.js 16 standalone output, Node 24). Listens on port 3000.
- **`shared-postgres`**: one PostgreSQL 18 instance (a Coolify database resource) holding a separate database and role per app. Poketrain uses database `poketrain` and role `poketrain_app`. It is not exposed to the internet; the app reaches it by its internal Docker hostname.
- **DNS**: `*.apps.<domain>` points at the droplet's reserved IP (managed in `shared-infra`). The app is served at `https://poketrain.apps.<domain>`.
- **DigitalOcean Spaces**: bucket `shared-infra-storage`. `tfstate/` holds Terraform state for `shared-infra`; `pg-backups/` receives Coolify's scheduled Postgres backups.
- **AI providers** (optional): the app calls Anthropic (or OpenAI) from the server with keys from env vars. Without a key the app runs in no-AI mode.

## Components

| Component | Where | Managed by |
|---|---|---|
| Droplet, firewall, reserved IP, DNS, cloud-init | DigitalOcean + DNS provider | `shared-infra` (Terraform) |
| Coolify server, app, Postgres resource, backups | Coolify Cloud dashboard | by hand in the UI |
| App code, Dockerfile, migrations | this repo | PRs to `main` |
| Postgres roles and databases | inside `shared-postgres` | by hand with `psql` |

## The image ([Dockerfile](../Dockerfile))

Multi-stage, built by Coolify on the droplet:

1. `base`: `node:24-slim` plus `openssl` and CA certificates (Prisma and outbound HTTPS).
2. `deps`: `npm ci`. The `postinstall` script runs `prisma generate`, which needs `prisma/` and `prisma.config.ts`; `prisma.config.ts` requires `DATABASE_URL` to be set even to generate, so a dummy value is set in the build stages (never used to connect).
3. `build`: `next build` with `NODE_OPTIONS=--max-old-space-size=1024` to stay inside a small droplet's memory. `public/` is created here because it is empty and git does not track empty directories.
4. `migrate-tools`: the Prisma CLI and `dotenv` only, pinned to the versions in `package-lock.json`. They are devDependencies, so the standalone trace does not include them.
5. `runner`: the traced standalone server, static files, and `/opt/migrate` (CLI + `prisma/` + `prisma.config.ts`). Runs as the unprivileged `node` user. Image size is about 850 MB.

The image declares a `HEALTHCHECK` that calls `/api/health` with `node` (the slim image has no curl or wget): interval 15 s, timeout 5 s, 90 s start period (covers the migration), 4 retries. Coolify uses it for rolling updates.

[docker-entrypoint.sh](../docker-entrypoint.sh) runs `prisma migrate deploy` from `/opt/migrate`, then `exec`s the server. Set `SKIP_MIGRATIONS=1` to skip it (for example when debugging a container by hand).

## Coolify: application settings

| Setting | Value |
|---|---|
| Source | GitHub App, repository `pandc19/poketrain`, branch `main` |
| Build pack | Dockerfile (`/Dockerfile`) |
| Port | 3000 |
| Domain | `https://poketrain.apps.<domain>` |
| Auto deploy | on (push to `main`; gated by the GitHub ruleset, see [deployment.md](deployment.md)) |
| Health check | from the image (`HEALTHCHECK` in the Dockerfile); leave Coolify's own health check off unless it is changed to match |
| Server | `shared-apps-1` |

### Environment variables

All are **runtime** variables. Untick "Available at Buildtime" on the secrets: Coolify passes build-time variables to `docker build` as build args, and they can be read from the image layers. The build needs none of them (the Dockerfile sets its own dummy `DATABASE_URL`).

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://poketrain_app:<password>@<postgres-internal-host>:5432/poketrain`. No `sslmode` and no `schema` parameter. Percent-encode special characters in the password |
| `AI_PROVIDER` | `claude` or `openai` |
| `ANTHROPIC_API_KEY` | secret |
| `ANTHROPIC_WORKSPACE_ID` | |
| `CLAUDE_MODEL` | |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | only if `AI_PROVIDER=openai` |

`PORT=3000` and `HOSTNAME=0.0.0.0` are set in the image. The names mirror [.env.local.example](../.env.local.example); keep the two in sync when a variable is added.

## Postgres

- Resource `shared-postgres` (PostgreSQL 18, the same major version as local development and the dump). Not publicly exposed.
- One login role and one database per app. Each role is `NOSUPERUSER NOCREATEDB NOCREATEROLE`, owns only its database, and `CONNECT` on every database is revoked from `PUBLIC`, so an app role cannot connect to another app's database.
- `poketrain_app` owns every object in `poketrain` (it runs the migrations). `\dt` in `poketrain` should list only `poketrain_app`-owned tables.
- The data came from Neon with `pg_restore --no-owner --no-privileges --role=poketrain_app`. The Neon database is no longer used. To copy production to a local database (through an SSH tunnel), see [database-transfer.md](database-transfer.md).
- The app and Postgres must share a Docker network (Coolify's default destination). If the app cannot resolve the host, check both resources use the same destination.

### Backups and restore

- Coolify scheduled backup on `shared-postgres` to the Spaces bucket `shared-infra-storage`, prefix `pg-backups/` (S3 storage configured in Coolify with the bucket-scoped key).
- **Restore** into a fresh database: create the role and database as in the section above, copy the dump file into the container, then
  ```bash
  pg_restore -U postgres -d poketrain --no-owner --no-privileges --role=poketrain_app --exit-on-error /tmp/<file>.dump
  ```
  Then check `\dt`, the table owners, and `SELECT count(*) FROM _prisma_migrations;`. Delete the dump file from the droplet afterwards.
- A backup that has never been restored is not proven. Do a test restore into a scratch database after changing anything about the backups.
- Destroying the droplet (`terraform destroy` in `shared-infra`) destroys the database. Take and verify a backup first; the rebuild and restore steps are in that repo's `DESTROY_AND_REBUILD.md`.

## Deployment flow

1. PR merged into `main` (see [deployment.md](deployment.md)).
2. Coolify clones the commit, builds the image on the droplet (about 3-8 minutes), and tags it with the commit SHA.
3. The new container runs `prisma migrate deploy`, then starts the server.
4. When the new container reports healthy (`/api/health`), Traefik routes to it and the old one is stopped. If it exits or never becomes healthy, the deployment fails and the old container keeps serving.

## Operational notes

- **Build memory.** `next build` runs on the droplet. On a 1 GB droplet it relies on the 2 GB swap and is slow; if a build is OOM-killed, resize the droplet to 2 GB RAM (DigitalOcean allows growing and shrinking CPU/RAM; the disk can only grow) or move the build to CI and deploy an image.
- **Disk.** Every deploy leaves an image of about 850 MB. Keep Coolify's Docker cleanup schedule enabled (server settings) so old images and build cache do not fill the disk.
- **Secrets** live only in Coolify and in the local `.env.local`. Nothing secret is in the repo, the image, or the build log.
- **Database credentials** per app: rotate with `ALTER ROLE poketrain_app PASSWORD '…'`, then update `DATABASE_URL` in Coolify and redeploy.

## Post-deployment checks

```bash
curl -sI https://poketrain.apps.<domain>/ | head -3          # 307 to /violet/pokedex
curl -s -o /dev/null -w "%{http_code}\n" https://poketrain.apps.<domain>/violet/pokedex   # 200
curl -s https://poketrain.apps.<domain>/api/health            # {"status":"ok"}
```

In the Coolify deployment log, the container's first lines should be `[entrypoint] prisma migrate deploy` and `No pending migrations to apply` (or the migrations just applied), then `✓ Ready`.

## Checklist: what only exists in the dashboards

These are not in the repo, so re-verify them if the setup is ever rebuilt:

- [ ] Coolify: GitHub App connected, auto deploy on, secrets set as runtime-only
- [ ] Coolify: S3 storage for `shared-infra-storage` and a backup schedule on `shared-postgres`
- [ ] Coolify: Docker cleanup schedule enabled on `shared-apps-1`
- [ ] Coolify: the app shows **healthy** after a deploy (the image's health check is being read), and a deploy with a failing start leaves the previous version serving (tested once with a deliberately broken `DATABASE_URL`, then restored)
- [ ] GitHub: the `main` ruleset and merge settings from [deployment.md](deployment.md)
- [ ] Postgres: `REVOKE ALL ON DATABASE … FROM PUBLIC` applied to every app database
- [ ] A test restore of a backup has been done at least once
