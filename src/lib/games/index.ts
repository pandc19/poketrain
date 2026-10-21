import type { Localized } from '../translate';
import { type CatalogSection, SCARLET_VIOLET_BREEDING_CATALOG, SCARLET_VIOLET_CATALOG } from './catalog';
import { scarletVioletExclusives, type VersionExclusives } from './exclusives';

export type { VersionExclusives } from './exclusives';

/**
 * Per-game configuration: the single extension point for adding a game.
 * A new game is a new entry here plus `npm run db:seed && npm run sync:pokeapi` locally. Production
 * never runs the seed, so the same PR adds a migration that inserts the game's row and a profile.
 */
export type GameConfig = {
  /** Also the PokéAPI version name ('violet'), which Pokédex text is tagged with. */
  id: string;
  /** For games sold as a pair, the other version's id. */
  pair?: string;
  name: string;
  shortName: string;
  generation: number;
  /** Primary PokéAPI version group. */
  versionGroup: string;
  /** Every version group whose learnsets count as legal (base game + DLC). */
  learnsetVersionGroups: string[];
  /** PokéAPI pokedex slugs, in display order. `note` says where the dex comes from. */
  pokedexes: {
    slug: string;
    name: Localized;
    note: Localized;
    /**
     * Species this Pokédex lists as their regional form (Alolan, Galarian, Hisuian), shown and
     * tracked apart from the normal one. Every other species is its own normal form.
     */
    regionalSpecies?: number[];
    /** The game's own Pokédex ends here; PokéAPI lists a few extra species after it. */
    lastEntry?: number;
  }[];
  /**
   * A tab listing the regional forms (Alolan, Galarian, Hisuian) of every species the game has,
   * numbered or not, so one accepted from Pokémon HOME that no Pokédex lists can still be registered.
   * Caught state is shared with the Pokédex that does list it.
   */
  extraForms?: {
    name: Localized;
    note: Localized;
    /** Species from Hisui with no regional form that the game accepts, whether or not a Pokédex lists them. */
    hisuiSpecies: number[];
  };
  /** The game has a National Dex. Scarlet/Violet do not: only their regional Pokédexes. */
  nationalDex: boolean;
  features: {
    breeding: boolean;
    /** EV training exists. When false the app hides EVs and the AI gives no EV advice. */
    evs: boolean;
    /**
     * EVs are easy to reset and retrain (as in Legends: Z-A), so a target spread is worth planning.
     * When false the player just records the current EVs and the AI works with them.
     */
    evTarget: boolean;
    heldItems: boolean;
    abilities: boolean;
    teraType: boolean;
    /** Has raid battles against a boss (Tera raids in Scarlet/Violet), so the Battle page offers a raid kind. */
    raids: boolean;
    /** Egg moves can be copied at a picnic with a Mirror Herb (Scarlet/Violet). */
    mirrorHerb: boolean;
    /** Has a Judge ("Juez") that rates a Pokémon's potential. */
    judge: boolean;
  };
  /** Quick-reference sections for this game (berries, items...), shown from the header. */
  catalog: CatalogSection[];
  /**
   * The game's colours. `from` and `to` paint its cartridge in the game selector and the shell of the
   * device in the header (`to` is the shell's darker edge). `accent` marks what is selected on the
   * dark screen and `lightAccent` on the light one, where a pale accent would not read.
   * `screenHue` is the OKLCH hue that tints the screen behind every page, dark or light (265 is a plain blue).
   * `motif` is a faint pattern on the shell: 'future' circuit traces (Violet, Miraidon) or 'ancient'
   * carved steps (Scarlet, Koraidon); none when left out.
   */
  theme: { from: string; to: string; accent: string; lightAccent: string; screenHue: number; motif?: GameMotif };
  /** For games sold as a pair: what only this version and only the other version have. */
  versionExclusives?: VersionExclusives;
  /**
   * How EV training works here, when it is unusual (a different system, or very hard).
   * Passed to the AI so it does not assume the usual rules.
   */
  evNote?: string;
  /**
   * How to describe where a Pokémon is found, when the map works in a particular
   * way (open world with fast travel, several maps...). Passed to the AI as guidance on the
   * format of the answer, not as facts about locations.
   */
  locationNote?: string;
};

/** A pattern for the shell in the header (see `.dex-motif` in globals.css). */
export type GameMotif = 'future' | 'ancient';

