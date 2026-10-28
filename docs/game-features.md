# Game features

What PokéTrain can do with a game, and what depends on the game. Not every game has the same mechanics, so
when a new one is added, this is the list of things to check in it and to switch on or off.

Status of each feature is per game (or per pair of games that share everything). **Scarlet and Violet** are the
only games so far; they are one column because they differ only in their version exclusives and their look.
When you add a game, add a column to the tables and fill it from the checks below.

Legend: ✅ the game has it and the app supports it · ❌ the game does not have it (the app hides it) ·
🔧 the app supports it, but the data is written for Scarlet/Violet only · ❓ not checked yet.

Last checked against the code: 2026-10-26.

## How to use this document

1. **Adding a game.** Go through [the matrix](#feature-matrix) row by row and answer "does this game have it?".
   Each row says where the app decides: a flag in `features` of the game's entry in
   [src/lib/games/index.ts](../src/lib/games/index.ts), another field of that entry, or data kept in
   `src/lib/games/`.
2. **Changing the app.** If a new feature only makes sense in some games, add a row here in the same PR, and a flag
   (or a field) in `GameConfig`, so the next game is checked against it.
3. **Keep the matrix honest.** Mark ❓ rather than guessing.

## Feature matrix

### Game-dependent features

| Feature | Decided by | What to check in the game | Scarlet / Violet |
|---|---|---|---|
| [Regional Pokédexes](#pokédex) | `pokedexes` | Which Pokédexes the game has (base game, DLC), and their PokéAPI slugs | ✅ Paldea, Kitakami (Teal Mask), Blueberry (Indigo Disk) |
| [National Dex tab](#pokédex) | `nationalDex` | Does the game have a National Dex? | ❌ regional dexes only |
| [Regional forms tab](#pokédex) | `extraForms` | Can the game receive regional forms (Alolan, Galarian, Hisuian) that no Pokédex lists, e.g. from Pokémon HOME? | ✅ |
| [Regional form variants](#pokédex) | `regionalSpecies` per Pokédex, `src/lib/dex-variant.ts` | Does the same species appear as different forms in different Pokédexes? | ✅ Blueberry lists Alolan, Galarian and Hisuian forms; Paldean Tauros and Wooper |
| [Dex cut-off](#pokédex) | `lastEntry` per Pokédex | Does PokéAPI list extra species after the game's own Pokédex ends? | ✅ Blueberry stops at 240 |
| [Version exclusives](#version-exclusives) | `pair`, `versionExclusives` | Is it sold as a pair with different Pokémon in each version? | ✅ (Bulbapedia list) |
| [Move legality and learnsets](#moves-and-legality) | `versionGroup`, `learnsetVersionGroups` | PokéAPI version groups of the base game and each DLC | ✅ `scarlet-violet`, `the-teal-mask`, `the-indigo-disk` |
| [EV training](#evs) | `features.evs` | Does the game have EVs? | ✅ |
| [EV target spread](#evs) | `features.evTarget` | Are EVs easy to reset and retrain (so a target is worth planning)? | ❌ hard to change: only the current EVs are recorded |
| [EV note for the AI](#evs) | `evNote` | Is EV training unusual (another system, very hard)? | ➖ not set |
| [Held items](#roster) | `features.heldItems` | Can Pokémon hold items that matter in battle? | ✅ |
| [Abilities](#roster) | `features.abilities` | Does the game have abilities? | ✅ (flag declared, not read by any code yet) |
| [Tera type](#tera-and-raids) | `features.teraType` | Terastallization or an equivalent | ✅ |
| [Tera raids](#tera-and-raids) | `features.raids` | Raid battles against a boss | ✅ |
| [Judge (IV ratings)](#judge-and-potential) | `features.judge` | Is there someone who rates a Pokémon's IVs? | ✅ |
| [Mints](#nature-and-mints) | a `mints` section in `catalog` | Can the nature's stat effect be changed with an item? | ✅ |
| [Breeding planner](#breeding) | `features.breeding` | Does the game have breeding? | ✅ |
| [Mirror Herb picnic shortcut](#breeding) | `features.mirrorHerb` | Can egg moves be copied from another Pokémon? | ✅ |
| [Form-locked evolutions](#breeding) | `breedingForms` | Evolutions only one form of the base species can make, and what keeps an egg that form | ✅ Basculegion (White-Striped Basculin + Everstone) |
| [Item catalog](#item-catalog) | `catalog` | Which reference sections (vitamins, berries, ...) are worth showing, training or breeding | 🔧 |
| [Where to find a Pokémon](#where-to-find-a-pokémon) | `versionGroup`, `locationNote`, `places.ts` | How the map works, and the places' Spanish names | 🔧 |
| [Look and name](#look-and-names) | `theme`, `name`, `shortName`, `shortNameEs` | The game's colours, motif, Spanish name | ✅ |

### Features every game gets

These do not depend on the game, but they use the game's data (learnsets, Pokédexes, types), so they only work once
the game has been synced from PokéAPI.

| Feature | Notes |
|---|---|
| Pokédex progress, with genders and "in my box" tracking | Per save profile |
| Trained roster, team of six, search | See [Roster](#roster) |
| Battle prep: opponents, counters, defeated/archived, best-so-far | See [Battle](#battle) |
| Spreadsheet import (.csv / .xlsx) | Reads Spanish or English names |
| Spanish / English interface, Pokémon and move names | Game language setting in Settings |
| Pokémon details dialog (PokéAPI text, stats, evolution line) | Prefers the game's own Pokédex text |
| Optional AI audits and lookups | Per-user key; everything else works without it |

## Feature details

### Pokédex

- **What it does.** One grid per regional Pokédex, with click, shift-click range and drag-to-paint. Caught state is
  stored once per save profile and species, so a regional dex and the National Dex are two views of the same rows.
  Other games' saves only add "caught in ..." badges.
- **Gate.** `pokedexes` (list, in display order, with PokéAPI slug and a note on where it comes from). A National Dex
  tab only appears with `nationalDex: true`; the "Regional forms" tab only with `extraForms`.
- **Check in a new game.**
  - Which Pokédexes exist and their PokéAPI slugs (`https://pokeapi.co/api/v2/pokedex/`).
  - Whether PokéAPI lists extra species past the game's last entry (`lastEntry`).
  - Whether a species shows up as different regional forms in different dexes (`regionalSpecies`). If the game has a
    new kind of form (a new region, Mega Evolutions), `VARIANTS` in `src/lib/dex-variant.ts` needs it. Only
    `alola`, `galar`, `hisui` and `paldea` are known.
  - Whether the game accepts forms from other games that no Pokédex lists (`extraForms.hisuiSpecies`).

### Version exclusives

- **What it does.** An **Exclusives** tab showing what only your version has and what only the other has, and a
  "Scarlet only" / "Violet only" tag on Pokédex cards. The tab only shows for games with `versionExclusives`.
- **Gate.** `pair` (id of the other version) and `versionExclusives`, built from `src/lib/games/exclusives/`.
- **Check in a new game.** Whether it is a pair with exclusives, and the list per version, including DLC and event
  groups. Source used so far: Bulbapedia. Single games leave both fields out.

### Moves and legality

- **What it does.** Move legality check against the game's real learnsets (no AI), the legal moves offered for
  rosters, battle opponents' moves, breeding egg moves, and the move list given to the AI.
- **Gate.** `learnsetVersionGroups` (base game plus DLC) and `versionGroup`. `npm run sync:pokeapi` only downloads
  learnsets for the version groups listed in `GAMES`.
- **Check in a new game.** PokéAPI's version-group names, including every DLC that adds Pokémon or moves. Re-run
  the sync after adding a game.

### Roster

Everything about one trained Pokémon, each part a checklist item (orange pending, green done).

| Part | Depends on the game? |
|---|---|
| Species, form, base species and final species (planned evolution), nickname, gender, origin, owned | No |
| Nature (target and current), ability | Abilities: flag declared, always shown |
| Held item | `features.heldItems` (read by the AI audit) |
| Moves, with legality | `learnsetVersionGroups` |
| EVs (target and/or current) | `features.evs`, `features.evTarget`; see [EVs](#evs) |
| Tera type | `features.teraType`; see [Tera and raids](#tera-and-raids) |
| Potential and IV ratings | `features.judge`; see [Judge and potential](#judge-and-potential) |
| Mint | A `mints` catalog section; see [Nature and Mints](#nature-and-mints) |
| Keeper and "training now" marks, notes, team slots (6) | No |
| Roles: roster, breeders, or both | No (breeders need `features.breeding`) |

### EVs

- **Gate.** `features.evs` and `features.evTarget`.
  - `evs: false` hides everything EV-related and the AI gives no EV advice.
  - `evs: true, evTarget: false` (Scarlet/Violet): you only record the current EVs. They are entered as the stats the
    game shows (the blue graph) plus the level, and the app works out the EVs and draws a hexagon like the game's
    yellow shape. The Judge's word per stat's IV makes the estimate exact ("Inmejorable" is 31). A stat shown
    sparkling in game is recorded as 252.
  - `evs: true, evTarget: true` (planned for Legends: Z-A): a target spread is planned too.
- **Check in a new game.** Whether EVs exist, whether they are easy to reset, how the game displays stats and EVs
  (so the entry method still makes sense), and whether there are vitamins, feathers or power items worth listing in
  the [catalog](#item-catalog). Put anything unusual in `evNote`, which is passed to the AI.

### Nature and Mints

- **What it does.** Records the Mint given to a Pokémon (the game then uses the Mint's nature effect, the real nature
  stays), with its own checklist state; the EV estimate takes it into account.
- **Gate.** The game's `catalog` has a section with id `mints` (`gameHasMints` in `src/lib/audit-ask.ts`). There is
  no flag.
- **Check in a new game.** Whether Mints (or something equivalent) exist.

### Tera and raids

- **Tera type** (`features.teraType`). A Tera type field on the roster card, in the AI audit, as a battle opponent's
  Tera type, and the Stellar type in the type pickers. Counters take a Tera'd opponent's single type into account and
  Tera Blast takes its type from the Tera type.
- **Tera raids** (`features.raids`). Battle opponents can be of the kind "Raid boss" with a star count; without the
  flag every opponent is a standard one.
- **Check in a new game.** Whether the game has Terastallization or a comparable mechanic. A different mechanic
  (Dynamax, Mega Evolution, Z-Moves) is **not** covered by these flags: it needs its own flag and UI.

### Judge and potential

- **What it does.** The overall Potential (decent ... outstanding) on the roster card and edit dialog, and a Judge's
  word per stat's IV on rosters and breeders. The ratings sharpen the EV estimate (a "no good" or "inmejorable" IV is
  a known number) and feed the breeding planner.
- **Gate.** `features.judge`.
- **Check in a new game.** Whether there is a Judge or other way to see IV quality, and the wording of the verdicts
  (the words in the app are Scarlet/Violet's: see `src/lib/iv-ratings.ts` and `src/lib/potential.ts`).

### Breeding

- **What it does.** The **Breeding** tab, with the **Breeders** view inside it. The assistant finds parents among
  breeders, roster and Pokédex, fathers that can pass an egg move, multi-generation chains, and the exact chance
  that every wanted IV is perfect (Destiny Knot, Power items, Everstone). A goal can ask for a nature and the hidden
  ability.
- **Gate.** `features.breeding`. Without it the tab is hidden, both pages return 404 and the API refuses.
- **Sub-features.**
  - `features.mirrorHerb`: the picnic shortcut for copying egg moves with a Mirror Herb.
  - `breedingForms`: evolutions only one form of the base species can make (Basculegion in Scarlet/Violet).
- **Check in a new game.** Egg groups and egg moves exist; which items pass IVs, a nature or a form (the engine
  assumes the Scarlet/Violet set: Destiny Knot, Power items, Everstone); whether the game has a way to copy egg
  moves; whether the hidden ability can be passed; any form-locked evolution.

### Battle

- **What it does.** Opponents (a trainer's Pokémon, a rival's moves, a raid boss) with type matchups, speed, the
  counters from your roster and from the game's Pokémon, a "best so far" pick, defeated state that freezes the
  matchups, and archiving.
- **Depends on the game.** Learnsets (`learnsetVersionGroups`), `features.raids`, `features.teraType` and
  `features.breeding` (a counter can offer to start a breeding plan for itself).
- **Check in a new game.** Mechanics that change damage or types (Dynamax, Mega Evolution, Z-Moves) are not modelled.

### Item catalog

- **What it does.** A **Catalog** button in the header with quick-reference sections (vitamins, power items,
  feathers, items that lower EVs, mints; for breeding: items held by the parents, Power items, Egg Power sandwiches).
  Sections have a `topic`: training sections show on training pages, breeding sections on the breeding pages.
- **Gate.** The game's `catalog` array. Today it is Scarlet/Violet's (`src/lib/games/catalog.ts`).
- **Check in a new game.** Which of these items exist and where to get them; write the new game's own sections.

### Where to find a Pokémon

- **What it does.** The Pokédex details dialog shows where to find a Pokémon, from a shared dictionary kept per
  version group (`pokemon_locations`). Looking it up is an AI web search (PokéAPI has no Generation 9 encounters), so
  it needs the user's own key.
- **Depends on the game.** `versionGroup` (games that share a map share answers), `locationNote` (how to describe
  places in this map: Paldea is open-world with fast travel), `src/lib/games/places.ts` (Spanish place names, written
  for Paldea, Kitakami and Blueberry).
- **Check in a new game.** Whether PokéAPI has encounter data for it (if so, the AI lookup may not be needed), the
  map layout for `locationNote`, and the Spanish place names.

### Look and names

- **Gate.** `theme` (cartridge and device colours, accent, screen hue, optional motif), `name`, `shortName`,
  `shortNameEs`. Games sold as a pair share everything else.
- **Also check** the landing page: `src/lib/landing.ts` builds a feature chip for each flag it knows (breeding, EVs,
  held items, Tera types, raids, Mirror Herb, Judge). A new flag does not show there until it is added.

## Adding a game, in order

1. Fill a column in the matrix above (use ❓ for anything not verified).
2. Add the game to `GAMES` in `src/lib/games/index.ts`, set every flag from the matrix.
3. Write the game-specific data the matrix marks 🔧: catalog, places, exclusives, breeding forms.
4. Add a migration that inserts the game's row and a profile (production never runs the seed), then run
   `npm run db:seed && npm run sync:pokeapi` locally.
5. Check the UI for each flag turned **off** (the page or control must be hidden, not broken), as Scarlet/Violet
   never exercise those paths.
6. Update this document: the matrix, and any new flag in [How to use this document](#how-to-use-this-document).

## Known gaps and Scarlet/Violet assumptions

Things that look generic but were written with Scarlet/Violet in mind. Check them when the first game that does not
share them arrives:

- `features.abilities` is declared but nothing reads it.
- `features.heldItems` is only read by the AI audit.
- `VARIANTS` in `src/lib/dex-variant.ts` knows four forms only.
- The Judge wording (`src/lib/iv-ratings.ts`, `src/lib/potential.ts`) and the breeding items are Scarlet/Violet's.
- `places.ts` and `catalog.ts` contain only Scarlet/Violet data.
- The type pickers add Stellar only when `teraType` is on.
- Rows in the matrix for mechanics the app does not model (Dynamax, Mega Evolution, Z-Moves, Pokémon-Amie style
  bonding) do not exist yet: add one when a game needs it.
