import { describe, expect, it } from 'vitest';
import { DITTO_ID, planBreeding, type BreedingData, type LearnWay, type Owned, type SpeciesInfo } from '@/lib/breeding/engine';

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

// A small made-up world. Moves: 1 = egg move of Target, 2 = natural for Target, 3 = chain-only, 9 = unknown.
const species = [
  sp(1, 'Target', ['field']),
  sp(2, 'TargetEvo', ['field'], { evolvesFromId: 1 }),
  sp(3, 'FieldDad', ['field']), // learns move 1 at level 20
  sp(4, 'FieldDadEvo', ['field'], { evolvesFromId: 3 }), // learns move 1 at level 1
  sp(5, 'Bridge', ['field', 'water1']), // gets move 3 as an egg move
  sp(6, 'WaterDad', ['water1']), // learns move 3 by level-up
  sp(7, 'Loner', ['dragon']), // learns move 1, shares no group
  sp(8, 'Baby', ['no-eggs']),
  sp(9, 'BabyEvo', ['fairy'], { evolvesFromId: 8 }),
  sp(10, 'Robot', ['mineral'], { genderRate: -1 }),
  sp(11, 'AllMale', ['field'], { genderRate: 0 }),
  sp(12, 'Legend', ['no-eggs']),
  sp(13, 'Unavailable', ['field'], { available: false }), // learns move 1 at level 1 but is not in the game
  sp(DITTO_ID, 'Ditto', ['ditto'], { genderRate: -1 }),
];

const learns = (rows: [number, number, LearnWay][]) => {
  const map = new Map<number, Map<number, LearnWay[]>>();
  for (const [speciesId, moveId, way] of rows) {
    if (!map.has(speciesId)) map.set(speciesId, new Map());
    const byMove = map.get(speciesId)!;
    byMove.set(moveId, [...(byMove.get(moveId) ?? []), way]);
  }
  return map;
};

const world = (mirrorHerb: boolean): BreedingData => ({
  species: new Map(species.map((s) => [s.id, s])),
  mirrorHerb,
  formLocks: [],
  learns: learns([
    [1, 1, { method: 'egg', level: 0 }],
    [1, 2, { method: 'level-up', level: 15 }],
    [2, 2, { method: 'machine', level: 0 }],
    [1, 3, { method: 'egg', level: 0 }],
    [3, 1, { method: 'level-up', level: 20 }],
    [4, 1, { method: 'level-up', level: 1 }],
    [5, 3, { method: 'egg', level: 0 }],
    [6, 3, { method: 'level-up', level: 30 }],
    [7, 1, { method: 'level-up', level: 5 }],
    [13, 1, { method: 'level-up', level: 1 }],
  ]),
});

const nothing: Owned = { roster: [], caughtSpeciesIds: new Set() };

describe('parents', () => {
  it('asks for a female of the line when nothing is owned', () => {
    const plan = planBreeding(world(false), nothing, 2, [])!;
    expect(plan.parents).toMatchObject({ canBreed: true, needsDitto: false, haveMother: false });
    expect(plan.parents.hatchesAs.nameEn).toBe('Target');
    expect(plan.parents.steps[0]).toMatchObject({ action: 'obtain', have: 'missing', gender: 'female' });
  });

  it('recognises an owned female of any stage of the family', () => {
    const owned: Owned = { roster: [{ speciesId: 2, gender: 'FEMALE', moveIds: [] }], caughtSpeciesIds: new Set() };
    expect(planBreeding(world(false), owned, 1, [])!.parents.haveMother).toBe(true);
  });

  it('needs Ditto for genderless and male-only species', () => {
    const owned: Owned = { roster: [], caughtSpeciesIds: new Set([10, DITTO_ID]) };
    const robot = planBreeding(world(false), owned, 10, [])!.parents;
    expect(robot).toMatchObject({ needsDitto: true, haveMother: true, haveDitto: true });
    expect(planBreeding(world(false), nothing, 11, [])!.parents.needsDitto).toBe(true);
  });

  it('refuses species that cannot breed, but lets a baby breed through its evolution', () => {
    expect(planBreeding(world(false), nothing, 12, [])!.parents).toMatchObject({ canBreed: false, reason: 'no-eggs' });
    const baby = planBreeding(world(false), nothing, 8, [])!.parents;
    expect(baby.canBreed).toBe(true);
    expect(baby.hatchesAs.nameEn).toBe('Baby');
    expect(baby.steps[0]).toMatchObject({ species: { nameEn: 'BabyEvo' } });
  });
});

