import { describe, expect, it } from 'vitest';
import { dexPosition, gameDexes, getGame } from '@/lib/games';

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

describe('Scarlet and Violet', () => {
  const scarlet = getGame('scarlet')!;
  const violet = getGame('violet')!;

  it('are each other’s pair and share Pokédexes and learnsets', () => {
    expect(scarlet.pair).toBe('violet');
    expect(violet.pair).toBe('scarlet');
    expect(gameDexes('scarlet')).toEqual(gameDexes('violet'));
    expect(scarlet.learnsetVersionGroups).toEqual(violet.learnsetVersionGroups);
  });

  it('have mirrored exclusives', () => {
    const groups = (g: typeof scarlet) => g.versionExclusives!.groups.map((x) => ({ id: x.id, own: x.own, other: x.other }));
    expect(groups(scarlet)).toEqual(groups(violet).map((x) => ({ id: x.id, own: x.other, other: x.own })));
    expect(scarlet.versionExclusives!.ownName).toBe('Scarlet');
    expect(scarlet.versionExclusives!.otherName).toBe('Violet');
  });

  it('look different', () => {
    expect(scarlet.theme.motif).toBe('ancient');
    expect(violet.theme.motif).toBe('future');
  });
});
