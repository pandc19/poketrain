import { multiplier, type TypeChart } from './battle/counters';
import { MAX_EV_TOTAL } from './ev-estimate';
import type { EvSpread } from './import/evs';
import { sameEffect } from './mint';
import type { Lang } from './i18n';
import { TYPE_NAMES_ES } from './pokemon-types';

/**
 * The audit without AI: rules over game data (base stats, the moves it can learn, the type chart).
 * It answers in the same shape as the model, so the code that turns a model's answer into an audit
 * (EV plan, fixed parts, Spanish names) works on it unchanged. Pure: the database reads live in tasks.ts.
 *
 * Bump this when a rule changes, so an audit made by older rules is told apart from a new one.
 */
export const RULES_VERSION = 3;

type Stat = keyof EvSpread;
type Say = { en: string; es: string };

export type RuleMove = {
  slug: string;
  nameEn: string;
  type: string;
  damageClass: string;
  power: number | null;
  accuracy: number | null;
  /** The Pokémon has it now. */
  known: boolean;
};

/** A nature's effect, as stored: the stats' PokéAPI slugs ('attack', 'special-attack'...), or null when neutral. */
export type RuleNature = { nameEn: string; increased: string | null; decreased: string | null };

export type RuleInput = {
  lang: Lang;
  /** The stage it is meant to end as: that is what the EVs, moves and item are for. */
  types: string[];
  baseStats: EvSpread;
  /** Everything it can legally have in this game, flagged with what it knows now. */
  moves: RuleMove[];
  natures: RuleNature[];
  /** The nature effect the game applies now (a given Mint, else its nature, else the one aimed for). */
  effectNature: RuleNature | null;
  /**
   * The nature effect it will have once the Mint fixed or chosen is given: the build is for that one.
   * Defaults to `effectNature`.
   */
  plannedNature?: RuleNature | null;
  /** Moves the player fixed: they stay, and the rest is chosen to go with them. */
  fixedMoves: string[];
  currentEvs: EvSpread | null;
  /** The game lets the player plan a whole spread; otherwise EVs can only be added to what it has. */
  freeEvs: boolean;
  /** Item slug → English name, for the items this game has. */
  items: Record<string, string>;
  chart: TypeChart;
  /** Which parts to give, the same flags the model is asked with. */
  ask: { evPlan: boolean; heldItem: boolean; moves: boolean; tera: boolean; nature: boolean; mint: boolean };
  /** The held item and Tera type it has now, so a good choice is kept rather than swapped. */
  currentItemSlug: string | null;
};

export type RuleOutput = {
  evPlan?: { spread: EvSpread };
  heldItem?: { item: string; reason: string };
  recommendedMoves?: { move: string; reason: string }[];
  mint?: { nature: string; keep: boolean; reason: string };
  nature?: { nature: string; reason: string };
  teraType?: { type: string; reason: string };
};

const STAT_SLUG: Record<string, Stat> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'specialAttack',
  'special-defense': 'specialDefense',
  speed: 'speed',
};

const STAT_NAME: Record<Stat, Say> = {
  hp: { en: 'HP', es: 'PS' },
  attack: { en: 'Attack', es: 'Ataque' },
  defense: { en: 'Defense', es: 'Defensa' },
  specialAttack: { en: 'Sp. Atk', es: 'Ataque Esp.' },
  specialDefense: { en: 'Sp. Def', es: 'Defensa Esp.' },
  speed: { en: 'Speed', es: 'Velocidad' },
};

const typeName = (type: string, lang: Lang) => (lang === 'es' ? (TYPE_NAMES_ES[type] ?? type) : type[0].toUpperCase() + type.slice(1));

/** Moves that raise what it attacks with. One of them is worth a slot on a Pokémon that can use it. */
const SETUP: Record<'physical' | 'special', { slug: string; stat: Stat }[]> = {
  physical: [
    { slug: 'swords-dance', stat: 'attack' },
    { slug: 'dragon-dance', stat: 'attack' },
    { slug: 'bulk-up', stat: 'attack' },
    { slug: 'shell-smash', stat: 'attack' },
    { slug: 'hone-claws', stat: 'attack' },
  ],
  special: [
    { slug: 'nasty-plot', stat: 'specialAttack' },
    { slug: 'calm-mind', stat: 'specialAttack' },
    { slug: 'quiver-dance', stat: 'specialAttack' },
    { slug: 'shell-smash', stat: 'specialAttack' },
    { slug: 'tail-glow', stat: 'specialAttack' },
  ],
};

