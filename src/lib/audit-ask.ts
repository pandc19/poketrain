import { activeMint, type AuditLocks } from './audit-locks';
import type { AuditAsk } from './ai/schema';

type Named = { nameEn: string } | null;

/** The parts of a roster Pokémon that decide what an audit still has to work out. */
export type AuditSubject = {
  auditLocks: AuditLocks | null;
  /** The EV spread the player is training towards (a fixed plan). */
  evs: unknown;
  currentNature: Named;
  targetNature: Named;
  mintNature: Named;
};

/** What the game offers: EV training, Tera types, and Mints (the game's catalog lists them). */
export type AuditGame = { hasEvs: boolean; hasTera: boolean; hasMint: boolean };

/**
 * Which parts of an audit are still open. A part the player has fixed is kept as it is, by every kind of
 * audit (quick, AI), and is never decided again; only the open ones are worked out. When none are open the
 * audit is built from the fixed parts alone and nothing is asked of a model.
 */
export function auditAsk(p: AuditSubject, game: AuditGame) {
  const locks = p.auditLocks;
  // A fixed Mint only counts while it still holds (it is the Mint chosen, still to be chosen, or none is needed).
  const mintLock = game.hasMint
    ? activeMint(locks, p.mintNature?.nameEn, (p.currentNature ?? p.targetNature)?.nameEn)
    : undefined;
  const hasNature = Boolean(p.currentNature || p.targetNature || p.mintNature);
  const planFixed = game.hasEvs && p.evs != null;
  const ask: AuditAsk = {
    evPlan: game.hasEvs && !planFixed,
    heldItem: !locks?.heldItem,
    moves: (locks?.moves?.length ?? 0) < 4,
    tera: game.hasTera && !locks?.teraType,
    // With no nature on record, the first thing to settle is which nature to aim for; a Mint only fixes a
    // nature it already has, so it is asked once there is one.
    nature: !hasNature,
    mint: game.hasMint && !mintLock && hasNature,
  };
  return { ask, mintLock, hasNature, planFixed, nothingToAsk: !Object.values(ask).some(Boolean) };
}

/** Mints exist where the game's catalog lists them. */
export const gameHasMints = (game: { catalog: { id: string }[] }) => game.catalog.some((s) => s.id === 'mints');
