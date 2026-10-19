import { describe, expect, it } from 'vitest';
import { DITTO_ID, type BreedingData, type IvStat, type Owned, type OwnedPokemon, type SpeciesInfo } from '@/lib/breeding/engine';
import { inheritanceOdds, planIvs } from '@/lib/breeding/ivs';

const sp = (id: number, name: string, eggGroups: string[], extra: Partial<SpeciesInfo> = {}): SpeciesInfo => ({
  id,
  nameEn: name,
  nameEs: name,
  eggGroups,
  genderRate: 4,
  evolvesFromId: null,
  available: true,
  ...extra,
});

const data: BreedingData = {
  species: new Map(
    [
      sp(1, 'Target', ['field']),
      sp(2, 'FieldDad', ['field']),
      sp(3, 'WaterDad', ['water1']),
      sp(4, 'Robot', ['mineral'], { genderRate: -1 }),
      sp(DITTO_ID, 'Ditto', ['ditto'], { genderRate: -1 }),
    ].map((s) => [s.id, s])
  ),
  learns: new Map(),
  mirrorHerb: false,
};

const ALL: IvStat[] = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'];
const mon = (
  id: string,
  speciesId: number,
  gender: OwnedPokemon['gender'],
  perfect: IvStat[],
  extra: Partial<OwnedPokemon> = {}
): OwnedPokemon => ({
  id,
  speciesId,
  gender,
  moveIds: [],
  source: 'breeder',
  ivs: Object.fromEntries(perfect.map((s) => [s, 'perfect' as const])),
  ...extra,
});
const owning = (...roster: OwnedPokemon[]): Owned => ({ roster, caughtSpeciesIds: new Set(roster.map((r) => r.speciesId)) });
const goal = (ivTargets: IvStat[], extra = {}) => ({ ivTargets, natureId: null, hiddenAbility: false, ...extra });

describe('inheritanceOdds', () => {
  it('both parents perfect: the stat is perfect whenever it is inherited, else 1 in 32', () => {
    const o = inheritanceOdds(['attack'], ['attack'], ['attack'], { knot: true });
    expect(o.all).toBeCloseTo(5 / 6 + 1 / 6 / 32, 10);
  });

  it('only one parent perfect: half the inherited chance', () => {
    const o = inheritanceOdds(['attack'], [], ['attack'], { knot: true });
    expect(o.all).toBeCloseTo(5 / 6 / 2 + 1 / 6 / 32, 10);
  });

  it('a Power item makes the held stat a sure thing', () => {
    const o = inheritanceOdds(['speed'], [], ['speed'], { knot: true, power: { stat: 'speed', holder: 'a' } });
    expect(o.all).toBe(1);
  });

  it('a Power item on a parent that is not perfect does not help', () => {
    const o = inheritanceOdds(['speed'], [], ['speed'], { knot: true, power: { stat: 'speed', holder: 'b' } });
    expect(o.all).toBe(0);
  });

  it('the Destiny Knot raises the chance for several stats', () => {
    const stats: IvStat[] = ['hp', 'attack', 'speed'];
    const without = inheritanceOdds(stats, stats, stats, { knot: false });
    const withKnot = inheritanceOdds(stats, stats, stats, { knot: true });
    expect(withKnot.all).toBeGreaterThan(without.all);
  });

  it('with nothing targeted there is nothing to fail', () => {
    expect(inheritanceOdds([], [], [], { knot: true })).toEqual({ all: 1, expected: 0 });
  });
});

