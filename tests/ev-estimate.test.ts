import { describe, expect, it } from 'vitest';
import { estimateEvRange, estimateMaxEvs, levelHints, estimateEvs, statValue, statsAboveMax } from '@/lib/ev-estimate';
import { ivAssumption } from '@/lib/potential';

// Golem's base stats, and an Adamant nature (+Attack, -Sp. Atk).
const GOLEM = { hp: 80, attack: 120, defense: 130, specialAttack: 55, specialDefense: 65, speed: 45 };
const ADAMANT = { increased: 'attack', decreased: 'special-attack' };

describe('stat formula', () => {
  it('matches known values at level 100 with 31 IVs', () => {
    expect(statValue('hp', 80, 31, 0, 100, null)).toBe(301);
    expect(statValue('hp', 80, 31, 252, 100, null)).toBe(364);
    expect(statValue('attack', 120, 31, 252, 100, ADAMANT)).toBe(Math.floor((276 + 63) * 1.1));
    expect(statValue('specialAttack', 55, 31, 0, 100, ADAMANT)).toBe(131);
  });
});

describe('estimating EVs from stats', () => {
  it('reads the numbers from a real Golem summary (stats, not EVs)', () => {
    const evs = estimateEvs({
      stats: { hp: 331, attack: 328, defense: 297, speed: 126, specialDefense: 166, specialAttack: 131 },
      level: 100,
      baseStats: GOLEM,
      nature: ADAMANT,
    });
    // Mostly HP and Attack, a little Defense, nothing in the rest: what the yellow graph showed.
    expect(evs).toEqual({ hp: 120, attack: 92, defense: 4, specialAttack: 0, specialDefense: 0, speed: 0 });
  });

  it('always finds a spread that makes the same stat, never more than was used', () => {
    for (const ev of [0, 4, 100, 168, 252]) {
      for (const key of ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'] as const) {
        const stat = statValue(key, GOLEM[key], 31, ev, 100, ADAMANT);
        const stats = { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, [key]: stat };
        const back = estimateEvs({ stats, level: 100, baseStats: GOLEM, nature: ADAMANT });
        // Same stat; and the smallest such spread, so never above what was really invested.
        expect(statValue(key, GOLEM[key], 31, back[key], 100, ADAMANT)).toBe(stat);
        expect(back[key]).toBeLessThanOrEqual(ev);
      }
    }
  });

  it('reads a stat at its maximum as 252 at any level, not the fewest EVs that give the same number', () => {
    for (const level of [50, 75, 76, 99, 100]) {
      const stat = statValue('hp', GOLEM.hp, 31, 252, level, ADAMANT);
      const stats = { hp: stat, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };
      expect(estimateEvs({ stats, level, baseStats: GOLEM, nature: ADAMANT }).hp).toBe(252);
    }
  });

  it('is exact where the nature does not scale the stat', () => {
    for (const ev of [0, 4, 100, 168, 252]) {
      for (const key of ['hp', 'defense', 'specialDefense', 'speed'] as const) {
        const stat = statValue(key, GOLEM[key], 31, ev, 100, ADAMANT);
        const stats = { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, [key]: stat };
        expect(estimateEvs({ stats, level: 100, baseStats: GOLEM, nature: ADAMANT })[key]).toBe(ev);
      }
    }
  });

  it('never goes past 252 or below 0', () => {
    const evs = estimateEvs({
      stats: { hp: 9999, attack: 1, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      level: 100,
      baseStats: GOLEM,
      nature: null,
    });
    expect(evs.hp).toBe(252);
    expect(evs.attack).toBe(0);
  });

  it('returns the smallest spread when the level makes several EVs give one stat', () => {
    const stat = statValue('speed', 45, 31, 100, 50, null);
    const back = estimateEvs({
      stats: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: stat },
      level: 50,
      baseStats: GOLEM,
      nature: null,
    });
    expect(statValue('speed', 45, 31, back.speed, 50, null)).toBe(stat);
    expect(back.speed).toBeLessThanOrEqual(100);
  });
});

