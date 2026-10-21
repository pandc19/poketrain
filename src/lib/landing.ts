import { GAMES, type GameConfig } from './games';
import type { Lang, TFunction } from './translate';

/** What the app does for a game because of how that game works. The picker draws an icon for each. */
export type FeatureKey = 'breeding' | 'evs' | 'items' | 'tera' | 'raids' | 'picnic' | 'judge';

/** One game as the landing page's picker shows it: everything already in the visitor's language. */
export type PickerGame = {
  id: string;
  name: string;
  shortName: string;
  generation: string;
  theme: GameConfig['theme'];
  /** Each Pokédex of the game, where it comes from, and how many Pokémon it lists (when the database knows). */
  pokedexes: { name: string; note: string; size: number | null }[];
  features: { key: FeatureKey; label: string }[];
  /** For a game sold as a pair: what the app tells you about the two versions. */
  versions: string | null;
  /** The demo has this game, so there is something to open. */
  inDemo: boolean;
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * The games the picker offers, read from the game config: the Pokédexes (with their sizes, which come from the
 * database), what the game has (breeding, EVs, Tera types…) and, for a pair, which Pokémon only one version has.
 * Nothing is written twice, so a game added to the config appears on the landing page by itself.
 */
export function pickerGames(
  lang: Lang,
  t: TFunction,
  sizes: ReadonlyMap<string, number> = new Map(),
  /** The games the demo has. Left out, every game counts as being in it. */
  demoGames?: ReadonlySet<string>,
  games: GameConfig[] = GAMES
): PickerGame[] {
  return games.map((g) => {
    const f = g.features;
    const features = [
      f.breeding && { key: 'breeding' as const, label: t('Breeding plans') },
      f.evs && { key: 'evs' as const, label: t('EV training') },
      f.heldItems && { key: 'items' as const, label: t('Held items') },
      f.teraType && { key: 'tera' as const, label: t('Tera types') },
      f.raids && { key: 'raids' as const, label: t('Tera raids') },
      f.mirrorHerb && { key: 'picnic' as const, label: t('Mirror Herb egg moves') },
      f.judge && { key: 'judge' as const, label: t('Judge’s IV ratings') },
    ].filter((x): x is { key: FeatureKey; label: string } => Boolean(x));
    return {
      id: g.id,
      name: g.name,
      shortName: g.shortName,
      generation: t('Generation {n}', { n: ROMAN[g.generation] ?? g.generation }),
      theme: g.theme,
      pokedexes: g.pokedexes.map((d) => ({ name: d.name[lang], note: d.note[lang], size: sizes.get(d.slug) ?? null })),
      features,
      versions: g.versionExclusives
        ? t('Marks the Pokémon only {own} has, and the ones you need {other} for.', { own: g.versionExclusives.ownName, other: g.versionExclusives.otherName })
        : null,
      inDemo: demoGames ? demoGames.has(g.id) : true,
    };
  });
}
