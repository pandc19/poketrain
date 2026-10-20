import { describe, expect, it } from 'vitest';
import { auditAsk, gameHasMints, type AuditSubject } from '@/lib/audit-ask';

const SV = { hasEvs: true, hasTera: true, hasMint: true };
const named = (nameEn: string) => ({ nameEn });

const open: AuditSubject = { auditLocks: null, evs: null, currentNature: named('Jolly'), targetNature: null, mintNature: null };

const allFixed: AuditSubject = {
  ...open,
  evs: { hp: 4, attack: 252, defense: 0, specialAttack: 0, specialDefense: 0, speed: 252 },
  auditLocks: {
    heldItem: { item: 'Life Orb', reason: 'x' },
    moves: ['Earthquake', 'Outrage', 'Swords Dance', 'Stone Edge'].map((move) => ({ move, reason: 'x' })),
    teraType: { type: 'dragon', reason: 'x' },
    // The Mint holds while the Pokémon has no Mint and its own nature is the one chosen.
    mint: { nature: 'Jolly', reason: 'x' },
  },
};

describe('what an audit still has to work out', () => {
  it('asks for every part of a Pokémon with nothing fixed', () => {
    const { ask, nothingToAsk } = auditAsk(open, SV);
    expect(ask).toEqual({ evPlan: true, heldItem: true, moves: true, tera: true, nature: false, mint: true });
    expect(nothingToAsk).toBe(false);
  });

  it('asks for nothing when every part is fixed, so no model is needed', () => {
    const { ask, nothingToAsk } = auditAsk(allFixed, SV);
    expect(ask).toEqual({ evPlan: false, heldItem: false, moves: false, tera: false, nature: false, mint: false });
    expect(nothingToAsk).toBe(true);
  });

  it('leaves out each part as it is fixed, and only that part', () => {
    const locks = allFixed.auditLocks!;
    expect(auditAsk({ ...open, auditLocks: { heldItem: locks.heldItem } }, SV).ask).toMatchObject({ heldItem: false, moves: true, tera: true });
    expect(auditAsk({ ...open, auditLocks: { teraType: locks.teraType } }, SV).ask).toMatchObject({ tera: false, heldItem: true });
    expect(auditAsk({ ...open, evs: allFixed.evs }, SV).ask).toMatchObject({ evPlan: false, heldItem: true });
  });

  it('keeps asking for the free moves while fewer than four are fixed', () => {
    const two = { moves: allFixed.auditLocks!.moves!.slice(0, 2) };
    expect(auditAsk({ ...open, auditLocks: two }, SV).ask.moves).toBe(true);
    expect(auditAsk({ ...open, auditLocks: { moves: allFixed.auditLocks!.moves } }, SV).ask.moves).toBe(false);
  });

  it('asks again for a fixed Mint that no longer holds (the nature changed)', () => {
    const changed = { ...allFixed, currentNature: named('Adamant') };
    expect(auditAsk(changed, SV).ask.mint).toBe(true);
    expect(auditAsk(changed, SV).nothingToAsk).toBe(false);
  });

  it('asks for a nature when none is on record, even with everything else fixed', () => {
    const noNature = { ...allFixed, currentNature: null };
    expect(auditAsk(noNature, SV).ask.nature).toBe(true);
    expect(auditAsk(noNature, SV).nothingToAsk).toBe(false);
  });

  it('skips what the game does not have', () => {
    const none = { hasEvs: false, hasTera: false, hasMint: false };
    expect(auditAsk(open, none).ask).toEqual({ evPlan: false, heldItem: true, moves: true, tera: false, nature: false, mint: false });
  });

  it('knows which games have Mints from their catalog', () => {
    expect(gameHasMints({ catalog: [{ id: 'mints' }, { id: 'berries' }] })).toBe(true);
    expect(gameHasMints({ catalog: [{ id: 'berries' }] })).toBe(false);
  });
});
