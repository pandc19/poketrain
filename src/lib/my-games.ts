import { prisma } from './db';
import { GAMES, type GameConfig } from './games';

/**
 * Games sold as a pair (Scarlet and Violet) together, in the order of the config, each group once. A game with no
 * pair is a group of one. Used wherever games are offered, so a pair is always one thing with two versions.
 */
export function groupGames(games: GameConfig[] = GAMES): GameConfig[][] {
  const groups: GameConfig[][] = [];
  const placed = new Set<string>();
  for (const game of games) {
    if (placed.has(game.id)) continue;
    const pair = game.pair ? games.find((g) => g.id === game.pair) : undefined;
    const group = pair ? [game, pair] : [game];
    for (const g of group) placed.add(g.id);
    groups.push(group);
  }
  return groups;
}

/** The ids of the games an account has a save for, in the order of the config. */
export async function ownedGameIds(userId: string): Promise<string[]> {
  const rows = await prisma.gameProfile.findMany({ where: { userId }, select: { gameId: true }, distinct: ['gameId'] });
  const owned = new Set(rows.map((r) => r.gameId));
  return GAMES.filter((g) => owned.has(g.id)).map((g) => g.id);
}

/**
 * Gives an account a save for each of these games that it does not have yet, and returns the ones it did add.
 * Ids that are not a game are ignored. Each game's save is kept apart: Scarlet and Violet are two saves, as in
 * the games.
 */
export async function addGames(userId: string, gameIds: string[]): Promise<string[]> {
  const wanted = GAMES.filter((g) => gameIds.includes(g.id)).map((g) => g.id);
  const have = new Set(await ownedGameIds(userId));
  const added = wanted.filter((id) => !have.has(id));
  if (added.length === 0) return [];
  await prisma.gameProfile.createMany({ data: added.map((gameId) => ({ userId, gameId, name: 'Main save' })), skipDuplicates: true });
  return added;
}
