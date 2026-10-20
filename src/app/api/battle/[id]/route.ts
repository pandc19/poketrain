import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { checkOpponent, opponentError, UpdateBody } from '@/lib/battle/input';
import { loadOpponents } from '@/lib/battle/load';
import { getUserId } from '@/lib/current-user';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getGame } from '@/lib/games';

async function findOpponent(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return prisma.battleOpponent.findFirst({
    where: { id, profile: { userId: await getUserId() } },
    include: { profile: { select: { gameId: true } } },
  });
}

/** The opponent worked out again from the current roster. */
export async function GET(_request: Request, ctx: RouteContext<'/api/battle/[id]'>) {
  const { id } = await ctx.params;
  const current = await findOpponent(id);
  const game = current && getGame(current.profile.gameId);
  if (!current || !game) return apiError('Not found', 404);
  const [opponent] = await loadOpponents(game, current.profileId, [id]);
  return Response.json({ opponent });
}

export async function PATCH(request: Request, ctx: RouteContext<'/api/battle/[id]'>) {
  const { id } = await ctx.params;
  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid body', 400);
  const current = await findOpponent(id);
  const game = current && getGame(current.profile.gameId);
  if (!current || !game) return apiError('Not found', 404);

  // Another species makes the old form and ability meaningless unless they were sent again.
  const speciesChanged = parsed.data.speciesId != null && parsed.data.speciesId !== current.speciesId;
  const merged = {
    speciesId: parsed.data.speciesId ?? current.speciesId,
    formId: parsed.data.formId !== undefined ? parsed.data.formId : speciesChanged ? null : current.formId,
    kind: parsed.data.kind ?? current.kind,
    teraType: parsed.data.teraType !== undefined ? parsed.data.teraType : current.teraType,
    stars: parsed.data.stars !== undefined ? parsed.data.stars : current.stars,
    abilityId: parsed.data.abilityId !== undefined ? parsed.data.abilityId : speciesChanged ? null : current.abilityId,
    moveIds: parsed.data.moveIds ?? current.moveIds,
    label: parsed.data.label !== undefined ? parsed.data.label : current.label,
    notes: parsed.data.notes !== undefined ? parsed.data.notes : current.notes,
  };
  const checked = await checkOpponent(game, merged);
  if ('error' in checked) return opponentError(checked.error);

  const { archived, defeated, bestRosterId } = parsed.data;
  if (bestRosterId) {
    const owned = await prisma.rosterPokemon.findFirst({
      where: { id: bestRosterId, profileId: current.profileId },
      select: { id: true },
    });
    if (!owned) return apiError('Not in your roster', 400);
  }
  await prisma.battleOpponent.update({
    where: { id },
    data: {
      ...checked.data,
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
      ...(defeated === undefined ? {} : { defeatedAt: defeated ? new Date() : null }),
      // Anything but putting it away or restoring it re-works what a defeated opponent shows; it is
      // locked again as loaded. Marking it not defeated unlocks it.
      ...(Object.keys(parsed.data).some((k) => k !== 'archived') ? { frozen: Prisma.DbNull } : {}),
      ...(bestRosterId === undefined ? {} : { bestRosterId }),
    },
  });
  const [opponent] = await loadOpponents(game, current.profileId, [id]);
  return Response.json({ opponent });
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/battle/[id]'>) {
  const { id } = await ctx.params;
  const current = await findOpponent(id);
  if (!current) return apiError('Not found', 404);
  await prisma.battleOpponent.delete({ where: { id } });
  return Response.json({ ok: true });
}
