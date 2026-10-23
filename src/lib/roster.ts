import type { AuditLocks } from './audit-locks';
import { prisma } from './db';
import { dexPosition, gameDexes, type GameConfig } from './games';
import type { EvSpread } from './import/evs';
import type { IvRatings } from './iv-ratings';
import { legalMoves } from './legality';
import type { TaskStatus } from './roster-status';

type Named = { id: number; nameEn: string; nameEs: string };

export type RosterMoveView = {
  slot: number;
  move: (Named & { type: string; damageClass: string }) | null;
  rawName: string | null;
  status: TaskStatus;
  legal: boolean | null;
};

/** Everything the roster UI needs for one Pokémon, already flattened for the client. */
export type RosterView = {
  id: string;
  species: Named;
  /** National Dex number. */
  nationalNumber: number;
  /** Entry number in the game's own Pokédex (first dex that lists it), or null if the game lacks it. */
  entryNumber: number | null;
  /** Sort key that follows the game's Pokédex order: base game first, then expansions. */
  dexOrder: number | null;
  baseSpecies: Named | null;
  /** The breeding plan for this Pokémon, if there is one. */
  planId: string | null;
  /**
   * The stage it is meant to end as, when that is a different one from the stage it is at now (a Slakoth
   * that will be a Slaking). Null when the stage it is at is the final one. The audit judges this one.
   */
  finalSpecies:
    | (Named & { types: string[]; baseStats: EvSpread | null; abilityOptions: (Named & { isHidden: boolean })[] })
    | null;
  formId: number | null;
  /** The slug of its form when that is not the species' default one (Alolan, Aqua Breed…); null otherwise. */
  formSlug: string | null;
  spriteUrl: string | null;
  types: string[];
  /** Abilities this species can actually have, for the editor and the legality flag. */
  abilityOptions: (Named & { isHidden: boolean })[];
  nickname: string | null;
  /** Where it is used: the trained roster, the breeders, or both. */
  roles: ('ROSTER' | 'BREEDER')[];
  gender: 'MALE' | 'FEMALE' | 'BOTH' | 'GENDERLESS' | 'UNKNOWN';
  /** Eighths female; -1 = genderless. Decides which gender buttons make sense. */
  genderRate: number;
  origin: 'CAUGHT' | 'BRED' | 'UNKNOWN';
  owned: boolean;
  /** Marked as a keeper: finished and kept (shown with crossed swords). */
  keeper: boolean;
  /** Marked as being trained right now. */
  training: boolean;
  /** Left out of the breeding plans. */
  breedingOff: boolean;
  targetNature: Named | null;
  currentNature: Named | null;
  /** The nature of the Mint it was given; its stat effect is the one the game shows. */
  mintNature: Named | null;
  /** DONE once the Mint is given; until then it is only the one chosen. */
  mintStatus: TaskStatus;
  /** The nature effect the recorded stats were read under. */
  statsNature: Named | null;
  natureStatus: TaskStatus;
  ability: Named | null;
  abilityLegal: boolean | null;
  abilityStatus: TaskStatus;
  item: (Named & { spriteUrl: string | null }) | null;
  itemNote: string | null;
  itemStatus: TaskStatus;
  evs: EvSpread | null;
  evStatus: TaskStatus;
  teraStatus: TaskStatus;
  /** The EVs it has right now, when recorded. */
  currentEvs: EvSpread | null;
  /** The current EVs were calculated from the stats, so they are approximate. */
  currentEvsEstimated: boolean;
  /** The stats the game shows (blue graph), when recorded. The current EVs are worked out from them. */
  currentStats: EvSpread | null;
  level: number;
  /** The Judge's word for each stat's IV, for the stats that have been judged. */
  ivRatings: IvRatings | null;
  /** The stats the game shows sparkling (252 EVs). Null = not looked at; once set, the rest are not full. */
  maxedEvs: (keyof EvSpread)[] | null;
  /** AI audit sections the player has fixed. */
  auditLocks: AuditLocks | null;
  /** Base stats of its form, so a build can be judged against what it is. */
  baseStats: EvSpread | null;
  teraType: string | null;
  /** The Judge's verdict, or null when not judged. */
  potential: 'DECENT' | 'ABOVE_AVERAGE' | 'RELATIVELY_SUPERIOR' | 'OUTSTANDING' | null;
  notes: string | null;
  moves: RosterMoveView[];
  audit: { provider: string; model: string; lang: string; createdAt: string; result: unknown } | null;
};

