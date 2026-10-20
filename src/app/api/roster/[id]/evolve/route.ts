import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { getUserId } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { variantOfSlug } from '@/lib/dex-variant';
import { rosterGenderToPokedex } from '@/lib/gender-sync';
import { getGame } from '@/lib/games';
import { recomputeEvsFromStats, syncEvStatus } from '@/lib/ev-sync';
import { loadRoster, refreshLegality } from '@/lib/roster';

const named = { id: true, nameEn: true, nameEs: true } as const;

async function findBreeder(rosterId: string) {
  if (!z.uuid().safeParse(rosterId).success) return null;
  return prisma.rosterPokemon.findFirst({
    where: { id: rosterId, profile: { userId: await getUserId() } },
    include: {
      profile: { select: { gameId: true } },
      form: { select: { slug: true } },
      roles: { select: { role: true } },
      species: { select: { ...named, evolvesFromId: true } },
    },
  });
}

/** Every other stage of its line that exists in the game: the ones before (nearest first) and after. */
async function stagesOf(gameId: string, speciesId: number, evolvesFromId: number | null) {
  const inGame = { pokedexSlots: { some: { pokedex: { gameId } } } };
  const before: { id: number; nameEn: string; nameEs: string }[] = [];
  for (let from = evolvesFromId, guard = 0; from != null && guard < 5; guard++) {
    const sp = await prisma.species.findUnique({ where: { id: from }, select: { ...named, evolvesFromId: true } });
    if (!sp) break;
    if (await prisma.species.count({ where: { id: sp.id, ...inGame } })) before.push({ id: sp.id, nameEn: sp.nameEn, nameEs: sp.nameEs });
    from = sp.evolvesFromId;
  }
  const after: { id: number; nameEn: string; nameEs: string }[] = [];
  let level = [speciesId];
  for (let guard = 0; level.length > 0 && guard < 5; guard++) {
    const next = await prisma.species.findMany({
      where: { evolvesFromId: { in: level }, ...inGame },
      select: named,
      orderBy: { id: 'asc' },
    });
    after.push(...next);
    level = next.map((n) => n.id);
  }
  return { before, after };
}

/** Which stages it can be switched to, and which one it is meant to end as, so the page can offer them. */
export async function GET(_request: Request, ctx: RouteContext<'/api/roster/[id]/evolve'>) {
  const { id } = await ctx.params;
  const current = await findBreeder(id);
  if (!current) return apiError('Not found', 404);
  const stages = await stagesOf(current.profile.gameId, current.speciesId, current.species.evolvesFromId);
  return Response.json({ ...stages, finalSpeciesId: current.finalSpeciesId });
}

const Body = z
  .object({
    /** Switch to this stage (it evolved in the game, or it was recorded at the wrong one). */
    speciesId: z.number().int().positive().optional(),
    /** The stage it is meant to end as; null (or the stage it is at) = the stage it is at is the final one. */
    finalSpeciesId: z.number().int().positive().nullable().optional(),
  })
  .refine((b) => b.speciesId !== undefined || b.finalSpeciesId !== undefined);

/**
 * Moves a Pokémon to another stage of its line (it evolved in the game, or you caught a Slakoth with better
 * IVs than your Slaking), and/or says which stage it is meant to end as. Moves, IVs, nature and the rest
 * stay; the species, form and, if it no longer fits, the ability change. The EVs are read again from the
 * recorded stats with the new stage's base stats. The Pokédex only gains the new stage if it was not
 * registered yet.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/roster/[id]/evolve'>) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid body', 400);
  const current = await findBreeder(id);
  const game = current && getGame(current.profile.gameId);
  if (!current || !game) return apiError('Not found', 404);

  const { before, after } = await stagesOf(game.id, current.speciesId, current.species.evolvesFromId);
  const wanted = parsed.data.speciesId ?? current.speciesId;
  const target = wanted === current.speciesId ? null : [...before, ...after].find((s) => s.id === wanted);
  if (wanted !== current.speciesId && !target) return apiError('That is not a stage of this Pokémon’s line', 400);

  // Where the line ends: what was asked for, or what it was already aiming at. Moving back to an earlier
  // stage (it was recorded as a Slaking and is a Slakoth) makes the stage it was the one it ends as.
  const newSpeciesId = target?.id ?? current.speciesId;
  const movedBack = target != null && before.some((s) => s.id === target.id);
  let finalId = parsed.data.finalSpeciesId !== undefined ? parsed.data.finalSpeciesId : current.finalSpeciesId;
  if (parsed.data.finalSpeciesId === undefined && movedBack && finalId == null) finalId = current.speciesId;
  if (finalId != null) {
    // Only a later stage of the line makes sense as the final one; the stage it is at needs no mark.
    const ahead = await stagesOf(game.id, newSpeciesId, null);
    if (!ahead.after.some((s) => s.id === finalId)) finalId = null;
  }

  let data: Prisma.RosterPokemonUncheckedUpdateInput = { finalSpeciesId: finalId };
  let newVariantKey: { speciesId: number; variant: ReturnType<typeof variantOfSlug> } | null = null;
  let isNewStage = false;
  if (target) {
    // Same variety when the new stage has one (a Galarian form stays Galarian), otherwise its normal form.
    const variant = variantOfSlug(current.form?.slug ?? '');
    const forms = await prisma.form.findMany({
      where: { speciesId: target.id },
      select: { id: true, slug: true, isDefault: true, abilities: { select: { abilityId: true, isHidden: true } } },
    });
    const form = forms.find((f) => variant !== '' && variantOfSlug(f.slug) === variant) ?? forms.find((f) => f.isDefault);
    if (!form) return apiError('No form for that Pokémon', 400);

    // The ability stays if the new stage has it. Otherwise a hidden ability moves to the new stage's hidden
    // one, and a normal one to the new stage's only normal ability (Truant → Vital Spirit), when it has just one.
    let abilityId = current.abilityId;
    if (abilityId != null && !form.abilities.some((a) => a.abilityId === abilityId)) {
      const wasHidden = await prisma.formAbility.findFirst({
        where: { abilityId, form: { speciesId: current.speciesId } },
        select: { isHidden: true },
      });
      const pool = form.abilities.filter((a) => a.isHidden === Boolean(wasHidden?.isHidden));
      abilityId = pool.length === 1 ? pool[0].abilityId : null;
    }
    data = {
      ...data,
      speciesId: target.id,
      formId: form.isDefault ? null : form.id,
      abilityId,
      ...(abilityId !== current.abilityId ? { abilityStatus: 'PENDING' as const } : {}),
    };
    newVariantKey = { speciesId: target.id, variant: variantOfSlug(form.slug) };
    isNewStage = true;
  }

  await prisma.$transaction(async (tx) => {
    await tx.rosterPokemon.update({ where: { id }, data });
    if (!newVariantKey) return;
    const key = { profileId: current.profileId, ...newVariantKey };
    const known = await tx.pokedexEntry.findUnique({
      where: { profileId_speciesId_variant: key },
      select: { speciesId: true },
    });
    if (!known) {
      await tx.pokedexEntry.create({ data: { ...key, owned: current.owned } });
      if (current.owned) {
        await rosterGenderToPokedex(tx, { ...key, rosterId: id, before: 'UNKNOWN', after: current.gender });
      }
    }
  });
  if (isNewStage) {
    await refreshLegality(id, game);
    // The recorded stats were read at the stage it was; with the new stage's base stats the EVs read again.
    await recomputeEvsFromStats(prisma, id);
    await syncEvStatus(prisma, id);
  }

  const [pokemon] = await loadRoster(current.profileId, [id]);
  return Response.json({ pokemon });
}
