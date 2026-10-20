# Poké Train

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
| `AI_PROVIDER` | no | `openai` (default) or `claude` |
| `OPENAI_API_KEY` | for OpenAI | Enables AI features with OpenAI |
| `OPENAI_BULK_MODEL` | no | Everyday requests. Default `gpt-4o-mini` |
| `OPENAI_ESCALATION_MODEL` | no | Harder requests. Default `gpt-4o` |
| `ANTHROPIC_API_KEY` | for Claude | Enables AI features with Claude |
| `ANTHROPIC_WORKSPACE_ID` | if needed | Required when the API says the key is not scoped to a workspace |
| `CLAUDE_BULK_MODEL` | no | Everyday requests. Default `claude-sonnet-5-5` |
| `CLAUDE_ESCALATION_MODEL` | no | Harder requests. Default `claude-opus-5-5` |
| `CLAUDE_MODEL` / `OPENAI_MODEL` | no | Older single-model setting: used for both when the pair above is not set |

**Which model does what.** The bulk model answers single-Pokémon audits and location lookups. The escalation model answers the whole-roster audit, and you can re-run any single audit on it with "Re-run with the stronger model". Claude models older than Opus 4.6 / Sonnet 4.6 (such as Haiku) automatically use the basic web search tool.

With no API key the app runs in **no-AI mode**: everything works except the AI buttons, which explain how to turn them on. To switch provider, change `AI_PROVIDER` and restart `npm run dev`. AI answers are cached in the database, so repeating a question costs nothing.

### Other commands

| Command | What it does |
|---|---|
| `npm test` | Runs the unit tests |
| `npm run lint` | Lints the code |
| `npm run build` | Production build |
| `npm run db:studio` | Opens Prisma Studio to browse the data |
| `npm run db:reset` | **Deletes all data** in the database (roster, Pokédex, breeding plans, AI cache, and the Pokémon reference data) but keeps the tables. It does nothing else and runs no migration. Afterwards run `npm run db:seed` and then `npm run sync:pokeapi` |
| `docker exec -it postgres18 psql -U poketrain -d poketrain_dev` | Opens a SQL shell on the database |

### Common problems

- **Connection refused** on startup or migrate: the `postgres18` container is stopped. Run `docker start postgres18`.
- **Port 3000 is taken:** `npm run dev -- -p 3001`.
- **Empty Pokédex:** the reference data has not been synced. Run `npm run sync:pokeapi`.
- **AI button says "not configured":** add a key to `.env.local` and restart the dev server.

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
