import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getGameLanguage } from './game-language';
import { applySpanishFixes, applySpanishNames } from './spanish-fixes';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  pgPool: Pool;
};

const pool =
  globalForPrisma.pgPool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

const base = new PrismaClient({
  adapter: new PrismaPg(pool),
  log: ['warn', 'error'],
});

/** The Latin American Spanish names by English name, read once (a sync refreshes them on the next start). */
let variants: Promise<Map<string, string>> | null = null;
const latinAmericanNames = () =>
  (variants ??= base.nameVariant.findMany().then(
    (rows) => new Map(rows.map((r) => [r.nameEn, r.nameEs419])),
    () => {
      variants = null;
      return new Map<string, string>();
    }
  ));

const create = () =>
  base.$extends({
    query: {
      // The game's Spanish name wins over PokéAPI's wherever names are read (see spanish-fixes.ts), and for a
      // player whose game is in Latin American Spanish, that dialect's name wins (see name-variants.ts).
      // Results stay plain objects, which the pages pass on to client components.
      $allModels: {
        async $allOperations({ args, query }) {
          const result = applySpanishFixes(await query(args));
          return (await getGameLanguage()) === 'es-419' ? applySpanishNames(result, await latinAmericanNames()) : result;
        },
      },
    },
  });

export const prisma = globalForPrisma.prisma || (create() as unknown as PrismaClient);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}
