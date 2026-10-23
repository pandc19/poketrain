import { MAX_EV_TOTAL } from './ev-estimate';
import { evGap, evTotal, formatEvs, type EvSpread } from './import/evs';

const KEYS: (keyof EvSpread)[] = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'];
const MAX_STAT = 252;
const MAX_TOTAL = MAX_EV_TOTAL;

/**
 * Makes the spread the model proposed a spread the game allows: whole EVs, at most 252 in a stat and 510
 * in all. Where EVs are hard to change, `keepCurrent` also never goes below what the Pokémon already has,
 * so the plan only adds to it.
 */
export function legalPlan(
  proposed: EvSpread,
  current: EvSpread | null,
  keepCurrent: boolean,
  /** Stats from most to least important. When the spread is over 510, the least important lose EVs first. */
  priority: (keyof EvSpread)[] = []
): EvSpread {
  const floor = (key: keyof EvSpread) => (keepCurrent ? Math.min(MAX_STAT, current?.[key] ?? 0) : 0);
  const plan = { ...proposed };
  for (const key of KEYS) {
    plan[key] = Math.max(floor(key), Math.min(MAX_STAT, Math.max(0, Math.round(proposed[key]))));
  }
  // Over 510: take the surplus back from the least important stat, then the next, never below its floor.
  const unlisted = KEYS.filter((k) => !priority.includes(k)).sort((a, b) => plan[b] - floor(b) - (plan[a] - floor(a)));
  for (const key of [...unlisted, ...[...priority].reverse()]) {
    const surplus = evTotal(plan) - MAX_TOTAL;
    if (surplus <= 0) break;
    plan[key] -= Math.min(plan[key] - floor(key), surplus);
  }
  return plan;
}

/**
 * Spends the EVs a model left over: under 510 means EVs that would give stats for free, so the rest goes
 * to HP, then Defense, then Sp. Def (the bulk stats), never past 252 in a stat. Only for a spread
 * a model proposed: a plan the player wrote is theirs and is not touched.
 */
export function fillPlan(plan: EvSpread): EvSpread {
  const filled = { ...plan };
  for (const key of ['hp', 'defense', 'specialDefense'] as const) {
    const room = Math.min(MAX_STAT - filled[key], MAX_TOTAL - evTotal(filled));
    if (room > 0) filled[key] += room;
  }
  return filled;
}

/** The texts the audit shows for an EV plan, worked out here instead of trusted to the model. */
export function describePlan(plan: EvSpread, current: EvSpread | null, nothing: string) {
  const gap = evGap(plan, current);
  return {
    spread: formatEvs(plan) || nothing,
    toTrain: evTotal(gap) > 0 ? formatEvs(gap) : nothing,
  };
}

/** What gives EVs in each stat: the vitamin, and the Power item that adds EVs while it is held in battle. */
const TRAINING: Record<keyof EvSpread, { vitamin: string; power: string; stat: string }> = {
  hp: { vitamin: 'HP Up', power: 'Power Weight', stat: 'HP' },
  attack: { vitamin: 'Protein', power: 'Power Bracer', stat: 'Attack' },
  defense: { vitamin: 'Iron', power: 'Power Belt', stat: 'Defense' },
  specialAttack: { vitamin: 'Calcium', power: 'Power Lens', stat: 'Sp. Atk' },
  specialDefense: { vitamin: 'Zinc', power: 'Power Band', stat: 'Sp. Def' },
  speed: { vitamin: 'Carbos', power: 'Power Anklet', stat: 'Speed' },
};
export const EVS_PER_VITAMIN = 10;
export const EVS_PER_POWER_ITEM = 8;

/**
 * The items that cover what is still to train: how many vitamins, and the
 * Power item to hold while battling. Counted here, since the model gets the
 * arithmetic wrong.
 */
export function trainingItemsFor(gap: EvSpread, es: boolean) {
  const missing = KEYS.filter((key) => gap[key] > 0);
  const vitamins = missing.map((key) => {
    const count = Math.ceil(gap[key] / EVS_PER_VITAMIN);
    const { vitamin, stat } = TRAINING[key];
    return {
      item: vitamin,
      stat,
      why: es
        ? `${count} × ${vitamin} dan ${count * EVS_PER_VITAMIN} EVs (+${EVS_PER_VITAMIN} cada uno) para cubrir los ${gap[key]} que faltan`
        : `${count} × ${vitamin} give ${count * EVS_PER_VITAMIN} EVs (+${EVS_PER_VITAMIN} each) to cover the ${gap[key]} still missing`,
    };
  });
  const power = missing.map((key) => {
    const { power: item, stat } = TRAINING[key];
    return {
      item,
      stat,
      why: es
        ? `Llévalo equipado mientras combates: +${EVS_PER_POWER_ITEM} EVs de más por combate`
        : `Hold it while battling: +${EVS_PER_POWER_ITEM} extra EVs per battle`,
    };
  });
  return [...vitamins, ...power];
}

/** Every stat has at least the EVs the plan asks for. */
export function planReached(target: EvSpread, current: EvSpread): boolean {
  return KEYS.every((key) => current[key] >= target[key]);
}
