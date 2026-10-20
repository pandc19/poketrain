import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { AiError, NO_AI_MESSAGE, getAiProvider } from '@/lib/ai';
import { researchLocation } from '@/lib/ai/tasks';
import { getUserId } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { getGame } from '@/lib/games';
import { getLang } from '@/lib/i18n';
import { findLocations } from '@/lib/locations';
import { pickLocation } from '@/lib/location-text';
import { findProfileId } from '@/lib/profile';

const Body = z.object({
  gameId: z.string(),
  speciesId: z.number().int().positive(),
  /** Research it again instead of using the saved answer. */
  refresh: z.boolean().default(false),
});

/**
 * Where to catch a Pokémon. PokéAPI has no encounter data for recent games, so a species nobody has
 * looked up yet goes to web research; the answer joins the shared dictionary for everyone.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid body', 400);
  const game = getGame(parsed.data.gameId);
  const profileId = await findProfileId(parsed.data.gameId);
  const species = await prisma.species.findUnique({ where: { id: parsed.data.speciesId }, select: { nameEn: true } });
  if (!game || !profileId || !species) return apiError('Not found', 404);

  const provider = getAiProvider();
  if (!provider) return apiError(NO_AI_MESSAGE, 503);
  try {
    const stored = await researchLocation(provider, game, await getUserId(), parsed.data.speciesId, species.nameEn, parsed.data.refresh);
    return Response.json({ result: pickLocation(stored, await getLang()) });
  } catch (error) {
    if (error instanceof AiError) return apiError(error.message, 502, error.vars);
    throw error;
  }
}

/** What the shared dictionary already has for a list of species. Needs no AI and makes no request to a model. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const game = getGame(params.get('gameId') ?? '');
  const ids = (params.get('speciesIds') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 100);
  if (!game || ids.length === 0) return Response.json({ results: {} });

  const lang = await getLang();
  const results: Record<number, unknown> = {};
  for (const [id, stored] of await findLocations(game, ids)) {
    const body = pickLocation(stored, lang);
    if (body) results[id] = body;
  }
  return Response.json({ results });
}
