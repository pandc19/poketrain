/**
 * Breeding and matchmaking engine. Pure: it works on plain data so it can be
 * unit tested without a database (see load.ts for the Prisma side).
 *
 * Rules modelled (Generation 6 onwards):
 *  - Two Pokémon can breed when they share an egg group, are of opposite
 *    gender, and neither is in the "no-eggs" group. Ditto breeds with
 *    anything that can breed, including genderless Pokémon.
 *  - The egg is the mother's species (or the non-Ditto parent's), at its
 *    base stage.
 *  - The egg knows an egg move if either parent knows it.
 *  - Scarlet/Violet only: a Pokémon holding a Mirror Herb with a free move
 *    slot copies its egg moves from any party member at a picnic, no egg needed.
 *
 * Genders: a Pokémon the player owns counts as a male or female parent only
 * when its gender is recorded (on the roster or in the Pokédex). A species
 * that can only be one gender is known without recording it.
 */

import type { Localized } from '../translate';

/**
 * An evolution only one form of the base species can make (White-Striped Basculin into Basculegion), so a
 * parent of any other form hatches eggs that can never evolve into the target. Rules live in the game's
 * config (src/lib/games/breeding-forms.ts); `formId` is looked up from the form's slug when the data loads.
 */
export type FormLock = {
  /** The evolved species the plan is for. */
  targetId: number;
  /** The species that hatches. */
  baseId: number;
  formId: number;
  /** The form as the player reads it: "White-Striped Basculin". */
  name: Localized;
  /** Held by the parent for the egg to keep the form. */
  item: { name: Localized; slug: string } | null;
};

export type SpeciesInfo = {
  id: number;
  nameEn: string;
  nameEs: string;
  eggGroups: string[];
  /** Eighths that are female; -1 = genderless. */
  genderRate: number;
  evolvesFromId: number | null;
  /** Obtainable in the game being planned for. */
  available: boolean;
};

export type LearnWay = { method: string; level: number };

export type BreedingData = {
  species: Map<number, SpeciesInfo>;
  /** speciesId -> moveId -> how that exact species learns it in this game. */
  learns: Map<number, Map<number, LearnWay[]>>;
  mirrorHerb: boolean;
  formLocks: FormLock[];
};

export type Gender = 'MALE' | 'FEMALE' | 'BOTH' | 'GENDERLESS' | 'UNKNOWN';

/** What the Judge's word for one stat tells about its IV: exactly 31, anything else, or not judged. */
export type IvKnowledge = 'perfect' | 'imperfect' | 'unknown';
export const IV_STATS = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'] as const;
export type IvStat = (typeof IV_STATS)[number];

export type OwnedPokemon = {
  speciesId: number;
  gender: Gender;
  moveIds: number[];
  /** Where it was recorded. A Pokédex entry is a species and a gender with nothing known about it. */
  source?: 'breeder' | 'roster' | 'pokedex';
  /** Roster id, so a plan can point at the exact Pokémon. */
  id?: string;
  /** Nickname, when it has one. */
  label?: string | null;
  /** The Judge's word for each IV; stats left out are not judged. */
  ivs?: Partial<Record<IvStat, IvKnowledge>>;
  /** The form it is, when recorded. */
  formId?: number | null;
  /** The nature it has now. */
  natureId?: number | null;
  /** True when its ability is the species' hidden one; null when not known. */
  hiddenAbility?: boolean | null;
};

export type Owned = {
  /**
   * Everything the player has: trained roster Pokémon (gender and moves
   * known) plus one entry per gender registered in the Pokédex.
   */
  roster: OwnedPokemon[];
  /** Species marked caught in the Pokédex. */
  caughtSpeciesIds: Set<number>;
};

export type SpeciesRef = { id: number; nameEn: string; nameEs: string };

/** How the player stands with respect to a species a step needs. */
export type Have = 'ready' | 'caught' | 'missing';

export type ParentRole = 'mother' | 'ditto' | 'father' | 'donor';

export type Step =
  | {
      action: 'obtain';
      species: SpeciesRef;
      have: Have;
      gender?: 'male' | 'female';
      role: ParentRole;
      /** The player has this species, but only of the other gender. */
      wrongGender?: boolean;
    }
  | { action: 'teach'; species: SpeciesRef; method: string; level: number }
  | { action: 'breed'; father: SpeciesRef; mother: SpeciesRef; offspring: SpeciesRef }
  | { action: 'picnic'; from: SpeciesRef; to: SpeciesRef };

