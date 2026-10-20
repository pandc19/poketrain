import { describe, expect, it } from 'vitest';
import { dexPosition, gameDexes } from '@/lib/games';

describe('Pokédexes of a game', () => {
  it('filters by the slugs the game config lists', () => {
    expect(gameDexes('violet')).toEqual({ slug: { in: ['paldea', 'kitakami', 'blueberry'] } });
  });

  it('matches nothing for an unknown game', () => {
    expect(gameDexes('nope')).toEqual({ slug: { in: [] } });
  });

  it('orders Pokédexes as the config lists them, unlisted ones last', () => {
    expect(dexPosition('violet', 'paldea')).toBe(0);
    expect(dexPosition('violet', 'blueberry')).toBe(2);
    expect(dexPosition('violet', 'national')).toBeGreaterThan(dexPosition('violet', 'blueberry'));
  });
});
