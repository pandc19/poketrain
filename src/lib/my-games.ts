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

export type GameData = { gameId: string; pokedexEntries: number; roster: number; breedingGoals: number; opponents: number };

/** What an account has saved in each game it has, to show what removing a game would take with it. */
export async function gameDataOf(userId: string): Promise<GameData[]> {
  const profiles = await prisma.gameProfile.findMany({
    where: { userId },
    select: { gameId: true, _count: { select: { pokedexEntries: true, roster: true, breedingGoals: true, opponents: true } } },
  });
  return GAMES.flatMap((g) => {
    const mine = profiles.filter((p) => p.gameId === g.id);
    if (mine.length === 0) return [];
    const sum = (key: 'pokedexEntries' | 'roster' | 'breedingGoals' | 'opponents') => mine.reduce((n, p) => n + p._count[key], 0);
    return [{ gameId: g.id, pokedexEntries: sum('pokedexEntries'), roster: sum('roster'), breedingGoals: sum('breedingGoals'), opponents: sum('opponents') }];
  });
}

/** Whether what was typed to confirm a removal is the game's short name, in either language (capitals and spaces around it do not matter). */
export const confirmsRemoval = (typed: string, game: GameConfig): boolean =>
  [game.shortName, game.shortNameEs].some((name) => typed.trim().toLowerCase() === name.toLowerCase());

/**
 * Deletes this account's saves of one game, and with them everything under them (Pokédex, roster, team, breeding
 * plans, opponents, saved AI answers). Only this account's rows and only this game's: nothing of another game or
 * another account is touched. Returns how many saves went (0 if it had none).
 */
export async function removeGame(userId: string, gameId: string): Promise<number> {
  const { count } = await prisma.gameProfile.deleteMany({ where: { userId, gameId } });
  return count;
}
