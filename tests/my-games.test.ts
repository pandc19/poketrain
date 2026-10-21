import { describe, expect, it } from 'vitest';
import { GAMES, type GameConfig } from '@/lib/games';
import { groupGames } from '@/lib/my-games';

const game = (id: string, pair?: string) => ({ id, pair }) as unknown as GameConfig;

describe('games, grouped as they are sold', () => {
  it('puts the two versions of a pair together, once', () => {
    const groups = groupGames(GAMES).map((g) => g.map((x) => x.id));
    expect(groups).toEqual([['violet', 'scarlet']]);
  });

  it('keeps a single game as a group of one, and the order of the config', () => {
    const games = [game('a'), game('b', 'c'), game('c', 'b'), game('d')];
    expect(groupGames(games).map((g) => g.map((x) => x.id))).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('puts a pair where its first version is, whichever version comes first', () => {
    const games = [game('x'), game('c', 'b'), game('y'), game('b', 'c')];
    expect(groupGames(games).map((g) => g.map((x) => x.id))).toEqual([['x'], ['c', 'b'], ['y']]);
  });

  it('treats a pair whose other version is missing as a single game', () => {
    expect(groupGames([game('b', 'gone')]).map((g) => g.map((x) => x.id))).toEqual([['b']]);
  });
});
