import type { Lang } from './i18n';

/** A Pokémon that can pass an egg move on: it knows the move, and the game has it (or the player does). */
export type Teacher = {
  nameEn: string;
  nameEs: string;
  /** One of the player's own Pokémon that has learned the move. */
  owned: boolean;
  /** It can be bred (not a legendary or paradox with no egg group), so it can be at a picnic with a Mirror Herb or in a nursery. */
  breeds: boolean;
  /** The Pokédex of the game it is found in, first the base game's: tells a DLC Pokémon from a base game one. */
  inBaseGame: boolean;
  /** Where it is found when that is not the base game, e.g. "DLC: The Teal Mask". */
  where: string | null;
};

/** The few worth naming: the player's own first, then base game ones, then ones that breed, then by name. */
export function chooseTeachers(teachers: Teacher[], max = 3): Teacher[] {
  return [...teachers]
    .sort(
      (a, b) =>
        Number(b.owned) - Number(a.owned) ||
        Number(b.inBaseGame) - Number(a.inBaseGame) ||
        Number(b.breeds) - Number(a.breeds) ||
        a.nameEn.localeCompare(b.nameEn)
    )
    .slice(0, max);
}

/**
 * How to get an egg move the Pokémon does not have: a picnic with a Mirror Herb held and a Pokémon that
 * already knows the move. Said once for each move, in the audit's language.
 */
export function eggMoveHint(lang: Lang, herb: string, teachers: Teacher[]): string {
  const names = chooseTeachers(teachers).map((t) => {
    const name = lang === 'en' ? t.nameEn : t.nameEs;
    if (t.owned) return lang === 'en' ? `${name} (yours)` : `${name} (el tuyo)`;
    return t.where ? `${name} (${t.where})` : name;
  });
  return lang === 'en'
    ? `Egg move: hold a ${herb} at a picnic with a Pokémon that already knows it, such as ${names.join(', ')}.`
    : `Movimiento huevo: llévale la ${herb} a un picnic con un Pokémon que ya lo sepa, como ${names.join(', ')}.`;
}