describe('moves', () => {
  it('reports moves the line learns without breeding, preferring level-up', () => {
    const move = planBreeding(world(false), nothing, 2, [2])!.moves[0];
    expect(move.kind).toBe('natural');
    expect(move.natural).toMatchObject({ species: { nameEn: 'Target' }, method: 'level-up', level: 15 });
  });

  it('flags moves the species cannot have', () => {
    expect(planBreeding(world(false), nothing, 1, [9])!.moves[0].kind).toBe('illegal');
  });

  it('finds a compatible father, one per family, cheapest stage, only from the game', () => {
    const move = planBreeding(world(false), nothing, 1, [1])!.moves[0];
    expect(move.kind).toBe('egg');
    expect(move.options).toHaveLength(1);
    const [obtain, teach, breed] = move.options[0].steps;
    expect(obtain).toMatchObject({ action: 'obtain', species: { nameEn: 'FieldDadEvo' }, gender: 'male', have: 'missing' });
    expect(teach).toMatchObject({ action: 'teach', method: 'level-up', level: 1 });
    expect(breed).toMatchObject({ action: 'breed', father: { nameEn: 'FieldDadEvo' }, offspring: { nameEn: 'Target' } });
  });

  it('prefers a father the player already owns that knows the move', () => {
    const owned: Owned = { roster: [{ speciesId: 3, gender: 'MALE', moveIds: [1] }], caughtSpeciesIds: new Set() };
    const option = planBreeding(world(false), owned, 1, [1])!.moves[0].options[0];
    expect(option.ready).toBe(true);
    // Already knows it: no teaching step.
    expect(option.steps.map((s) => s.action)).toEqual(['obtain', 'breed']);
  });

  it('builds a chain through an intermediate species when no father learns it directly', () => {
    const move = planBreeding(world(false), nothing, 1, [3])!.moves[0];
    expect(move.options).toHaveLength(1);
    expect(move.options[0].kind).toBe('chain');
    const breeds = move.options[0].steps.filter((s) => s.action === 'breed');
    expect(breeds).toMatchObject([
      { father: { nameEn: 'WaterDad' }, mother: { nameEn: 'Bridge' }, offspring: { nameEn: 'Bridge' } },
      { father: { nameEn: 'Bridge' }, mother: { nameEn: 'Target' }, offspring: { nameEn: 'Target' } },
    ]);
  });
});

describe('Mirror Herb (Scarlet/Violet)', () => {
  it('offers a picnic transfer from any owned Pokémon that knows the move, first', () => {
    const owned: Owned = { roster: [{ speciesId: 7, gender: 'UNKNOWN', moveIds: [1] }], caughtSpeciesIds: new Set() };
    const options = planBreeding(world(true), owned, 1, [1])!.moves[0].options;
    expect(options[0]).toMatchObject({ kind: 'mirror-herb', ready: true });
    expect(options[0].steps).toMatchObject([{ action: 'picnic', from: { nameEn: 'Loner' }, to: { nameEn: 'Target' } }]);
    expect(options.some((o) => o.kind === 'breed')).toBe(true);
  });

  it('suggests the easiest species to catch for a picnic when nothing owned knows the move', () => {
    const picnic = planBreeding(world(true), nothing, 1, [1])!.moves[0].options.find((o) => o.kind === 'mirror-herb')!;
    expect(picnic.ready).toBe(false);
    expect(picnic.steps.map((s) => s.action)).toEqual(['obtain', 'teach', 'picnic']);
    expect(picnic.steps[0]).toMatchObject({ species: { nameEn: 'FieldDadEvo' } });
  });

  it('is not offered in games without it', () => {
    const options = planBreeding(world(false), nothing, 1, [1])!.moves[0].options;
    expect(options.some((o) => o.kind === 'mirror-herb')).toBe(false);
  });
});

