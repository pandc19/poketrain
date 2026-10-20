import { prisma } from '../db';
import { dexPosition, gameDexes, type GameConfig } from '../games';
import { getPokeApi } from './client';
import { loadEvolutionMethods } from './evolution';
import type { Localized } from '../translate';
import { REGIONS, type Variant, variantOfSlug } from '../dex-variant';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PokemonInfo = {
  id: number;
  nameEn: string;
  nameEs: string;
  genus: { es: string | null; en: string | null };
  flavor: { es: string | null; en: string | null };
  types: string[];
  heightM: number | null;
  weightKg: number | null;
  artwork: string | null;
  /** Every look of the species worth flipping through (regional forms, gender differences). Always has the normal look first; arrows only make sense with two or more. */
  variants: { label: string; artwork: string; shiny: string | null }[];
  abilities: { nameEn: string; nameEs: string; isHidden: boolean }[];
  stats: { key: string; value: number }[];
  eggGroups: string[];
  /** Eighths female; -1 = genderless. */
  genderRate: number;
  captureRate: number | null;
  baseHappiness: number | null;
  isBaby: boolean;
  isLegendary: boolean;
  isMythical: boolean;
  generation: string | null;
  /**
   * The whole evolution family, each with the stage it sits at, what it comes from and how it
   * evolves from that one in this game ("Lv. 16", "Water Stone"…; null for the first stage or when unknown).
   */
  evolutions: {
    id: number;
    nameEn: string;
    nameEs: string;
    spriteUrl: string | null;
    stage: number;
    from: number | null;
    how: Localized | null;
  }[];
  /** Where it sits in the game's own Pokédexes, when a game was given. */
  dexEntries: { dex: { en: string; es: string }; number: number }[];
};

type FlavorEntry = { flavor_text: string; language: { name: string }; version?: { name: string } };

/**
 * Picks the Pokédex text for a language, preferring the given game versions
 * (most preferred first) and otherwise the most recent entry.
 */
