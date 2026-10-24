import { cookies } from 'next/headers';
import { prisma } from '../db';
import { GAME_LANG_COOKIE, gameLanguageCookie } from '../game-language';
import { parseGameLanguage } from '../name-variants';
import { createSession, deleteSession } from './accounts';
import { SEEN_COOKIE, SESSION_COOKIE, sessionCookieOptions } from './cookie';

/** Logs a user in: a new session, and its cookie. */
export async function startSession(userId: string): Promise<void> {
  const token = await createSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  jar.set(SEEN_COOKIE, String(Date.now()), sessionCookieOptions());
  // Names follow the language their game is set to, wherever they log in from.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gameLanguage: true } });
  jar.set(GAME_LANG_COOKIE, parseGameLanguage(user?.gameLanguage), gameLanguageCookie);
}

/** Logs out: ends the session and clears its cookie. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(SESSION_COOKIE);
  jar.delete(SEEN_COOKIE);
  jar.delete(GAME_LANG_COOKIE);
}
