import { describe, expect, it } from 'vitest';
import { auditSuggestions } from '@/lib/audit-compare';

const now = { item: null, moves: [], tera: null, mintGiven: null, mintChosen: null, realNature: null, evs: null };

describe('Mint suggestion', () => {
  const use = { mint: { nature: 'Jolly', keep: false, reason: 'r' } };
  const none = { mint: { nature: 'Adamant', keep: true, reason: 'r' } };

  it('suggests the Mint to choose until the Mint field holds it', () => {
    expect(auditSuggestions(use, { ...now, realNature: 'Adamant' }).mint).toMatchObject({ target: 'Jolly', same: false });
    // Chosen but not given yet still matches: the field holds it.
    expect(auditSuggestions(use, { ...now, realNature: 'Adamant', mintChosen: 'Jolly' }).mint).toMatchObject({ same: true });
  });

  it('suggests no Mint when none is needed, and matches an empty field', () => {
    expect(auditSuggestions(none, { ...now, realNature: 'Adamant' }).mint).toMatchObject({ target: null, same: true });
    expect(auditSuggestions(none, { ...now, realNature: 'Adamant', mintChosen: 'Jolly' }).mint).toMatchObject({ target: null, same: false });
  });

  it('keeps the Mint it was given when its effect is the best', () => {
    const keep = { mint: { nature: 'Jolly', keep: true, reason: 'r' } };
    expect(auditSuggestions(keep, { ...now, realNature: 'Brave', mintGiven: 'Jolly', mintChosen: 'Jolly' }).mint).toMatchObject({ target: 'Jolly', same: true });
  });
});

describe('nature suggestion', () => {
  const audit = { nature: { nature: 'Jolly', reason: 'Fast physical attacker.' } };

  it('is offered while the Pokémon has no nature on record', () => {
    expect(auditSuggestions(audit, now).nature).toEqual({ nature: 'Jolly', reason: 'Fast physical attacker.', same: false });
  });

  it('matches once that nature is the one it has or aims for', () => {
    expect(auditSuggestions(audit, { ...now, realNature: 'jolly' }).nature?.same).toBe(true);
  });

  it('is absent from audits that did not ask for it', () => {
    expect(auditSuggestions({}, now).nature).toBeUndefined();
  });
});
