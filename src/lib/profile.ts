import { notFound } from 'next/navigation';
import { prisma } from './db';
import { getUserId } from './current-user';
import { getGame, type GameConfig } from './games';

/** Resolves the `[game]` route segment to its config and the current user's profile. */
export async function requireGameProfile(gameId: string): Promise<{ game: GameConfig; profileId: string }> {
  const game = getGame(gameId);
  if (!game) notFound();
  const profile = await prisma.gameProfile.findFirst({
    where: { userId: await getUserId(), gameId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!profile) throw new Error(`No profile for game "${gameId}" -- run \`npm run db:seed\``);
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
