import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { getUserId } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { findProfileId } from '@/lib/profile';
import { TRAINING_STATS, loadTeam } from '@/lib/team';

const Body = z.object({
  gameId: z.string(),
  slot: z.number().int().min(1).max(6),
  /** The roster Pokémon to put in the slot, or null to empty it. */
  rosterPokemonId: z.uuid().nullable(),
});

const Training = z.object({
  gameId: z.string(),
  /** The stat being trained, or null for none. */
  trainingStat: z.enum(TRAINING_STATS).nullable(),
});

/** Chooses the stat the team is being trained in (or none). */
export async function PATCH(request: Request) {
  const parsed = Training.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid body', 400);
  const profileId = await findProfileId(parsed.data.gameId);
  if (!profileId) return apiError('Unknown game', 404);
  await prisma.gameProfile.update({ where: { id: profileId }, data: { trainingStat: parsed.data.trainingStat } });
  return Response.json({ trainingStat: parsed.data.trainingStat });
}

/** Puts a roster Pokémon in a team slot (swapping places when it is already in the team), or empties the slot. */
export async function PUT(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid body', 400);
  const { gameId, slot, rosterPokemonId } = parsed.data;
  const profileId = await findProfileId(gameId);
  if (!profileId) return apiError('Unknown game', 404);

  if (rosterPokemonId) {
    const mine = await prisma.rosterPokemon.findFirst({
      where: { id: rosterPokemonId, profileId, profile: { userId: await getUserId() } },
      select: { id: true },
    });
    if (!mine) return apiError('Not found', 404);
  }

  await prisma.$transaction(async (tx) => {
    const occupant = await tx.teamSlot.findUnique({ where: { profileId_slot: { profileId, slot } } });
    const moving = rosterPokemonId ? await tx.teamSlot.findUnique({ where: { rosterPokemonId } }) : null;
    // Free the slot and the Pokémon's old place first (both are unique), then fill them again.
    if (occupant) await tx.teamSlot.delete({ where: { id: occupant.id } });
    if (moving && moving.id !== occupant?.id) await tx.teamSlot.delete({ where: { id: moving.id } });
    if (rosterPokemonId) await tx.teamSlot.create({ data: { profileId, slot, rosterPokemonId } });
    // Taking a Pokémon from another slot: whoever was here goes there.
    if (occupant && moving && moving.id !== occupant.id) {
      await tx.teamSlot.create({ data: { profileId, slot: moving.slot, rosterPokemonId: occupant.rosterPokemonId } });
    }
    // Emptying a slot closes the gap: the ones after it move up one place each, in order.
    if (!rosterPokemonId) {
      const rest = await tx.teamSlot.findMany({ where: { profileId }, orderBy: { slot: 'asc' } });
      for (const [i, row] of rest.entries()) {
        if (row.slot !== i + 1) await tx.teamSlot.update({ where: { id: row.id }, data: { slot: i + 1 } });
      }
    }
  });
  return Response.json({ team: await loadTeam(profileId) });
}
