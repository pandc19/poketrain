import { z } from 'zod';
import { apiError } from '@/lib/api-error';
import { LOCAL_USER_ID } from '@/lib/constants';
import { variantOfSlug } from '@/lib/dex-variant';
import { prisma } from '@/lib/db';
import { findProfileId } from '@/lib/profile';
import { loadRoster } from '@/lib/roster';

const Body = z
  .object({
    gameId: z.string(),
    /** A new Pokémon of this species... */
    speciesId: z.number().int().positive().optional(),
    /** ...or one that exists already, getting this role as well. */
    existingId: z.uuid().optional(),
    /** ...or a copy of one, as a breeder: same species, moves, IVs and nature, to change afterwards. */
    cloneId: z.uuid().optional(),
    role: z.enum(['ROSTER', 'BREEDER']).default('ROSTER'),
  })
  .refine((b) => [b.speciesId, b.existingId, b.cloneId].filter((x) => x != null).length === 1, {
    message: 'Give a species, an existing Pokémon or one to clone',
  });

/** A breeder is one you have: it is caught in the Pokédex and marked as in your box. */
async function markHave(rosterId: string, profileId: string) {
  const p = await prisma.rosterPokemon.update({
    where: { id: rosterId },
    data: { owned: true },
    select: { speciesId: true, form: { select: { slug: true } } },
  });
  const variant = variantOfSlug(p.form?.slug ?? '');
  await prisma.pokedexEntry.upsert({
    where: { profileId_speciesId_variant: { profileId, speciesId: p.speciesId, variant } },
    update: { owned: true },
    create: { profileId, speciesId: p.speciesId, variant, owned: true },
  });
}

/** Adds a Pokémon to the roster or to the breeders; a new one starts empty and is filled in afterwards. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid body', 400);
  const { gameId, speciesId, existingId, cloneId, role } = parsed.data;
  const profileId = await findProfileId(gameId);
  if (!profileId) return apiError('Unknown game', 404);

  if (cloneId) {
    const source = await prisma.rosterPokemon.findFirst({
      where: { id: cloneId, profileId, profile: { userId: LOCAL_USER_ID } },
      include: { moves: true },
    });
    if (!source) return apiError('Not found', 404);
    const last = await prisma.rosterPokemon.aggregate({ where: { profileId }, _max: { sortOrder: true } });
    // What breeding looks at (species, gender, nature, ability, IV words, moves) is copied; the rest of
    // a trained Pokémon (EVs, stats, item, team slot, marks) is not, as a clone is only a breeder.
    const created = await prisma.rosterPokemon.create({
      data: {
        profileId,
        speciesId: source.speciesId,
        formId: source.formId,
        baseSpeciesId: source.baseSpeciesId,
        nickname: source.nickname,
        gender: source.gender,
        origin: source.origin,
        currentNatureId: source.currentNatureId,
        natureStatus: source.natureStatus,
        abilityId: source.abilityId,
        abilityStatus: source.abilityStatus,
        ivRatings: source.ivRatings ?? undefined,
        potential: source.potential,
        level: source.level,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
        roles: { create: { role: 'BREEDER' } },
        moves: {
          create: source.moves.map((m) => ({ slot: m.slot, moveId: m.moveId, rawName: m.rawName, status: m.status, legal: m.legal })),
        },
      },
    });
    await markHave(created.id, profileId);
    const [view] = await loadRoster(profileId, [created.id]);
    return Response.json({ pokemon: view });
  }

  if (existingId) {
    const existing = await prisma.rosterPokemon.findFirst({
      where: { id: existingId, profileId, profile: { userId: LOCAL_USER_ID } },
      select: { id: true },
    });
    if (!existing) return apiError('Not found', 404);
    await prisma.pokemonRoleAssignment.upsert({
      where: { rosterPokemonId_role: { rosterPokemonId: existingId, role } },
      update: {},
      create: { rosterPokemonId: existingId, role },
    });
    if (role === 'BREEDER') await markHave(existingId, profileId);
    const [view] = await loadRoster(profileId, [existingId]);
    return Response.json({ pokemon: view });
  }

  const species = await prisma.species.findUnique({ where: { id: speciesId! }, select: { id: true } });
  if (!species) return apiError('Unknown Pokémon', 404);

  const last = await prisma.rosterPokemon.aggregate({ where: { profileId }, _max: { sortOrder: true } });
  const created = await prisma.rosterPokemon.create({
    data: {
      profileId,
      speciesId: species.id,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      roles: { create: { role } },
    },
  });
  // A breeder is one you have: it is what the breeding planner pairs up.
  if (role === 'BREEDER') await markHave(created.id, profileId);
  const [view] = await loadRoster(profileId, [created.id]);
  return Response.json({ pokemon: view });
}

/** The Pokémon of a game that have a role, e.g. the roster ones to pick breeders from. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const profileId = await findProfileId(url.searchParams.get('gameId') ?? '');
  if (!profileId) return apiError('Unknown game', 404);
  const role = z.enum(['ROSTER', 'BREEDER']).safeParse(url.searchParams.get('role'));
  return Response.json({ pokemon: await loadRoster(profileId, undefined, role.success ? role.data : undefined) });
}