describe('planIvs', () => {
  it('picks the mother and father whose perfect stats cover the targets', () => {
    const owned = owning(
      mon('m1', 1, 'FEMALE', ['hp']),
      mon('m2', 1, 'FEMALE', ['attack', 'speed']),
      mon('f1', 2, 'MALE', ['attack', 'speed'])
    );
    const plan = planIvs(data, owned, 1, goal(['attack', 'speed']))!;
    expect(plan.base?.id).toBe('m2');
    expect(plan.partner?.id).toBe('f1');
    expect(plan.gaps).toEqual([]);
    expect(plan.items.destinyKnot).toBe(true);
  });

  it('recommends a Power item for a stat a parent has perfect', () => {
    const owned = owning(mon('m', 1, 'FEMALE', ['speed']), mon('f', 2, 'MALE', []));
    const plan = planIvs(data, owned, 1, goal(['speed']))!;
    expect(plan.items.powerItem).toBe('speed');
    expect(plan.items.powerHolder).toBe('base');
    expect(plan.chance.all).toBe(1);
  });

  it('reports the stats no parent has', () => {
    const owned = owning(mon('m', 1, 'FEMALE', ['hp']), mon('f', 2, 'MALE', ['hp']));
    const plan = planIvs(data, owned, 1, goal(['hp', 'attack']))!;
    expect(plan.gaps).toEqual(['attack']);
  });

  it('uses a 6 IV Ditto as the partner when it is the better parent', () => {
    const owned = owning(mon('m', 1, 'FEMALE', ['hp']), mon('f', 2, 'MALE', []), mon('d', DITTO_ID, 'GENDERLESS', ALL));
    const plan = planIvs(data, owned, 1, goal(['attack', 'speed']))!;
    expect(plan.partner?.id).toBe('d');
  });

  it('does not pair a father that shares no egg group', () => {
    const owned = owning(mon('m', 1, 'FEMALE', ['hp']), mon('w', 3, 'MALE', ['hp']));
    expect(planIvs(data, owned, 1, goal(['hp']))!.reason).toBe('no-partner');
  });

  it('needs a female of the line, unless the line is genderless (then Ditto)', () => {
    const noFemale = owning(mon('f', 1, 'MALE', ['hp']), mon('d', DITTO_ID, 'GENDERLESS', []));
    expect(planIvs(data, noFemale, 1, goal(['hp']))!.reason).toBe('no-base');

    const robots = owning(mon('r', 4, 'GENDERLESS', ['hp']), mon('f', 2, 'MALE', []), mon('d', DITTO_ID, 'GENDERLESS', []));
    const plan = planIvs(data, robots, 4, goal(['hp']))!;
    expect(plan.base?.id).toBe('r');
    expect(plan.partner?.id).toBe('d');
  });

  it('prefers recorded Pokémon over Pokédex entries, and says the chance is a minimum', () => {
    const owned = owning(
      { speciesId: 1, gender: 'FEMALE', moveIds: [], source: 'pokedex' },
      mon('m', 1, 'FEMALE', []),
      { speciesId: 2, gender: 'MALE', moveIds: [], source: 'pokedex' }
    );
    const plan = planIvs(data, owned, 1, goal(['hp']))!;
    expect(plan.base?.id).toBe('m');
    expect(plan.unrecorded).toBe(true);
  });

  it('puts the Everstone on the parent with the wanted nature', () => {
    const owned = owning(mon('m', 1, 'FEMALE', ['hp'], { natureId: 5 }), mon('f', 2, 'MALE', ['hp'], { natureId: 11 }));
    const plan = planIvs(data, owned, 1, goal(['hp'], { natureId: 11 }))!;
    expect(plan.items.everstone).toBe('partner');
    expect(plan.natureOk).toBe(true);
    expect(planIvs(data, owned, 1, goal(['hp'], { natureId: 99 }))!.natureOk).toBe(false);
  });

  it('never gives one parent two items: the Everstone replaces the Power item, the Knot goes to the other parent', () => {
    const owned = owning(mon('m', 1, 'FEMALE', ['hp'], { natureId: 5 }), mon('f', 2, 'MALE', ['hp', 'attack'], { natureId: 11 }));
    const plan = planIvs(data, owned, 1, goal(['hp', 'attack'], { natureId: 11 }))!;
    expect(plan.items.everstone).toBe('partner');
    expect(plan.items.powerItem).toBeNull();
    expect(plan.items.knotHolder).toBe('base');
  });

  it('uses the Power item when no parent has the nature, and the Knot goes to the other parent', () => {
    const owned = owning(mon('m', 1, 'FEMALE', ['speed'], { natureId: 5 }), mon('f', 2, 'MALE', [], { natureId: 6 }));
    const plan = planIvs(data, owned, 1, goal(['speed'], { natureId: 11 }))!;
    expect(plan.items.everstone).toBeNull();
    expect(plan.items.powerHolder).toBe('base');
    expect(plan.items.knotHolder).toBe('partner');
  });

  it('only counts the mother for the hidden ability', () => {
    const owned = owning(
      mon('m', 1, 'FEMALE', [], { hiddenAbility: false }),
      mon('f', 2, 'MALE', [], { hiddenAbility: true })
    );
    expect(planIvs(data, owned, 1, goal([], { hiddenAbility: true }))!.hiddenOk).toBe(false);
  });
});
