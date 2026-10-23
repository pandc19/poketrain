import { z } from 'zod';
import { TYPE_SLUGS } from './pokemon-types';

const Pick = z.object({ item: z.string().min(1).max(100), reason: z.string().max(1000) });
const MovePick = z.object({ move: z.string().min(1).max(100), reason: z.string().max(1000) });

/** The parts of an AI audit the player has fixed, so that running the audit again keeps them. */
export const AuditLocksSchema = z.object({
  heldItem: Pick.optional(),
  moves: z.array(MovePick).max(4).optional(),
  /** The Tera type: the AI's suggestion the player fixed, or one they chose themselves (no reason). */
  teraType: z.object({ type: z.enum(TYPE_SLUGS as [string, ...string[]]), reason: z.string().max(1000) }).optional(),
  /**
   * The Mint nature the player settled on (English name). `change` is set when the answer was to use that
   * Mint (rather than that none is needed): it is still to be chosen and given.
   */
  mint: z.object({ nature: z.string().min(1).max(40), reason: z.string().max(1000), change: z.boolean().optional() }).optional(),
});
export type AuditLocks = z.infer<typeof AuditLocksSchema>;

/**
 * The fixed Mint, when it still holds. With a Mint chosen (given or not), it holds when that is the one
 * fixed. With none chosen, a fixed change is still to be applied, and "no Mint needed" holds while its own
 * nature is the one fixed. Otherwise it is stale (another Mint was chosen, or the nature changed) and the
 * audit decides again.
 */
export function activeMint(
  locks: AuditLocks | null | undefined,
  mintChosen: string | null | undefined,
  realNature: string | null | undefined
) {
  const fixed = locks?.mint;
  if (!fixed) return undefined;
  const same = (a: string | null | undefined, b: string) => a != null && a.toLowerCase() === b.toLowerCase();
  if (mintChosen) return same(mintChosen, fixed.nature) ? fixed : undefined;
  return fixed.change || same(realNature, fixed.nature) ? fixed : undefined;
}

type Moves = { move: string; reason: string }[];

/**
 * The recommended moves with the fixed ones first and in the same order, then
 * the model's others to fill the four slots. A move is never listed twice.
 */
export function withFixedMoves(fixed: Moves | undefined, suggested: Moves): Moves {
  const out = [...(fixed ?? [])];
  const seen = new Set(out.map((m) => m.move.toLowerCase()));
  for (const m of suggested) {
    if (out.length >= 4) break;
    if (seen.has(m.move.toLowerCase())) continue;
    seen.add(m.move.toLowerCase());
    out.push(m);
  }
  return out;
}
