import { describe, expect, it } from 'vitest';
import { SCARLET_VIOLET_PLACES } from '@/lib/games/places';

const es = (en: string) => SCARLET_VIOLET_PLACES.find((p) => p.en === en)?.es;

describe('the places of Scarlet and Violet', () => {
  it('name Kitakami and the numbered areas the way the Spanish game does', () => {
    expect(es('Kitakami')).toBe('Noroteo');
    expect(es('South Province (Area Six)')).toBe('Área 6 del sur');
    expect(es('West Province (Area One)')).toBe('Área 1 del oeste');
  });

  it('have as many numbered areas as the map: six in the south, three in the others', () => {
    expect(es('North Province (Area Three)')).toBe('Área 3 del norte');
    expect(es('North Province (Area Four)')).toBeUndefined();
    expect(es('South Province (Area Four)')).toBe('Área 4 del sur');
  });

  it('list each English name once, so one name cannot mean two places', () => {
    const names = SCARLET_VIOLET_PLACES.map((p) => p.en);
    expect(new Set(names).size).toBe(names.length);
  });

  it('give no place an empty name', () => {
    expect(SCARLET_VIOLET_PLACES.every((p) => p.en.trim() && p.es.trim())).toBe(true);
  });
});
