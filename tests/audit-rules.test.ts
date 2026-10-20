import { describe, expect, it } from 'vitest';
import { RULES_VERSION, roleOf, ruleAudit, type RuleInput, type RuleMove, type RuleNature } from '@/lib/audit-rules';
import { evTotal } from '@/lib/import/evs';
import { TYPE_CHART } from './type-chart';

const NATURES: RuleNature[] = [
  { nameEn: 'Hardy', increased: null, decreased: null },
  { nameEn: 'Adamant', increased: 'attack', decreased: 'special-attack' },
  { nameEn: 'Jolly', increased: 'speed', decreased: 'special-attack' },
  { nameEn: 'Modest', increased: 'special-attack', decreased: 'attack' },
  { nameEn: 'Timid', increased: 'speed', decreased: 'attack' },
  { nameEn: 'Lonely', increased: 'attack', decreased: 'defense' },
];

const mv = (slug: string, type: string, damageClass: string, power: number | null, accuracy: number | null = 100, known = false): RuleMove => ({
  slug,
  nameEn: slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
  type,
  damageClass,
  power,
  accuracy,
  known,
});

const ITEMS = {
  'focus-sash': 'Focus Sash',
  'choice-band': 'Choice Band',
  'choice-specs': 'Choice Specs',
  'life-orb': 'Life Orb',
  leftovers: 'Leftovers',
  'assault-vest': 'Assault Vest',
};

const ASK = { evPlan: true, heldItem: true, moves: true, tera: true, nature: true, mint: false };

// Garchomp: a fast physical Dragon/Ground attacker.
const garchomp: RuleInput = {
  lang: 'en',
  types: ['dragon', 'ground'],
  baseStats: { hp: 108, attack: 130, defense: 95, specialAttack: 80, specialDefense: 85, speed: 102 },
  moves: [
    mv('earthquake', 'ground', 'physical', 100),
    mv('dragon-claw', 'dragon', 'physical', 80),
    mv('outrage', 'dragon', 'physical', 120),
    mv('stone-edge', 'rock', 'physical', 100, 80),
    mv('crunch', 'dark', 'physical', 80),
    mv('fire-fang', 'fire', 'physical', 65, 95),
    mv('iron-head', 'steel', 'physical', 80),
    mv('poison-jab', 'poison', 'physical', 80),
    mv('swords-dance', 'normal', 'status', null, null),
    mv('hyper-beam', 'normal', 'special', 150, 90),
    mv('draco-meteor', 'dragon', 'special', 130, 90),
    mv('giga-impact', 'normal', 'physical', 150, 90),
  ],
  natures: NATURES,
  effectNature: null,
  fixedMoves: [],
  currentEvs: null,
  freeEvs: true,
  items: ITEMS,
  chart: TYPE_CHART,
  ask: ASK,
  currentItemSlug: null,
};

describe('role', () => {
  it('reads the attacking stat and the speed from the base stats', () => {
    expect(roleOf(garchomp)).toEqual({ offense: 'attack', fast: true });
    expect(roleOf({ ...garchomp, baseStats: { ...garchomp.baseStats, attack: 70, specialAttack: 120, speed: 60 } })).toEqual({
      offense: 'specialAttack',
      fast: false,
    });
  });

  it('lets the nature it has break a close call, but never override clear base stats', () => {
    const modest = NATURES.find((n) => n.nameEn === 'Modest')!;
    const even = { ...garchomp.baseStats, attack: 100, specialAttack: 105 };
    expect(roleOf({ ...garchomp, baseStats: even, effectNature: modest }).offense).toBe('specialAttack');
    // A physical attacker with a special nature is still physical: the nature is the thing to fix.
    expect(roleOf({ ...garchomp, effectNature: modest }).offense).toBe('attack');
    const lonely = NATURES.find((n) => n.nameEn === 'Lonely')!;
    const sylveon = { ...garchomp.baseStats, attack: 65, specialAttack: 110, speed: 60 };
    expect(roleOf({ ...garchomp, baseStats: sylveon, effectNature: lonely })).toEqual({ offense: 'specialAttack', fast: false });
  });

  it('breaks a close call by what its moves are good at', () => {
    const even = { ...garchomp.baseStats, attack: 100, specialAttack: 100 };
    expect(roleOf({ ...garchomp, baseStats: even }).offense).toBe('attack');
    const specialMoves = [mv('psychic', 'psychic', 'special', 90), mv('moonblast', 'fairy', 'special', 95), mv('tackle', 'normal', 'physical', 40)];
    expect(roleOf({ ...garchomp, baseStats: even, types: ['psychic'], moves: specialMoves }).offense).toBe('specialAttack');
  });
});