export function pickFlavor(entries: FlavorEntry[], language: string, preferVersions: string[] = []): string | null {
  const own = entries.filter((e) => e.language.name === language);
  if (!own.length) return null;
  const preferred = preferVersions.map((v) => own.find((e) => e.version?.name === v)).find((e) => e != null);
  const entry = preferred ?? own[own.length - 1];
  return entry.flavor_text.replace(/[\n\f\r]+/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

/** Orders an evolution family into stages: the base form is stage 0, its evolutions stage 1, and so on. */
export function evolutionStages(
  species: { id: number; evolvesFromId: number | null }[],
  id: number
): { id: number; stage: number; from: number | null }[] {
  const parent = new Map(species.map((s) => [s.id, s.evolvesFromId]));
  let root = id;
  for (let guard = 0; guard < 10; guard++) {
    const up = parent.get(root);
    if (up == null) break;
    root = up;
  }
  const children = new Map<number, number[]>();
  for (const s of species) {
    if (s.evolvesFromId != null) {
      if (!children.has(s.evolvesFromId)) children.set(s.evolvesFromId, []);
      children.get(s.evolvesFromId)!.push(s.id);
    }
  }
  const out: { id: number; stage: number; from: number | null }[] = [{ id: root, stage: 0, from: null }];
  for (let i = 0; i < out.length; i++) {
    for (const child of children.get(out[i].id) ?? []) out.push({ id: child, stage: out[i].stage + 1, from: out[i].id });
  }
  return out;
}

const SKIPPED_VARIETY = /-(mega|gmax|totem|starter|cosplay|rock-star|belle|pop-star|phd|libre|original-cap|.+-cap)(-|$)/;
const MAX_VARIANTS = 30;

const titleCase = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** The different looks of a species: its other varieties, in-form variations, and the female look when it differs. */
async function loadVariants(
  speciesJson: any,
  defaultArtwork: string | null,
  defaultPokemon: any,
  /** The variety shown first; it is the species' default one unless the game has a regional form. */
  primaryName?: string,
  /** Show that one look only (a regional form opened from its own Pokédex card). */
  only = false
): Promise<PokemonInfo['variants']> {
  const out: PokemonInfo['variants'] = [];
  const varieties: { is_default: boolean; pokemon: { name: string } }[] = speciesJson.varieties ?? [];
  const baseName: string = varieties.find((v) => v.is_default)?.pokemon.name ?? speciesJson.name;
  const hasGender = Boolean(speciesJson.has_gender_differences);
  const femaleSprite: string | null = defaultPokemon?.sprites?.front_female ?? null;
  const shinyOf = (p: any): string | null =>
    p?.sprites?.other?.['official-artwork']?.front_shiny ?? p?.sprites?.front_shiny ?? null;

  const primary = primaryName ?? baseName;
  const others = varieties.filter((v) => v.pokemon.name !== primary && !SKIPPED_VARIETY.test(v.pokemon.name));
  // Some species (Oinkologne, Indeedee, Meowstic) have the female as a variety of her own with full artwork.
  const femaleVariety = others.some((v) => /-female$/.test(v.pokemon.name));
  const gendered = hasGender && (femaleSprite != null || femaleVariety);

  const primaryLabel = primary === baseName ? '' : titleCase(primary.slice(baseName.length + 1) || primary);
  if (only) {
    return defaultArtwork ? [{ label: primaryLabel, artwork: defaultArtwork, shiny: shinyOf(defaultPokemon) }] : [];
  }
  if (defaultArtwork) out.push({ label: gendered ? '♂' : primaryLabel, artwork: defaultArtwork, shiny: shinyOf(defaultPokemon) });
  if (gendered && !femaleVariety && femaleSprite) out.push({ label: '♀', artwork: femaleSprite, shiny: defaultPokemon?.sprites?.front_shiny_female ?? null });

  const fetched = await Promise.all(
    others.map((v) => getPokeApi(`pokemon/${v.pokemon.name}`).catch(() => null))
  );
  fetched.forEach((p, i) => {
    const art = p?.sprites?.other?.['official-artwork']?.front_default ?? p?.sprites?.front_default;
    if (!art) return;
    const name = others[i].pokemon.name;
    const label = /-female$/.test(name)
      ? '♀'
      : name === baseName
        ? 'Normal'
        : titleCase(name.startsWith(baseName + '-') ? name.slice(baseName.length + 1) : name);
    out.push({ label, artwork: art, shiny: shinyOf(p) });
  });

  // Species like Unown or Vivillon keep their looks as forms of the one Pokémon.
  const forms: { name: string }[] = defaultPokemon?.forms ?? [];
  if (forms.length > 1 && out.length <= 1) {
    const list = await Promise.all(
      forms.slice(0, MAX_VARIANTS).map((f) => getPokeApi(`pokemon-form/${f.name}`).catch(() => null))
    );
    out.length = 0;
    list.forEach((f, i) => {
      const art = f?.sprites?.front_default;
      if (!art) return;
      const name = forms[i].name;
      out.push({ label: titleCase(name.startsWith(baseName + '-') ? name.slice(baseName.length + 1) : name), artwork: art, shiny: f?.sprites?.front_shiny ?? null });
    });
  }
  return out.slice(0, MAX_VARIANTS);
}

const STAT_KEYS = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'] as const;

/**
 * Everything the Pokédex info dialog shows for one species. Types, stats,
 * abilities, egg groups and evolutions come from the synced PokéAPI tables;
 * the description, genus, size and capture data come from PokéAPI itself
 * (via the shared cache). Nothing here depends on your roster.
 */
export async function loadPokemonInfo(
  speciesId: number,
  game?: GameConfig,
  /** A regional form opened from its own Pokédex card: only that form is described. */
  variant: Variant = '',
  /** The slug of one particular form (Aqua Breed Tauros, White Kyurem…): only that form is described. */
  formSlug = ''
): Promise<PokemonInfo | null> {
  const species = await prisma.species.findUnique({
    where: { id: speciesId },
    select: {
      id: true,
      nameEn: true,
      nameEs: true,
      eggGroups: true,
      genderRate: true,
      isBaby: true,
      forms: {
        where: {
          OR: [
            { isDefault: true },
            { slug: { contains: '-paldea' } },
            ...REGIONS.map((r) => ({ slug: { contains: `-${r}` } })),
            ...(formSlug ? [{ slug: formSlug }] : []),
          ],
        },
        select: { id: true, slug: true, isDefault: true, types: true, baseStats: true, spriteUrl: true },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!species) return null;
  const regional = formSlug
    ? species.forms.find((f) => !f.isDefault && f.slug === formSlug)
    : variant
      ? species.forms.find((f) => !f.isDefault && variantOfSlug(f.slug) === variant)
      : undefined;
  const form = regional ?? species.forms.find((f) => f.isDefault);

  const [speciesJson, pokemonJson, family, slots] = await Promise.all([
    getPokeApi(`pokemon-species/${speciesId}`),
    form ? getPokeApi(`pokemon/${form.id}`) : Promise.resolve(null),
    prisma.species.findMany({
      select: {
        id: true,
        evolvesFromId: true,
        nameEn: true,
        nameEs: true,
        forms: {
          where: {
            OR: [
              { isDefault: true },
              { slug: { contains: '-paldea' } },
              ...REGIONS.map((r) => ({ slug: { contains: `-${r}` } })),
            ],
          },
          select: { slug: true, isDefault: true, spriteUrl: true },
          orderBy: { id: 'asc' },
        },
      },
    }),
    game
      ? prisma.pokedexSlot.findMany({
          where: { speciesId, pokedex: gameDexes(game.id) },
          select: { entryNumber: true, pokedex: { select: { slug: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const abilitySlugs: { slug: string; isHidden: boolean }[] = (pokemonJson?.abilities ?? []).map((a: any) => ({
    slug: a.ability.name,
    isHidden: a.is_hidden,
  }));
  const abilityRows = abilitySlugs.length
    ? await prisma.ability.findMany({
        where: { slug: { in: abilitySlugs.map((a) => a.slug) } },
        select: { slug: true, nameEn: true, nameEs: true },
      })
    : [];
  const abilityBySlug = new Map(abilityRows.map((a) => [a.slug, a]));

  // Games name their Pokédex text by version; Violet's own entry comes first.
  const prefer = game?.id === 'violet' ? ['violet', 'scarlet'] : [];
  const flavors: FlavorEntry[] = speciesJson.flavor_text_entries ?? [];
  const genera: { genus: string; language: { name: string } }[] = speciesJson.genera ?? [];
  const genus = (lang: string) => genera.find((g) => g.language.name === lang)?.genus ?? null;

  const byId = new Map(family.map((s) => [s.id, s]));
  const stats = (form?.baseStats ?? {}) as Record<string, number>;
  const artwork =
    pokemonJson?.sprites?.other?.['official-artwork']?.front_default ?? form?.spriteUrl ?? null;

  const familyIds = evolutionStages(family, speciesId);
  const [variants, evolveHow] = await Promise.all([
    loadVariants(speciesJson, artwork, pokemonJson, pokemonJson?.name, Boolean((variant || formSlug) && regional)),
    // How each one evolves is a nice-to-have: without the chain, the line still shows.
    familyIds.length > 1
      ? loadEvolutionMethods(speciesJson, game, variant || (regional?.slug.includes('-paldea') ? 'paldea' : '')).catch(
          () => new Map<number, Localized | null>()
        )
      : Promise.resolve(new Map<number, Localized | null>()),
  ]);

  return {
    id: species.id,
    nameEn: species.nameEn,
    nameEs: species.nameEs,
    genus: { es: genus('es'), en: genus('en') },
    flavor: { es: pickFlavor(flavors, 'es', prefer), en: pickFlavor(flavors, 'en', prefer) },
    types: form?.types ?? [],
    heightM: pokemonJson ? pokemonJson.height / 10 : null,
    weightKg: pokemonJson ? pokemonJson.weight / 10 : null,
    artwork,
    variants,
    abilities: abilitySlugs.map((a) => {
      const row = abilityBySlug.get(a.slug);
      return { nameEn: row?.nameEn ?? a.slug, nameEs: row?.nameEs ?? a.slug, isHidden: a.isHidden };
    }),
    stats: STAT_KEYS.map((key) => ({ key, value: stats[key] ?? 0 })),
    eggGroups: species.eggGroups,
    genderRate: species.genderRate,
    captureRate: speciesJson.capture_rate ?? null,
    baseHappiness: speciesJson.base_happiness ?? null,
    isBaby: species.isBaby,
    isLegendary: Boolean(speciesJson.is_legendary),
    isMythical: Boolean(speciesJson.is_mythical),
    generation: speciesJson.generation?.name ?? null,
    evolutions: familyIds.map((e) => ({
      ...e,
      how: e.from == null ? null : (evolveHow.get(e.id) ?? null),
      nameEn: byId.get(e.id)?.nameEn ?? String(e.id),
      nameEs: byId.get(e.id)?.nameEs ?? String(e.id),
      spriteUrl: (() => {
        const forms = byId.get(e.id)?.forms ?? [];
        const regionalLook = variant ? forms.find((f) => !f.isDefault && variantOfSlug(f.slug) === variant) : undefined;
        const look = regionalLook ?? forms.find((f) => f.isDefault);
        return look?.spriteUrl ?? null;
      })(),
    })),
    dexEntries: slots
      .filter((s) => {
        const last = game?.pokedexes.find((d) => d.slug === s.pokedex.slug)?.lastEntry;
        return last == null || s.entryNumber <= last;
      })
      .sort((a, b) => dexPosition(game?.id ?? '', a.pokedex.slug) - dexPosition(game?.id ?? '', b.pokedex.slug))
      .map((s) => {
        // The game config knows each Pokédex by name in both languages.
        const configured = game?.pokedexes.find((d) => d.slug === s.pokedex.slug);
        return { dex: configured?.name ?? { en: s.pokedex.name, es: s.pokedex.name }, number: s.entryNumber };
      }),
  };
}