describe('genders', () => {
  const dad = (gender: 'MALE' | 'FEMALE' | 'BOTH' | 'UNKNOWN', moveIds: number[] = []): Owned => ({
    roster: [{ speciesId: 3, gender, moveIds }],
    caughtSpeciesIds: new Set([3]),
  });
  const father = (owned: Owned) =>
    planBreeding(world(false), owned, 1, [1])!.moves[0].options[0].steps.find((s) => s.action === 'obtain')!;

  it('uses a male or a "both" Pokémon that knows the move', () => {
    expect(father(dad('MALE', [1]))).toMatchObject({ have: 'ready' });
    expect(father(dad('BOTH', [1]))).toMatchObject({ have: 'ready' });
  });

  it('does not use a female as the father, and says it is the wrong gender', () => {
    expect(father(dad('FEMALE', [1]))).toMatchObject({ have: 'missing', wrongGender: true });
  });

  it('treats an unrecorded gender as caught, not ready', () => {
    expect(father(dad('UNKNOWN', [1]))).toMatchObject({ have: 'caught' });
  });

  it('treats a species caught with no gender recorded as caught', () => {
    const owned: Owned = { roster: [], caughtSpeciesIds: new Set([3]) };
    expect(father(owned)).toMatchObject({ have: 'caught' });
  });

  it('knows single-gender species without recording them', () => {
    const owned: Owned = { roster: [{ speciesId: 11, gender: 'UNKNOWN', moveIds: [] }], caughtSpeciesIds: new Set([11]) };
    // AllMale (id 11) only breeds with Ditto and needs no female to be recorded.
    expect(planBreeding(world(false), owned, 11, [])!.parents).toMatchObject({ needsDitto: true, haveMother: true });
  });

  it('asks for a female when only a male of the line is registered', () => {
    const owned: Owned = { roster: [{ speciesId: 1, gender: 'MALE', moveIds: [] }], caughtSpeciesIds: new Set([1]) };
    const parents = planBreeding(world(false), owned, 1, [])!.parents;
    expect(parents.haveMother).toBe(false);
    expect(parents.steps[0]).toMatchObject({ have: 'missing', gender: 'female', wrongGender: true });
  });
});

describe('shopping list', () => {
  it('lists the mother and the best father once, with what is still missing', () => {
    const plan = planBreeding(world(false), nothing, 1, [1])!;
    expect(plan.shopping).toMatchObject([
      { species: { nameEn: 'Target' }, gender: 'female', role: 'mother', have: 'missing' },
      { species: { nameEn: 'FieldDadEvo' }, gender: 'male', role: 'father', forMoveId: 1, have: 'missing' },
    ]);
  });

  it('marks parents the player has as ready', () => {
    const owned: Owned = {
      roster: [
        { speciesId: 1, gender: 'FEMALE', moveIds: [] },
        { speciesId: 3, gender: 'MALE', moveIds: [1] },
      ],
      caughtSpeciesIds: new Set([1, 3]),
    };
    const plan = planBreeding(world(false), owned, 1, [1])!;
    expect(plan.shopping.every((s) => s.have === 'ready')).toBe(true);
  });
});

describe('form-locked evolutions', () => {
  // 20 hatches as 20 in any form; only form 201 evolves into 21 (like White-Striped Basculin into Basculegion).
  const lock = { targetId: 21, baseId: 20, formId: 201, name: { en: 'Striped', es: 'Rayado' }, item: null };
  const locked: BreedingData = {
    species: new Map([sp(20, 'Fish', ['water2']), sp(21, 'FishEvo', ['water2'], { evolvesFromId: 20 })].map((s) => [s.id, s])),
    mirrorHerb: false,
    formLocks: [lock],
    learns: new Map(),
  };
  const have = (speciesId: number, formId: number | null): Owned => ({
    roster: [{ speciesId, formId, gender: 'FEMALE', moveIds: [] }],
    caughtSpeciesIds: new Set([speciesId]),
  });
  const motherHave = (owned: Owned, data = locked) => planBreeding(data, owned, 21, [])!.parents.steps[0];

  it('counts the right form as a ready mother', () => {
    expect(motherHave(have(20, 201))).toMatchObject({ have: 'ready' });
  });
  it('does not count another form', () => {
    expect(motherHave(have(20, 200))).toMatchObject({ have: 'missing' });
  });
  it('asks to check the form when it is not recorded', () => {
    expect(motherHave(have(20, null))).toMatchObject({ have: 'caught' });
  });
  it('counts an evolved Pokémon whatever its recorded form', () => {
    expect(motherHave(have(21, null))).toMatchObject({ have: 'ready' });
  });
  it('is ignored for a game with no such rule, and for the base species', () => {
    expect(motherHave(have(20, 200), { ...locked, formLocks: [] })).toMatchObject({ have: 'ready' });
    expect(planBreeding(locked, have(20, 200), 20, [])!.parents.steps[0]).toMatchObject({ have: 'ready' });
    expect(planBreeding(locked, have(20, 200), 20, [])!.parents.formLock).toBeUndefined();
  });
});
