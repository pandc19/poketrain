import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { userForToken } from './auth/accounts';
import { SESSION_COOKIE } from './auth/cookie';
import { DEMO_USER_ID } from './constants';
import { parseGameLanguage, type GameLanguage } from './name-variants';

export type CurrentUser = {
  id: string;
  name: string;
  lastName: string;
  email: string | null;
  role: 'ADMIN' | 'USER';
  /** The language their game is set to (names of moves, items and abilities in Spanish). */
  gameLanguage: GameLanguage;
  /** Nobody is logged in: this is the shared demo. */
  isDemo: boolean;
};

const DEMO: CurrentUser = { id: DEMO_USER_ID, name: 'Demo', lastName: '', email: null, role: 'USER', gameLanguage: 'es', isDemo: true };

/** Who is using the app: the logged-in user, or else the demo. Looked up once per request. */
export const getUser = cache(async (): Promise<CurrentUser> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? await userForToken(token) : null;
  return user ? { ...user, gameLanguage: parseGameLanguage(user.gameLanguage), isDemo: false } : DEMO;
});

/**
 * The user whose data this request reads and writes. Every query that is scoped to a user goes through here.
 * The demo is a user like any other, so its visitors can edit it.
 */
export async function getUserId(): Promise<string> {
  return (await getUser()).id;
}

/** For pages and actions only the admin may use: anyone else gets a 404, as if the page did not exist. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getUser();
  if (user.role !== 'ADMIN' || user.isDemo) notFound();
  return user;
}
