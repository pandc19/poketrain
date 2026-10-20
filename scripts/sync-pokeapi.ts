/**
 * Pulls deterministic reference data from PokéAPI into Postgres: species,
 * forms, moves, learnsets, abilities, natures, held items and Pokédex orders.
 *
 * Every response is cached on disk in .cache/pokeapi, so the script can be
 * interrupted and re-run without re-downloading (delete the folder to force
 * a refresh). Database writes are idempotent.
 *
 * Usage: npm run sync:pokeapi
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/lib/db';
import { GAMES, NATIONAL_DEX_SLUG } from '../src/lib/games';
import { SPANISH_FIX_BY_SLUG } from '../src/lib/spanish-fixes';

const API = 'https://pokeapi.co/api/v2';
const CACHE_DIR = path.join(process.cwd(), '.cache', 'pokeapi');
const CONCURRENCY = 6;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

async function get(resource: string): Promise<Json> {
  const file = path.join(CACHE_DIR, resource.replace(/[/?=&]/g, '_') + '.json');
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    // not cached yet
  }
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/${resource}`);
    if (res.ok) {
      const text = await res.text();
      await writeFile(file, text);
      return JSON.parse(text);
    }
    if (attempt >= 5 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`PokéAPI ${res.status} for ${resource}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function mapPool<T, R>(label: string, items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
        if (++done % 200 === 0 || done === items.length) {
          console.log(`  ${label}: ${done}/${items.length}`);
        }
      }
    })
  );
  return out;
}

const STAT_KEY: Record<string, string> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'specialAttack',
  'special-defense': 'specialDefense',
  speed: 'speed',
};

const idFromUrl = (url: string) => Number(url.split('/').filter(Boolean).pop());
const nameIn = (names: Json[], lang: string): string | undefined =>
  names?.find((n) => n.language.name === lang)?.name;
const titleCase = (slug: string) =>
  slug.replace(/(^|-)(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase());
const names = (d: Json) => {
  const nameEn = nameIn(d.names, 'en') ?? titleCase(d.name);
  return { nameEn, nameEs: SPANISH_FIX_BY_SLUG.get(d.name) ?? nameIn(d.names, 'es') ?? nameEn };
};

/** One sentence on what an ability does, in each language (Spanish is flavor text, English the short effect). */
const abilityDescriptions = (d: Json) => {
  const clean = (s?: string) => s?.replace(/[\n\f]+/g, ' ').replace(/\s+/g, ' ').trim() || null;
  const flavorEs = [...(d.flavor_text_entries ?? [])].reverse().find((f: Json) => f.language.name === 'es');
  const effectEn = d.effect_entries?.find((e: Json) => e.language.name === 'en');
  const flavorEn = [...(d.flavor_text_entries ?? [])].reverse().find((f: Json) => f.language.name === 'en');
  return {
    descriptionEn: clean(effectEn?.short_effect) ?? clean(flavorEn?.flavor_text),
    descriptionEs: clean(flavorEs?.flavor_text),
  };
};

