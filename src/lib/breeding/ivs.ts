/**
 * IV-aware parent matching. Pure, like engine.ts.
 *
 * Rules modelled (Scarlet/Violet):
 *  - An egg inherits 3 of the 6 IVs from its parents, or 5 with a Destiny Knot (held
 *    by either parent). Each inherited stat comes from a random parent.
 *  - A Power item (Weight, Bracer, Belt, Lens, Band, Anklet) makes its holder pass down
 *    one chosen stat for sure; it is one of the inherited stats.
 *  - The other IVs are random: 1 in 32 to be 31.
 *  - An Everstone makes the egg take its holder's nature.
 *  - Each parent holds one item, so the Destiny Knot, a Power item and the Everstone cannot all be
 *    used: the Knot always, plus the Everstone when a parent has the wanted nature (a Mint fixes
 *    it otherwise), else the best Power item.
 *  - The hidden ability comes from the parent whose species hatches (the mother), so a
 *    plan only counts that parent for it.
 *
 * Only an IV the Judge called "Inmejorable" (31) counts as perfect. A stat that was
 * not judged counts as not perfect, so a plan is never more hopeful than what is recorded.
 */
import {
  DITTO_ID,
  IV_STATS,
  type BreedingData,
  type IvStat,
  type Owned,
  type OwnedPokemon,
  type SpeciesRef,
  breederOf,
  canBeFemale,
  canBeMale,
  canBreedAtAll,
  effectiveGender,
  familyIds,
  ref,
  shareGroup,
} from './engine';

export type IvGoal = {
  /** Stats that must be 31 in the offspring. */
  ivTargets: IvStat[];
  natureId: number | null;
  hiddenAbility: boolean;
};

export type ParentPick = {
  id: string | null;
  label: string | null;
  species: SpeciesRef;
  gender: 'male' | 'female' | 'any';
  source: 'breeder' | 'roster' | 'pokedex';
  /** Stats recorded as exactly 31. */
  perfect: IvStat[];
  natureId: number | null;
  hiddenAbility: boolean | null;
};

export type IvPlan = {
  targets: IvStat[];
  wantsNature: number | null;
  wantsHiddenAbility: boolean;
  /** The Pokémon whose species hatches (the mother, or the non-Ditto parent) and its partner. */
  base: ParentPick | null;
  partner: ParentPick | null;
  /** Held items to bring to the picnic or nursery. */
  items: {
    destinyKnot: boolean;
    /** The parent that holds the Knot: the one without the other item, or either when there is none. */
    knotHolder: 'base' | 'partner' | 'either';
    powerItem: IvStat | null;
    powerHolder: 'base' | 'partner' | null;
    everstone: 'base' | 'partner' | null;
  };
  /** Chance that every targeted IV is 31, and how many targeted IVs to expect, with that setup. */
  chance: { all: number; expected: number };
  /** Targeted stats that neither parent has recorded as 31: the next thing to breed or catch. */
  gaps: IvStat[];
  natureOk: boolean | null;
  hiddenOk: boolean | null;
  /** The pair's IVs are not recorded (Pokédex entries only), so the chance is a floor. */
  unrecorded: boolean;
  /** No pair could be made from what you have. */
  reason?: 'no-base' | 'no-partner' | 'no-breeding';
};

const pickOf = (data: BreedingData, p: OwnedPokemon, gender: ParentPick['gender']): ParentPick => ({
  id: p.id ?? null,
  label: p.label ?? null,
  species: ref(data.species.get(p.speciesId)!),
  gender,
  source: p.source ?? 'roster',
  perfect: IV_STATS.filter((s) => p.ivs?.[s] === 'perfect'),
  natureId: p.natureId ?? null,
  hiddenAbility: p.hiddenAbility ?? null,
});

/** n choose k, small n. */
function subsets(n: number, k: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, cur: number[]) => {
    if (cur.length === k) return void out.push([...cur]);
    for (let i = start; i < n; i++) walk(i + 1, [...cur, i]);
  };
  walk(0, []);
  return out;
}

