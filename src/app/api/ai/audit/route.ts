import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { AiError, NO_AI_MESSAGE } from '@/lib/ai';
import { getAiProviderFor } from '@/lib/ai/user-provider';
import { auditBuild } from '@/lib/ai/tasks';
import { getUser } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { recomputeEvsFromStats } from '@/lib/ev-sync';
import { getGame } from '@/lib/games';
import { getLang } from '@/lib/i18n';
import { loadRoster } from '@/lib/roster';

const Body = z.object({
  rosterPokemonId: z.uuid(),
  refresh: z.boolean().default(false),
  /** Use the stronger escalation model instead of the everyday one. */
  deep: z.boolean().default(false),
});

/** Runs (or returns the cached) AI audit of one roster build. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid body', 400);

  // Hiding the button is not the guard: without a key of their own (or AI given by the admin) nothing is asked.
  const user = await getUser();
  const provider = await getAiProviderFor(user);
  if (!provider) return apiError(NO_AI_MESSAGE, 403);

  const row = await prisma.rosterPokemon.findFirst({
    where: { id: parsed.data.rosterPokemonId, profile: { userId: user.id } },
    select: { profileId: true, currentEvsEstimated: true, profile: { select: { gameId: true } } },
  });
  const game = row && getGame(row.profile.gameId);
  if (!row || !game) return apiError('Not found', 404);

  // The EVs worked out from the stats are made again first, so an audit never plans from an out-of-date estimate.
  if (row.currentEvsEstimated) await recomputeEvsFromStats(prisma, parsed.data.rosterPokemonId);
  const [pokemon] = await loadRoster(row.profileId, [parsed.data.rosterPokemonId]);
  try {
    await auditBuild(provider, game, await getLang(), row.profileId, pokemon, parsed.data.refresh, parsed.data.deep);
  } catch (error) {
    if (error instanceof AiError) return apiError(error.message, 502, error.vars);
    throw error;
  }
  const [updated] = await loadRoster(row.profileId, [parsed.data.rosterPokemonId]);
  return Response.json({ pokemon: updated });
}
