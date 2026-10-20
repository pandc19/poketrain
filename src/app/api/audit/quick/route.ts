import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { AiError } from '@/lib/ai';
import { quickAudit } from '@/lib/ai/tasks';
import { getUserId } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { recomputeEvsFromStats } from '@/lib/ev-sync';
import { getGame } from '@/lib/games';
import { getLang } from '@/lib/i18n';
import { loadRoster } from '@/lib/roster';

const Body = z.object({ rosterPokemonId: z.uuid() });

/** The audit made from game data alone: needs no AI, no key and costs nothing. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid body', 400);

  const row = await prisma.rosterPokemon.findFirst({
    where: { id: parsed.data.rosterPokemonId, profile: { userId: await getUserId() } },
    select: { profileId: true, currentEvsEstimated: true, profile: { select: { gameId: true } } },
  });
  const game = row && getGame(row.profile.gameId);
  if (!row || !game) return apiError('Not found', 404);

  // The EVs worked out from the stats are made again first, so the plan never starts from an out-of-date estimate.
  if (row.currentEvsEstimated) await recomputeEvsFromStats(prisma, parsed.data.rosterPokemonId);
  const [pokemon] = await loadRoster(row.profileId, [parsed.data.rosterPokemonId]);
  try {
    await quickAudit(game, await getLang(), row.profileId, pokemon);
  } catch (error) {
    if (error instanceof AiError) return apiError(error.message, 422, error.vars);
    throw error;
  }
  const [updated] = await loadRoster(row.profileId, [parsed.data.rosterPokemonId]);
  return Response.json({ pokemon: updated });
}
