import type { Lang } from './i18n';

/** One language's answer to "where do I catch it?". Same shape the model returns. */
export type LocationBody = {
  found: boolean;
  locations: { place: string; nearby: string; details: string }[];
  notes: string;
};

/**
 * What the shared dictionary stores for a species: the answer in each language. A lookup fills both;
 * answers brought over from the old per-user cache were written in one language only.
 */
export type StoredLocation = { en?: LocationBody; es?: LocationBody };

/** The answer in the player's language, or in the other one when that is all there is. */
export function pickLocation(stored: StoredLocation | null | undefined, lang: Lang): LocationBody | null {
  if (!stored) return null;
  const other: Lang = lang === 'es' ? 'en' : 'es';
  return stored[lang] ?? stored[other] ?? null;
}
