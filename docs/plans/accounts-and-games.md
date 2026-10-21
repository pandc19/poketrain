# Plan: accounts, demo, the app without AI, more games

Status: in progress. Every PR below targets the integration branch `feat/accounts-and-games`, which merges to `main` (and deploys) only once the whole plan is done. Each PR is tested by hand before it merges into the integration branch.

---

## Goals

- The app stays open as a **demo** anyone can use without logging in, with its own copy of the data.
- **Accounts** with email and password, **invite-only**. Sessions do not expire.
- Two **roles**: `ADMIN` (the owner) and `USER`. The admin also has a config page.
- The **whole app works without AI**. AI controls are shown only to a user who can use AI: the admin, or a user who has added their own API key. There is no billing (see [Why no billing](#why-no-billing)).
- More **games**: Scarlet now, then Sword/Shield, Brilliant Diamond/Shining Pearl and Legends: Z-A.

## Pages and navigation

The URLs stay the same. Who is looking decides whose data is shown.

| Who | `/` | `/<game>/...` | `/admin` |
|---|---|---|---|
| Logged out | Landing page | **Demo data**, with a banner: "You're viewing the demo · Log in · Home" | → `/login` |
| User | → their first game | their data | 404 |
| Admin | → their first game | their data | config page |

New pages: `/login`, `/request-invite` (name, email, optional "what games do you play"), `/register?invite=<code>` (only with a valid, unused invite), `/settings` (own API key). All of them link back to the landing page. The header gains Log out, Admin (admin only), and a game selector that lists only the account's games, with "Add game" at the end.

### Landing page

Built on the app's device and cartridge look, in English and Spanish.

> **PokéTrain**
> A side project from someone who loves Pokémon games, built to keep a playthrough organised: what you've caught, who you're training, what to breed next, and what's still left to beat. All in one place, instead of a dozen spreadsheets and browser tabs.
>
> [Try the demo] [Log in] [Request an invite]

Then: what it does (Pokédex, roster and training, breeding planner, battle prep, and what the AI adds); the games available now, one cartridge card each in its own colours, pairs side by side; coming next (Legends: Z-A, Brilliant Diamond / Shining Pearl, Sword / Shield); footer "A free-time fan project. Not affiliated with Nintendo, Game Freak or The Pokémon Company."

## Accounts, roles, invites

Schema:

- `users`: `email` (unique), `passwordHash`, `role` (`ADMIN | USER`, default `USER`), and the user's own AI settings (provider, encrypted key, workspace, model).
- `sessions`: `id`, `userId`, `tokenHash`, `createdAt`, `lastSeenAt`.
- `invite_requests`: `name`, `email`, `message`, `status` (`PENDING | INVITED | DECLINED`), `createdAt`.
- `invites`: `codeHash`, `email?`, `createdBy`, `createdAt`, `usedAt`, `usedBy`.
- `password_resets`: `tokenHash`, `userId`, `expiresAt` (about 24 h), `usedAt`.

- Passwords: `node:crypto` scrypt, no new dependency.
- Sessions never expire: the row lives until logout. The cookie (`httpOnly`, `Secure`, `SameSite=Lax`) is re-issued every ~30 days, since browsers cap a cookie at 400 days.
- No email provider: the admin approves a request, the app shows a single-use invite link, the admin sends it. Password resets work the same way.
- `/request-invite` and `/login`: honeypot field and a per-IP rate limit.
- The existing user (today's `LOCAL_USER_ID`) becomes the `ADMIN`.
- `getUser()` returns the session's user, or the demo user when nobody is logged in. `requireAdmin()` guards `/admin` and its actions. Every check runs on the server.

## AI

What it does today:

1. **Build audit** (Roster): held item, four legal moves, EV plan, nature or Mint, Tera type, each with a reason; locked parts are kept. Audit (bulk model), Deep audit (stronger model), Re-run.
2. **Where to catch a Pokémon** (web search): Roster EV sources, Breeding, EV sources list.

Everything else (legality, EVs from stats, IV ratings, breeding plans, battle counters, exclusives, import, Spanish names) is game data and works without a key.

Rules:

- `canUseAi(user)`: true when the user has set up their own AI (the server has no key of its own). The `/api/ai/*` routes return 403 otherwise; hiding a button is never the only guard.
- Without AI the controls are **hidden**, not disabled. In their place, a short line pointing to `/settings`.
- The demo shows saved AI answers with a label: "AI isn't available in the demo. With your own API key you can run it."
- Every AI action has a `HelpTip` saying what it does, that it uses the user's key, and where the answer is saved.
- Own keys: encrypted at rest with a key from an env var, never sent back to the browser, never logged.

### Shared location dictionary

Table `pokemon_locations`, shared by every user: `versionGroup`, `speciesId`, `variant` (`''` or a region), `result` (English and Spanish in one answer), `provider`, `model`, `promptVersion`, `createdBy`, timestamps. Unique on `(versionGroup, speciesId, variant)`.

- Keyed by version group: Scarlet and Violet share a map. Version exclusivity comes from our own exclusives data and shows as a badge.
- Lookup: database first, for anyone. Not there and the user can use AI: "Find location", saved for everyone. Not there and no AI: "We don't know where to find this one yet. Add your own API key to look it up." "Look again" (AI only) replaces the entry; the admin page can delete one.
- The answers already saved under `ai_audits` (kind `location`) are moved by a one-off script that rebuilds their hashes per species and language.

### Quick audit (no AI)

Free, instant, for everyone including the demo. Same result shape as the AI audit, so the panel shows it unchanged; reasons come from templates in both languages.

- Role: physical or special from base Attack vs Sp. Atk (and its moves, EVs, nature); fast or bulky from base Speed.
- Nature: raise the attacking stat (or Speed when fast), lower the unused attacking one. Mint when the nature's effect differs.
- EV plan: fast: 252 attack stat / 252 Speed / 4 HP; slow: 252 HP / 252 attack stat / 4 Defense.
- Moves: legal damaging moves of its category scored by power × accuracy × STAB; best STAB of each own type, then coverage from the type chart; moves it knows win ties. A short hand list of setup moves to include and moves with drawbacks to skip.
- Held item: rules of thumb (Focus Sash, Choice Band/Specs, Life Orb, Leftovers), only items the game has.
- Tera type: its strongest move type.
- Locks are kept. Saved with `provider: 'rules'` and a rules version.
- Says plainly: "Rule-based suggestion. An AI audit looks deeper."

### As built in PR 6

- Sessions are database rows with no expiry; the cookie (`HttpOnly`, `SameSite=lax`, `Secure` in production) lasts the 400 days a browser allows, and `src/proxy.ts` re-issues it, same value, once it is a month old, without touching the database.
- Passwords: scrypt, the cost kept in the hash. Invite, reset and login tokens: 256 random bits, stored only as a SHA-256 hash.
- The login, request and register forms are server actions that return short error codes (never text), so every message goes through `t()`. Limits are in memory: failed logins per address and per email, requests per address, and a honeypot on the request form.
- A new account has a profile for every game until accounts choose their games (PR 12).
- Until the admin page (PR 9), the owner used `npm run accounts`. PR 9 moved invites, requests, users and password links into the page and dropped those commands; `admin` (the owner's first login) and `reset` stay as a recovery tool, since they are what is needed when nobody can log in, which the page cannot help with.
- A password needs 8 characters at least (`src/lib/auth/rules.ts`); the forms show the same number.
- The existing user became the admin by migration, and a `Demo` user (no email, no password) was added with a profile per game. Whoever is not logged in is the demo.

### As built in PR 7

- **The AI is configured in the app, per user, and the server holds no AI key.** No AI environment variable is read (the provider, keys, workspace and models of `.env.local` are gone). Settings has the provider (Anthropic or OpenAI), the API key, an Anthropic workspace id (optional) and a model (optional; otherwise the provider's default). The owner sets up theirs like anyone else, and the per-user `aiEnabled` switch no longer exists: it only ever meant "use the server's key".
- `getAiProviderFor` / `canUseAi` in `src/lib/ai/user-provider.ts` are the only way to get a provider. The demo never has AI, and nobody has it until they set it up.
- `/api/ai/*` answer 403 without AI. The roster and breeding pages pass `aiEnabled` per user, and the AI buttons stay hidden without it.
- A key is AES-256-GCM encrypted with `ENCRYPTION_SECRET`, with the user's id as authenticated data (a copied blob does not decrypt); the provider and the last four characters are kept beside it. On save the key, the workspace and the model are checked with the provider's free calls (list models, retrieve the model), never returned to the browser, never logged. A key that cannot be decrypted counts as no key. With the key left empty only the other settings change.
- `/settings`: the account, and the AI form (provider, key, workspace, model; remove).
- The admin page (PR 9) therefore has no "AI on/off per user"; it only lists whether each user has AI set up.

### As built in PR 10

- `copyUserData(from, to)` (`src/lib/demo-copy.ts`) empties the target's saves and copies the source's saves, Pokédex, roster (with moves and roles), team slots, breeding plans, battle opponents and saved AI answers, in one transaction: all or nothing. The source is only read, and copying a user onto itself is refused.
- Pointers are remapped: rows that point at a roster Pokémon (team slots, the best counter of an opponent, saved AI answers) point at its copy, as do the ids inside an opponent's frozen snapshot and an answer's JSON. A stale best-counter id is dropped. Imports are not carried over. Copied Pokémon get new version-7 UUIDs made in code, since they are needed before the rows exist.
- Saved AI answers are now unique per save (`profile_id` is in the key), so a copy does not collide with its original. The audit cache reads and writes with the profile in its key.
- The demo remembers when it was last copied (`users.data_copied_at`). The Admin page has a Demo section: when it was last copied, how many Pokémon it has, and **Copy my data to the demo**, which asks first because visitors' edits are lost, and shows what it copied.
- A game or Pokémon the owner adds comes along on the next copy, since the copy takes whatever saves the owner has.

### As built in PR 9

- `/admin` (and every action behind it) is for the admin only: anyone else gets a 404, as if there were nothing there. Each server action checks the caller itself, since actions are reachable endpoints; hiding the page would not be a guard.
- Sections: invite requests (Invite makes a one-time link tied to the person's email and marks the request invited; Decline; answered ones fold away, and an invited one can get a fresh link); invites (make one for an email or for anyone, see the ones not used yet, revoke one); users (role, email, whether AI is set up, logins, and a one-time password link); the location dictionary (newest 50, search by name, delete an entry).
- A link is shown once, with a Copy button: only a hash is kept, so a lost one is revoked and made again. Links point at `APP_URL` when set, otherwise at the address the admin is using.
- The *Admin* link shows in the header for the admin only.

### As built in PR 8

- One context (`AiAccessProvider`, from the layout) says whether this person can use AI and whether they are in the demo; it replaces the `aiEnabled` prop that was passed through six components.
- Each AI action has a help tip (`AiHelp`): the audit says what it suggests, that fixed parts stay and that the answer is saved on the Pokémon; the location lookup says what it finds, that the answer is saved for everyone and that searching again replaces it. Both say they use the person's own key, and the audit's names the quick audit as the free alternative.
- Where the AI is not available, a line takes the place of the button (`AiUnavailable`), with the same tip: in the demo, "AI is not available in the demo. Log in and add your own API key to run it."; for a logged-in user, "AI is off." with a link to Settings. The list-level notice on the roster is gone.
- Answers the AI wrote earlier still show in the demo, with a note under them (`DemoAiNote`) that visitors cannot run the AI.

## Admin config page (`/admin`)

1. Demo data: "Copy my data to demo", the time of the last copy, a confirmation (it wipes visitors' edits).
2. AI: which users have AI set up (the provider only; never a key).
3. Invite requests: pending list, Invite (makes the link) or Decline; a link can also be made without a request.
4. Users: list, role, whether AI is set up, "Create a password reset link".
5. Location dictionary: list and delete entries.

## Demo data

- The demo is a user with role `USER` and AI off. Visitors can edit it; every copy wipes their edits.
- `copyUserData(admin → demo)`, in one transaction: delete the demo's profiles (cascade), then copy every admin profile with new ids: Pokédex entries, roster with moves and roles, team slots, breeding goals, battle opponents (remapping `bestRosterId` and ids inside `frozen`), saved AI answers.
- Saved AI answers are unique on `(kind, provider, inputHash)` across the whole database; the copy needs `profile_id` in that key (a migration).
- New games come along on the next copy.

## Games

- Pokédexes are read from the game config's slugs instead of `pokedexes.game_id` (dropped), so paired games can share them.
- **Scarlet**: like Violet, exclusives reversed (`scarletVioletExclusives('scarlet')`), red theme, `ancient` motif. Same version group, no new sync.
- **Add game** dialog: games by generation; pairs offer one version or both (two separate saves). New accounts start here. The seed stops creating a profile per game for everyone.
- Next, one PR each: config, `features`, exclusives (hand-kept, from Bulbapedia), catalog, theme, `sync:pokeapi`.

| Game | Pair | Care |
|---|---|---|
| Sword / Shield | yes | Galar, Isle of Armor, Crown Tundra dexes; Max Raids, no Tera; Dynamax |
| Brilliant Diamond / Shining Pearl | yes | Sinnoh plus National Dex; no raids, no Tera |
| Legends: Z-A | no | own battle and training system, `evTarget: true`, no breeding, Megas; check PokéAPI coverage first |

## Why no billing

The app is built on Pokémon trademarks and game assets (the name, the sprites, game text). A free fan tool sits in the tolerated grey area; charging makes it a commercial product on someone else's IP, which is what draws takedowns and gets payment accounts closed. Users who want AI bring their own key instead. If billing ever comes back, `canUseAi` is where it plugs in.

## PRs

All into `feat/accounts-and-games`; tested by hand before each merge.

1. `refactor: resolve the current user through one helper`
2. `refactor: link pokedexes to games through the game config`
3. `feat: add Pokémon Scarlet`
4. `feat: keep a shared dictionary of where to catch each Pokémon`
5. `feat: add a rule-based audit that needs no AI`
6. `feat: add accounts with roles, invites and long-lived sessions`
7. `feat: let users bring their own AI key`
8. `feat: explain what each AI action does`
9. `feat: add the admin config page`
10. `feat: copy the admin's data to the demo`
11. `feat: add a landing page and the demo banner`
12. `feat: let each account choose its games`
13. One PR per new game: Sword/Shield, BD/SP, Legends: Z-A.
