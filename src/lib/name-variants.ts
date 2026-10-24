/**
 * The language a player's game is set to. It names moves, items and abilities when the app is in Spanish
 * (English shows English names): Spanish from Spain, or from Latin America, where some of them differ
 * ("Chuzos" in Spain is "Carámbano" in Latin America, and Spain's "Carámbano" is "Lanza de Hielo").
 */
export const GAME_LANGUAGES = ['es', 'es-419'] as const;
export type GameLanguage = (typeof GAME_LANGUAGES)[number];

/** Spain unless the value is Latin America. */
export const parseGameLanguage = (value: unknown): GameLanguage => (value === 'es-419' ? 'es-419' : 'es');

/** The names, with the dialect they are in: what a prompt tells a model, and what the setting calls it. */
export const GAME_LANGUAGE_NAMES: Record<GameLanguage, { en: string; es: string }> = {
  es: { en: 'Spanish (Spain)', es: 'Español (España)' },
  'es-419': { en: 'Spanish (Latin America)', es: 'Español (Latinoamérica)' },
};
