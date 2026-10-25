import { AuditLocksSchema } from '@/lib/audit-locks';
import { Prisma } from '@prisma/client';
import { apiError } from '@/lib/api-error';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getUserId } from '@/lib/current-user';
import { recomputeEvsFromStats, syncEvStatus } from '@/lib/ev-sync';
import { rosterGenderToPokedex } from '@/lib/gender-sync';
import { getGame } from '@/lib/games';
import { legalPlan } from '@/lib/ev-plan';
import { parseEvs } from '@/lib/import/evs';
import { IV_RATING_VALUES, potentialFromRatings, type IvRatings } from '@/lib/iv-ratings';
import { isBoxForm } from '@/lib/form-options';
import { variantOfSlug } from '@/lib/dex-variant';
import { TYPE_SLUGS } from '@/lib/pokemon-types';
import { loadRoster, refreshLegality } from '@/lib/roster';

const Status = z.enum(['PENDING', 'DONE']);
const id = z.number().int().positive().nullable();

const Body = z.object({
  /** Flip one micro-task. */
  task: z
    .object({
      key: z.union([z.enum(['owned', 'item', 'tera', 'evs']), z.string().regex(/^move:[1-4]$/)]),
      status: Status,
    })
    .optional(),
  /** Edit the build itself. Changing what a task targets resets it to PENDING. */
  set: z
    .object({
      nickname: z.string().max(60).nullable(),
      /** The player's marks: a keeper (finished and kept), and being trained now. */
      keeper: z.boolean(),
      training: z.boolean(),
      /** Left out of the breeding plans. */
      breedingOff: z.boolean(),
      // One Pokémon has one gender; "both" is only a Pokédex notion (you have one of each).
      gender: z.enum(['MALE', 'FEMALE', 'GENDERLESS', 'UNKNOWN']),
      targetNatureId: id,
      /** The nature it really has (breeders record this one). */
      currentNatureId: id,
      /** The nature of the Mint it was given, whose stat effect the game uses. */
      mintNatureId: id,
      /** DONE once the Mint has been given. */
      mintStatus: z.enum(['PENDING', 'DONE']),
      abilityId: id,
      /** Which form of the species it is. */
      formId: id,
      itemId: id,
      itemNote: z.string().max(200).nullable(),
      evs: z.string().max(200).nullable(),
      currentEvs: z.string().max(200).nullable(),
      currentEvsEstimated: z.boolean(),
      /** The stats on record are up to date with the nature effect in force now (after a Mint, say). */
      statsRead: z.boolean(),
      /** The stats the game shows; the EVs are worked out from them. */
      currentStats: z
        .object({
          hp: z.number().int().min(0).max(999),
          attack: z.number().int().min(0).max(999),
          defense: z.number().int().min(0).max(999),
          specialAttack: z.number().int().min(0).max(999),
          specialDefense: z.number().int().min(0).max(999),
          speed: z.number().int().min(0).max(999),
        })
        .nullable(),
      level: z.number().int().min(1).max(100),
      /** What the Judge said about each stat's IV. */
      auditLocks: AuditLocksSchema.nullable(),
      ivRatings: z
        .object({
          hp: z.enum(IV_RATING_VALUES).nullable().optional(),
          attack: z.enum(IV_RATING_VALUES).nullable().optional(),
          defense: z.enum(IV_RATING_VALUES).nullable().optional(),
          specialAttack: z.enum(IV_RATING_VALUES).nullable().optional(),
          specialDefense: z.enum(IV_RATING_VALUES).nullable().optional(),
          speed: z.enum(IV_RATING_VALUES).nullable().optional(),
        })
        .nullable(),
      /** The stats whose EVs the game shows sparkling (252). Null = not looked at. */
      maxedEvs: z.array(z.enum(['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'])).max(6).nullable(),
      teraType: z.enum(TYPE_SLUGS as [string, ...string[]]).nullable(),
      potential: z.enum(['DECENT', 'ABOVE_AVERAGE', 'RELATIVELY_SUPERIOR', 'OUTSTANDING']).nullable(),
      notes: z.string().max(4000).nullable(),
      moves: z
        .array(z.object({ slot: z.number().int().min(1).max(4), moveId: id, status: Status.optional() }))
        .max(4),
    })
    .partial()
    .optional(),
});

