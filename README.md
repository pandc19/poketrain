# PokéTrain

Track Pokédex progress and a trained competitive roster across Pokémon games. Games so far: **Pokémon Scarlet** and **Pokémon Violet**.

- **Pokédex grid** per regional dex with click, shift-click range and drag-to-paint toggling. Each game also has its own **National Dex** tab: the same caught list as its regional dexes, with a badge on Pokémon you caught in your other games.
- **Spreadsheet importer** (.csv / .xlsx) with a column-mapping step. Reads Spanish or English names and tolerates typos.
- **Trained roster**: small cards with paging on the left, and everything about the selected Pokémon on the right, editable in place. Every nature, ability, item, EV spread and move is a checklist item: orange while pending, green when done.
- **Spanish and English.** The ES/EN switch in the header changes the whole app: menus, buttons, messages and Pokémon, move, item and ability names. AI answers are written in the language selected when you ask. A saved AI answer is never translated: switching language keeps it, and the card says which language it is in until you re-run it in the new one (a copy you already have in that language is reused for free).
- **Pokémon details.** Click any Pokédex card for its information from PokéAPI: description, stats, abilities, egg groups, gender, size, evolution line and where it sits in the game's Pokédexes. Marking uses the **Catch** button on the card (shift-click fills a range).
- **Version exclusives.** For paired games (Scarlet/Violet) the **Exclusives** tab is a small Pokédex of what only your version has and what only the other version has, with a "Scarlet only" / "Violet only" tag on Pokédex cards. The list comes from Bulbapedia and is kept in `src/lib/games/exclusives/`.
- **Current EVs and a practical AI audit.** Record a Pokémon's current EVs next to its target. The AI audit then works from what it actually has (current EVs, nature, ability, potential, held item, the moves it knows) and the moves it can legally learn: at most three changes ranked easiest first, an EV plan to finish the training, the best held item, and the best four moves. EVs depend on the game (`features.evs` and `features.evTarget` in `src/lib/games/index.ts`): with no EV training everything EV-related is hidden and the AI gives no EV advice; where EVs are hard to change (Violet) you only record the current EVs, entered as the stats the game shows (the blue graph) plus its level, from which the app works out the EVs and draws them as a hexagon like the game's yellow shape (you can also pick the Judge's word for each stat's IV: "Inmejorable" is exactly 31, so that stat's EVs are exact, and the overall potential fills in when the six ratings agree on it), and the AI works with them; where they are easy to reset and retrain (like Legends: Z-A) a target spread is planned too.
- **Judge potential.** In games with a Judge (Juez), each roster Pokémon has a Potential you can set on the card or in the edit modal.
- **Have it now vs. caught.** A caught Pokémon stays in the Pokédex after it evolves. Untick its ✓ and it shows as "not in my box" (with what it evolved into), and the breeding planner stops counting it as a parent.
- **Genders.** Record ♂/♀ on caught Pokémon in the Pokédex and on roster cards; the breeding planner uses them to know which parents you actually have.
- **Move legality check** against the game's real learnsets (no AI involved).
- **Breeders**: Pokémon you keep to breed with, recorded with the Judge's word for each IV, nature and ability. A Pokémon is stored once and can be on the roster, in the breeders, or both (`pokemon_roles`); removing it from one page keeps it on the other.
- **Breeding assistant**: finds parents in your breeders, roster and Pokédex, fathers that can pass an egg move, multi-generation chains, and the Mirror Herb picnic shortcut. A goal can also ask for IVs that must be 31, a nature and the hidden ability: the plan then picks the best pair, says which Destiny Knot, Power item and Everstone to hold, and gives the exact chance that every wanted IV comes out perfect (`src/lib/breeding/ivs.ts`). The Catalog button shows the breeding items on the breeding pages.
- **Optional AI** (OpenAI or Claude, switchable): build and team audits, where to find items and TMs, where to catch a Pokémon.

## Run it locally

**You need:** Node 24, npm, and Docker with the `postgres18` container (PostgreSQL 18 on port 5432). The app uses its own role and database inside that container; it does not start another one and does not touch other projects' databases.

1. **Make sure Postgres is up.**
   ```bash
   docker ps --filter name=postgres18     # should show "Up"
   docker start postgres18                # only if it is stopped
   ```
2. **Create the role and database (once).** Safe to re-run.
   ```bash
   ./scripts/setup-db.sh
   ```
   This creates the role `poketrain` (with `CREATEDB`, which Prisma needs for migrations) and the database `poketrain_dev`.
3. **Install dependencies.**
   ```bash
   npm install
   ```
4. **Create your env file.** The database URL works as-is.
   ```bash
   cp .env.local.example .env.local
   ```
5. **Create the tables and seed the base rows** (your user, the games and one save profile per game).
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
6. **Download the Pokémon reference data from PokéAPI.** About two minutes the first time. It can be interrupted and resumed, and only needs repeating when a game is added.
   ```bash
   npm run sync:pokeapi
   ```
7. **Start the app** and open http://localhost:3000.
   ```bash
   npm run dev
   ```

**Day to day:** `docker start postgres18` if needed, then `npm run dev`.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Connection string for the `poketrain_dev` database |
| `ENCRYPTION_SECRET` | to save an AI key | 32 random bytes in base64 (`openssl rand -base64 32`). Encrypts the AI keys saved in Settings. If it changes, saved keys become unreadable and are added again |
| `APP_URL` | no | The address invite and password links point to. By default the address the owner is using (`http://localhost:3000` for the script) |

**The AI is set up in the app, not in the environment.** Open **Settings** and choose Anthropic (Claude) or OpenAI, paste an API key, and optionally add an Anthropic workspace id (only if Anthropic says the key needs one) and a model (otherwise the provider's default: `claude-sonnet-5-5`, or `gpt-4o-mini`). Everyone does this for themselves, the owner included. The key and the model are checked with the provider (requests that cost nothing) before they are saved, and the key is stored encrypted. Without it the app runs in **no-AI mode**: everything works except the AI audit and the where-to-catch lookup, whose buttons are hidden. AI answers are saved in the database, so switching provider or model keeps them.

### Other commands

| Command | What it does |
|---|---|
| `npm test` | Runs the unit tests |
| `npm run lint` | Lints the code |
| `npm run build` | Production build |
| `npm run db:studio` | Opens Prisma Studio to browse the data |
| `npm run db:reset` | **Deletes all data** in the database (roster, Pokédex, breeding plans, AI cache, and the Pokémon reference data) but keeps the tables. It does nothing else and runs no migration. Afterwards run `npm run db:seed` and then `npm run sync:pokeapi` |
| `npm run accounts -- <task>` | The two account tasks for when nobody can log in: `admin` (the owner's login) and `reset <email>` (a password link). The rest is on the Admin page. See [Accounts](#accounts) |
| `npm run locations:import-legacy` | One-off: moves the "where do I catch it?" answers saved in the old per-user AI cache into the shared location dictionary. Safe to repeat. Reads `DATABASE_URL` from `.env.local` |
| `docker exec -it postgres18 psql -U poketrain -d poketrain_dev` | Opens a SQL shell on the database |

### Common problems

- **Connection refused** on startup or migrate: the `postgres18` container is stopped. Run `docker start postgres18`.
- **Port 3000 is taken:** `npm run dev -- -p 3001`.
- **Empty Pokédex:** the reference data has not been synced. Run `npm run sync:pokeapi`.
- **AI button says "not configured":** add a key to `.env.local` and restart the dev server.

## Suggesting a feature

`/suggest` is open to everyone, with no account: a message, and for a visitor an optional name and an optional email to be answered at (someone logged in is known by their account). It is linked from the landing page and from Settings. A hidden field catches bots and each person, or address, can send five an hour. The owner reads them on the Admin page, where each can be archived (it folds away and can be brought back) or deleted. Nothing is emailed: there is no email service, so the owner checks the page.

## Accounts

Anyone who is not logged in lands on a front page (what PokéTrain is, the games it covers, a way to log in or ask for an invite) and can open the shared **demo** from it. Every page of the demo carries a banner that says so, with the way to log in. A logged-in user goes straight to their game; a new account first chooses the games it plays (**Add game**, also in the header), and each game, Scarlet and Violet included, is its own save. The demo is a copy of the owner's data (see below).

Anyone who is not logged in uses the shared **demo** (its own copy of the data, which visitors can edit). Accounts are **by invitation**: people ask on `/request-invite`, and the owner sends them a one-time link. There is no email service, so the owner copies each link and sends it by hand.

1. **Log in as the owner.** Your data belongs to the owner account, which has no login until you give it one: `npm run accounts -- admin` (asks for an email and a password, not shown). Without it, the app shows the demo.
2. **Everything else is on the Admin page** (the *Admin* link in the header, for the owner only): the **demo** ("Copy my data to the demo", see below), the **suggestions** people sent (read, archive, delete), invite requests (Invite or Decline), invites made by hand and the ones not used yet (which can be revoked), the users, with a one-time **password link** for each, and the shared list of where to catch each Pokémon, where a wrong answer can be deleted. A link is shown once, when it is made: only a hash of it is kept.
3. **A forgotten password of your own.** The page cannot help when nobody can log in, so `npm run accounts -- reset you@example.com` prints a link, good once and for a day.

**The demo is a copy of your data.** Whoever is not logged in sees and can edit the demo, which has its own copy of your saves, Pokédex, roster, team, breeding plans, opponents and saved AI answers (never your account, your AI key or anything of anyone else). It starts empty. On the Admin page, **Copy my data to the demo** replaces everything in the demo with what you have now, including anything visitors changed there, so a game or a Pokémon you add shows up in the demo after the next copy. It asks first, shows what it copied, and is all or nothing: if it fails, the demo stays as it was.

**AI is the user's own.** Nobody gets AI by default: the demo and new accounts have none, and the AI buttons stay hidden. Everyone, the owner included, sets up their own provider, key, workspace and model in **Settings** (see [Environment variables](#environment-variables)), so the provider charges them and PokéTrain charges nothing. Everything that is not the build audit or the location lookup works without AI, including the quick audit.

Logins never expire: they end when the person logs out. Passwords are hashed with scrypt, invite and reset links and login tokens are stored only as hashes, and the login and request forms limit repeated attempts. Links point at the address the owner is using; set `APP_URL` to force one.

## Deploying

Production runs on a DigitalOcean droplet managed by Coolify. Every change goes through a pull request, and a merge to `main` deploys. How that works: [docs/deployment.md](docs/deployment.md). What it is made of: [docs/deployment-reference.md](docs/deployment-reference.md).

## Importing a spreadsheet

The **Import** page is not in the menu any more (the roster is already imported), but it is still at `/violet/import`. Open it, drop the file, check what each column is imported as, preview, then import. `samples/violet-roster.csv` is a working example.

How rows are read:

- **Status column.** "Listo" / "Done" marks everything done. "Falta golpe bajo" / "Missing Sucker Punch" marks only that move pending. A **blank status means you do not have that Pokémon yet** (Obtained = No); any status text means you do.
- **Recommended vs. current columns.** When a row has current moves, those are the build that is tracked and counted as known; the recommended list is kept in the notes. With only recommended moves, everything starts pending.
- **Nature** is done when the current nature matches the recommended one.
- **Alternatives** such as "Vidasfera o Cinta Elegida" keep the first as the item and the full text as a note.
- **Unrecognised names** are kept as typed and flagged, so nothing from the sheet is lost. Fix them in the detail panel of the roster.

## How it is put together

| Path | What lives there |
|---|---|
| `src/lib/games/` | Per-game config. Adding a game is a new entry here plus a seed and sync |
| `prisma/schema.prisma` | Reference data (from PokéAPI) and user data |
| `scripts/sync-pokeapi.ts` | Reference data download, cached in `.cache/pokeapi` |
| `src/lib/import/` | Name matching, column mapping and row interpretation |
| `src/lib/roster-status.ts` | The pending/complete status engine |
| `src/lib/legality.ts` | Move legality from learnsets |
| `src/lib/breeding/` | Breeding engine (`engine.ts` is pure and unit tested) |
| `src/lib/ai/` | Provider interface, OpenAI and Claude providers, prompts and caching |
| `src/lib/messages-es.ts` | Spanish text for every interface string, keyed by its English text (`tests/i18n.test.ts` fails when one is missing) |
| `src/app/` | Pages and API routes |

**Data sources.** PokéAPI supplies everything deterministic: species, types, stats, egg groups, abilities, items, moves and learnsets, in English and Spanish. AI is used only for judgement and for facts PokéAPI does not have. PokéAPI has no wild-encounter data for Generation 9, so "where do I catch this" is an AI web lookup; treat those answers as a lead to check in game.

**Multi-dex linking.** Caught state is stored once, per save profile and species. A game's regional dexes and its National Dex are two views of those same rows, so marking a Pokémon in one marks it in the other. Other games' saves only add the "caught in ..." badges; they never count as caught.