/**
 * Scarlet and Violet share everything (map, Pokédexes, learnsets, mechanics) except their version
 * exclusives and their look.
 */
function scarletViolet(version: 'scarlet' | 'violet', theme: GameConfig['theme']): GameConfig {
  const other = version === 'violet' ? 'scarlet' : 'violet';
  const name = version === 'violet' ? 'Violet' : 'Scarlet';
  return {
    id: version,
    pair: other,
    name: `Pokémon ${name}`,
    shortName: name,
    generation: 9,
    versionGroup: 'scarlet-violet',
    learnsetVersionGroups: ['scarlet-violet', 'the-teal-mask', 'the-indigo-disk'],
    pokedexes: [
      { slug: 'paldea', name: { en: 'Paldea', es: 'Paldea' }, note: { en: 'Base game', es: 'Juego base' } },
      { slug: 'kitakami', name: { en: 'Kitakami', es: 'Noroteo' }, note: { en: 'DLC: The Teal Mask', es: 'DLC: La Máscara Turquesa' } },
      {
        slug: 'blueberry',
        name: { en: 'Blueberry', es: 'Arándano' },
        note: { en: 'DLC: The Indigo Disk', es: 'DLC: El Disco Índigo' },
        // Alolan Sandshrew/Sandslash, Vulpix/Ninetales, Diglett/Dugtrio, Geodude line, Grimer/Muk, Exeggutor;
        // Galarian Slowpoke/Slowbro/Slowking; Hisuian Qwilfish.
        regionalSpecies: [27, 28, 37, 38, 50, 51, 74, 75, 76, 88, 89, 103, 79, 80, 199, 211],
        lastEntry: 240,
      },
    ],
    nationalDex: false,
    extraForms: {
      // Wyrdeer and Sneasler evolve from Stantler and Hisuian Sneasel.
      hisuiSpecies: [899, 903],
      name: { en: 'Regional forms', es: 'Formas regionales' },
      note: { en: 'Alolan, Galarian and Hisuian forms of the Pokémon in this game, numbered or not. Marking one here marks it in its Pokédex too', es: 'Formas de Alola, Galar y Hisui de los Pokémon de este juego, con número o sin él. Marcar una aquí la marca también en su Pokédex' },
    },
    features: {
      breeding: true,
      evs: true,
      evTarget: false,
      heldItems: true,
      abilities: true,
      teraType: true,
      raids: true,
      mirrorHerb: true,
      judge: true,
    },
    theme,
    catalog: [...SCARLET_VIOLET_CATALOG, ...SCARLET_VIOLET_BREEDING_CATALOG],
    locationNote:
      'Paldea is one open map and you can fast travel almost anywhere, so for each place give the area and the nearest fast-travel point, town or landmark to travel to. ' +
      'Kitakami and Blueberry Academy are separate DLC maps: say which map it is, and the nearest region of that map.',
    versionExclusives: scarletVioletExclusives(version),
  };
}

/** In display order. The first one is where `/` goes. */
export const GAMES: GameConfig[] = [
  scarletViolet('violet', { from: '#7c3aed', to: '#4c1d95', accent: '#c4b5fd', lightAccent: '#6d28d9', screenHue: 290, motif: 'future' }),
  scarletViolet('scarlet', { from: '#dc2626', to: '#7f1d1d', accent: '#fca5a5', lightAccent: '#b91c1c', screenHue: 25, motif: 'ancient' }),
];

export const NATIONAL_DEX_SLUG = 'national';
export const EXTRA_DEX_SLUG = 'extra';

export function getGame(id: string): GameConfig | undefined {
  return GAMES.find((g) => g.id === id);
}

/**
 * Query filter for the Pokédexes a game lists. Games and Pokédexes are linked here, by slug, rather
 * than in the database, so paired games (Scarlet and Violet) can share the same Pokédexes.
 */
export function gameDexes(gameId: string): { slug: { in: string[] } } {
  return { slug: { in: getGame(gameId)?.pokedexes.map((d) => d.slug) ?? [] } };
}

/** Where a Pokédex sits in the game's list, for ordering. One the game does not list goes last. */
export function dexPosition(gameId: string, slug: string): number {
  const i = getGame(gameId)?.pokedexes.findIndex((d) => d.slug === slug) ?? -1;
  return i === -1 ? 999 : i;
}
