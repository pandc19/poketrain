import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { IV_STATS } from '@/lib/breeding/engine';
import { loadGoals } from '@/lib/breeding/goals';
import { getUserId } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { getGame } from '@/lib/games';

/** Anything of a plan can change: what it is a plan for. */
const Body = z.object({
  speciesId: z.number().int().positive().optional(),
  moveIds: z.array(z.number().int().positive()).max(4).optional(),
  ivTargets: z.array(z.enum(IV_STATS)).max(6).optional(),
  natureId: z.number().int().positive().nullable().optional(),
  hiddenAbility: z.boolean().optional(),
});

async function findGoal(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return prisma.breedingGoal.findFirst({
    where: { id, profile: { userId: await getUserId() } },
    include: { profile: { select: { gameId: true } } },
  });
}

export async function PATCH(request: Request, ctx: RouteContext<'/api/breeding/[id]'>) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid body', 400);
  const goal = await findGoal(id);
  const game = goal && getGame(goal.profile.gameId);
  if (!goal || !game) return apiError('Not found', 404);

  const { speciesId, moveIds, ivTargets, natureId, hiddenAbility } = parsed.data;
  if (speciesId != null && !(await prisma.species.findUnique({ where: { id: speciesId }, select: { id: true } }))) {
    return apiError('Unknown Pokémon', 404);
  }
  await prisma.breedingGoal.update({
    where: { id },
    data: {
      speciesId,
      moveIds: moveIds ? [...new Set(moveIds)] : undefined,
      ivTargets: ivTargets ? [...new Set(ivTargets)] : undefined,
      natureId,
      hiddenAbility,
    },
  });
  const [view] = await loadGoals(game, goal.profileId, [id]);
  return Response.json({ goal: view });
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/breeding/[id]'>) {
  const { id } = await ctx.params;
  const goal = await findGoal(id);
  if (!goal) return apiError('Not found', 404);
  await prisma.breedingGoal.delete({ where: { id } });
  return Response.json({ ok: true });
}
