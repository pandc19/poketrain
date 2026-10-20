import { prisma } from '../db';
import type { GameConfig } from '../games';

type Named = {
  id: number;
  slug: string;
  nameEn: string;
  nameEs: string;
  type: string;
  damageClass: string;
  power: number | null;
  accuracy: number | null;
};

export type LearnableMoves = {
  /** Egg moves that the Pokémon cannot learn any other way: these need breeding. */
  egg: Named[];
  /** Everything else it can have: level-up, TMs and tutors, from its own line. */
  other: Named[];
};

/**
 * The moves a species can legally have in a game, split into the ones that
 * need breeding and the ones it learns normally. A species inherits what its
 * pre-evolutions learn, which is also what an egg hatches knowing.
 */
export async function learnableMoves(game: GameConfig, speciesId: number): Promise<LearnableMoves> {
  const species = await prisma.species.findMany({ select: { id: true, evolvesFromId: true } });
  const parent = new Map(species.map((s) => [s.id, s.evolvesFromId]));
  const line: number[] = [];
  for (let cur: number | null | undefined = speciesId; cur != null && !line.includes(cur); cur = parent.get(cur)) {
    line.push(cur);
  }

  const rows = await prisma.learnset.findMany({
    where: { form: { speciesId: { in: line } }, versionGroup: { in: game.learnsetVersionGroups } },
    select: { moveId: true, method: true },
    distinct: ['moveId', 'method'],
  });

  const natural = new Set<number>();
  const egg = new Set<number>();
  for (const r of rows) (r.method === 'egg' ? egg : natural).add(r.moveId);
  // A move it also learns normally needs no breeding, which is how the planner treats it.
  for (const id of natural) egg.delete(id);

  const moves = await prisma.move.findMany({
    where: { id: { in: [...egg, ...natural] } },
    select: { id: true, slug: true, nameEn: true, nameEs: true, type: true, damageClass: true, power: true, accuracy: true },
    orderBy: { nameEn: 'asc' },
  });
  return {
    egg: moves.filter((m) => egg.has(m.id)),
    other: moves.filter((m) => natural.has(m.id)),
  };
}
