import type { EvSpread } from './import/evs';
import { ivBoundsFor, type IvRatings } from './iv-ratings';

/** The stat a nature raises or lowers, as PokéAPI names it ("special-attack"). */
export type NatureEffect = { increased: string | null; decreased: string | null } | null;

const KEY_OF: Record<string, keyof EvSpread> = {
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'specialAttack',
  'special-defense': 'specialDefense',
  speed: 'speed',
};

const multiplier = (key: keyof EvSpread, nature: NatureEffect): number => {
  if (!nature || key === 'hp') return 1;
  if (nature.increased && KEY_OF[nature.increased] === key) return 1.1;
  if (nature.decreased && KEY_OF[nature.decreased] === key) return 0.9;
  return 1;
};

/** The stat the games show for given base stat, IV, EV, level and nature (generation 3 and later). */
export function statValue(
  key: keyof EvSpread,
  base: number,
  iv: number,
  ev: number,
  level: number,
  nature: NatureEffect
): number {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  if (key === 'hp') return core + level + 10;
  return Math.floor((core + 5) * multiplier(key, nature));
}

/**
 * Works backwards from the stats the game shows to the EVs behind them.
 *
 * The stat depends on IVs too, which are not visible, so perfect IVs (31) are
 * assumed. A Pokémon with lower IVs has more EVs than this says; the result is
 * the smallest spread that produces the stat. Below level 100 several EVs can
 * give the same stat, and the smallest is returned, except a stat at its
 * maximum, which reads as 252. Values are multiples of 4
 * (only each 4 EVs add a point) and never above 252.
 */
export function estimateEvs(args: {
  stats: EvSpread;
  level: number;
  baseStats: EvSpread;
  nature: NatureEffect;
  /** One IV for every stat, or an IV per stat (31 for any left out). */
  ivs?: number | Partial<Record<keyof EvSpread, number>>;
}): EvSpread {
  const { stats, level, baseStats, nature, ivs = 31 } = args;
  const out: EvSpread = { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };
  (Object.keys(out) as (keyof EvSpread)[]).forEach((key) => {
    const target = stats[key];
    if (!target) return;
    const iv = typeof ivs === 'number' ? ivs : (ivs[key] ?? 31);
    // At a very low level the stat does not move with EVs at all (level 1 shows 6 whether the Pokémon
    // has none or 252), so it says nothing about them: read it as none, not as full.
    if (statValue(key, baseStats[key], iv, 0, level, nature) === statValue(key, baseStats[key], iv, 252, level, nature)) {
      out[key] = 0;
      return;
    }
    // A stat at its maximum for this level has 252 EVs: below level 100 a few
    // fewer give the same number, but the stat could not tell them apart and
    // the game shows it as full.
    if (statValue(key, baseStats[key], iv, 252, level, nature) <= target) {
      out[key] = 252;
      return;
    }
    // Smallest number of 4-EV steps that makes the shown stat.
    for (let steps = 0; steps <= 63; steps++) {
      if (statValue(key, baseStats[key], iv, steps * 4, level, nature) >= target) {
        out[key] = steps * 4;
        return;
      }
    }
    out[key] = 252;
  });
  return out;
}

export const MAX_EV_TOTAL = 510;
const MAX_STAT_EV = 252;

/**
 * The most EVs (in fours, up to 252) that still show the stat that is shown. Below level 100 several
 * EV amounts give the same number (at level 75 a point takes about 5 steps of 4), so what the stat
 * says is a range: this is its top end, and `estimateEvs` its bottom.
 */
export function estimateMaxEvs(args: {
  stats: EvSpread;
  level: number;
  baseStats: EvSpread;
  nature: NatureEffect;
  ivs?: number | Partial<Record<keyof EvSpread, number>>;
}): EvSpread {
  const { stats, level, baseStats, nature, ivs = 31 } = args;
  const out: EvSpread = { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };
  (Object.keys(out) as (keyof EvSpread)[]).forEach((key) => {
    const target = stats[key];
    if (!target) return;
    const iv = typeof ivs === 'number' ? ivs : (ivs[key] ?? 31);
    for (let steps = 63; steps >= 0; steps--) {
      if (statValue(key, baseStats[key], iv, steps * 4, level, nature) <= target) {
        out[key] = steps * 4;
        return;
      }
    }
  });
  return out;
}

/**
 * The fewest EVs that fit the stats (`estimate`) and the most they could be
 * (`high`).
 *
 * Each stat's IV is what the Judge said about it: a judged stat is held to its
 * band ("Inmejorable" is exactly 31, so its EVs are exact), an unjudged one can
 * be anywhere from `ivsLow` (what the overall potential allows, 31 when that
 * is unknown) to 31. The fewest EVs assume the highest IV each stat can have,
 * the most assume the lowest. The real EVs are somewhere between the two.
 */
