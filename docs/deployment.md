# Deployment

How a change gets from a branch to production. For what production is made of (server, database, env vars, Coolify settings), see [deployment-reference.md](deployment-reference.md).

---

## Branching strategy

One long-lived branch, `main`. It is always deployable, and **every merge to `main` deploys to production**: Coolify watches the repo and rebuilds on each push. There is no staging environment and no release tag. Work is done on short-lived branches and reaches `main` only through a pull request.

```
  feature/xyz  ──PR + CI──▶  main  ──push──▶  Coolify builds the Dockerfile on the droplet
                                              └─▶ container starts: prisma migrate deploy, then the app
```

**Rules**
- Nobody pushes to `main` directly, including for a one-line fix. Branch, PR, merge.
- A PR can merge only when the `check` job of [CI](../.github/workflows/ci.yml) passes (lint, type-check, tests).
- Merges are **squash** merges, so `main` has one commit per PR and a revert is one click.
- Branch names: `feature/…`, `fix/…`, `chore/…`, `docs/…`. Delete the branch after the merge.
- Commit messages say what changed for the user, in plain words, as the existing history does.

---

## Daily flow

```bash
git checkout main && git pull origin main
git checkout -b feature/my-change

# work, commit, push
git add <files>
git commit -m "Roster: describe the change"
git push -u origin feature/my-change

# open the PR on GitHub (or: gh pr create), wait for the check, squash and merge

git checkout main && git pull origin main
git branch -d feature/my-change
```

After the merge, watch the deployment in Coolify (Deployments tab). A deploy takes roughly 3-8 minutes: most of it is `next build` on a small droplet.

---

## What a merge does

1. GitHub notifies Coolify (GitHub App webhook); Coolify clones the commit and runs `docker build` with the [Dockerfile](../Dockerfile) **on the droplet**. Nothing is built in GitHub Actions.
2. The new container's entrypoint ([docker-entrypoint.sh](../docker-entrypoint.sh)) runs `prisma migrate deploy` against the production database, then starts the server.
3. If the container does not come up (a failed migration exits the container), Coolify does not switch over and the previous version keeps serving. Read the deployment log.
4. Once the new container is running, Coolify stops the old one.

### Database changes

- Add a migration with `npm run db:migrate` locally and commit the new folder in `prisma/migrations/`. It is applied automatically on the next deploy. Never edit a migration that has already been merged.
- The migration runs **while the old version is still serving**. Write migrations that the previous code can live with (add columns as nullable or with a default; drop or rename a column in a later PR, after the code that stopped using it has shipped).
- Migrations are not rolled back. A rollback of the app does not undo them.
- Production data is not touched by `db:seed`, `db:reset` or `sync:pokeapi` unless you point `DATABASE_URL` at it. Those scripts read `.env.local`; keep that file pointed at the local database.

---

## Rollback

- **Bad code, schema fine:** revert the PR on GitHub (it makes a new PR; merge it like any other). Or, for speed, use Coolify's Rollback tab on the application to redeploy a previous image; then revert the PR so `main` matches what is running.
- **Bad migration:** fix forward with a new migration. If data was damaged, restore from the Postgres backup (see the reference, "Backups and restore").

---

## GitHub settings (one-time)

Settings → Rules → Rulesets → New branch ruleset, targeting the default branch (`main`), enforcement **Active**:

| Setting | Value | Why |
|---|---|---|
| Restrict deletions | on | `main` cannot be deleted |
| Block force pushes | on | History on `main` is what Coolify deploys |
| Require a pull request before merging | on, **0** required approvals | PR-only, but a solo owner cannot approve their own PR. Raise to 1 if a second person joins |
| Dismiss stale approvals / require review from Code Owners | off | Nothing to dismiss with 0 approvals |
| Require conversation resolution | on | Open review threads block the merge |
| Require status checks to pass | on, add **`check`** | The CI job. Pick it from the list after it has run once on a PR |
| Require branches to be up to date before merging | on | The check runs against what will actually land |
| Require linear history | on | Matches squash merges |
| Bypass list | empty | The rule applies to the owner too. If an emergency needs a bypass, add yourself temporarily, then remove it |

Settings → General → Pull Requests:
- Allow squash merging: **on**. Merge commits and rebase merging: **off**.
- Default commit message: "Pull request title and description".
- Automatically delete head branches: **on**.
- Allow auto-merge: on (lets a PR merge itself once the check is green).

Settings → Code security (availability depends on the repo being public or on the plan):
- Secret scanning and push protection: on. Keys such as `ANTHROPIC_API_KEY` must only ever live in Coolify and `.env.local`.
- Dependabot alerts: on.

Settings → Actions → General: workflow permissions "Read repository contents" (the CI workflow declares `contents: read`).

The Coolify GitHub App only needs read access to this repository's contents and webhooks; it does not need to bypass the ruleset because it never pushes.

---

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs on every PR to `main` and on every push to `main`: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`. It does not build the Docker image or run `next build`: the real build happens in Coolify, and a broken Dockerfile shows up there (the previous version keeps running). If a Dockerfile change is risky, build it locally first: `docker build -t poketrain:test .`.

Coolify deploys on push to `main` regardless of CI, so the ruleset above is what makes CI a gate.