/**
 * Exact odds for one pair. `power` is a stat plus which parent holds the item
 * (that parent must have the stat perfect for the item to help).
 */
export function inheritanceOdds(
  a: IvStat[],
  b: IvStat[],
  targets: IvStat[],
  opts: { knot: boolean; power?: { stat: IvStat; holder: 'a' | 'b' } | null }
): { all: number; expected: number } {
  if (!targets.length) return { all: 1, expected: 0 };
  const k = opts.knot ? 5 : 3;
  const power = opts.power ?? null;
  const powerIndex = power ? IV_STATS.indexOf(power.stat) : -1;
  const sets = subsets(6, k).filter((s) => powerIndex < 0 || s.includes(powerIndex));

  let all = 0;
  let expected = 0;
  for (const inherited of sets) {
    let product = 1;
    let sum = 0;
    for (const stat of targets) {
      const i = IV_STATS.indexOf(stat);
      let p: number;
      if (!inherited.includes(i)) p = 1 / 32;
      else if (i === powerIndex && power) p = (power.holder === 'a' ? a : b).includes(stat) ? 1 : 0;
      else p = ((a.includes(stat) ? 1 : 0) + (b.includes(stat) ? 1 : 0)) / 2;
      product *= p;
      sum += p;
    }
    all += product;
    expected += sum;
  }
  return { all: all / sets.length, expected: expected / sets.length };
}

type Scored = {
  base: OwnedPokemon;
  partner: OwnedPokemon;
  power: { stat: IvStat; holder: 'base' | 'partner' } | null;
  odds: { all: number; expected: number };
  everstone: 'base' | 'partner' | null;
  natureOk: boolean | null;
  hiddenOk: boolean | null;
  unrecorded: boolean;
};

const perfectOf = (p: OwnedPokemon) => IV_STATS.filter((s) => p.ivs?.[s] === 'perfect');
const SOURCE_RANK = { breeder: 0, roster: 1, pokedex: 2 } as const;

function score(base: OwnedPokemon, partner: OwnedPokemon, goal: IvGoal): Scored {
  const a = perfectOf(base);
  const b = perfectOf(partner);
  const targets = goal.ivTargets;

  let everstone: Scored['everstone'] = null;
  let natureOk: boolean | null = null;
  if (goal.natureId != null) {
    // Ditto's nature is passed on like any other parent's.
    everstone = base.natureId === goal.natureId ? 'base' : partner.natureId === goal.natureId ? 'partner' : null;
    natureOk = everstone != null;
  }

  // The best Power item: the one that gives the highest chance of every target. Only when the
  // Everstone is not used, as a parent holds one item and the Knot needs the other.
  let power: Scored['power'] = null;
  let odds = inheritanceOdds(a, b, targets, { knot: true });
  for (const stat of everstone ? [] : targets) {
    for (const holder of ['base', 'partner'] as const) {
      const has = (holder === 'base' ? a : b).includes(stat);
      if (!has) continue;
      const o = inheritanceOdds(a, b, targets, { knot: true, power: { stat, holder: holder === 'base' ? 'a' : 'b' } });
      if (o.all > odds.all || (o.all === odds.all && o.expected > odds.expected)) {
        odds = o;
        power = { stat, holder };
      }
    }
  }

  const hiddenOk = goal.hiddenAbility ? base.hiddenAbility === true : null;
  const unrecorded = base.source === 'pokedex' || partner.source === 'pokedex';
  return { base, partner, power, odds, everstone, natureOk, hiddenOk, unrecorded };
}

