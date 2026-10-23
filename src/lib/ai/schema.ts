import { z } from 'zod';
import { TYPE_SLUGS } from '../pokemon-types';

/** Shapes every AI provider must return. Kept small: each field is shown in the UI. */

/**
 * What an audit of one Pokémon gives: how to finish its EV training, the best
 * held item, and the best moves. Nothing else.
 */
export const BuildAuditSchema = z.object({
  evPlan: z
    .object({
      spread: z.string().describe('The EV spread to finish with, e.g. "252 Atk / 252 Spe / 6 HP"'),
      toTrain: z.string().describe('Exactly what is still missing from its current EVs'),
      /** Written by earlier versions; the Pokémon to battle now come from game data (`sources`). */
      steps: z.array(z.string()).optional(),
      items: z
        .array(z.object({ item: z.string(), stat: z.string(), why: z.string() }))
        .optional()
        .describe('Vitamins and Power items for the missing EVs'),
      sources: z
        .array(
          z.object({
            stat: z.string(),
            species: z.array(z.object({ id: z.number(), nameEn: z.string(), nameEs: z.string(), amount: z.number() })),
          })
        )
        .optional()
        .describe('The Pokémon that give each missing stat'),
    })
    .describe('How to finish its EV training'),
  heldItem: z
    .object({ item: z.string(), reason: z.string() })
    .describe('The best held item for it as it is now. If it already holds the best one, name it'),
  recommendedMoves: z
    .array(z.object({ move: z.string(), reason: z.string() }))
    .describe('The best set of up to four moves for it, chosen only from the moves it can learn in this game'),
  mint: z
    .object({
      nature: z.string().describe('The nature whose stat effect it should have, in English (one of the 25 natures)'),
      keep: z.boolean().describe('True when the effect it has now is already that one, so nothing needs to change'),
      reason: z.string(),
    })
    .describe('Which Mint to use: keep the effect it has, or change it to a better nature'),
  nature: z
    .object({
      nature: z.string().describe('The nature to aim for, in English (one of the 25 natures)'),
      reason: z.string(),
    })
    .describe('The best nature for it, to catch or breed one with. Only asked when it has no nature on record'),
  teraType: z
    .object({ type: z.enum(TYPE_SLUGS as [string, ...string[]]), reason: z.string() })
    .describe('The best Tera type for it. If the one it has is already the best, name it'),
});
export type BuildAudit = z.infer<typeof BuildAuditSchema>;

/**
 * What the model returns. The EV plan is the spread as numbers per stat, so
 * nothing can be mistaken for a stat value; the text shown, the vitamin counts
 * and the Pokémon to battle are all built from it in code. The Mint is only the
 * nature whose effect is best: whether that means keeping what it has, needing no
 * Mint or using one is worked out in code from what the Pokémon has.
 */
export const BuildAuditRawSchema = BuildAuditSchema.omit({ evPlan: true }).extend({
  mint: z
    .object({
      nature: z.string().describe('The nature whose stat effect is best for it, in English (one of the 25 natures)'),
      reason: z.string().describe('One sentence: what that effect raises and lowers, and why that suits it'),
    })
    .describe('The nature effect it should have'),
  evPlan: z
    .object({
      spread: z
        .object({
          hp: z.number().int(),
          attack: z.number().int(),
          defense: z.number().int(),
          specialAttack: z.number().int(),
          specialDefense: z.number().int(),
          speed: z.number().int(),
        })
        .describe(
          'EVs (not stats) it should have when finished: whole EVs per stat, at most 252 each, adding up to 510 (never more)'
        ),
    })
    .describe('How to finish its EV training'),
});
export type BuildAuditRaw = z.infer<typeof BuildAuditRawSchema>;

/** Which parts of the audit the model is asked for: the ones the player has not fixed, and the game has. */
export type AuditAsk = { evPlan: boolean; heldItem: boolean; moves: boolean; tera: boolean; mint: boolean; nature: boolean };

/**
 * The answer to ask for. Only the parts in `ask` are in it, so a fixed part is never
 * decided (or paid for) again; the rest of the audit is put together in code.
 */
export function buildAuditSchema(ask: AuditAsk, hasEvs: boolean) {
  const base = BuildAuditRawSchema;
  const omit: Record<string, true> = {};
  // A game without EV training has no EV plan to give.
  if (!ask.evPlan || !hasEvs) omit.evPlan = true;
  if (!ask.heldItem) omit.heldItem = true;
  if (!ask.moves) omit.recommendedMoves = true;
  if (!ask.tera) omit.teraType = true;
  if (!ask.mint) omit.mint = true;
  if (!ask.nature) omit.nature = true;
  const keys = Object.keys(omit).filter((k) => k in base.shape);
  return base.omit(Object.fromEntries(keys.map((k) => [k, true])) as never) as unknown as z.ZodType<Partial<BuildAuditRaw>>;
}

export const LocationSchema = z.object({
  found: z.boolean(),
  locations: z
    .array(
      z.object({
        place: z.string().describe('Area name'),
        nearby: z.string().describe('The nearest fast-travel point, town or region to travel to. Empty if not known'),
        details: z.string().describe('One short sentence on where in the area or how to get to it'),
      })
    )
    .max(2),
  notes: z.string().describe('Empty, or one short sentence'),
});
export type LocationResult = z.infer<typeof LocationSchema>;

/** One request answers in both languages, so the shared dictionary serves every player. */
export const BilingualLocationSchema = z.object({
  en: LocationSchema.describe('Written in English'),
  es: LocationSchema.describe('Written in Spanish from Spain'),
});