describe('IVs from the Judge potential', () => {
  const stats = { hp: 331, attack: 328, defense: 297, speed: 126, specialDefense: 166, specialAttack: 131 };

  it('knows the lowest IV each rating allows, and nothing without one', () => {
    expect(ivAssumption(null)).toMatchObject({ low: 31, fromPotential: false });
    expect(ivAssumption('DECENT')).toMatchObject({ low: 0, high: 15, fromPotential: true });
    expect(ivAssumption('OUTSTANDING')).toMatchObject({ low: 25, high: 31 });
  });

  it('shows the fewest EVs, and the potential only says how many more it could be', () => {
    const range = (potential: string | null) =>
      estimateEvRange({ stats, level: 100, baseStats: GOLEM, nature: ADAMANT, ivsLow: ivAssumption(potential).low });
    const total = (e: Record<string, number>) => Object.values(e).reduce((a, b) => a + b, 0);

    // The number shown never depends on the potential: it is the same 216 EVs.
    expect(range('DECENT').estimate).toEqual(range('OUTSTANDING').estimate);
    expect(range(null).estimate).toEqual({ hp: 120, attack: 92, defense: 4, specialAttack: 0, specialDefense: 0, speed: 0 });
    // A lower rating leaves more room above it.
    expect(total(range('DECENT').high)).toBeGreaterThan(total(range('ABOVE_AVERAGE').high));
    expect(total(range('ABOVE_AVERAGE').high)).toBeGreaterThan(total(range('OUTSTANDING').high));
    expect(total(range('OUTSTANDING').high)).toBeGreaterThanOrEqual(total(range('OUTSTANDING').estimate));
    // With no potential there is no room: the range is a single value.
    expect(range(null).high).toEqual(range(null).estimate);
  });
});

describe('stats above what the level allows', () => {
  // Lucario: 70 base HP. Its best HP is 253 at level 73 and 257 at level 74.
  const LUCARIO = { hp: 70, attack: 110, defense: 70, specialAttack: 115, specialDefense: 70, speed: 90 };
  const stats = { hp: 257, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };

  it('flags a stat that no EVs and IVs could reach at that level', () => {
    expect(statsAboveMax({ stats, level: 73, baseStats: LUCARIO, nature: null })).toEqual({ hp: 253 });
  });
  it('accepts the same stat at the level where it is the maximum', () => {
    expect(statsAboveMax({ stats, level: 74, baseStats: LUCARIO, nature: null })).toEqual({});
  });
});

describe('a stat shows a range of EVs, and the plan can sit inside it', () => {
  const base = { hp: 100, attack: 75, defense: 80, specialAttack: 40, specialDefense: 100, speed: 50 };
  const none = { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };
  // Level 75: a stat point takes about 5 steps of 4 EVs, so several amounts show the same number.
  const level = 75;
  const stats = { ...none, attack: 164 };

  it('has a top end above the fewest EVs when the level is low', () => {
    const low = estimateEvs({ stats, level, baseStats: base, nature: null, ivs: 31 });
    const top = estimateMaxEvs({ stats, level, baseStats: base, nature: null, ivs: 31 });
    expect(top.attack).toBeGreaterThan(low.attack);
    expect(top.attack % 4).toBe(0);
    // Every amount in between gives the same shown stat.
    for (let ev = low.attack; ev <= top.attack; ev += 4) {
      expect(statValue('attack', base.attack, 31, ev, level, null)).toBe(164);
    }
  });

  it('is the same number at level 100, where each step shows', () => {
    const s100 = { ...none, attack: 200 };
    const low = estimateEvs({ stats: s100, level: 100, baseStats: base, nature: null, ivs: 31 });
    const top = estimateMaxEvs({ stats: s100, level: 100, baseStats: base, nature: null, ivs: 31 });
    expect(top.attack).toBe(low.attack);
  });

  it('takes the plan as the amount when it is inside the range', () => {
    const args = { stats, level, baseStats: base, nature: null, ivsLow: 31 };
    const without = estimateEvRange(args).estimate.attack;
    const top = estimateMaxEvs({ stats, level, baseStats: base, nature: null, ivs: 31 }).attack;
    expect(top).toBeGreaterThan(without);
    expect(estimateEvRange({ ...args, plan: { ...none, attack: without + 4 } }).estimate.attack).toBe(without + 4);
  });

  it('leaves the estimate alone when the plan is beyond the range', () => {
    const args = { stats, level, baseStats: base, nature: null, ivsLow: 31 };
    const top = estimateMaxEvs({ stats, level, baseStats: base, nature: null, ivs: 31 }).attack;
    const without = estimateEvRange(args).estimate.attack;
    expect(estimateEvRange({ ...args, plan: { ...none, attack: top + 8 } }).estimate.attack).toBe(without);
  });

  it('uses the IVs the Judge left open: a plan of 252 fits a stat read at 248 with a lower IV', () => {
    // Attack 264 at level 66 with an IV between 16 and 25: the fewest EVs at IV 25 may be under 252, the most reach it.
    const s66 = { ...none, attack: 264 };
    const args = { stats: s66, level: 66, baseStats: { ...base, attack: 135 }, nature: null, ivsLow: 16 };
    const est = estimateEvRange(args).estimate.attack;
    const planned = estimateEvRange({ ...args, plan: { ...none, attack: 252 } }).estimate.attack;
    expect(planned).toBeGreaterThanOrEqual(est);
  });
});