describe('rule-based audit of a fast physical attacker', () => {
  const audit = ruleAudit(garchomp);

  it('aims for a Jolly nature, with a reason', () => {
    expect(audit.nature?.nature).toBe('Jolly');
    expect(audit.nature?.reason).toMatch(/Jolly raises Speed and lowers Sp\. Atk/);
  });

  it('puts the EVs in Attack, Speed and a little HP', () => {
    expect(audit.evPlan?.spread).toEqual({ hp: 4, attack: 252, defense: 0, specialAttack: 0, specialDefense: 0, speed: 252 });
  });

  it('picks the best attack of each of its types first, and a setup move', () => {
    const names = audit.recommendedMoves!.map((m) => m.move);
    expect(names).toHaveLength(4);
    expect(names).toContain('Earthquake');
    expect(names).toContain('Outrage');
    expect(names).toContain('Swords Dance');
    // No special attacks for a physical attacker, and no recharge moves.
    expect(names).not.toContain('Draco Meteor');
    expect(names).not.toContain('Hyper Beam');
    expect(names).not.toContain('Giga Impact');
  });

  it('chooses the third attack for what the first two cannot hit', () => {
    const names = audit.recommendedMoves!.map((m) => m.move);
    const third = names.find((n) => !['Earthquake', 'Outrage', 'Swords Dance'].includes(n));
    // Ground and Dragon miss Flying, Ice-resisters, Steel and Fairy; the others each reach something new.
    expect(['Stone Edge', 'Fire Fang', 'Iron Head', 'Crunch', 'Poison Jab']).toContain(third);
    expect(audit.recommendedMoves!.find((m) => m.move === third)!.reason).toMatch(/^Covers what its other attacks miss: /);
  });

  it('powers up its strongest attack with the Tera type', () => {
    expect(audit.teraType?.type).toBe('dragon');
    expect(audit.teraType?.reason).toMatch(/Outrage/);
  });

  it('answers in Spanish when asked to', () => {
    const es = ruleAudit({ ...garchomp, lang: 'es' });
    expect(es.nature?.reason).toMatch(/sube Velocidad y baja Ataque Esp\./);
    expect(es.recommendedMoves![0].reason).toMatch(/Ataque .* del mismo tipo, potencia/);
  });
});

describe('move choice', () => {
  const grass: RuleInput = {
    ...garchomp,
    types: ['grass'],
    baseStats: { hp: 70, attack: 85, defense: 65, specialAttack: 105, specialDefense: 85, speed: 120 },
    moves: [
      mv('solar-beam', 'grass', 'special', 120),
      mv('leaf-storm', 'grass', 'special', 130, 90),
      mv('energy-ball', 'grass', 'special', 90),
      mv('giga-drain', 'grass', 'special', 75),
      mv('dragon-pulse', 'dragon', 'special', 85),
      mv('focus-blast', 'fighting', 'special', 120, 70),
    ],
    ask: { ...ASK, heldItem: false, tera: false },
  };

  it('leaves out moves that need a turn to charge', () => {
    expect(ruleAudit(grass).recommendedMoves!.map((m) => m.move)).not.toContain('Solar Beam');
  });

  it('does not stack moves of one type while other types are left uncovered', () => {
    const types = ruleAudit(grass).recommendedMoves!.map((m) => m.move);
    const grassMoves = types.filter((n) => ['Leaf Storm', 'Energy Ball', 'Giga Drain'].includes(n));
    expect(grassMoves.length).toBeLessThanOrEqual(2);
    expect(types).toContain('Dragon Pulse');
  });

  it('chooses the setup move it already knows over another', () => {
    const both = [...garchomp.moves.filter((m) => m.slug !== 'swords-dance'), mv('swords-dance', 'normal', 'status', null, null), mv('dragon-dance', 'dragon', 'status', null, null, true)];
    expect(ruleAudit({ ...garchomp, moves: both }).recommendedMoves!.map((m) => m.move)).toContain('Dragon Dance');
  });

  it('does not fill a slot with a weak move just to cover a type', () => {
    const weak: RuleInput = { ...grass, moves: [mv('energy-ball', 'grass', 'special', 90), mv('magical-leaf', 'grass', 'special', 60)], ask: { ...grass.ask, moves: true } };
    expect(ruleAudit(weak).recommendedMoves!.map((m) => m.move)).toEqual(['Energy Ball']);
  });

  it('prefers a clean move to one that lowers its own stats when they are close', () => {
    const near: RuleInput = { ...grass, moves: [mv('leaf-storm', 'grass', 'special', 100), mv('energy-ball', 'grass', 'special', 90)], ask: { ...grass.ask, moves: true } };
    expect(ruleAudit(near).recommendedMoves![0].move).toBe('Energy Ball');
  });
});

