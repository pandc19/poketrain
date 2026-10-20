import { prisma } from './db';
import { getUserId } from './current-user';
import type { Prisma } from '@prisma/client';
import { EXTRA_DEX_SLUG, NATIONAL_DEX_SLUG, gameDexes, getGame } from './games';
import { rosterProgress } from './roster-status';
import { exclusiveBySpecies } from './games/exclusives';
import { type Variant, REGIONS, VARIANTS, encodeKey, variantOfSlug } from './dex-variant';

export type DexCell = {
  speciesId: number;
  /** Identifies this card's own caught state: the species plus the regional form it shows. */
  key: number;
  /** Null for a form no Pokédex of the game numbers. */
  entryNumber: number | null;
  nameEn: string;
  nameEs: string;
  spriteUrl: string | null;
  /** Set when the card shows a regional form (Alolan Dugtrio), tracked apart from the normal one. */
  formLabel: string | null;
  /** The heading it sits under in a sectioned tab (the region). */
  section: string | null;
  types: string[];
  /** Caught in the profile being viewed. */
  caught: boolean;
  /** Obtainable in the game being viewed. Always true outside a game's National Dex. */
  inGame: boolean;
  /** Only one version of a paired game has it. `own` is true when it is the player's version. */
  exclusive: { versionName: string; own: boolean } | null;
  /** You have one right now. False on a caught Pokémon means it evolved or was released. */
  owned: boolean;
  /** In your trained roster as obtained. The roster decides, so the Pokédex Have button is locked on. */
  ownedViaRoster: boolean;
  /** Genders recorded for this species in the profile being viewed. */
  hasMale: boolean;
  hasFemale: boolean;
  /** Eighths female; -1 = genderless. Gender buttons only matter for mixed species. */
  genderRate: number;
  /** Short names of the *other* games where this species is already caught. */
  caughtIn: string[];
  /** The first species of its evolution line, so a search can bring the whole line. */
  lineRoot: number;
  /** The breeding plan for this Pokémon, if there is one. */
  planId: string | null;
  /** A roster Pokémon of this species is marked as a keeper. */
  keeper: boolean;
  /** A roster Pokémon of this species is marked as being trained now. */
  training: boolean;
  /** A roster Pokémon of this species has every task done. */
  ready: boolean;
};

/**
 * Builds one Pokédex page. Caught state lives in a single place
 * (PokedexEntry, per save profile), so a game's regional dexes and its
 * National Dex are two views of the same rows. Other games' saves only
 * contribute the "caught in ..." badges; they never count as caught here.
 *
 * @param profileId the save profile being viewed.
 */
/** The order of the sections in the regional forms tab: the regions, the normal forms, then the rest. */
const sectionRank = (section: string) =>
  section === 'other' ? VARIANTS.length + 1 : section === 'normal' ? VARIANTS.length : VARIANTS.indexOf(section as never);

const gameDexSlots = (gameId: string) =>
  prisma.pokedexSlot.findMany({ where: { pokedex: gameDexes(gameId) }, select: { speciesId: true, pokedex: { select: { slug: true } } } });

/** Species a Pokédex of the game lists only as a regional form, and no Pokédex lists as its normal one. */
function normalOnly(gameId: string, slots: { speciesId: number; pokedex: { slug: string } }[]): number[] {
  const dexes = getGame(gameId)?.pokedexes ?? [];
  const regional = new Set(dexes.flatMap((d) => d.regionalSpecies ?? []));
  const asNormal = new Set(
    slots
      .filter((s) => !dexes.find((d) => d.slug === s.pokedex.slug)?.regionalSpecies?.includes(s.speciesId))
      .map((s) => s.speciesId)
  );
  return [...regional].filter((id) => !asNormal.has(id));
}

