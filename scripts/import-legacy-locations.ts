/**
 * Moves the "where do I catch it?" answers saved in the per-user AI cache (ai_audits, kind "location")
 * into the shared dictionary (pokemon_locations). Safe to run more than once: an entry that already
 * exists in the dictionary is left as it is.
 *
 * The cache keys answers by a hash, not by species, so each key is rebuilt: for every game, species and
 * language, with each model that ever saved a location. Answers saved under an older prompt version, or a
 * model that no row names, cannot be matched and are only counted.
 *
 * It only touches the database named by DATABASE_URL (.env.local locally; set it to the production URL to
 * move the production answers).
 */
import { prisma } from '../src/lib/db';
import { GAMES, gameDexes } from '../src/lib/games';
import { legacyLocationHash } from '../src/lib/ai/tasks';
import type { Lang } from '../src/lib/i18n';
import type { LocationBody, StoredLocation } from '../src/lib/location-text';

const LANGS: Lang[] = ['en', 'es'];

async function main() {
  const rows = await prisma.aiAudit.findMany({
    where: { kind: 'location' },
    select: { provider: true, model: true, inputHash: true, result: true, createdAt: true },
  });
  const byKey = new Map(rows.map((r) => [`${r.provider}:${r.inputHash}`, r]));
  const models = [...new Map(rows.map((r) => [`${r.provider}\n${r.model}`, [r.provider, r.model] as const])).values()];
  console.log(`${rows.length} saved location answer(s), from ${models.length} model(s)`);

  // Per version group and species: the answer in each language, newest first.
  const found = new Map<string, { versionGroup: string; speciesId: number; stored: StoredLocation; at: Date; provider: string; model: string }>();
  const matched = new Set<string>();
  for (const game of GAMES) {
    const species = await prisma.species.findMany({
      where: { pokedexSlots: { some: { pokedex: gameDexes(game.id) } } },
      select: { id: true, nameEn: true },
    });
    for (const sp of species) {
      for (const lang of LANGS) {
        for (const [provider, model] of models) {
          const key = `${provider}:${legacyLocationHash(model, game.id, sp.nameEn, lang)}`;
          const row = byKey.get(key);
          if (!row) continue;
          matched.add(key);
          const id = `${game.versionGroup}:${sp.id}`;
          const entry = found.get(id) ?? { versionGroup: game.versionGroup, speciesId: sp.id, stored: {}, at: row.createdAt, provider, model };
          // Scarlet and Violet share a version group: keep the newest answer per language.
          const current = entry.stored[lang];
          if (!current || row.createdAt >= entry.at) entry.stored[lang] = row.result as LocationBody;
          if (row.createdAt >= entry.at) Object.assign(entry, { at: row.createdAt, provider, model });
          found.set(id, entry);
        }
      }
    }
  }

  let created = 0;
  for (const e of found.values()) {
    const exists = await prisma.pokemonLocation.findUnique({
      where: { versionGroup_speciesId_variant: { versionGroup: e.versionGroup, speciesId: e.speciesId, variant: '' } },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.pokemonLocation.create({
      data: {
        versionGroup: e.versionGroup,
        speciesId: e.speciesId,
        variant: '',
        result: e.stored as object,
        provider: e.provider,
        model: e.model,
        // Written by the prompt the old cache used, one language per answer.
        promptVersion: 12,
      },
    });
    created++;
  }
  console.log(`moved ${created} species into the dictionary (${found.size - created} were already there)`);
  console.log(`${rows.length - matched.size} answer(s) could not be matched (older prompt or model) and were left alone`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
