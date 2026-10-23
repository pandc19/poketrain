/**
 * Matching the names a model writes against the game's own. A model is told to give moves, items and natures
 * by their English name, but writes the Spanish one, or a near miss ("Pantalla Luz" for "Pantalla de Luz"),
 * so a name is matched without accents, case, punctuation or the little words Spanish names add.
 */

const SMALL_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las']);

export const normalizeName = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !SMALL_WORDS.has(word))
    .join(' ');

/** Edits (insert, delete, change) between two short strings. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/**
 * The entry a name stands for, by its English or Spanish name: an exact match first, else the one entry a
 * single typo away (names of 6 letters or more). Nothing when it is not clearly one of them.
 */
export function resolveName<T extends { nameEn: string; nameEs?: string | null }>(text: string, list: T[]): T | undefined {
  const query = normalizeName(text);
  if (!query) return undefined;
  const names = (x: T) => [normalizeName(x.nameEn), x.nameEs ? normalizeName(x.nameEs) : ''].filter(Boolean);
  const exact = list.find((x) => names(x).includes(query));
  if (exact || query.length < 6) return exact;
  const near = list.filter((x) => names(x).some((n) => Math.abs(n.length - query.length) <= 1 && distance(n, query) <= 1));
  return near.length === 1 ? near[0] : undefined;
}

/**
 * The moves a model suggested that the Pokémon can have, under the game's English names and without
 * repeating a fixed move or each other. A move that is not in `pool` is left out (the model was told to
 * choose only from it), so the caller fills the rest.
 */
export function keepLegalMoves<M extends { nameEn: string; nameEs?: string | null }>(
  picks: { move: string; reason: string }[],
  fixed: string[],
  pool: M[]
): { move: string; reason: string }[] {
  const taken = new Set(fixed.map(normalizeName));
  const kept: { move: string; reason: string }[] = [];
  for (const pick of picks) {
    const hit = resolveName(pick.move, pool);
    if (!hit || taken.has(normalizeName(hit.nameEn))) continue;
    taken.add(normalizeName(hit.nameEn));
    kept.push({ ...pick, move: hit.nameEn });
  }
  return kept.slice(0, Math.max(0, 4 - fixed.length));
}
