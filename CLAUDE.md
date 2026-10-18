# Project conventions

Git workflow (full version in `docs/deployment.md`):

- Never push to `main`. Work on a branch named `type/short-description` (kebab-case) and open a PR.
- Commit messages and PR titles: `type: short description`, max 72 chars, imperative, no period. Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`.
- The PR title becomes the squash commit on `main`, so write it carefully. Fill in the PR template.
- Before opening a PR run `npm run lint`, `npx tsc --noEmit` and `npm test`; CI runs the same.
