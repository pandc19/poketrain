import type { GameLanguage } from '../name-variants';

/**
 * How a model writes Spanish: the dialect of the player's game language, so the names in its sentences are the
 * ones their game shows (Spain and Latin America call some moves and abilities differently).
 */
export const spanishRules = (names: GameLanguage) =>
  (names === 'es-419'
    ? 'Write every text field in Spanish from Latin America (español latinoamericano), in the plain and direct way a player would say it. ' +
      'In sentences, name Pokémon, moves, items (TMs, vitamins, berries, Mints), abilities, natures, types, towns, areas and fast-travel points exactly as the Spanish (Latin America) version of the game shows them, ' +
      'as the Spanish WikiDex lists them for Latin America (for example Carámbano for Icicle Crash, Lanza de Hielo for Icicle Spear, Alma Sanadora for Healer, Curación Pluvial for Rain Dish, Pokébola), ' +
      'never a translation of your own and never the names used in Spain. '
    : 'Write every text field in Spanish from Spain (español de España), in the plain and direct way a player would say it. ' +
      'In sentences, name Pokémon, moves, items (TMs, vitamins, berries, Mints), abilities, natures, types, towns, areas and fast-travel points exactly as the Spanish (Spain) version of the game shows them, ' +
      'as the Spanish WikiDex lists them (for example Roca Afilada, Cinta Elegida, Proteína, Firme, Intimidación), never a translation of your own. ') +
  'If you are not sure of the Spanish name, write the English one rather than inventing it. ' +
  'The only exception are fields that hold an identifier the app matches (the move, the item, the nature of a Mint, a Tera type and a Pokémon to look up): those stay in English exactly as the English game spells them.';
