import { prisma } from '../db';
import { getUserId } from '../current-user';
import type { GameConfig } from '../games';
import { IV_STATS, type BreedingData, type IvKnowledge, type LearnWay, type Owned, type OwnedPokemon } from './engine';

/** Loads what the engine needs for a set of moves in one game. */
export async function loadBreedingData(game: GameConfig, moveIds: number[]): Promise<BreedingData> {
  const [species, slots, learnsets] = await Promise.all([
    prisma.species.findMany({
      select: { id: true, nameEn: true, nameEs: true, eggGroups: true, genderRate: true, evolvesFromId: true },
    }),
    prisma.pokedexSlot.findMany({ where: { pokedex: { gameId: game.id } }, select: { speciesId: true } }),
    moveIds.length
      ? prisma.learnset.findMany({
          where: { moveId: { in: moveIds }, versionGroup: { in: game.learnsetVersionGroups } },
          select: { moveId: true, method: true, level: true, form: { select: { speciesId: true } } },
        })
      : [],
  ]);

  const available = new Set(slots.map((s) => s.speciesId));
  const learns = new Map<number, Map<number, LearnWay[]>>();
  for (const l of learnsets) {
    const speciesId = l.form.speciesId;
    if (!learns.has(speciesId)) learns.set(speciesId, new Map());
    const byMove = learns.get(speciesId)!;
    if (!byMove.has(l.moveId)) byMove.set(l.moveId, []);
    byMove.get(l.moveId)!.push({ method: l.method, level: l.level });
  }
  return {
    species: new Map(species.map((s) => [s.id, { ...s, available: available.has(s.id) }])),
    learns,
    mirrorHerb: game.features.mirrorHerb,
  };
}

/**
 * What the player has to breed with in this game: the owned roster Pokémon
 * of this profile, plus the genders registered in its Pokédex. A Pokémon
 * that is only registered (it evolved or was released) is not a parent. A species
 * caught with no gender recorded is kept as "unknown", which the planner
 * reports as "caught, check its gender" rather than as a usable parent.
 */
export async function loadOwned(profileId: string): Promise<Owned> {
  const [roster, entries] = await Promise.all([
    prisma.rosterPokemon.findMany({
      where: { profileId, owned: true, breedingOff: false, profile: { userId: await getUserId() } },
      select: {
        id: true,
        speciesId: true,
        gender: true,
        nickname: true,
        ivRatings: true,
        currentNatureId: true,
        abilityId: true,
        roles: { select: { role: true } },
        species: { select: { forms: { select: { abilities: { select: { abilityId: true, isHidden: true } } } } } },
        // Only moves already checked off: a pending move is not known yet.
        moves: { where: { status: 'DONE', moveId: { not: null } }, select: { moveId: true } },
      },
    }),
    prisma.pokedexEntry.findMany({
      where: { profileId },
      select: { speciesId: true, hasMale: true, hasFemale: true, owned: true },
    }),
  ]);

  // Registered-only entries (evolved or released) are not in the player's hands.
  // A species can have an entry per regional form; breeding only cares about the species.
  const heldBySpecies = new Map<number, { speciesId: number; hasMale: boolean; hasFemale: boolean }>();
  for (const e of entries.filter((e) => e.owned)) {
    const known = heldBySpecies.get(e.speciesId);
    heldBySpecies.set(e.speciesId, {
      speciesId: e.speciesId,
      hasMale: Boolean(known?.hasMale || e.hasMale),
      hasFemale: Boolean(known?.hasFemale || e.hasFemale),
    });
  }
  const held = [...heldBySpecies.values()];
  const owned: OwnedPokemon[] = roster.map((p) => {
    const ratings = (p.ivRatings ?? {}) as Record<string, string | null>;
    const ivs: Partial<Record<(typeof IV_STATS)[number], IvKnowledge>> = {};
    for (const stat of IV_STATS) {
      const word = ratings[stat];
      if (word) ivs[stat] = word === 'PERFECT' ? 'perfect' : 'imperfect';
    }
    const hiddenIds = new Set(p.species.forms.flatMap((f) => f.abilities.filter((a) => a.isHidden).map((a) => a.abilityId)));
    return {
      id: p.id,
      label: p.nickname,
      speciesId: p.speciesId,
      gender: p.gender,
      moveIds: p.moves.map((m) => m.moveId!),
      source: p.roles.some((r) => r.role === 'BREEDER') ? ('breeder' as const) : ('roster' as const),
      ivs,
      natureId: p.currentNatureId,
      hiddenAbility: p.abilityId == null ? null : hiddenIds.has(p.abilityId),
    };
  });
  const inRoster = new Set(roster.map((p) => p.speciesId));
  for (const e of held) {
    if (e.hasMale) owned.push({ speciesId: e.speciesId, gender: 'MALE', moveIds: [], source: 'pokedex' });
    if (e.hasFemale) owned.push({ speciesId: e.speciesId, gender: 'FEMALE', moveIds: [], source: 'pokedex' });
    if (!e.hasMale && !e.hasFemale && !inRoster.has(e.speciesId)) {
      owned.push({ speciesId: e.speciesId, gender: 'UNKNOWN', moveIds: [], source: 'pokedex' });
    }
  }
  return { roster: owned, caughtSpeciesIds: new Set(held.map((e) => e.speciesId)) };
}
