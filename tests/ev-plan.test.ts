import { describe, expect, it } from 'vitest';
import { describePlan, fillPlan, legalPlan } from '@/lib/ev-plan';

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
    expect(legalPlan(evs(0, 252, 0, 0, 0, 252), current, true)).toEqual(evs(120, 252, 4, 0, 0, 132));
  });

  it('caps a stat at 252 and the total at 508', () => {
    const plan = legalPlan(evs(300, 300, 0, 0, 0, 300), null, false);
    expect(Math.max(...Object.values(plan))).toBeLessThanOrEqual(252);
    expect(plan.speed).toBe(252);
    expect(Object.values(plan).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(508);
  });

  it('takes the surplus from the least important stat first', () => {
    const plan = legalPlan(evs(120, 252, 4, 0, 0, 252), evs(120, 92, 4), true, ['attack', 'speed']);
    expect(plan).toEqual(evs(120, 252, 4, 0, 0, 132));
    const other = legalPlan(evs(120, 252, 4, 0, 0, 252), evs(120, 92, 4), true, ['speed', 'attack']);
    expect(other).toEqual(evs(120, 132, 4, 0, 0, 252));
  });

  it('uses amounts in fours: 252 / 252 / 4, not 6', () => {
    expect(legalPlan(evs(6, 252, 0, 0, 0, 252), null, false)).toEqual(evs(4, 252, 0, 0, 0, 252));
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

describe('fillPlan', () => {
  it('spends the last 4 of a 252 / 252 spread on HP', () => {
    expect(fillPlan(evs(0, 252, 0, 0, 0, 252))).toEqual(evs(4, 252, 0, 0, 0, 252));
  });

  it('leaves a full spread alone', () => {
    expect(fillPlan(evs(4, 252, 0, 0, 0, 252))).toEqual(evs(4, 252, 0, 0, 0, 252));
  });

  it('never goes over 252 in a stat', () => {
    expect(fillPlan(evs(252, 252, 0, 0, 0, 0))).toEqual(evs(252, 252, 4, 0, 0, 0));
  });
});