const speciesSelect = {
  id: true,
  nameEn: true,
  nameEs: true,
  genderRate: true,
  forms: {
    where: {
      OR: [{ isDefault: true }, { slug: { contains: '-paldea' } }, ...REGIONS.map((r) => ({ slug: { contains: `-${r}` } }))],
    },
    select: { slug: true, isDefault: true, spriteUrl: true, types: true },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.SpeciesSelect;

export async function loadDex(
  pokedexSlug: string,
  profileId: string | null,
  opts: { gameId?: string } = {}
): Promise<DexCell[]> {
  const lastEntry = opts.gameId
    ? getGame(opts.gameId)?.pokedexes.find((d) => d.slug === pokedexSlug)?.lastEntry
    : undefined;
  // The extra tab lists forms no Pokédex of the game numbers; each one is shown as its regional form.
  const isExtra = pokedexSlug === EXTRA_DEX_SLUG && Boolean(opts.gameId && getGame(opts.gameId)?.extraForms);
  const dexSlots = isExtra ? await gameDexSlots(opts.gameId!) : [];
  const userId = await getUserId();
  const [slots, entries, roster, gameSlots, lines] = await Promise.all([
    isExtra
      ? Promise.all([
          prisma.form.findMany({
            // A regional form is accepted when the game has its species in any of its Pokédexes.
            where: {
              OR: VARIANTS.map((r) => ({ slug: { contains: `-${r}` } })),
              species: { pokedexSlots: { some: { pokedex: gameDexes(opts.gameId!) } } },
            },
            select: { slug: true, species: { select: speciesSelect } },
          }),
          // Species that began in Hisui have no regional form, but belong with that region.
          prisma.species.findMany({
            where: { id: { in: getGame(opts.gameId!)?.extraForms?.hisuiSpecies ?? [] } },
            select: speciesSelect,
          }),
          // A Pokédex may list a species only as its regional form (Alolan Exeggutor), leaving the
          // normal one in none; that one is still in the game, so it gets a card here.
          prisma.species.findMany({
            where: { id: { in: normalOnly(opts.gameId!, dexSlots) } },
            select: speciesSelect,
          }),
          // Whatever else the player has registered by hand that no Pokédex of the game lists
          // (a Regice or a Mew brought in from elsewhere).
          profileId
            ? prisma.pokedexEntry
                .findMany({ where: { profileId, variant: '' }, select: { speciesId: true } })
                .then((rows) => {
                  const inDex = new Set(dexSlots.map((d) => d.speciesId));
                  return rows.map((r) => r.speciesId).filter((id) => !inDex.has(id));
                })
                .then((ids) => prisma.species.findMany({ where: { id: { in: ids } }, select: speciesSelect }))
            : [],
        ]).then(([forms, hisui, normal, other]) =>
          [
            ...forms
              // Cap, totem and the like are not looks of their own (variantOfSlug says '').
              .filter((f) => variantOfSlug(f.slug) !== '')
              // Paldean Tauros has three breeds, one card.
              .filter((f, i, all) => all.findIndex((g) => g.species.id === f.species.id && variantOfSlug(g.slug) === variantOfSlug(f.slug)) === i)
              .map((f) => ({ species: f.species, variant: variantOfSlug(f.slug), section: variantOfSlug(f.slug) as string })),
            ...hisui.map((species) => ({ species, variant: '' as Variant, section: 'hisui' })),
            ...normal.map((species) => ({ species, variant: '' as Variant, section: 'normal' })),
            ...other.map((species) => ({ species, variant: '' as Variant, section: 'other' })),
          ]
            .map((x) => ({ entryNumber: null as number | null, ...x }))
            // By region, then by National Dex number.
            .sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || a.species.id - b.species.id)
        )
      : prisma.pokedexSlot.findMany({
          where: { pokedex: { slug: pokedexSlug }, ...(lastEntry ? { entryNumber: { lte: lastEntry } } : {}) },
          orderBy: { entryNumber: 'asc' },
          select: { entryNumber: true, species: { select: speciesSelect } },
        }),
    prisma.pokedexEntry.findMany({
      where: { profile: { userId } },
      select: {
        speciesId: true,
        profileId: true,
        owned: true,
        variant: true,
        hasMale: true,
        hasFemale: true,
        profile: { select: { gameId: true } },
      },
    }),
    prisma.rosterPokemon.findMany({
      where: profileId ? { profileId } : { profile: { userId } },
      include: { moves: true, roles: true },
    }),
    // A game's National Dex lists every species; this marks which ones the game has.
    opts.gameId && pokedexSlug === NATIONAL_DEX_SLUG
      ? prisma.pokedexSlot.findMany({ where: { pokedex: gameDexes(opts.gameId) }, select: { speciesId: true } })
      : null,
    prisma.species.findMany({ select: { id: true, evolvesFromId: true, nameEn: true, nameEs: true } }),
  ]);
  const inGame = gameSlots ? new Set(gameSlots.map((s) => s.speciesId)) : null;
  const regionalSpecies = new Set(
    (opts.gameId ? getGame(opts.gameId)?.pokedexes.find((d) => d.slug === pokedexSlug)?.regionalSpecies : undefined) ??
      []
  );

  // Which form a card shows, and so which caught state it owns: a Pokédex that lists regional
  // forms shows those, the Paldea one shows the Paldean form, any other the species' own form.
  type Form = (typeof slots)[number]['species']['forms'][number];
  const lookOf = (speciesId: number, forms: Form[], fixed?: Variant): { look: Form | undefined; variant: Variant } => {
    const own = forms.find((f) => f.isDefault);
    // The regional-forms tab has a card per form.
    if (fixed) return { look: forms.find((f) => variantOfSlug(f.slug) === fixed) ?? own, variant: fixed };
    if (regionalSpecies.has(speciesId)) {
      for (const region of REGIONS) {
        const form = forms.find((f) => !f.isDefault && variantOfSlug(f.slug) === region);
        if (form) return { look: form, variant: region };
      }
    }
    const paldean = pokedexSlug === 'paldea' ? forms.find((f) => f.slug.includes('-paldea')) : undefined;
    return paldean ? { look: paldean, variant: 'paldea' } : { look: own, variant: '' };
  };

  // Roster Pokémon count for the form they are.
  const rosterFormIds = [...new Set(roster.map((p) => p.formId).filter((id): id is number => id != null))];
  const rosterForms = rosterFormIds.length
    ? await prisma.form.findMany({ where: { id: { in: rosterFormIds } }, select: { id: true, slug: true } })
    : [];
  const rosterVariant = new Map(rosterForms.map((f) => [f.id, variantOfSlug(f.slug)]));
  const rosterKey = (p: (typeof roster)[number]) =>
    encodeKey(p.speciesId, p.formId != null ? (rosterVariant.get(p.formId) ?? '') : '');

  const caughtHere = new Set<number>();
  const ownedHere = new Set<number>();
  const gendersHere = new Map<number, { hasMale: boolean; hasFemale: boolean }>();
  const caughtIn = new Map<number, Set<string>>();
  for (const e of entries) {
    if (e.profileId === profileId) {
      const key = encodeKey(e.speciesId, e.variant as Variant);
      caughtHere.add(key);
      if (e.owned) ownedHere.add(key);
      gendersHere.set(key, { hasMale: e.hasMale, hasFemale: e.hasFemale });
      continue;
    }
    const name = getGame(e.profile.gameId)?.shortName ?? e.profile.gameId;
    if (!caughtIn.has(e.speciesId)) caughtIn.set(e.speciesId, new Set());
    caughtIn.get(e.speciesId)!.add(name);
  }

  const rosterOwned = new Set<number>();
  const rosterKeeper = new Set<number>();
  const rosterTraining = new Set<number>();
  const rosterReady = new Set<number>();
  for (const p of roster) {
    const key = rosterKey(p);
    if (p.owned) rosterOwned.add(key);
    if (p.keeper) rosterKeeper.add(key);
    if (p.training) rosterTraining.add(key);
    if (p.roles.some((r) => r.role === 'ROSTER') && rosterProgress(p).complete) rosterReady.add(key);
  }

  // Evolution lines, so a search brings the whole line.
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const rootOf = (id: number) => {
    let cur = id;
    for (let guard = 0; guard < 6; guard++) {
      const from = lineById.get(cur)?.evolvesFromId;
      if (from == null) break;
      cur = from;
    }
    return cur;
  };
  const holding = (id: number, variant: Variant) => {
    const key = encodeKey(id, variant);
    return ownedHere.has(key) || rosterOwned.has(key);
  };

  // A breeding plan for the same Pokémon, if there is one (the newest).
  const planBySpecies = new Map<number, string>();
  if (profileId) {
    for (const g of await prisma.breedingGoal.findMany({ where: { profileId }, orderBy: { createdAt: 'desc' }, select: { id: true, speciesId: true } })) {
      if (!planBySpecies.has(g.speciesId)) planBySpecies.set(g.speciesId, g.id);
    }
  }

  const versions = opts.gameId ? getGame(opts.gameId)?.versionExclusives : undefined;
  const exclusives = versions ? exclusiveBySpecies(versions) : null;

  return slots.map((s) => {
    const { look, variant } = lookOf(s.species.id, s.species.forms, 'variant' in s ? s.variant : undefined);
    const key = encodeKey(s.species.id, variant);
    const side = exclusives?.get(s.species.id);
    return {
      speciesId: s.species.id,
      lineRoot: rootOf(s.species.id),
      key,
      entryNumber: s.entryNumber,
      nameEn: s.species.nameEn,
      nameEs: s.species.nameEs,
      spriteUrl: look?.spriteUrl ?? null,
      formLabel: variant ? variant[0].toUpperCase() + variant.slice(1) : null,
      section: 'section' in s && s.section ? s.section[0].toUpperCase() + s.section.slice(1) : null,
      types: look?.types ?? [],
      caught: caughtHere.has(key),
      inGame: inGame ? inGame.has(s.species.id) : true,
      hasMale: gendersHere.get(key)?.hasMale ?? false,
      hasFemale: gendersHere.get(key)?.hasFemale ?? false,
      genderRate: s.species.genderRate,
      caughtIn: [...(caughtIn.get(s.species.id) ?? [])],
      planId: planBySpecies.get(s.species.id) ?? null,
      keeper: rosterKeeper.has(key),
      training: rosterTraining.has(key),
      ready: rosterReady.has(key),
      exclusive: side && versions ? { versionName: side === 'own' ? versions.ownName : versions.otherName, own: side === 'own' } : null,
      owned: holding(s.species.id, variant),
      ownedViaRoster: rosterOwned.has(key),
    };
  });
}
