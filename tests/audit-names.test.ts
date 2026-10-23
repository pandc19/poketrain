import { describe, expect, it } from 'vitest';
import { keepLegalMoves, normalizeName, resolveName } from '@/lib/audit-names';

const MOVES = [
  { nameEn: 'Light Screen', nameEs: 'Pantalla de Luz' },
  { nameEn: 'Toxic', nameEs: 'Tóxico' },
  { nameEn: 'Soft-Boiled', nameEs: 'Amortiguador' },
  { nameEn: 'Calm Mind', nameEs: 'Paz Mental' },
  { nameEn: 'Fire Blast', nameEs: 'Llamarada' },
  { nameEn: 'Fire Fang', nameEs: 'Colmillo Ígneo' },
];

describe('resolveName', () => {
  it('finds a move by its English or Spanish name', () => {
    expect(resolveName('Light Screen', MOVES)?.nameEn).toBe('Light Screen');
    expect(resolveName('Pantalla de Luz', MOVES)?.nameEn).toBe('Light Screen');
  });

  it('ignores case, accents, punctuation and the small words of Spanish names', () => {
    expect(resolveName('Pantalla Luz', MOVES)?.nameEn).toBe('Light Screen');
    expect(resolveName('TOXICO', MOVES)?.nameEn).toBe('Toxic');
    expect(resolveName('soft boiled', MOVES)?.nameEn).toBe('Soft-Boiled');
    expect(resolveName('Colmillo Igneo', MOVES)?.nameEn).toBe('Fire Fang');
  });

  it('forgives one typo in a longer name, only when it is clearly one move', () => {
    expect(resolveName('Calm Mnd', MOVES)?.nameEn).toBe('Calm Mind');
    expect(resolveName('Fire Fan', MOVES)?.nameEn).toBe('Fire Fang');
  });

  it('finds nothing for a move that is not in the list', () => {
    expect(resolveName('Seismic Toss', MOVES)).toBeUndefined();
    expect(resolveName('', MOVES)).toBeUndefined();
    expect(normalizeName('Pantalla de Luz')).toBe('pantalla luz');
  });
});

describe('keepLegalMoves', () => {
  // Blissey in Scarlet and Violet: it learns Light Screen, but not Toxic.
  const POOL = MOVES.filter((m) => m.nameEn !== 'Toxic');
  const pick = (move: string) => ({ move, reason: `why ${move}` });

  it('names a move the way the game does, whatever language the model wrote it in', () => {
    const out = keepLegalMoves([pick('Soft-Boiled'), pick('Pantalla Luz'), pick('Calm Mind')], [], POOL);
    expect(out.map((m) => m.move)).toEqual(['Soft-Boiled', 'Light Screen', 'Calm Mind']);
    expect(out[1].reason).toBe('why Pantalla Luz');
  });

  it('leaves out a move the Pokémon cannot learn', () => {
    expect(keepLegalMoves([pick('Light Screen'), pick('Tóxico'), pick('Toxic')], [], POOL).map((m) => m.move)).toEqual(['Light Screen']);
  });

  it('does not repeat a fixed move or a move already chosen, and keeps the slots that are left', () => {
    const out = keepLegalMoves([pick('Pantalla de Luz'), pick('Calm Mind'), pick('Paz Mental'), pick('Fire Blast')], ['Light Screen'], POOL);
    expect(out.map((m) => m.move)).toEqual(['Calm Mind', 'Fire Blast']);
    expect(keepLegalMoves(MOVES.map((m) => pick(m.nameEn)), ['Fire Fang', 'Toxic'], MOVES)).toHaveLength(2);
  });
});