export type MoveOption = {
  kind: 'mirror-herb' | 'breed' | 'chain';
  /** True when the player already owns a Pokémon that knows the move. */
  ready: boolean;
  steps: Step[];
};

export type MovePlan = {
  moveId: number;
  /**
   * natural: the target learns it without breeding.
   * egg: needs a parent (or picnic partner) that knows it.
   * illegal: cannot have it in this game at all.
   */
  kind: 'natural' | 'egg' | 'illegal';
  natural?: { species: SpeciesRef; method: string; level: number };
  options: MoveOption[];
};

export type ParentPlan = {
  /** Base-stage species the egg hatches as. */
  hatchesAs: SpeciesRef;
  canBreed: boolean;
  /** Why not, when canBreed is false. */
  reason?: 'no-eggs' | 'unknown-species';
  /** Needs Ditto: genderless, or a male-only line. */
  needsDitto: boolean;
  /** Only this form of the family hatches eggs that can evolve into the target. */
  formLock?: { name: Localized; item: FormLock['item'] };
  haveMother: boolean;
  haveDitto: boolean;
  steps: Step[];
};

/** One Pokémon the plan needs, and whether the player has it. */
export type ShoppingItem = {
  species: SpeciesRef;
  gender?: 'male' | 'female';
  role: ParentRole;
  have: Have;
  wrongGender?: boolean;
  /** The wanted move this Pokémon passes down, for fathers and picnic partners. */
  forMoveId?: number;
};

export type BreedingPlan = {
  target: SpeciesRef;
  parents: ParentPlan;
  moves: MovePlan[];
  /** Everything needed to get the target with the wanted moves, de-duplicated. */
  shopping: ShoppingItem[];
};

export const DITTO_ID = 132;
const NO_EGGS = 'no-eggs';
const MAX_CHAIN_DEPTH = 3;
const MAX_OPTIONS = 3;

export const ref = (s: SpeciesInfo): SpeciesRef => ({ id: s.id, nameEn: s.nameEn, nameEs: s.nameEs });

/** The species itself followed by its pre-evolutions, base stage last. */
export function lineage(data: BreedingData, speciesId: number): SpeciesInfo[] {
  const chain: SpeciesInfo[] = [];
  for (let cur = data.species.get(speciesId); cur && !chain.includes(cur); ) {
    chain.push(cur);
    cur = cur.evolvesFromId != null ? data.species.get(cur.evolvesFromId) : undefined;
  }
  return chain;
}

/** The rule that limits which parents can hatch an egg that evolves into this species, if there is one. */
export function formLockFor(data: BreedingData, speciesId: number): FormLock | null {
  const line = lineage(data, speciesId).map((s) => s.id);
  return data.formLocks.find((l) => line.includes(l.targetId)) ?? null;
}

/**
 * Whether a Pokémon of the family is the form the lock needs: yes, no, or not known (a Pokédex entry or a roster
 * Pokémon with no form recorded). An evolved Pokémon already is the form.
 */
export function formOf(lock: FormLock, p: OwnedPokemon): 'yes' | 'no' | 'unknown' {
  if (p.speciesId !== lock.baseId) return 'yes';
  if (p.formId == null) return 'unknown';
  return p.formId === lock.formId ? 'yes' : 'no';
}

export const baseOf = (data: BreedingData, speciesId: number) => lineage(data, speciesId).at(-1);

export const canBreedAtAll = (s: SpeciesInfo) => s.eggGroups.length > 0 && !s.eggGroups.includes(NO_EGGS) && s.id !== DITTO_ID;
export const canBeMale = (s: SpeciesInfo) => s.genderRate >= 0 && s.genderRate < 8;
export const canBeFemale = (s: SpeciesInfo) => s.genderRate > 0;
export const shareGroup = (a: SpeciesInfo, b: SpeciesInfo) => a.eggGroups.some((g) => b.eggGroups.includes(g));

/** Ways a species' line learns a move, split into egg and everything else. */
function waysFor(data: BreedingData, speciesId: number, moveId: number) {
  let natural: { species: SpeciesInfo; way: LearnWay } | null = null;
  let egg = false;
  for (const s of lineage(data, speciesId)) {
    for (const way of data.learns.get(s.id)?.get(moveId) ?? []) {
      if (way.method === 'egg') {
        egg = true;
        continue;
      }
      // Prefer level-up (lowest level) over TMs and tutors: it costs nothing.
      const better =
        !natural ||
        (way.method === 'level-up' && (natural.way.method !== 'level-up' || way.level < natural.way.level));
      if (better) natural = { species: s, way };
    }
  }
  return { natural, egg };
}