describe('hints that the level may be behind the game', () => {
  const base = { hp: 90, attack: 100, defense: 60, specialAttack: 90, specialDefense: 60, speed: 80 };
  const nature = { increased: 'attack', decreased: 'special-attack' };
  const none = { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };

  it('flags a stat that sits exactly at the most it can be at this level', () => {
    const stats = { ...none, attack: statValue('attack', 100, 31, 252, 75, nature) };
    const { estimate } = estimateEvRange({ stats, level: 75, baseStats: base, nature, ivsLow: 31 });
    expect(levelHints({ stats, level: 75, baseStats: base, nature, estimate }).atMax).toEqual(['attack']);
  });

  it('flags stats that ask for more EVs than a Pokémon can have', () => {
    // Stats read at level 80 but recorded as level 70: every stat reads as a lot of EVs.
    const stats = {
      hp: statValue('hp', 90, 31, 100, 80, nature),
      attack: statValue('attack', 100, 31, 252, 80, nature),
      defense: statValue('defense', 60, 31, 252, 80, nature),
      specialAttack: statValue('specialAttack', 90, 31, 252, 80, nature),
      specialDefense: statValue('specialDefense', 60, 31, 252, 80, nature),
      speed: statValue('speed', 80, 31, 252, 80, nature),
    };
    const { estimate } = estimateEvRange({ stats, level: 74, baseStats: base, nature, ivsLow: 31 });
    const total = Object.values(estimate).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(508);
    expect(levelHints({ stats, level: 74, baseStats: base, nature, estimate }).overTotal).toBe(total);
  });

  it('says nothing at level 100', () => {
    const stats = { ...none, attack: statValue('attack', 100, 31, 252, 100, nature) };
    const { estimate } = estimateEvRange({ stats, level: 100, baseStats: base, nature, ivsLow: 31 });
    expect(levelHints({ stats, level: 100, baseStats: base, nature, estimate })).toEqual({ overTotal: null, atMax: [] });
  });
});

describe('very low levels', () => {
  // Frigibax at level 1: every stat reads 5 or 6 whatever its EVs are.
  const FRIGIBAX = { hp: 65, attack: 75, defense: 45, specialAttack: 35, specialDefense: 45, speed: 55 };
  const stats = { hp: 12, attack: 6, defense: 6, specialAttack: 5, specialDefense: 6, speed: 6 };

  it('reads no EVs from stats that EVs cannot move, instead of calling them full', () => {
    const evs = estimateEvs({ stats, level: 1, baseStats: FRIGIBAX, nature: null });
    expect(evs).toEqual({ hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 });
  });

  it('does not warn that the stats are at their most', () => {
    const { estimate } = estimateEvRange({ stats, level: 1, baseStats: FRIGIBAX, nature: null, ivsLow: 31 });
    expect(levelHints({ stats, level: 1, baseStats: FRIGIBAX, nature: null, estimate })).toEqual({ overTotal: null, atMax: [] });
  });
});

describe('very low levels with an EV plan', () => {
  const FRIGIBAX = { hp: 65, attack: 75, defense: 45, specialAttack: 35, specialDefense: 45, speed: 55 };
  const stats = { hp: 12, attack: 6, defense: 6, specialAttack: 5, specialDefense: 6, speed: 6 };

  it('does not take the plan as what the Pokémon has when the stats cannot show it', () => {
    const plan = { hp: 0, attack: 252, defense: 0, specialAttack: 0, specialDefense: 4, speed: 252 };
    const { estimate } = estimateEvRange({ stats, level: 1, baseStats: FRIGIBAX, nature: null, ivsLow: 31, plan });
    expect(estimate).toEqual({ hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 });
  });
});

describe('a plan of 252 does not make a stat read full', () => {
  // Kingambit at level 75, Adamant, Attack 299 with a "Pretty good" IV: 244 EVs fit, and so do 252.
  const KINGAMBIT = { hp: 100, attack: 135, defense: 120, specialAttack: 60, specialDefense: 85, speed: 50 };
  const stats = { hp: 277, attack: 299, defense: 223, specialAttack: 111, specialDefense: 158, speed: 109 };
  const args = {
    stats,
    level: 75,
    baseStats: KINGAMBIT,
    nature: ADAMANT,
    ivsLow: 31,
    ratings: { attack: 'MEDIUM' as const },
  };
  const none = { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };

  it('reads the plan as one step short of full when fewer EVs fit as well', () => {
    expect(estimateEvRange(args).estimate.attack).toBe(244);
    expect(estimateEvRange({ ...args, plan: { ...none, attack: 252 } }).estimate.attack).toBe(248);
  });

  it('still reads 252 when the stat itself is full', () => {
    const full = { ...stats, attack: statValue('attack', 135, 31, 252, 75, ADAMANT) };
    expect(estimateEvRange({ ...args, stats: full, ratings: null, plan: { ...none, attack: 252 } }).estimate.attack).toBe(252);
  });
});