const named = { id: true, nameEn: true, nameEs: true } as const;

/**
 * The Pokémon of a profile. `role` limits it to the trained roster or to the breeders;
 * without it every Pokémon comes back (what a lookup by id wants).
 */
export async function loadRoster(
  profileId: string,
  ids?: string[],
  role?: 'ROSTER' | 'BREEDER'
): Promise<RosterView[]> {
  const rows = await prisma.rosterPokemon.findMany({
    where: {
      profileId,
      ...(ids ? { id: { in: ids } } : {}),
      ...(role ? { roles: { some: { role } } } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      species: {
        select: {
          ...named,
          genderRate: true,
          forms: {
            orderBy: { id: 'asc' },
            select: {
              id: true,
              isDefault: true,
              slug: true,
              spriteUrl: true,
              types: true,
              baseStats: true,
              abilities: { select: { isHidden: true, ability: { select: named } } },
            },
          },
        },
      },
      roles: { select: { role: true } },
      baseSpecies: { select: named },
      finalSpecies: {
        select: {
          ...named,
          forms: {
            where: { isDefault: true },
            take: 1,
            select: {
              types: true,
              baseStats: true,
              abilities: { select: { isHidden: true, ability: { select: named } } },
            },
          },
        },
      },
      targetNature: { select: named },
      currentNature: { select: named },
      mintNature: { select: named },
      statsNature: { select: named },
      ability: { select: named },
      item: { select: { ...named, spriteUrl: true } },
      moves: {
        orderBy: { slot: 'asc' },
        include: { move: { select: { ...named, type: true, damageClass: true } } },
      },
      audits: { where: { kind: 'build' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  // Where each species sits in this game's own Pokédex, for Pokédex-order sorting.
  const profile = await prisma.gameProfile.findUnique({ where: { id: profileId }, select: { gameId: true } });
  const slots = profile
    ? await prisma.pokedexSlot.findMany({
        where: { pokedex: gameDexes(profile.gameId), speciesId: { in: [...new Set(rows.map((r) => r.speciesId))] } },
        select: { speciesId: true, entryNumber: true, pokedex: { select: { slug: true } } },
      })
    : [];
  const position = new Map<number, { dexOrder: number; entryNumber: number }>();
  for (const slot of slots) {
    const dexOrder = dexPosition(profile?.gameId ?? '', slot.pokedex.slug) * 10000 + slot.entryNumber;
    const known = position.get(slot.speciesId);
    if (!known || dexOrder < known.dexOrder) position.set(slot.speciesId, { dexOrder, entryNumber: slot.entryNumber });
  }

  // A breeding plan for the same Pokémon, if there is one (the newest).
  const planBySpecies = new Map<number, string>();
  for (const g of await prisma.breedingGoal.findMany({ where: { profileId }, orderBy: { createdAt: 'desc' }, select: { id: true, speciesId: true } })) {
    if (!planBySpecies.has(g.speciesId)) planBySpecies.set(g.speciesId, g.id);
  }

  return rows.map((r) => {
    const form = r.species.forms.find((f) => f.id === r.formId) ?? r.species.forms.find((f) => f.isDefault);
    const abilityOptions = (form?.abilities ?? []).map((a) => ({ ...a.ability, isHidden: a.isHidden }));
    const audit = r.audits[0];
    return {
      id: r.id,
      species: { id: r.species.id, nameEn: r.species.nameEn, nameEs: r.species.nameEs },
      nationalNumber: r.species.id,
      planId: planBySpecies.get(r.speciesId) ?? null,
      entryNumber: position.get(r.speciesId)?.entryNumber ?? null,
      dexOrder: position.get(r.speciesId)?.dexOrder ?? null,
      baseSpecies: r.baseSpecies,
      finalSpecies: finalOf(r.finalSpecies, r.speciesId),
      genderRate: r.species.genderRate,
      formId: form?.id ?? null,
      formSlug: form && !form.isDefault ? form.slug : null,
      spriteUrl: form?.spriteUrl ?? null,
      types: form?.types ?? [],
      abilityOptions,
      nickname: r.nickname,
      roles: r.roles.map((x) => x.role),
      gender: r.gender,
      origin: r.origin,
      owned: r.owned,
      keeper: r.keeper,
      training: r.training,
      breedingOff: r.breedingOff,
      targetNature: r.targetNature,
      currentNature: r.currentNature,
      mintNature: r.mintNature,
      mintStatus: r.mintStatus,
      statsNature: r.statsNature,
      natureStatus: r.natureStatus,
      ability: r.ability,
      abilityLegal: r.ability ? abilityOptions.some((a) => a.id === r.ability!.id) : null,
      abilityStatus: r.abilityStatus,
      item: r.item,
      itemNote: r.itemNote,
      itemStatus: r.itemStatus,
      evs: r.evs as EvSpread | null,
      currentEvs: r.currentEvs as EvSpread | null,
      currentEvsEstimated: r.currentEvsEstimated,
      currentStats: r.currentStats as EvSpread | null,
      level: r.level,
      ivRatings: r.ivRatings as IvRatings | null,
      maxedEvs: r.maxedEvs as (keyof EvSpread)[] | null,
      auditLocks: r.auditLocks as AuditLocks | null,
      baseStats: (form?.baseStats ?? null) as EvSpread | null,
      evStatus: r.evStatus,
      teraType: r.teraType,
      teraStatus: r.teraStatus,
      potential: r.potential,
      notes: r.notes,
      moves: r.moves.map((m) => ({
        slot: m.slot,
        move: m.move,
        rawName: m.rawName,
        status: m.status,
        legal: m.legal,
      })),
      audit: audit
        ? {
            provider: audit.provider,
            model: audit.model,
            lang: audit.lang,
            createdAt: audit.createdAt.toISOString(),
            result: audit.result,
          }
        : null,
    };
  });
}

/** Re-runs the deterministic legality check for one Pokémon's moves and stores the result. */
export async function refreshLegality(rosterPokemonId: string, game: GameConfig): Promise<void> {
  const p = await prisma.rosterPokemon.findUnique({
    where: { id: rosterPokemonId },
    select: { speciesId: true, moves: { select: { id: true, moveId: true } } },
  });
  if (!p) return;
  const moveIds = p.moves.map((m) => m.moveId).filter((id): id is number => id != null);
  const legal = (await legalMoves([p.speciesId], moveIds, game.learnsetVersionGroups)).get(p.speciesId)!;
  await prisma.$transaction(
    p.moves.map((m) =>
      prisma.rosterMove.update({
        where: { id: m.id },
        data: { legal: m.moveId == null ? null : legal.has(m.moveId) },
      })
    )
  );
}

/** The final stage as the view carries it, or null when it is the stage the Pokémon is at. */
function finalOf(
  final: {
    id: number;
    nameEn: string;
    nameEs: string;
    forms: { types: string[]; baseStats: unknown; abilities: { isHidden: boolean; ability: Named }[] }[];
  } | null,
  speciesId: number
): RosterView['finalSpecies'] {
  if (!final || final.id === speciesId) return null;
  const form = final.forms[0];
  return {
    id: final.id,
    nameEn: final.nameEn,
    nameEs: final.nameEs,
    types: form?.types ?? [],
    baseStats: (form?.baseStats ?? null) as EvSpread | null,
    abilityOptions: (form?.abilities ?? []).map((a) => ({ ...a.ability, isHidden: a.isHidden })),
  };
}

/** Name lists for the editors. Pokémon are limited to those obtainable in the game. */
export async function loadEditorOptions(game: GameConfig) {
  const [species, moves, items, natures] = await Promise.all([
    prisma.species.findMany({
      where: { pokedexSlots: { some: { pokedex: gameDexes(game.id) } } },
      select: named,
      orderBy: { id: 'asc' },
    }),
    prisma.move.findMany({ select: named, orderBy: { nameEn: 'asc' } }),
    prisma.item.findMany({
      // Things a Pokémon can meaningfully hold; skips key items, TMs, balls, etc.
      where: {
        OR: [
          {
            category: {
              in: [
                'held-items', 'choice', 'bad-held-items', 'type-enhancement', 'species-specific', 'plates',
                'in-a-pinch', 'picky-healing', 'type-protection', 'medicine', 'other', 'effort-training',
                'training', 'scarves', 'jewels', 'mega-stones', 'z-crystals', 'memories', 'held-items-other', 'tera-shard',
              ],
            },
          },
          // Held items PokéAPI files under another category (the Leader's Crest is in "picnic").
          { slug: { in: ['leaders-crest'] } },
        ],
      },
      select: named,
      orderBy: { nameEn: 'asc' },
    }),
    prisma.nature.findMany({ select: { ...named, slug: true, increased: true, decreased: true }, orderBy: { nameEn: 'asc' } }),
  ]);
  return { species, moves, items, natures };
}

export type EditorOptions = Awaited<ReturnType<typeof loadEditorOptions>>;