export function estimateEvRange(args: {
  stats: EvSpread;
  level: number;
  baseStats: EvSpread;
  nature: NatureEffect;
  /** The lowest average IV the overall potential allows, for stats not judged. */
  ivsLow: number;
  ratings?: IvRatings | null;
  /**
   * The EV plan, if there is one. A stat only says a range of EVs (see `estimateMaxEvs`, and the IVs
   * the Judge left open), so where the plan's amount is inside that range it is taken as the amount:
   * the stat cannot show the difference, and the plan is the best reading of it (never as 252 unless the
   * stat itself reads full).
   */
  plan?: Partial<EvSpread> | null;
}): { estimate: EvSpread; high: EvSpread } {
  const { ivsLow, ratings, plan, ...rest } = args;
  const keys = Object.keys(args.stats) as (keyof EvSpread)[];
  const best: Partial<Record<keyof EvSpread, number>> = {};
  const worst: Partial<Record<keyof EvSpread, number>> = {};
  for (const key of keys) {
    const bounds = ivBoundsFor(ratings, key, ivsLow);
    best[key] = bounds.high;
    worst[key] = bounds.low;
  }
  const estimate = estimateEvs({ ...rest, ivs: best });
  if (plan) {
    const most = estimateMaxEvs({ ...rest, ivs: worst });
    for (const key of keys) {
      const want = plan[key];
      // A stat EVs cannot move at this level (level 1) says nothing, so the plan is not a reading of it.
      const moves = statValue(key, rest.baseStats[key], best[key] ?? 31, 0, rest.level, rest.nature) !==
        statValue(key, rest.baseStats[key], best[key] ?? 31, 252, rest.level, rest.nature);
      if (!moves || want == null) continue;
      // A plan of 252 only says "full" when the stat itself does: if fewer EVs fit as well, the game may well
      // show the stat as not full, so the plan does not move the reading (it reads the same with or without it).
      if (want >= MAX_STAT_EV && estimate[key] < MAX_STAT_EV) continue;
      if (want > estimate[key] && want <= most[key]) estimate[key] = want;
    }
  }
  return {
    estimate,
    high: estimateEvs({ ...rest, ivs: worst }),
  };
}

/**
 * The stats that are higher than the Pokémon can have at this level, with the
 * most it could have (252 EVs and the best IV its rating allows). That means
 * the level, the base stats or the number typed is wrong, and the EVs shown
 * for such a stat would only be a clamp, not a reading.
 */
export function statsAboveMax(args: {
  stats: EvSpread;
  level: number;
  baseStats: EvSpread;
  nature: NatureEffect;
  ratings?: IvRatings | null;
}): Partial<Record<keyof EvSpread, number>> {
  const { stats, level, baseStats, nature, ratings } = args;
  const out: Partial<Record<keyof EvSpread, number>> = {};
  for (const key of Object.keys(stats) as (keyof EvSpread)[]) {
    if (!stats[key]) continue;
    const max = statValue(key, baseStats[key], ivBoundsFor(ratings, key).high, 252, level, nature);
    if (stats[key] > max) out[key] = max;
  }
  return out;
}

/**
 * Signs that the level on record may be behind the game (it leveled up and only the stats were typed):
 * the stats ask for more EVs than a Pokémon can have, or a stat sits exactly at the most it can be at this
 * level, so the EVs read "full" while the game may say otherwise. Nothing is said at level 100.
 */
export function levelHints(args: {
  stats: EvSpread;
  level: number;
  baseStats: EvSpread;
  nature: NatureEffect;
  ratings?: IvRatings | null;
  /** The EVs read from the stats (the fewest that fit). */
  estimate: EvSpread;
}): { overTotal: number | null; atMax: (keyof EvSpread)[] } {
  const { stats, level, baseStats, nature, ratings, estimate } = args;
  if (level >= 100) return { overTotal: null, atMax: [] };
  const total = (Object.values(estimate) as number[]).reduce((a, b) => a + b, 0);
  const above = statsAboveMax({ stats, level, baseStats, nature, ratings });
  const atMax: (keyof EvSpread)[] = [];
  for (const key of Object.keys(stats) as (keyof EvSpread)[]) {
    if (!stats[key] || key in above) continue;
    const best = ivBoundsFor(ratings, key).high;
    const max = statValue(key, baseStats[key], best, 252, level, nature);
    // A stat that EVs cannot move at this level is not "full".
    if (stats[key] === max && statValue(key, baseStats[key], best, 0, level, nature) !== max) atMax.push(key);
  }
  // 508 is what can be spent in fours; a little over is just how the stats round.
  return { overTotal: total > MAX_EV_TOTAL ? total : null, atMax };
}
