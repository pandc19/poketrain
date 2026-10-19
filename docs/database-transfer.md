# Moving the database between production and local

Production is the `poketrain` database in the shared Postgres on the Coolify droplet (see [deployment-reference.md](deployment-reference.md)). It is not exposed to the internet, so a laptop reaches it through an **SSH tunnel**, the same one DBeaver uses. `pg_dump` / `pg_restore` then work as against any Postgres.

The local database lives in the `postgres18` Docker container (role `poketrain`, database `poketrain_dev`). The commands below run the Postgres tools in Docker (`postgres:18` for the remote side, `docker exec` for the local container), so the client version always matches the servers and nothing has to be installed on the host. Any `pg_dump` / `pg_restore` of version 18 or newer also works.

Dumps are written to and read from the host with shell redirection, so no files are left inside a container.

> **Production is the source of truth. Pull from it, do not push to it.** Restoring a local database into production would overwrite real data and the migration history. To rebuild production from a backup, use "Backups and restore" in [deployment-reference.md](deployment-reference.md).

> **Restoring into local overwrites local.** `--clean --if-exists` drops each object before recreating it. Anything only in your local database (including a migration you have not merged yet) is lost.

## Setup

### 1. Open the tunnel

Use the same values as the DBeaver connection: open it, **SSH** tab for the droplet and user, **Main** tab for the database host and port as the droplet sees them.

```bash
export DROPLET=root@<droplet-ip-or-hostname>   # DBeaver > SSH tab: Host/IP + User Name
export PROD_DB_HOST=<host>                     # DBeaver > Main tab: Host  (as seen from the droplet)
export PROD_DB_PORT=5432                       # DBeaver > Main tab: Port
export SSH_KEY=<path-to-private-key>           # DBeaver > SSH tab: Private Key

# Forwards localhost:15432 to the database through the droplet. Leave it running, or add -f to background it.
ssh -i $SSH_KEY -o IdentitiesOnly=yes -N -L 15432:$PROD_DB_HOST:$PROD_DB_PORT $DROPLET
```

`<host>` is whatever works from the droplet: `localhost` if the database publishes a port on the droplet, otherwise the Postgres container's name or Docker IP on Coolify's network (the Postgres resource page in Coolify shows the internal name). The key is the one DBeaver's SSH tab uses; `-i` with `IdentitiesOnly` makes `ssh` offer only that key, as without it a named key is not tried and the droplet answers `Permission denied (publickey)`. Close the tunnel with Ctrl-C (or `kill` the process if you used `-f`).

### 2. Connection string and local settings

In a second terminal, keep the password out of your shell history (read it from your password manager):

```bash
read -rs PROD_PASSWORD   # paste it, press Enter
# Docker Desktop reaches the host's localhost as host.docker.internal
export PROD_URL="postgresql://poketrain_app:${PROD_PASSWORD}@host.docker.internal:15432/poketrain"

# Local (matches scripts/setup-db.sh and .env.local)
export LOCAL_CONTAINER=postgres18
export LOCAL_USER=poketrain
export LOCAL_DB=poketrain_dev
```

No `sslmode` parameter: the traffic is already inside the SSH tunnel. `poketrain_app` owns the production database, so it can dump everything; no superuser is needed. If the password contains `@ / # :`, percent-encode them in the URL.

## Production → local

```bash
# 1. Dump production (custom format, no owners/grants: the production role does not exist locally)
docker run --rm postgres:18 pg_dump "$PROD_URL" \
  --format=custom --no-owner --no-privileges \
  > poketrain_prod.dump

# 2. Restore into the local container
docker exec -i "$LOCAL_CONTAINER" pg_restore -U "$LOCAL_USER" -d "$LOCAL_DB" \
  --no-owner --no-privileges --clean --if-exists \
  < poketrain_prod.dump
```

Objects restored this way are owned by `poketrain` because `--no-owner` makes them belong to the user running the restore.

The dump carries production's migration history. If your branch has a newer migration than production, apply it after the restore: `npm run db:migrate`.

### Without the tunnel

The dump can also run on the droplet and stream back over SSH, which needs no forwarded port and always uses the server's own `pg_dump` version:

```bash
ssh -i $SSH_KEY -o IdentitiesOnly=yes $DROPLET "docker exec -i \$(docker ps -qf name=<postgres-container-name>) \
  env PGPASSWORD='<password>' pg_dump -U poketrain_app -d poketrain --format=custom --no-owner --no-privileges" \
  > poketrain_prod.dump
```

(The container name is the one Coolify shows on the Postgres resource; `docker ps` on the droplet lists it. The password appears on the droplet's process list while the command runs, so prefer the tunnel for anything shared.)

## Plain SQL variant (easy to inspect or edit)

```bash
# dump production
docker run --rm postgres:18 pg_dump "$PROD_URL" \
  --no-owner --no-privileges --clean --if-exists > poketrain.sql

# restore to local
docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -v ON_ERROR_STOP=1 < poketrain.sql
```

## Check it worked

Compare the tables and a few row counts on both sides:

```bash
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -c '\dt'
docker run --rm postgres:18 psql "$PROD_URL" -c '\dt'
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -c 'SELECT count(*) FROM _prisma_migrations'
```

Then make sure `DATABASE_URL` in `.env.local` points at the **local** database before running `npm run dev`. Several scripts (`db:seed`, `db:reset`, `sync:pokeapi`) read `.env.local` and write to whatever it points at.

## Troubleshooting

- **`Connection refused` / timeout on `host.docker.internal:15432`**: the tunnel is not running, or `PROD_DB_HOST` is wrong. Test from the host first: `psql "postgresql://poketrain_app:...@localhost:15432/poketrain" -c 'select 1'`. On Linux, add `--add-host=host.docker.internal:host-gateway` to the `docker run`.
- **`password authentication failed`**: wrong password, or special characters not percent-encoded in the URL.
- **`permission denied for database`**: you connected as another role; production revokes `CONNECT` from everyone except the owner role.
- **Version error from `pg_dump`** ("server version mismatch"): the client must be the same major version as the server or newer. The `postgres:18` image matches today's server; use `postgres:<version>` if the server is upgraded.
- **Errors about missing roles**: you dropped `--no-owner` / `--no-privileges`.
- **Restore warnings about objects that do not exist**: expected on the first restore with `--clean`; `--if-exists` keeps them harmless.
- **Dump files contain your data**: they are ignored by git (`*.dump`) but do not leave copies around. Delete them when done.