const childrenIndex = new WeakMap<BreedingData, Map<number, number[]>>();

export function familyIds(data: BreedingData, speciesId: number): number[] {
  let children = childrenIndex.get(data);
  if (!children) {
    children = new Map();
    for (const s of data.species.values()) {
      if (s.evolvesFromId == null) continue;
      if (!children.has(s.evolvesFromId)) children.set(s.evolvesFromId, []);
      children.get(s.evolvesFromId)!.push(s.id);
    }
    childrenIndex.set(data, children);
  }
  const base = baseOf(data, speciesId);
  if (!base) return [speciesId];
  const ids = [base.id];
  // Walk down the evolution tree from the base stage.
  for (let i = 0; i < ids.length; i++) {
    for (const child of children.get(ids[i]) ?? []) {
      if (!ids.includes(child)) ids.push(child);
    }
  }
  return ids;
}

/** The stage of a family that can actually breed (baby Pokémon cannot; their evolutions can). */
export function breederOf(data: BreedingData, speciesId: number): SpeciesInfo | null {
  const self = data.species.get(speciesId);
  if (self && canBreedAtAll(self)) return self;
  return familyIds(data, speciesId).map((id) => data.species.get(id)!).find(canBreedAtAll) ?? null;
}

/** A recorded gender, or the one a single-gender species must have. */
export function effectiveGender(data: BreedingData, p: OwnedPokemon): Gender {
  if (p.gender !== 'UNKNOWN') return p.gender;
  const rate = data.species.get(p.speciesId)?.genderRate;
  return rate === 0 ? 'MALE' : rate === 8 ? 'FEMALE' : 'UNKNOWN';
}

const isGender = (g: Gender, want: 'male' | 'female') =>
  g === 'BOTH' || g === (want === 'male' ? 'MALE' : 'FEMALE');

/**
 * Where the player stands for one needed Pokémon.
 *  ready: has one (of the right gender, knowing the move if one is wanted).
 *  caught: has the species, but its gender is not recorded or it lacks the move.
 *  missing: has none; `wrongGender` when only the other gender is owned.
 */
function standing(
  owned: Owned,
  data: BreedingData,
  speciesId: number,
  want: { move?: number; gender?: 'male' | 'female'; lock?: FormLock | null } = {}
): { have: Have; wrongGender: boolean } {
  const family = new Set(familyIds(data, speciesId));
  const form = (p: OwnedPokemon) => (want.lock ? formOf(want.lock, p) : 'yes');
  const ofFamily = owned.roster.filter((p) => family.has(p.speciesId));
  // A Pokémon of the wrong form is no parent for this plan.
  const inFamily = ofFamily.filter((p) => form(p) !== 'no');
  const hasMove = (p: OwnedPokemon) => want.move == null || p.moveIds.includes(want.move);
  const known = (p: OwnedPokemon) => !want.gender || isGender(effectiveGender(data, p), want.gender);
  const unknown = (p: OwnedPokemon) => effectiveGender(data, p) === 'UNKNOWN';

  if (inFamily.some((p) => known(p) && hasMove(p) && form(p) === 'yes')) return { have: 'ready', wrongGender: false };
  if (inFamily.some((p) => known(p) || unknown(p))) return { have: 'caught', wrongGender: false };
  if (ofFamily.length === 0 && [...family].some((id) => owned.caughtSpeciesIds.has(id))) {
    return { have: 'caught', wrongGender: false };
  }
  return { have: 'missing', wrongGender: inFamily.length > 0 };
}

/** A species that can teach the move to an egg of `mother`'s line by being the father. */
type Donor = { species: SpeciesInfo; way: LearnWay; have: Have; wrongGender: boolean };

/**
 * Fathers for `child`: available, able to be male, sharing an egg group, and
 * learning the move without breeding. One per evolution family (the stage
 * that learns it most cheaply), best first.
 */
function directDonors(data: BreedingData, owned: Owned, child: SpeciesInfo, moveId: number): Donor[] {
  const byFamily = new Map<number, Donor>();
  for (const s of data.species.values()) {
    if (!s.available || !canBreedAtAll(s) || !canBeMale(s) || !shareGroup(s, child)) continue;
    const way = pickNatural(data.learns.get(s.id)?.get(moveId));
    if (!way) continue;
    const family = baseOf(data, s.id)?.id ?? s.id;
    const donor: Donor = { species: s, way, ...standing(owned, data, s.id, { move: moveId, gender: 'male' }) };
    const existing = byFamily.get(family);
    if (!existing || rank(donor) < rank(existing)) byFamily.set(family, donor);
  }
  return [...byFamily.values()].sort((a, b) => rank(a) - rank(b) || a.species.id - b.species.id);
}

