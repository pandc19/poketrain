import { GAMES, type GameConfig } from './games';
import type { Lang, TFunction } from './translate';

/** One game as the landing page's picker shows it: everything already in the visitor's language. */
export type PickerGame = {
  id: string;
  name: string;
  shortName: string;
  generation: string;
  theme: GameConfig['theme'];
  pokedexes: { name: string; note: string }[];
  /** What the game's mechanics let the app do, as plain phrases to run into a sentence. */
  features: string[];
  /** For a game sold as a pair: what the app tells you about the two versions. */
  versions: string | null;
};

/**
 * A phrase to run into a sentence: in Spanish a word that is only capitalised because it started a heading
 * ("Teratipos") is lower case in the middle of a sentence. English keeps its capitals, which are mostly names
 * ("EV", "Tera").
 */
const inSentence = (text: string, lang: Lang) => (lang === 'es' && /^\p{Lu}\p{Ll}/u.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * The games the picker offers, read from the game config: the Pokédexes, what the game has (breeding, EVs, Tera
 * types…) and, for a pair, which Pokémon only one version has. Nothing is written twice, so a game added to the
 * config appears on the landing page by itself.
 */
export function pickerGames(lang: Lang, t: TFunction, games: GameConfig[] = GAMES): PickerGame[] {
  return games.map((g) => {
    const f = g.features;
    const features = [
      f.breeding && t('breeding plans'),
      f.evs && t('EV training'),
      f.heldItems && t('held items'),
      f.teraType && t('Tera types'),
      f.raids && t('Tera raids'),
      f.mirrorHerb && t('egg moves with the Mirror Herb'),
      f.judge && t('the Judge’s IV ratings'),
    ]
      .filter((x): x is string => Boolean(x))
      .map((x) => inSentence(x, lang));
    return {
      id: g.id,
      name: g.name,
      shortName: g.shortName,
      generation: t('Generation {n}', { n: ROMAN[g.generation] ?? g.generation }),
      theme: g.theme,
      pokedexes: g.pokedexes.map((d) => ({ name: d.name[lang], note: d.note[lang] })),
      features,
      versions: g.versionExclusives
        ? t('Marks the Pokémon only {own} has, and the ones you need {other} for.', { own: g.versionExclusives.ownName, other: g.versionExclusives.otherName })
        : null,
    };
  });
}