/** Powerful moves with a heavy cost: a turn lost recharging, or the user fainting. Left out of the picks. */
const COSTLY = new Set([
  'hyper-beam', 'giga-impact', 'blast-burn', 'hydro-cannon', 'frenzy-plant', 'rock-wrecker', 'roar-of-time', 'prismatic-laser',
  'eternabeam', 'meteor-assault', 'explosion', 'self-destruct', 'misty-explosion', 'final-gambit', 'focus-punch', 'last-resort',
  'dream-eater', 'mind-blown',
]);

/** Strong moves that need a turn to charge (or the right weather), so they are not counted on. */
const CHARGE = ['solar-beam', 'solar-blade', 'skull-bash', 'sky-attack', 'razor-wind', 'freeze-shock', 'ice-burn', 'geomancy', 'meteor-beam', 'electro-shot'];
/** Left out of the picks and of how well it attacks: moves with a heavy cost, or that need a turn to charge. */
const SLOW = new Set([...COSTLY, ...CHARGE]);
/** Strong moves that lower the user's own stats afterwards: still good, but a clean one of similar power wins. */
const DROPS = new Set(['overheat', 'draco-meteor', 'leaf-storm', 'psycho-boost', 'fleur-cannon', 'close-combat', 'superpower', 'v-create', 'hammer-arm', 'clanging-scales', 'armor-cannon', 'shell-side-arm']);

const FAST = 80;
const MARGIN = 15;
const nameOf = (n: RuleNature | undefined) => n?.nameEn ?? '';

/**
 * Which attacking stat it uses, and whether it is fast. The base stats decide; only when they are close do
 * the nature it has and then its moves break the tie (a wrong nature must not turn a special attacker physical).
 */
export function roleOf(input: Pick<RuleInput, 'baseStats' | 'moves' | 'types' | 'effectNature'>) {
  const { baseStats: b, effectNature: n } = input;
  let offense: 'attack' | 'specialAttack';
  if (Math.abs(b.attack - b.specialAttack) >= MARGIN) {
    offense = b.attack > b.specialAttack ? 'attack' : 'specialAttack';
  } else {
    const raised = n?.increased ? STAT_SLUG[n.increased] : undefined;
    if (raised === 'attack' || raised === 'specialAttack') {
      offense = raised;
    } else {
      // Still a close call: the one its moves are better at (its own types' moves count most).
      const reach = (cls: string) =>
        input.moves
          .filter((m) => m.damageClass === cls && m.power && !SLOW.has(m.slug))
          .map((m) => (m.power ?? 0) * (input.types.includes(m.type) ? 1.5 : 1))
          .sort((x, y) => y - x)
          .slice(0, 4)
          .reduce((sum, v) => sum + v, 0);
      offense = reach('physical') >= reach('special') ? 'attack' : 'specialAttack';
    }
  }
  return { offense, fast: b.speed >= FAST };
}

/** The nature that suits a role: raise what it attacks with (or Speed when fast), lower the attack it never uses. */
export function idealNature(role: ReturnType<typeof roleOf>, natures: RuleNature[]): RuleNature | undefined {
  const physical = role.offense === 'attack';
  const name = role.fast ? (physical ? 'Jolly' : 'Timid') : physical ? 'Adamant' : 'Modest';
  return natures.find((n) => n.nameEn === name);
}


function natureReason(n: RuleNature, lang: Lang, unused: Stat): string {
  const up = n.increased ? STAT_NAME[STAT_SLUG[n.increased]] : null;
  const down = n.decreased ? STAT_NAME[STAT_SLUG[n.decreased]] : null;
  return lang === 'es'
    ? `${n.nameEn} sube ${up?.es} y baja ${down?.es ?? STAT_NAME[unused].es}, que no usa.`
    : `${n.nameEn} raises ${up?.en} and lowers ${down?.en ?? STAT_NAME[unused].en}, which it does not use.`;
}

/** Damage a move does against each of the 18 types, 2x or better. */
function superEffective(chart: TypeChart, attackType: string, types: string[]): string[] {
  return types.filter((t) => multiplier(chart, attackType, [t]) >= 2);
}

const ALL_TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];

