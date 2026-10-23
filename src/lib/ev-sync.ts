import type { Prisma, PrismaClient } from '@prisma/client';
import { estimateEvRange } from './ev-estimate';
import { ivAssumption } from './potential';
import type { IvRatings } from './iv-ratings';
import type { EvSpread } from './import/evs';
import { legalPlan, planReached } from './ev-plan';
import { getGame } from './games';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Works the current EVs out from the stats the player entered (the numbers
 * on the game's blue graph), its level and its nature, and saves them. The
 * game only draws EVs as a shape, so the stats are the number you can read.
 * Does nothing when no stats are recorded.
 */
export async function recomputeEvsFromStats(db: Db, rosterId: string): Promise<void> {
  const row = await db.rosterPokemon.findUnique({
    where: { id: rosterId },
    select: {
      currentStats: true,
      level: true,
      speciesId: true,
      formId: true,
      currentNatureId: true,
      mintNatureId: true,
      mintStatus: true,
      statsNatureId: true,
      evs: true,
      targetNatureId: true,
      potential: true,
      ivRatings: true,
      maxedEvs: true,
      profile: { select: { gameId: true } },
    },
  });
  if (!row?.currentStats) return;

  const form = row.formId
    ? await db.form.findUnique({ where: { id: row.formId }, select: { baseStats: true } })
    : await db.form.findFirst({ where: { speciesId: row.speciesId, isDefault: true }, select: { baseStats: true } });
  if (!form) return;

  // The nature effect the stats were read under (a Mint given since does not change the numbers recorded);
  // when that is not known, the one in force now: a Mint's (once given), else the nature it has, else the one planned.
  const natureId =
    row.statsNatureId ?? (row.mintStatus === 'DONE' ? row.mintNatureId : null) ?? row.currentNatureId ?? row.targetNatureId;
  const nature = natureId
    ? await db.nature.findUnique({ where: { id: natureId }, select: { increased: true, decreased: true } })
    : null;

  // The fewest EVs that fit: judged stats are held to their IV band, the rest assume perfect IVs. The sparkles
  // the game shows settle which stats are full.
  const { estimate: evs } = estimateEvRange({
    stats: row.currentStats as unknown as EvSpread,
    level: row.level,
    baseStats: form.baseStats as unknown as EvSpread,
    nature,
    ivsLow: ivAssumption(row.potential).low,
    ratings: row.ivRatings as IvRatings | null,
    plan: row.evs as Partial<EvSpread> | null,
    maxed: row.maxedEvs as (keyof EvSpread)[] | null,
  });
  // Where EVs are hard to take back, the plan can only add to what the Pokémon has: if the stats now read
  // higher than the plan in a stat (it evolved, or leveled up), the plan is raised to match, and what that
  // costs comes off the least needed stat, as the audit does.
  const game = getGame(row.profile.gameId);
  const plan = row.evs as unknown as EvSpread | null;
  const raised = plan && game && game.features.evs && !game.features.evTarget ? legalPlan(plan, evs, true) : null;
  const planChanged = raised != null && JSON.stringify(raised) !== JSON.stringify(plan);
  await db.rosterPokemon.update({
    where: { id: rosterId },
    data: { currentEvs: evs, currentEvsEstimated: true, ...(planChanged ? { evs: raised } : {}) },
  });
}

/**
 * The EV task follows the training: done once the current EVs reach the
 * planned spread, pending again if they fall short (for example after a reset).
 * Does nothing without a plan or without known current EVs.
 */
export async function syncEvStatus(db: Db, rosterId: string): Promise<void> {
  const row = await db.rosterPokemon.findUnique({
    where: { id: rosterId },
    select: { evs: true, currentEvs: true, evStatus: true },
  });
  if (!row?.evs || !row.currentEvs) return;
  const status = planReached(row.evs as unknown as EvSpread, row.currentEvs as unknown as EvSpread) ? 'DONE' : 'PENDING';
  if (status !== row.evStatus) {
    await db.rosterPokemon.update({ where: { id: rosterId }, data: { evStatus: status } });
  }
}
