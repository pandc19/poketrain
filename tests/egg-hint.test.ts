import { describe, expect, it } from 'vitest';
import { chooseTeachers, eggMoveHint, type Teacher } from '@/lib/egg-hint';

const teacher = (nameEn: string, over: Partial<Teacher> = {}): Teacher => ({
  nameEn,
  nameEs: nameEn.toLowerCase(),
  owned: false,
  breeds: true,
  inBaseGame: true,
  where: null,
  ...over,
});

describe('chooseTeachers', () => {
  it("puts the player's own first, then base game ones, then ones that breed", () => {
    const out = chooseTeachers([
      teacher('Chimecho', { inBaseGame: false, where: 'DLC' }),
      teacher('Iron Hands', { breeds: false }),
      teacher('Mankey'),
      teacher('Zubat', { owned: true }),
    ]);
    expect(out.map((t) => t.nameEn)).toEqual(['Zubat', 'Mankey', 'Iron Hands']);
  });

  it('names at most three', () => {
    expect(chooseTeachers(['A', 'B', 'C', 'D', 'E'].map((n) => teacher(n)))).toHaveLength(3);
  });
});

describe('eggMoveHint', () => {
  const heal = [teacher('Chimecho', { nameEs: 'Chimecho', inBaseGame: false, where: 'DLC: The Teal Mask' })];

  it('says how to teach it, in English', () => {
    expect(eggMoveHint('en', 'Mirror Herb', heal)).toBe(
      'Egg move: hold a Mirror Herb at a picnic with a Pokémon that already knows it, such as Chimecho (DLC: The Teal Mask).'
    );
  });

  it('says it in Spanish, with the Pokémon the player has marked as theirs', () => {
    const out = eggMoveHint('es', 'Hierba Copia', [teacher('Mankey', { nameEs: 'Mankey', owned: true })]);
    expect(out).toBe('Movimiento huevo: llévale la Hierba Copia a un picnic con un Pokémon que ya lo sepa, como Mankey (el tuyo).');
  });
});