function pickMoves(input: RuleInput, role: ReturnType<typeof roleOf>): { move: RuleMove; reason: string }[] {
  const { lang, chart } = input;
  const cls = role.offense === 'attack' ? 'physical' : 'special';
  const fixed = input.moves.filter((m) => input.fixedMoves.includes(m.nameEn));
  const slots = 4 - input.fixedMoves.length;
  if (slots <= 0) return [];

  const score = (m: RuleMove) =>
    (m.power ?? 0) * ((m.accuracy ?? 100) / 100) * (input.types.includes(m.type) ? 1.5 : 1) * (m.known ? 1.1 : 1) * (DROPS.has(m.slug) ? 0.85 : 1);
  const attacks = input.moves
    .filter((m) => m.damageClass === cls && (m.power ?? 0) >= 50 && !SLOW.has(m.slug) && !input.fixedMoves.includes(m.nameEn))
    .sort((a, b) => score(b) - score(a));

  const chosen: { move: RuleMove; reason: string }[] = [];
  const have = () => [...fixed, ...chosen.map((c) => c.move)];
  const hit = () => new Set(have().filter((m) => m.damageClass !== 'status').flatMap((m) => superEffective(chart, m.type, ALL_TYPES)));

  // One worthwhile setup move, when it has a spare slot and something to set up with.
  const b = input.baseStats;
  const sturdy = role.fast || (b.hp + b.defense + b.specialDefense) / 3 >= 70;
  const setup = !sturdy
    ? undefined
    : SETUP[cls]
    .map((s) => ({ s, m: input.moves.find((m) => m.slug === s.slug && !input.fixedMoves.includes(m.nameEn)) }))
    .filter((x) => x.m)
    // One it already knows first, then the order of the list.
    .sort((a, b) => Number(b.m!.known) - Number(a.m!.known))[0];
  const attackSlots = setup && slots >= 3 ? slots - 1 : slots;

  // 1. The best move of each of its own types.
  for (const type of input.types) {
    if (chosen.length >= attackSlots) break;
    const best = attacks.find((m) => m.type === type && !chosen.some((c) => c.move === m));
    if (best) {
      chosen.push({
        move: best,
        reason: lang === 'es' ? `Ataque ${typeName(type, 'es')} del mismo tipo, potencia ${best.power}.` : `Same-type ${typeName(type, 'en')} attack, power ${best.power}.`,
      });
    }
  }
  // 2. Then the move that reaches the most types the others do not.
  while (chosen.length < attackSlots) {
    const covered = hit();
    const best = attacks
      // A move picked to cover other types should be worth a slot: not a weak one.
      .filter((m) => !chosen.some((c) => c.move === m) && (m.power ?? 0) >= 70)
      .map((m) => ({ m, fresh: superEffective(chart, m.type, ALL_TYPES).filter((t) => !covered.has(t)) }))
      // What it reaches that the others do not counts most; a second move of a type already chosen counts less.
      .map((x) => ({ ...x, value: x.fresh.length * 40 + (score(x.m) / 10) * (have().some((h) => h.type === x.m.type) ? 0.6 : 1) }))
      .sort((a, b) => b.value - a.value)[0];
    if (!best) break;
    const names = best.fresh.slice(0, 3).map((t) => typeName(t, lang)).join(', ');
    chosen.push({
      move: best.m,
      reason: best.fresh.length
        ? lang === 'es'
          ? `Cubre lo que sus otros ataques no alcanzan: ${names}.`
          : `Covers what its other attacks miss: ${names}.`
        : lang === 'es'
          ? `Ataque ${typeName(best.m.type, 'es')} potente, potencia ${best.m.power}.`
          : `Strong ${typeName(best.m.type, 'en')} attack, power ${best.m.power}.`,
    });
  }
  if (setup && chosen.length < slots) {
    const stat = STAT_NAME[setup.s.stat];
    chosen.push({
      move: setup.m!,
      reason: lang === 'es' ? `Sube ${stat.es}, lo que usa para atacar.` : `Raises ${stat.en}, which it attacks with.`,
    });
  }
  return chosen;
}

