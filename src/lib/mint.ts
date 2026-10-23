import type { RuleNature } from './audit-rules';
import { resolveName } from './audit-names';

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
  // The model may write the nature as a player says it (Spanish, without an accent): it is matched, not compared.
  const best = resolveName(raw.nature, natures);
  const now = applied ? natures.find((n) => n.nameEn.toLowerCase() === applied.toLowerCase()) : undefined;
  const keep = best != null && now != null && sameEffect(best, now);
  return { nature: keep ? now.nameEn : (best?.nameEn ?? raw.nature), keep, reason: raw.reason };
}