function pickNatural(ways: LearnWay[] | undefined): LearnWay | null {
  const natural = (ways ?? []).filter((w) => w.method !== 'egg');
  if (!natural.length) return null;
  return natural.sort((a, b) => methodCost(a) - methodCost(b))[0];
}

const methodCost = (w: LearnWay) => (w.method === 'level-up' ? w.level : w.method === 'machine' ? 200 : 300);
const HAVE_RANK: Record<Have, number> = { ready: 0, caught: 1, missing: 2 };
const rank = (d: { have: Have; way: LearnWay }) => HAVE_RANK[d.have] * 1000 + methodCost(d.way);

const donorSteps = (d: Donor): Step[] => [
  { action: 'obtain', species: ref(d.species), have: d.have, gender: 'male', role: 'father', wrongGender: d.wrongGender },
  ...(d.have === 'ready' ? [] : [{ action: 'teach' as const, species: ref(d.species), method: d.way.method, level: d.way.level }]),
];

/**
 * Shortest multi-generation path when no father learns the move directly:
 * a donor passes it to an intermediate species (as that species' egg move),
 * whose male offspring passes it on, until the target's line is reached.
 */
function chainPath(data: BreedingData, owned: Owned, target: SpeciesInfo, moveId: number): Step[] | null {
  type Node = { species: SpeciesInfo; next: Node | null };
  let frontier: Node[] = [{ species: target, next: null }];
  const seen = new Set([baseOf(data, target.id)?.id ?? target.id]);

  for (let depth = 0; depth < MAX_CHAIN_DEPTH && frontier.length; depth++) {
    const nextFrontier: Node[] = [];
    for (const node of frontier) {
      if (depth > 0) {
        const donor = directDonors(data, owned, node.species, moveId)[0];
        if (donor) {
          const steps: Step[] = [...donorSteps(donor)];
          let father = donor.species;
          for (let cur: Node | null = node; cur; cur = cur.next) {
            const hatches = baseOf(data, cur.species.id) ?? cur.species;
            steps.push({ action: 'breed', father: ref(father), mother: ref(cur.species), offspring: ref(hatches) });
            father = hatches;
          }
          return steps;
        }
      }
      // Intermediates: species that get the move as an egg move and can father `node`.
      for (const s of data.species.values()) {
        if (!s.available || !canBreedAtAll(s) || !canBeMale(s) || !canBeFemale(s) || !shareGroup(s, node.species)) continue;
        const family = baseOf(data, s.id)?.id ?? s.id;
        if (seen.has(family) || !waysFor(data, s.id, moveId).egg) continue;
        seen.add(family);
        nextFrontier.push({ species: s, next: node });
      }
    }
    frontier = nextFrontier;
  }
  return null;
}

function planMove(data: BreedingData, owned: Owned, target: SpeciesInfo, moveId: number, mother: SpeciesInfo | null): MovePlan {
  const { natural, egg } = waysFor(data, target.id, moveId);
  if (natural) {
    return {
      moveId,
      kind: 'natural',
      natural: { species: ref(natural.species), method: natural.way.method, level: natural.way.level },
      options: [],
    };
  }
  if (!egg) return { moveId, kind: 'illegal', options: [] };

  const options: MoveOption[] = [];
  const hatches = baseOf(data, target.id) ?? target;

  if (data.mirrorHerb) {
    // Any owned Pokémon that knows the move works, whatever its species or gender.
    const knower = owned.roster.find((p) => p.moveIds.includes(moveId) && data.species.has(p.speciesId));
    if (knower) {
      options.push({
        kind: 'mirror-herb',
        ready: true,
        steps: [{ action: 'picnic', from: ref(data.species.get(knower.speciesId)!), to: ref(target) }],
      });
    }
  }

  if (mother) {
    for (const donor of directDonors(data, owned, mother, moveId).slice(0, MAX_OPTIONS)) {
      options.push({
        kind: 'breed',
        ready: donor.have === 'ready',
        steps: [...donorSteps(donor), { action: 'breed', father: ref(donor.species), mother: ref(mother), offspring: ref(hatches) }],
      });
    }
    if (!options.some((o) => o.kind === 'breed')) {
      const chain = chainPath(data, owned, mother, moveId);
      if (chain) options.push({ kind: 'chain', ready: false, steps: chain });
    }
  }

  if (data.mirrorHerb && !options.some((o) => o.kind === 'mirror-herb')) {
    // No owned knower: the cheapest species to catch and level up, of any egg group.
    const anyDonor = [...data.species.values()]
      .filter((s) => s.available)
      .map((s) => ({ species: s, way: pickNatural(data.learns.get(s.id)?.get(moveId)) }))
      .filter((d): d is { species: SpeciesInfo; way: LearnWay } => d.way != null)
      .map((d) => ({ ...d, ...standing(owned, data, d.species.id, { move: moveId }) }))
      .sort((a, b) => rank(a) - rank(b) || a.species.id - b.species.id)[0];
    if (anyDonor) {
      options.push({
        kind: 'mirror-herb',
        ready: false,
        steps: [
          { action: 'obtain', species: ref(anyDonor.species), have: anyDonor.have, role: 'donor' },
          { action: 'teach', species: ref(anyDonor.species), method: anyDonor.way.method, level: anyDonor.way.level },
          { action: 'picnic', from: ref(anyDonor.species), to: ref(target) },
        ],
      });
    }
  }

  // Things the player can do right now come first.
  options.sort((a, b) => Number(b.ready) - Number(a.ready));
  return { moveId, kind: 'egg', options };
}