function pickItem(input: RuleInput, role: ReturnType<typeof roleOf>, set: RuleMove[]): { slug: string; reason: Say } | null {
  const b = input.baseStats;
  const bulk = (b.hp + b.defense + b.specialDefense) / 3;
  const frail = bulk < 70;
  const attacksOnly = set.length > 0 && set.every((m) => m.damageClass !== 'status');
  const setsUp = set.some((m) => m.damageClass === 'status');
  const physical = role.offense === 'attack';
  const options: { slug: string; reason: Say }[] = [];
  if (role.fast && frail && !setsUp) {
    options.push({ slug: 'focus-sash', reason: { en: 'Fast but frail: the Sash lets it survive one hit and answer.', es: 'Rápido pero frágil: la Banda Aguante le deja sobrevivir a un golpe y responder.' } });
  }
  if (attacksOnly && !frail) {
    options.push(
      physical
        ? { slug: 'choice-band', reason: { en: 'Every move attacks, so the Band boosts them all.', es: 'Todos sus movimientos atacan, así que la Cinta Elección los potencia todos.' } }
        : { slug: 'choice-specs', reason: { en: 'Every move attacks, so the Specs boost them all.', es: 'Todos sus movimientos atacan, así que las Gafas Elección los potencian todos.' } }
    );
  }
  if (!role.fast && bulk >= 85 && b.specialDefense >= b.defense && !set.some((m) => m.damageClass === 'status')) {
    options.push({ slug: 'assault-vest', reason: { en: 'Bulky attacker with no status moves: the Vest adds Sp. Def.', es: 'Atacante resistente sin movimientos de estado: el Chaleco Asalto le suma Defensa Esp.' } });
  }
  if (bulk >= 85) {
    options.push({ slug: 'leftovers', reason: { en: 'Bulky, so the healing every turn adds up.', es: 'Es resistente, así que la curación de cada turno se acumula.' } });
  }
  options.push({ slug: 'life-orb', reason: { en: 'Boosts all its attacks at a small cost in HP.', es: 'Potencia todos sus ataques a cambio de algo de PS.' } });
  // Keep what it has when that is one of the good choices; otherwise the first one this game has.
  const keep = options.find((o) => o.slug === input.currentItemSlug && input.items[o.slug]);
  return keep ?? options.find((o) => input.items[o.slug]) ?? null;
}

function spreadFor(input: RuleInput, role: ReturnType<typeof roleOf>): EvSpread {
  const plan: EvSpread = { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 };
  const order: [Stat, number][] = role.fast
    ? [[role.offense, 252], ['speed', 252], ['hp', 6]]
    : [[role.offense, 252], ['hp', 252], ['defense', 6]];
  if (input.freeEvs || !input.currentEvs) {
    for (const [stat, amount] of order) plan[stat] = amount;
    return plan;
  }
  // EVs are hard to change here: keep what it has and put the ones still free where they matter most.
  Object.assign(plan, input.currentEvs);
  let free = MAX_EV_TOTAL - Object.values(plan).reduce((s, v) => s + v, 0);
  for (const [stat, amount] of order) {
    const add = Math.min(Math.max(0, amount - plan[stat]), free);
    plan[stat] += add;
    free -= add;
  }
  return plan;
}

/** The audit parts asked for, worked out from game data alone. */
export function ruleAudit(input: RuleInput): RuleOutput {
  const { ask, lang } = input;
  // The role is read with the effect it will have: a Mint fixed or chosen is part of the build.
  const role = roleOf({ ...input, effectNature: input.plannedNature ?? input.effectNature });
  const out: RuleOutput = {};
  const unused: Stat = role.offense === 'attack' ? 'specialAttack' : 'attack';
  const ideal = idealNature(role, input.natures);

  if (ask.evPlan) out.evPlan = { spread: spreadFor(input, role) };

  if (ask.nature && ideal) {
    out.nature = { nature: ideal.nameEn, reason: natureReason(ideal, lang, unused) };
  }
  if (ask.mint && ideal) {
    const effect = input.effectNature;
    const keep = effect != null && sameEffect(effect, ideal);
    const target = keep ? effect : ideal;
    out.mint = {
      nature: nameOf(target),
      keep,
      reason: keep
        ? lang === 'es' ? `El efecto que tiene ya es el mejor para su papel: ${natureReason(target, lang, unused)}` : `The effect it has is already the best for its role: ${natureReason(target, lang, unused)}`
        : natureReason(target, lang, unused),
    };
  }

  const picked = ask.moves || ask.heldItem || ask.tera ? pickMoves(input, role) : [];
  if (ask.moves) out.recommendedMoves = picked.map((p) => ({ move: p.move.nameEn, reason: p.reason }));

  // The item and Tera type go with the whole set: the fixed moves count too.
  const fixed = input.moves.filter((m) => input.fixedMoves.includes(m.nameEn));
  const set = [...fixed, ...picked.map((p) => p.move)];
  if (ask.heldItem) {
    const item = pickItem(input, role, set);
    if (item) out.heldItem = { item: input.items[item.slug], reason: item.reason[lang] };
  }
  if (ask.tera) {
    const attacks = set.filter((m) => (m.power ?? 0) > 0);
    const main = attacks.sort((a, b) => (b.power ?? 0) - (a.power ?? 0))[0];
    if (main) {
      out.teraType = {
        type: main.type,
        reason:
          lang === 'es'
            ? `Potencia su ataque principal, ${main.nameEn} (${typeName(main.type, 'es')}).`
            : `Powers up its main attack, ${main.nameEn} (${typeName(main.type, 'en')}).`,
      };
    }
  }
  return out;
}