async function findOwned(rosterId: string) {
  if (!z.uuid().safeParse(rosterId).success) return null;
  return prisma.rosterPokemon.findFirst({
    where: { id: rosterId, profile: { userId: await getUserId() } },
    include: { moves: true, profile: { select: { gameId: true } }, form: { select: { slug: true } } },
  });
}

export async function PATCH(request: Request, ctx: RouteContext<'/api/roster/[id]'>) {
  const { id: rosterId } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid body', 400);
  const current = await findOwned(rosterId);
  if (!current) return apiError('Not found', 404);
  const { task, set } = parsed.data;
  // The Pokédex keeps a regional form apart from the normal one.
  const variant = variantOfSlug(current.form?.slug ?? '');

  if (task) {
    const { key, status } = task;
    if (key.startsWith('move:')) {
      await prisma.rosterMove.updateMany({
        where: { rosterPokemonId: rosterId, slot: Number(key.slice(5)) },
        data: { status },
      });
    } else {
      await prisma.rosterPokemon.update({
        where: { id: rosterId },
        data:
          key === 'owned'
            ? { owned: status === 'DONE' }
            : key === 'item'
              ? { itemStatus: status }
              : key === 'tera'
                ? { teraStatus: status }
                : { evStatus: status },
      });
      // A Pokémon you have is caught and in your box, so the Pokédex says so too.
      if (key === 'owned' && status === 'DONE') {
        await prisma.pokedexEntry.upsert({
          where: { profileId_speciesId_variant: { profileId: current.profileId, speciesId: current.speciesId, variant } },
          update: { owned: true },
          create: { profileId: current.profileId, speciesId: current.speciesId, variant, owned: true },
        });
      }
      // Giving it up leaves it caught, but no longer in the box unless another one is.
      if (key === 'owned' && status === 'PENDING' && current.owned) {
        const others = await prisma.rosterPokemon.count({
          where: { profileId: current.profileId, speciesId: current.speciesId, owned: true, id: { not: rosterId } },
        });
        if (others === 0) {
          await prisma.pokedexEntry.updateMany({
            where: { profileId: current.profileId, speciesId: current.speciesId, variant },
            data: { owned: false },
          });
        }
      }
      // Getting a Pokémon whose gender is already set records that gender in the Pokédex.
      if (key === 'owned' && status === 'DONE' && !current.owned) {
        await rosterGenderToPokedex(prisma, {
          profileId: current.profileId,
          speciesId: current.speciesId,
          variant,
          rosterId,
          before: 'UNKNOWN',
          after: set?.gender ?? current.gender,
        });
      }
    }
  }

  if (set) {
    if (set.formId != null) {
      const form = await prisma.form.findUnique({ where: { id: set.formId }, select: { speciesId: true, slug: true } });
      // A form of its own species, and not a regional one: the Pokédex keeps those as separate entries.
      if (!form || form.speciesId !== current.speciesId || !(isBoxForm(form.slug) || set.formId === current.formId)) {
        return apiError('That is not a form this Pokémon can be', 422);
      }
    }
    let currentEvs: ReturnType<typeof parseEvs> | undefined;
    if (set.currentEvs !== undefined) {
      currentEvs = set.currentEvs ? parseEvs(set.currentEvs) : null;
      if (set.currentEvs && !currentEvs) {
        return apiError('EV spread not recognised. Example: 252 Atk / 4 SpD / 252 Spe', 422);
      }
    }
    let evs: ReturnType<typeof parseEvs> | undefined;
    if (set.evs !== undefined) {
      evs = set.evs ? parseEvs(set.evs) : null;
      if (set.evs && !evs) {
        return apiError('EV spread not recognised. Example: 252 Atk / 4 SpD / 252 Spe', 422);
      }
      // A plan is saved the way the game allows: 252 at most in a stat and 510 in all.
      if (evs) evs = legalPlan(evs, null, false);
    }
    // A Mint is chosen first and given later: choosing another one starts it again as not given.
    const mintChanged = set.mintNatureId !== undefined && set.mintNatureId !== current.mintNatureId;
    const mintNatureAfter = mintChanged ? set.mintNatureId! ?? null : current.mintNatureId;
    const mintStatusAfter = mintChanged
      ? set.mintNatureId != null && set.mintStatus === 'DONE'
        ? 'DONE'
        : 'PENDING'
      : mintNatureAfter != null && set.mintStatus !== undefined
        ? set.mintStatus
        : current.mintStatus;
    const mintGivenAfter = mintNatureAfter != null && mintStatusAfter === 'DONE';
    await prisma.$transaction(async (tx) => {
      await tx.rosterPokemon.update({
        where: { id: rosterId },
        data: {
          nickname: set.nickname,
          // A keeper is finished and kept, so it is not being trained, and the other way round.
          ...(set.keeper === true ? { keeper: true, training: false } : set.keeper === false ? { keeper: false } : {}),
          ...(set.training === true && set.keeper !== true
            ? { training: true, keeper: false }
            : set.training === false && set.keeper === undefined
              ? { training: false }
              : {}),
          breedingOff: set.breedingOff,
          gender: set.gender,
          formId: set.formId,
          notes: set.notes,
          teraType: set.teraType,
          ...(set.teraType !== undefined && set.teraType !== current.teraType
            ? { teraStatus: set.teraType != null ? 'PENDING' : 'DONE' }
            : {}),
          potential: set.potential,
          itemNote: set.itemNote,
          ...(set.targetNatureId !== undefined && set.targetNatureId !== current.targetNatureId
            ? {
                targetNatureId: set.targetNatureId,
                natureStatus: set.targetNatureId != null && set.targetNatureId === current.currentNatureId ? 'DONE' : 'PENDING',
              }
            : {}),
          ...(set.currentNatureId !== undefined && set.currentNatureId !== current.currentNatureId
            ? {
                currentNatureId: set.currentNatureId,
                ...(current.targetNatureId != null
                  ? { natureStatus: set.currentNatureId === current.targetNatureId ? ('DONE' as const) : ('PENDING' as const) }
                  : {}),
              }
            : {}),
          ...(mintChanged ? { mintNatureId: mintNatureAfter, mintStatus: mintStatusAfter } : set.mintStatus !== undefined && mintNatureAfter != null ? { mintStatus: mintStatusAfter } : {}),
          ...(set.abilityId !== undefined && set.abilityId !== current.abilityId
            ? { abilityId: set.abilityId }
            : {}),
          ...(set.itemId !== undefined && set.itemId !== current.itemId
            ? { itemId: set.itemId, itemStatus: 'PENDING' }
            : {}),
          ...(set.currentStats !== undefined ? { currentStats: set.currentStats ?? Prisma.DbNull } : {}),
          // The nature effect the stats were read under. The first numbers recorded take the one in force;
          // after that it only moves when the player says the stats are up to date (a Mint was given since),
          // because a few typed numbers do not make a new reading of all six.
          ...(set.currentStats === null ? { statsNatureId: null } : {}),
          ...((set.currentStats != null && current.statsNatureId == null) || set.statsRead === true
            ? {
                statsNatureId:
                  (mintGivenAfter ? mintNatureAfter : null) ??
                  (set.currentNatureId !== undefined ? set.currentNatureId : current.currentNatureId) ??
                  (set.targetNatureId !== undefined ? set.targetNatureId : current.targetNatureId),
              }
            : {}),
          ...(set.level !== undefined ? { level: set.level } : {}),
          ...(set.ivRatings !== undefined ? { ivRatings: set.ivRatings ?? Prisma.DbNull } : {}),
          ...(set.maxedEvs !== undefined ? { maxedEvs: set.maxedEvs ? [...new Set(set.maxedEvs)] : Prisma.DbNull } : {}),
          ...(set.auditLocks !== undefined ? { auditLocks: set.auditLocks ?? Prisma.DbNull } : {}),
          ...(currentEvs !== undefined
            ? { currentEvs: currentEvs ?? Prisma.DbNull, currentEvsEstimated: currentEvs ? (set.currentEvsEstimated ?? false) : false }
            : {}),
          ...(evs !== undefined
            ? {
                evs: evs ?? Prisma.DbNull,
                ...(JSON.stringify(evs) !== JSON.stringify(current.evs) ? { evStatus: 'PENDING' as const } : {}),
              }
            : {}),
        },
      });
      for (const m of set.moves ?? []) {
        const existing = current.moves.find((x) => x.slot === m.slot);
        if (m.moveId == null) {
          if (existing) await tx.rosterMove.delete({ where: { id: existing.id } });
        } else if (!existing) {
          await tx.rosterMove.create({
            data: { rosterPokemonId: rosterId, slot: m.slot, moveId: m.moveId, ...(m.status ? { status: m.status } : {}) },
          });
        } else if (existing.moveId !== m.moveId) {
          await tx.rosterMove.update({
            where: { id: existing.id },
            data: { moveId: m.moveId, rawName: null, status: m.status ?? 'PENDING', legal: null },
          });
        }
      }
    });
    // When all six IV ratings are known and agree on one overall potential, fill it in
    // unless the player already set one.
    if (set.ivRatings && set.potential === undefined && current.potential == null) {
      const derived = potentialFromRatings(set.ivRatings as IvRatings);
      if (derived) await prisma.rosterPokemon.update({ where: { id: rosterId }, data: { potential: derived } });
    }

    // EVs follow from the stats, so they are worked out again when any of those inputs change.
    // Typing exact EVs in the same request wins over the estimate.
    if (
      currentEvs === undefined &&
      (set.currentStats !== undefined ||
        set.level !== undefined ||
        set.targetNatureId !== undefined ||
        set.mintNatureId !== undefined ||
        set.mintStatus !== undefined ||
        set.statsRead !== undefined ||
        set.evs !== undefined ||
        set.ivRatings !== undefined ||
        set.maxedEvs !== undefined)
    ) {
      if (set.currentStats === null) {
        await prisma.rosterPokemon.update({
          where: { id: rosterId },
          data: { currentEvs: Prisma.DbNull, currentEvsEstimated: false },
        });
      } else {
        await recomputeEvsFromStats(prisma, rosterId);
      }
    }

    await syncEvStatus(prisma, rosterId);

    const game = getGame(current.profile.gameId);
    if (set.moves && game) await refreshLegality(rosterId, game);

    // A gender set on an obtained Pokémon is also recorded in the Pokédex.
    if (set.gender !== undefined && set.gender !== current.gender && current.owned) {
      await rosterGenderToPokedex(prisma, {
        profileId: current.profileId,
        speciesId: current.speciesId,
        rosterId,
        before: current.gender,
        after: set.gender,
      });
    }
  }

  const [view] = await loadRoster(current.profileId, [rosterId]);
  return Response.json({ pokemon: view });
}

/**
 * Takes a Pokémon off one page (`?role=ROSTER` or `?role=BREEDER`). It is deleted only when
 * no role is left, so one that is also a breeder stays in the breeders when removed from the roster.
 */
export async function DELETE(request: Request, ctx: RouteContext<'/api/roster/[id]'>) {
  const { id: rosterId } = await ctx.params;
  const current = await findOwned(rosterId);
  if (!current) return apiError('Not found', 404);
  const role = new URL(request.url).searchParams.get('role');
  const parsedRole = z.enum(['ROSTER', 'BREEDER']).safeParse(role);
  if (parsedRole.success) {
    await prisma.pokemonRoleAssignment.deleteMany({ where: { rosterPokemonId: rosterId, role: parsedRole.data } });
  }
  const left = await prisma.pokemonRoleAssignment.count({ where: { rosterPokemonId: rosterId } });
  if (left === 0) await prisma.rosterPokemon.delete({ where: { id: rosterId } });
  return Response.json({ ok: true, deleted: left === 0 });
}
