import { notFound, redirect } from 'next/navigation';
import { prisma } from './db';
import { getUser, getUserId } from './current-user';
import { getGame, type GameConfig } from './games';

/**
 * Resolves the `[game]` route segment to its config and the current user's profile. A game the account has not
 * added is not an error: someone logged in is taken to add it (with it chosen already), and a visitor, whose demo
 * does not have that game, back to the front page.
 */
export async function requireGameProfile(gameId: string): Promise<{ game: GameConfig; profileId: string }> {
  const game = getGame(gameId);
  if (!game) notFound();
  const user = await getUser();
  const profile = await prisma.gameProfile.findFirst({
    where: { userId: user.id, gameId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!profile) redirect(user.isDemo ? '/' : `/games/add?game=${encodeURIComponent(gameId)}`);
  return { game, profileId: profile.id };
}

/** Same lookup for route handlers, where a missing profile is a 404 body rather than a page. */
export async function findProfileId(gameId: string): Promise<string | null> {
  if (!getGame(gameId)) return null;
  const profile = await prisma.gameProfile.findFirst({
    where: { userId: await getUserId(), gameId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return profile?.id ?? null;
}
