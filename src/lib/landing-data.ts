import { prisma } from './db';
import { GAMES } from './games';

let cached: Promise<Map<string, number>> | null = null;

/**
 * How many Pokémon each Pokédex of the games lists, by slug. A Pokédex the game cuts short (Blueberry's ends at 240)
 * counts only up to there. It is reference data that only changes when the game data is synced, so it is read once
 * per server run. An empty database gives an empty map, and the landing page simply leaves the sizes out.
 */
export function pokedexSizes(): Promise<Map<string, number>> {
  cached ??= (async () => {
    const sizes = new Map<string, number>();
    const dexes = new Map(GAMES.flatMap((g) => g.pokedexes).map((d) => [d.slug, d.lastEntry] as const));
    for (const [slug, lastEntry] of dexes) {
      const count = await prisma.pokedexSlot.count({
        where: { pokedex: { slug }, ...(lastEntry ? { entryNumber: { lte: lastEntry } } : {}) },
      });
      if (count > 0) sizes.set(slug, count);
    }
    return sizes;
  })().catch(() => {
    // The page works without the sizes: try again next time rather than keep a failure.
    cached = null;
    return new Map<string, number>();
  });
  return cached;
}