const better = (x: Scored, y: Scored) => {
  const eps = 1e-12;
  // A wanted nature comes first: the Everstone takes the second item slot, so a pair that has it
  // would otherwise lose to one that only wins by using a Power item.
  if ((x.natureOk === true) !== (y.natureOk === true)) return x.natureOk === true;
  if (Math.abs(x.odds.all - y.odds.all) > eps) return x.odds.all > y.odds.all;
  if (Math.abs(x.odds.expected - y.odds.expected) > eps) return x.odds.expected > y.odds.expected;
  if ((x.hiddenOk === true) !== (y.hiddenOk === true)) return x.hiddenOk === true;
  const rank = (s: Scored) => SOURCE_RANK[s.base.source ?? 'roster'] + SOURCE_RANK[s.partner.source ?? 'roster'];
  return rank(x) < rank(y);
};

const empty = (goal: IvGoal, reason: IvPlan['reason']): IvPlan => ({
  targets: goal.ivTargets,
  wantsNature: goal.natureId,
  wantsHiddenAbility: goal.hiddenAbility,
  base: null,
  partner: null,
  items: { destinyKnot: true, knotHolder: 'either', powerItem: null, powerHolder: null, everstone: null },
  chance: { all: 0, expected: 0 },
  gaps: goal.ivTargets,
  natureOk: null,
  hiddenOk: null,
  unrecorded: false,
  reason,
});

/**
 * Picks the best parents for the target from everything owned: breeders and roster
 * Pokémon with their IV words, and Pokédex entries (IVs unknown) as the last resort.
 */
export function planIvs(data: BreedingData, owned: Owned, targetId: number, goal: IvGoal): IvPlan | null {
  const target = data.species.get(targetId);
  if (!target) return null;
  const breeder = breederOf(data, target.id);
  if (!breeder || !canBreedAtAll(breeder)) return empty(goal, 'no-breeding');
  const needsDitto = !canBeFemale(breeder);

  const family = new Set(familyIds(data, target.id));
  const isDitto = (p: OwnedPokemon) => p.speciesId === DITTO_ID;

  const bases = owned.roster.filter((p) => {
    if (!family.has(p.speciesId) || isDitto(p)) return false;
    if (needsDitto) return true;
    const g = effectiveGender(data, p);
    return g === 'FEMALE' || g === 'BOTH';
  });
  if (!bases.length) return empty(goal, 'no-base');

  const partnersFor = (base: OwnedPokemon) => {
    const info = data.species.get(base.speciesId)!;
    return owned.roster.filter((p) => {
      if (p === base || (p.id != null && p.id === base.id)) return false;
      if (isDitto(p)) return true;
      if (needsDitto) return false;
      const s = data.species.get(p.speciesId);
      if (!s || !canBreedAtAll(s) || !canBeMale(s) || !shareGroup(s, info)) return false;
      const g = effectiveGender(data, p);
      return g === 'MALE' || g === 'BOTH';
    });
  };

  let best: Scored | null = null;
  for (const base of bases) {
    for (const partner of partnersFor(base)) {
      const scored = score(base, partner, goal);
      if (!best || better(scored, best)) best = scored;
    }
  }
  if (!best) return empty(goal, 'no-partner');

  const basePick = pickOf(data, best.base, canBeFemale(data.species.get(best.base.speciesId)!) ? 'female' : 'any');
  const partnerPick = pickOf(data, best.partner, isDitto(best.partner) ? 'any' : 'male');
  // The Knot goes to the parent that holds neither of the other two items.
  const other = best.everstone ?? best.power?.holder ?? null;
  const have = new Set([...basePick.perfect, ...partnerPick.perfect]);
  return {
    targets: goal.ivTargets,
    wantsNature: goal.natureId,
    wantsHiddenAbility: goal.hiddenAbility,
    base: basePick,
    partner: partnerPick,
    items: {
      destinyKnot: true,
      knotHolder: other ? (other === 'base' ? 'partner' : 'base') : 'either',
      powerItem: best.power?.stat ?? null,
      powerHolder: best.power?.holder ?? null,
      everstone: best.everstone,
    },
    chance: best.odds,
    gaps: goal.ivTargets.filter((s) => !have.has(s)),
    natureOk: best.natureOk,
    hiddenOk: best.hiddenOk,
    unrecorded: best.unrecorded,
  };
}
