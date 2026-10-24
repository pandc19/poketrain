import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { parseGameLanguage, type GameLanguage } from './name-variants';

/**
 * The player's game language, kept in a cookie like the app language. It is the saved setting (on the user) copied
 * here when they choose it and when they log in, so that names can follow it wherever they are read (see db.ts).
 */
export const GAME_LANG_COOKIE = 'game_lang';

/** Spain outside a request (scripts), and for anyone who has not chosen. */
export async function getGameLanguage(): Promise<GameLanguage> {
  try {
    return parseGameLanguage((await cookies()).get(GAME_LANG_COOKIE)?.value);
  } catch (error) {
    unstable_rethrow(error);
    return 'es';
  }
}

export const gameLanguageCookie = {
  maxAge: 60 * 60 * 24 * 365,
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};