function planParents(data: BreedingData, owned: Owned, target: SpeciesInfo): ParentPlan {
  const hatches = baseOf(data, target.id) ?? target;
  const haveDitto = owned.caughtSpeciesIds.has(DITTO_ID) || owned.roster.some((p) => p.speciesId === DITTO_ID);
  const ditto = data.species.get(DITTO_ID);

  // Baby Pokémon are in "no-eggs" themselves; what matters is whether an evolved stage can breed.
  const breeder = breederOf(data, target.id);
  if (!breeder) {
    return { hatchesAs: ref(hatches), canBreed: false, reason: 'no-eggs', needsDitto: false, haveMother: false, haveDitto, steps: [] };
  }
  const needsDitto = !canBeFemale(breeder);
  const lock = formLockFor(data, target.id);

  const steps: Step[] = [];
  let haveMother: boolean;
  if (needsDitto) {
    // Any one of this line will do; Ditto supplies the other half.
    const mine = standing(owned, data, breeder.id, { lock });
    haveMother = mine.have !== 'missing';
    steps.push({ action: 'obtain', species: ref(breeder), have: haveMother ? 'ready' : 'missing', role: 'mother' });
    if (ditto) steps.push({ action: 'obtain', species: ref(ditto), have: haveDitto ? 'ready' : 'missing', role: 'ditto' });
  } else {
    const mother = standing(owned, data, breeder.id, { gender: 'female', lock });
    haveMother = mother.have === 'ready';
    steps.push({
      action: 'obtain',
      species: ref(breeder),
      have: mother.have,
      gender: 'female',
      role: 'mother',
      wrongGender: mother.wrongGender,
    });
  }
  return {
    hatchesAs: ref(hatches),
    canBreed: true,
    needsDitto,
    formLock: lock ? { name: lock.name, item: lock.item } : undefined,
    haveMother,
    haveDitto,
    steps,
  };
}

/** Collapses the steps of the best option for each move into one de-duplicated list. */
function shoppingList(parents: ParentPlan, moves: MovePlan[]): ShoppingItem[] {
  const items = new Map<string, ShoppingItem>();
  const add = (step: Step, forMoveId?: number) => {
    if (step.action !== 'obtain') return;
    const key = `${step.species.id}:${step.gender ?? ''}:${step.role}`;
    if (items.has(key)) return;
    items.set(key, {
      species: step.species,
      gender: step.gender,
      role: step.role,
      have: step.have,
      wrongGender: step.wrongGender,
      forMoveId,
    });
  };
  parents.steps.forEach((s) => add(s));
  for (const move of moves) {
    // Options are sorted ready-first, so the first one is the best available.
    move.options[0]?.steps.forEach((s) => add(s, move.moveId));
  }
  return [...items.values()];
}

/** Builds the full plan for breeding `targetId` with the wanted moves. */
export function planBreeding(data: BreedingData, owned: Owned, targetId: number, moveIds: number[]): BreedingPlan | null {
  const target = data.species.get(targetId);
  if (!target) return null;
  const parents = planParents(data, owned, target);
  const mother = breederOf(data, target.id);
  const moves = moveIds.map((moveId) => planMove(data, owned, target, moveId, parents.canBreed ? mother : null));
  return { target: ref(target), parents, moves, shopping: shoppingList(parents, moves) };
}
