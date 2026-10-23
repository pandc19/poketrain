import { describe, expect, it } from 'vitest';
import { describePlan, legalPlan, shapePlan } from '@/lib/ev-plan';

const evs = (hp = 0, attack = 0, defense = 0, specialAttack = 0, specialDefense = 0, speed = 0) => ({
  hp,
  attack,
  defense,
  specialAttack,
  specialDefense,
  speed,
});

describe('legalPlan', () => {
  const current = evs(120, 92, 4);

  it('never goes below the current EVs when they are hard to change', () => {
    expect(legalPlan(evs(0, 252, 0, 0, 0, 252), current, true)).toEqual(evs(120, 252, 4, 0, 0, 134));
  });

  it('caps a stat at 252 and the total at 510', () => {
    const plan = legalPlan(evs(300, 300, 0, 0, 0, 300), null, false);
    expect(Math.max(...Object.values(plan))).toBeLessThanOrEqual(252);
    expect(plan.speed).toBe(252);
    expect(Object.values(plan).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(510);
  });

  it('takes the surplus from the least important stat first', () => {
    const plan = legalPlan(evs(120, 252, 4, 0, 0, 252), evs(120, 92, 4), true, ['attack', 'speed']);
    expect(plan).toEqual(evs(120, 252, 4, 0, 0, 134));
    const other = legalPlan(evs(120, 252, 4, 0, 0, 252), evs(120, 92, 4), true, ['speed', 'attack']);
    expect(other).toEqual(evs(120, 134, 4, 0, 0, 252));
  });

  it('allows the whole 510: 252 / 252 / 6', () => {
    expect(legalPlan(evs(6, 252, 0, 0, 0, 252), null, false)).toEqual(evs(6, 252, 0, 0, 0, 252));
    expect(legalPlan(evs(10, 252, 0, 0, 0, 252), null, false, ['attack', 'speed'])).toEqual(evs(6, 252, 0, 0, 0, 252));
  });

  it('keeps what is trained when the plan already fits', () => {
    expect(legalPlan(current, current, true)).toEqual(current);
  });
});

describe('describePlan', () => {
  it('says what is still to train', () => {
    expect(describePlan(evs(120, 252, 4), evs(120, 92, 4), 'nothing')).toEqual({
      spread: '120 HP / 252 Atk / 4 Def',
      toTrain: '160 Atk',
    });
  });

  it('says nothing is missing when the plan is reached', () => {
    expect(describePlan(evs(120, 92, 4), evs(120, 92, 4), 'nothing').toTrain).toBe('nothing');
  });
});

describe('trainingItemsFor', () => {
  it('counts one vitamin per 10 EVs, rounded up, for each missing stat', async () => {
    const { trainingItemsFor } = await import('@/lib/ev-plan');
    const out = trainingItemsFor(evs(0, 160, 134), false);
    expect(out.map((v) => [v.item, v.stat])).toEqual([
      ['Protein', 'Attack'],
      ['Iron', 'Defense'],
      ['Power Bracer', 'Attack'],
      ['Power Belt', 'Defense'],
    ]);
    expect(out[0].why).toContain('16 × Protein');
    expect(out[1].why).toContain('14 × Iron');
  });
});

describe('bestSources', () => {
  it('puts pure yields first, then early evolution stages, then the biggest yield', async () => {
    const { bestSources } = await import('@/lib/ev-catalog');
    const c = (id: number, stage: number, yields: Record<string, number>) => ({
      id,
      nameEn: `P${id}`,
      nameEs: `P${id}`,
      amount: 0,
      yields,
      national: id,
      stage,
    });
    const out = bestSources(
      [
        c(1, 2, { attack: 3 }),
        c(2, 0, { attack: 1 }),
        c(3, 0, { attack: 1, speed: 1 }),
        c(4, 1, { attack: 2 }),
        c(5, 0, { speed: 3 }),
      ],
      'attack'
    );
    expect(out.map((x) => x.id)).toEqual([2, 4, 1, 3]);
  });
});

describe('planReached', () => {
  it('is true once every stat has at least the planned EVs', async () => {
    const { planReached } = await import('@/lib/ev-plan');
    expect(planReached(evs(120, 252, 138), evs(120, 252, 138))).toBe(true);
    expect(planReached(evs(120, 252, 138), evs(120, 252, 140, 0, 4))).toBe(true);
    expect(planReached(evs(120, 252, 138), evs(120, 200, 138))).toBe(false);
  });
});

describe('withFixedMoves', () => {
  it('keeps the fixed moves first and fills the rest without repeats', async () => {
    const { withFixedMoves } = await import('@/lib/audit-locks');
    const m = (move: string) => ({ move, reason: '' });
    const out = withFixedMoves([m('Stone Edge')], [m('Earthquake'), m('stone edge'), m('Stealth Rock'), m('Explosion'), m('Rock Slide')]);
    expect(out.map((x) => x.move)).toEqual(['Stone Edge', 'Earthquake', 'Stealth Rock', 'Explosion']);
  });
});

describe('shapePlan', () => {
  it('finishes the two main stats at 252 and spends the last 6 on HP', () => {
    expect(shapePlan(evs(0, 252, 0, 0, 0, 252), null)).toEqual(evs(6, 252, 0, 0, 0, 252));
  });

  it('takes a scattered spread to 252 / 252 in its two biggest stats', () => {
    // A model's 200 Atk / 160 Spe / 150 HP becomes 252 Atk / 252 Spe, and the 6 left go to HP, where it put its next EVs.
    expect(shapePlan(evs(150, 200, 0, 0, 0, 160), null)).toEqual(evs(6, 252, 0, 0, 0, 252));
  });

  it('puts the last 6 where the spread put its third stat', () => {
    expect(shapePlan(evs(0, 252, 0, 0, 4, 252), null)).toEqual(evs(0, 252, 0, 0, 6, 252));
  });

  it('keeps EVs it already has, and gives the second main stat what is left', () => {
    // 100 in HP cannot be taken back: Attack still gets 252, Speed the 158 left.
    expect(shapePlan(evs(0, 252, 0, 0, 0, 252), evs(100, 40))).toEqual(evs(100, 252, 0, 0, 0, 158));
  });

  it('still reaches 252 / 252 when what it has leaves room', () => {
    expect(shapePlan(evs(0, 252, 0, 0, 0, 252), evs(4, 120, 0, 0, 0, 60))).toEqual(evs(6, 252, 0, 0, 0, 252));
  });

  it('on a tie, counts a stat it already has full as one of the two', () => {
    // Attack, Defense and Speed all proposed at 252, Defense already full: Defense and Attack are the two, Speed gets the 6.
    expect(shapePlan(evs(0, 252, 252, 0, 0, 252), evs(0, 0, 252))).toEqual(evs(0, 252, 252, 0, 0, 6));
  });
});
