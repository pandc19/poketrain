import { prisma } from '../db';
import { getGameLanguage } from '../game-language';
import { SCARLET_VIOLET_PLACES } from '../games/places';
import type { Lang } from '../i18n';
import type { LocationBody } from '../location-text';
import type { GameLanguage } from '../name-variants';

type Dictionary = { map: Map<string, string>; re: RegExp };
/** One dictionary for each Spanish: the names are read the way the player's game language calls them (see db.ts). */
const loading = new Map<GameLanguage, Promise<Dictionary>>();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every game name that differs between English and Spanish (places, moves, items, abilities, natures, Pokémon), loaded
 * once per server run and game language. It is what the game itself calls them in Spanish, taken from the synced
 * game data.
 */
function load(variant: GameLanguage): Promise<Dictionary> {
  if (!loading.has(variant)) loading.set(variant, (async () => {
    const [moves, items, abilities, natures, species] = await Promise.all([
      prisma.move.findMany({ select: { nameEn: true, nameEs: true } }),
      prisma.item.findMany({ select: { nameEn: true, nameEs: true } }),
      prisma.ability.findMany({ select: { nameEn: true, nameEs: true } }),
      prisma.nature.findMany({ select: { nameEn: true, nameEs: true } }),
      prisma.species.findMany({ select: { nameEn: true, nameEs: true } }),
    ]);
    const map = new Map<string, string>();
    // The places go first: where a place and a Pokémon share a name, the place is what a location answer means.
    for (const p of SCARLET_VIOLET_PLACES) map.set(p.en, p.es);
    for (const row of [...species, ...abilities, ...natures, ...items, ...moves]) {
      // Short or identical names are left alone: they are too easy to meet as ordinary words.
      if (row.nameEn.length >= 4 && row.nameEs && row.nameEs !== row.nameEn && !map.has(row.nameEn)) {
        map.set(row.nameEn, row.nameEs);
      }
    }
    const names = [...map.keys()].sort((a, b) => b.length - a.length).map(escape);
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
    return { map, re };
  })());
  return loading.get(variant)!;
}

/**
 * Writes the game names found in a text the way the player's language shows them. Only English names exactly
 * as the English game spells them are touched, so it is safe on text the model wrote in Spanish.
 */
export async function localizeNames(text: string, lang: Lang): Promise<string> {
  if (lang !== 'es' || !text) return text;
  const { map, re } = await load(await getGameLanguage());
  return text.replace(re, (name) => map.get(name) ?? name);
}

/**
 * A location answer in the player's language. The saved Spanish text has the places that were left in English
 * (Kitakami, Asado Desert...) written the way the Spanish game does, which also fixes answers saved before the
 * places were known. The English text is left as it is. Nothing is sent to a model.
 */
export async function localizeLocation(body: LocationBody | null, lang: Lang): Promise<LocationBody | null> {
  if (!body || lang !== 'es') return body;
  const say = (text: string) => localizeNames(text, lang);
  return {
    ...body,
    locations: await Promise.all(body.locations.map(async (l) => ({ place: await say(l.place), nearby: await say(l.nearby), details: await say(l.details) }))),
    notes: await say(body.notes),
  };
}