describe('fixed parts and limits', () => {
  it('keeps fixed moves and only fills the remaining slots, without repeating them', () => {
    const audit = ruleAudit({ ...garchomp, fixedMoves: ['Earthquake', 'Outrage'], ask: { ...ASK, tera: false } });
    const names = audit.recommendedMoves!.map((m) => m.move);
    expect(names).toHaveLength(2);
    expect(names).not.toContain('Earthquake');
    expect(names).not.toContain('Outrage');
  });

  it('asks for nothing it was not asked for', () => {
    const audit = ruleAudit({ ...garchomp, ask: { evPlan: false, heldItem: false, moves: false, tera: false, nature: false, mint: false } });
    expect(audit).toEqual({});
  });

  it('only adds to the EVs it has where EVs are hard to change', () => {
    const current = { hp: 0, attack: 100, defense: 252, specialAttack: 0, specialDefense: 0, speed: 0 };
    const spread = ruleAudit({ ...garchomp, freeEvs: false, currentEvs: current }).evPlan!.spread;
    for (const key of Object.keys(current) as (keyof typeof current)[]) expect(spread[key]).toBeGreaterThanOrEqual(current[key]);
    expect(evTotal(spread)).toBeLessThanOrEqual(508);
    // 352 are spent, so 156 are free: 152 finish Attack, the last 4 go to Speed.
    expect(spread.attack).toBe(252);
    expect(spread.speed).toBe(4);
    expect(evTotal(spread)).toBe(508);
  });
});

describe('Mint', () => {
  const jolly = NATURES.find((n) => n.nameEn === 'Jolly')!;
  const adamant = NATURES.find((n) => n.nameEn === 'Adamant')!;
  const ask = { ...ASK, evPlan: false, heldItem: false, moves: false, tera: false, nature: false, mint: true };

  it('keeps the effect it has when it is already the right one', () => {
    const mint = ruleAudit({ ...garchomp, ask, effectNature: jolly }).mint!;
    expect(mint).toMatchObject({ nature: 'Jolly', keep: true });
  });

  it('suggests the better effect when it is not', () => {
    const mint = ruleAudit({ ...garchomp, ask, effectNature: adamant }).mint!;
    expect(mint).toMatchObject({ nature: 'Jolly', keep: false });
  });
});

describe('held item', () => {
  const ask = { ...ASK, evPlan: false, moves: false, tera: false, nature: false, mint: false };
  const frailFast = { hp: 55, attack: 50, defense: 45, specialAttack: 135, specialDefense: 95, speed: 120 };

  it('gives a fast, frail Pokémon a Focus Sash', () => {
    const out = ruleAudit({ ...garchomp, baseStats: frailFast, moves: [mv('shadow-ball', 'ghost', 'special', 80)], ask });
    expect(out.heldItem?.item).toBe('Focus Sash');
  });

  it('keeps the item it holds when that is one of the good choices', () => {
    const out = ruleAudit({ ...garchomp, ask, currentItemSlug: 'life-orb' });
    expect(out.heldItem?.item).toBe('Life Orb');
  });

  it('only names items the game has', () => {
    const out = ruleAudit({ ...garchomp, ask, items: { 'life-orb': 'Life Orb' } });
    expect(out.heldItem?.item).toBe('Life Orb');
    expect(ruleAudit({ ...garchomp, ask, items: {} }).heldItem).toBeUndefined();
  });
});

describe('special attacker', () => {
  const gardevoir: RuleInput = {
    ...garchomp,
    types: ['psychic', 'fairy'],
    baseStats: { hp: 68, attack: 65, defense: 65, specialAttack: 125, specialDefense: 115, speed: 80 },
    moves: [
      mv('psychic', 'psychic', 'special', 90),
      mv('moonblast', 'fairy', 'special', 95),
      mv('shadow-ball', 'ghost', 'special', 80),
      mv('focus-blast', 'fighting', 'special', 120, 70),
      mv('calm-mind', 'psychic', 'status', null, null),
      mv('close-combat', 'fighting', 'physical', 120),
    ],
  };

  it('uses only special attacks and a special setup move', () => {
    const names = ruleAudit(gardevoir).recommendedMoves!.map((m) => m.move);
    expect(names).toContain('Psychic');
    expect(names).toContain('Moonblast');
    expect(names).toContain('Calm Mind');
    expect(names).not.toContain('Close Combat');
  });

  it('aims for Timid, as a fast special attacker', () => {
    expect(ruleAudit(gardevoir).nature?.nature).toBe('Timid');
  });
});

describe('version', () => {
  it('has a rules version to tell audits made by older rules apart', () => {
    expect(RULES_VERSION).toBeGreaterThan(0);
  });
});
