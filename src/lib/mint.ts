import type { RuleNature } from './audit-rules';

/** Two natures do the same to the stats (every neutral nature does nothing). */
export const sameEffect = (a: RuleNature, b: RuleNature) => a.increased === b.increased && a.decreased === b.decreased;

/** The Mint whose stat effect the game shows: one chosen but not yet given changes nothing. */
export const mintInForce = <N>(p: { mintNature: N | null; mintStatus: 'PENDING' | 'DONE' }): N | null =>
  p.mintStatus === 'DONE' ? p.mintNature : null;

/**
 * A model's Mint answer as the card shows it. The model only names the nature whose effect is best; `keep`
 * is whether the effect in force (`applied`: the given Mint's, else its nature's) is already that one, and
 * any neutral nature is as good as another. Worked out here so every provider gives the same answer.
 */
export function settleMint(raw: { nature: string; reason: string }, applied: string | null | undefined, natures: RuleNature[]) {
  const find = (name: string) => natures.find((n) => n.nameEn.toLowerCase() === name.trim().toLowerCase());
  const best = find(raw.nature);
  const now = applied ? find(applied) : undefined;
  const keep = best != null && now != null && sameEffect(best, now);
  return { nature: keep ? now.nameEn : (best?.nameEn ?? raw.nature), keep, reason: raw.reason };
}