async function chunked<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>, size = 5000) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const versionGroups = new Set(GAMES.flatMap((g) => g.learnsetVersionGroups));

  console.log('types');
  const typeList = await get('type?limit=100');
  const typeRefs: Json[] = typeList.results.filter((r: Json) => idFromUrl(r.url) < 10000); // not unknown/shadow
  const types = await mapPool('types', typeRefs, (r: Json) => get(`type/${r.name}`));
  const effects: { attacker: string; defender: string; multiplier: number }[] = [];
  for (const ty of types) {
    const rel = ty.damage_relations;
    const add = (list: Json[], multiplier: number) =>
      list.forEach((d) => effects.push({ attacker: ty.name, defender: d.name, multiplier }));
    add(rel.no_damage_to, 0);
    add(rel.half_damage_to, 0.5);
    add(rel.double_damage_to, 2);
  }
  // One transaction, so the app never reads an empty chart in between.
  await prisma.$transaction([
    prisma.typeEffect.deleteMany(),
    prisma.typeEffect.createMany({ data: effects, skipDuplicates: true }),
  ]);
  console.log(`  type effects: ${effects.length} rows`);
  if (process.argv.includes('--only-types')) return;

  if (process.argv.includes('--only-abilities')) {
    console.log('abilities');
    const list = await get('ability?limit=1000');
    const all = await mapPool('abilities', list.results, (r: Json) => get(`ability/${idFromUrl(r.url)}`));
    for (const a of all) {
      const data = { slug: a.name, ...names(a), ...abilityDescriptions(a) };
      await prisma.ability.upsert({ where: { id: a.id }, update: data, create: { id: a.id, ...data } });
    }
    return;
  }

  console.log('natures');
  const natureList = await get('nature?limit=100');
  const natures = await mapPool('natures', natureList.results, (r: Json) => get(`nature/${r.name}`));
  for (const n of natures) {
    const data = {
      slug: n.name,
      ...names(n),
      increased: n.increased_stat?.name ?? null,
      decreased: n.decreased_stat?.name ?? null,
    };
    await prisma.nature.upsert({ where: { id: n.id }, update: data, create: { id: n.id, ...data } });
  }

  // PokéAPI lists Oinkologne as always male, though it is 50/50 like Lechonk (it has a female form of its own).
  const GENDER_RATE_FIXES: Record<number, number> = { 916: 4 };

  console.log('species');
  const national = await get(`pokedex/${NATIONAL_DEX_SLUG}`);
  const speciesRefs: Json[] = national.pokemon_entries.map((e: Json) => e.pokemon_species);
  const species = await mapPool('species', speciesRefs, (r) => get(`pokemon-species/${idFromUrl(r.url)}`));
  // Two passes so evolves_from never points at a row that does not exist yet.
  for (const s of species) {
    const data = {
      slug: s.name,
      ...names(s),
      eggGroups: s.egg_groups.map((g: Json) => g.name),
      genderRate: GENDER_RATE_FIXES[s.id] ?? s.gender_rate,
      isBaby: s.is_baby,
      isSpecial: Boolean(s.is_legendary || s.is_mythical),
    };
    await prisma.species.upsert({ where: { id: s.id }, update: data, create: { id: s.id, ...data } });
  }
  for (const s of species) {
    if (!s.evolves_from_species) continue;
    await prisma.species.update({
      where: { id: s.id },
      data: { evolvesFromId: idFromUrl(s.evolves_from_species.url) },
    });
  }

  console.log('forms');
  const varietyRefs = species.flatMap((s) =>
    s.varieties.map((v: Json) => ({ speciesId: s.id, isDefault: v.is_default, id: idFromUrl(v.pokemon.url) }))
  );
  const pokemon = await mapPool('forms', varietyRefs, (v) => get(`pokemon/${v.id}`));
  const stat = (p: Json, name: string) => p.stats.find((s: Json) => s.stat.name === name)?.base_stat ?? 0;
  for (const [i, p] of pokemon.entries()) {
    const data = {
      speciesId: varietyRefs[i].speciesId,
      slug: p.name,
      isDefault: varietyRefs[i].isDefault,
      types: p.types.map((t: Json) => t.type.name),
      baseStats: {
        hp: stat(p, 'hp'),
        attack: stat(p, 'attack'),
        defense: stat(p, 'defense'),
        specialAttack: stat(p, 'special-attack'),
        specialDefense: stat(p, 'special-defense'),
        speed: stat(p, 'speed'),
      },
      evYield: Object.fromEntries(
        p.stats
          .filter((s: Json) => s.effort > 0)
          .map((s: Json) => [STAT_KEY[s.stat.name], s.effort])
      ),
      spriteUrl: p.sprites.front_default ?? p.sprites.other?.['official-artwork']?.front_default ?? null,
    };
    await prisma.form.upsert({ where: { id: p.id }, update: data, create: { id: p.id, ...data } });
  }

  console.log('moves');
  const moveList = await get('move?limit=2000');
  const moves = await mapPool('moves', moveList.results, (r: Json) => get(`move/${idFromUrl(r.url)}`));
  const moveIds = new Set<number>();
  for (const m of moves) {
    if (!m.type || !m.damage_class) continue; // placeholder entries
    moveIds.add(m.id);
    const data = {
      slug: m.name,
      ...names(m),
      type: m.type.name,
      damageClass: m.damage_class.name,
      power: m.power,
      accuracy: m.accuracy,
      pp: m.pp,
    };
    await prisma.move.upsert({ where: { id: m.id }, update: data, create: { id: m.id, ...data } });
  }

  console.log('abilities');
  const abilityIds = [...new Set(pokemon.flatMap((p) => p.abilities.map((a: Json) => idFromUrl(a.ability.url))))];
  const abilities = await mapPool('abilities', abilityIds, (id) => get(`ability/${id}`));
  for (const a of abilities) {
    const data = { slug: a.name, ...names(a), ...abilityDescriptions(a) };
    await prisma.ability.upsert({ where: { id: a.id }, update: data, create: { id: a.id, ...data } });
  }
  const formAbilities = new Map<string, { formId: number; abilityId: number; isHidden: boolean }>();
  for (const p of pokemon) {
    for (const a of p.abilities) {
      const abilityId = idFromUrl(a.ability.url);
      formAbilities.set(`${p.id}:${abilityId}`, { formId: p.id, abilityId, isHidden: a.is_hidden });
    }
  }
  await prisma.formAbility.deleteMany();
  await chunked([...formAbilities.values()], (data) => prisma.formAbility.createMany({ data }));

  console.log('learnsets');
  const learnsets = new Map<string, { formId: number; moveId: number; versionGroup: string; method: string; level: number }>();
  for (const p of pokemon) {
    for (const m of p.moves) {
      const moveId = idFromUrl(m.move.url);
      if (!moveIds.has(moveId)) continue;
      for (const d of m.version_group_details) {
        const versionGroup = d.version_group.name;
        if (!versionGroups.has(versionGroup)) continue;
        const row = {
          formId: p.id,
          moveId,
          versionGroup,
          method: d.move_learn_method.name,
          level: d.level_learned_at ?? 0,
        };
        learnsets.set(Object.values(row).join(':'), row);
      }
    }
  }
  await prisma.learnset.deleteMany({ where: { versionGroup: { in: [...versionGroups] } } });
  await chunked([...learnsets.values()], (data) => prisma.learnset.createMany({ data }));
  console.log(`  learnsets: ${learnsets.size} rows`);

  console.log('items');
  // Every item, not just PokéAPI's "holdable" attribute: that list misses
  // newer held items such as the Assault Vest and Mirror Herb.
  const itemList = await get('item?limit=5000');
  const itemIds: number[] = itemList.results.map((r: Json) => idFromUrl(r.url));
  const items = await mapPool('items', itemIds, (id) => get(`item/${id}`));
  // PokéAPI lists a few items under more than one id; the first one wins.
  const seenItems = new Set<string>();
  for (const it of items) {
    if (seenItems.has(it.name)) continue;
    seenItems.add(it.name);
    const data = {
      slug: it.name,
      ...names(it),
      category: it.category?.name ?? 'unknown',
      spriteUrl: it.sprites?.default ?? null,
    };
    await prisma.item.upsert({ where: { id: it.id }, update: data, create: { id: it.id, ...data } });
  }

  console.log('pokedexes');
  // Paired games list the same Pokédexes; each is synced once. Which games list it is in the game config.
  const dexes = [
    { slug: NATIONAL_DEX_SLUG, name: 'National' },
    ...new Map(GAMES.flatMap((g) => g.pokedexes.map((d) => [d.slug, { slug: d.slug, name: d.name.en }] as const))).values(),
  ];
  for (const dex of dexes) {
    const d = dex.slug === NATIONAL_DEX_SLUG ? national : await get(`pokedex/${dex.slug}`);
    await prisma.pokedex.upsert({ where: { id: d.id }, update: dex, create: { id: d.id, ...dex } });
    await prisma.pokedexSlot.deleteMany({ where: { pokedexId: d.id } });
    await chunked(
      (d.pokemon_entries as Json[]).map((e) => ({
        pokedexId: d.id,
        speciesId: idFromUrl(e.pokemon_species.url),
        entryNumber: e.entry_number,
      })),
      (data) => prisma.pokedexSlot.createMany({ data, skipDuplicates: true })
    );
    console.log(`  ${dex.slug}: ${d.pokemon_entries.length} entries`);
  }

  await prisma.syncState.upsert({
    where: { key: 'pokeapi:lastSync' },
    update: { value: new Date().toISOString() },
    create: { key: 'pokeapi:lastSync', value: new Date().toISOString() },
  });
  console.log('done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
