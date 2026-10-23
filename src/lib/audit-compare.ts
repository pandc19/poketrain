/** What the audit suggests, set against what the Pokémon has now. Pure, so the same answer feeds the fields and the summary. */

type AuditLike = {
  heldItem?: { item: string; reason: string };
  recommendedMoves?: { move: string; reason: string }[];
  teraType?: { type: string; reason: string };
  mint?: { nature: string; keep: boolean; reason: string };
  nature?: { nature: string; reason: string };
  evPlan?: { spread: string };
};

export type Current = {
  /** English name of the held item, or the free-text note. */
  item: string | null;
  /** English names of its moves. */
  moves: string[];
  tera: string | null;
  /** English name of the nature of the Mint it was given (one only chosen does not count). */
  mintGiven: string | null;
  /** English name of the nature of the Mint chosen in its Mint field, given or not. */
  mintChosen: string | null;
  /** English name of its own nature. */
  realNature: string | null;
  /** Its EV plan as text, in the same format the audit writes. */
  evs: string | null;
};

export type AuditSuggestions = {
  item?: { name: string; reason: string; same: boolean };
  moves?: { move: string; reason: string; has: boolean }[];
  tera?: { type: string; reason: string; same: boolean };
  /** `target` is the Mint its Mint field should hold (null: none), the one Apply chooses. */
  mint?: { nature: string; keep: boolean; reason: string; target: string | null; same: boolean };
  nature?: { nature: string; reason: string; same: boolean };
  evs?: { spread: string; same: boolean };
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  a != null && b != null && a.trim().toLowerCase() === b.trim().toLowerCase();

export function auditSuggestions(audit: AuditLike | null | undefined, now: Current): AuditSuggestions {
  const out: AuditSuggestions = {};
  if (!audit) return out;
  if (audit.heldItem) {
    out.item = { name: audit.heldItem.item, reason: audit.heldItem.reason, same: same(audit.heldItem.item, now.item) };
  }
  if (audit.recommendedMoves?.length) {
    const have = new Set(now.moves.map((m) => m.toLowerCase()));
    out.moves = audit.recommendedMoves.map((m) => ({ ...m, has: have.has(m.move.toLowerCase()) }));
  }
  if (audit.teraType) {
    out.tera = { type: audit.teraType.type, reason: audit.teraType.reason, same: same(audit.teraType.type, now.tera) };
  }
  if (audit.mint) {
    const m = audit.mint;
    const hasMint = now.mintGiven != null;
    // An answer saved before the Pokémon changed ("keep" a Mint it never had) says nothing now.
    const stale = m.keep && !hasMint && !same(m.nature, now.realNature);
    if (!stale) {
      // Keeping the effect means keeping the Mint it was given, or choosing none; otherwise that nature's Mint.
      const target = m.keep ? now.mintGiven : m.nature;
      out.mint = { ...m, target, same: target == null ? now.mintChosen == null : same(target, now.mintChosen) };
    }
  }
  if (audit.nature) {
    out.nature = { ...audit.nature, same: same(audit.nature.nature, now.realNature) };
  }
  const spread = audit.evPlan?.spread;
  if (spread && spread !== 'nothing' && spread !== 'nada') {
    out.evs = { spread, same: now.evs != null && now.evs === spread };
  }
  return out;
}
