import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { gameDexes, type GameConfig } from '../games';
import { TYPE_SLUGS } from '../pokemon-types';
import {
  abilityMatters,
  chartFrom,
  rankCounters,
  weaknessTable,
  type BaseStats,
  type Candidate,
  type CandidateMove,
  type Counter,
  type OpponentInput,
  type TypeChart,
} from './counters';

/** The 18 types a Pokémon can have (Stellar is a Tera type only). */
const BATTLE_TYPES = TYPE_SLUGS.filter((t) => t !== 'stellar');

export type Named = { id: number; nameEn: string; nameEs: string };

/** An ability with a sentence on what it does, in each language (null when the data has none). */
export type AbilityInfo = Named & { descriptionEn: string | null; descriptionEs: string | null };

export type MoveView = Named & { type: string; power: number | null; damageClass: string };

/** The easiest way a Pokémon of the game gets a move. */
export type LearnWay = { method: 'level' | 'evolve' | 'tm' | 'tutor' | 'egg'; level?: number };

export type CounterView = {
  species: Named;
  formId: number;
  spriteUrl: string | null;
  types: string[];
  /** Where it comes from: a roster entry, or a species of the game. */
  source: 'roster' | 'game';
  /** You have one (roster entry in your box, or an owned Pokédex entry). */
  have: boolean;
  nickname: string | null;
  move: MoveView & { multiplier: number; stab: boolean; known: boolean; learn?: LearnWay | null };
  alternatives: (MoveView & { multiplier: number; stab: boolean; known: boolean; learn?: LearnWay | null })[];
  /** The ability to give it, when it changes the matchup (game suggestions). */
  ability?: Named | null;
  /** Its Tera type (roster), or the best one to give it (game suggestion); null = none. */
  teraType?: string | null;
  /** Worst hit it takes from the opponent's attacks, once Terastallized when it has a Tera type. */
  incoming: number;
  /** The same before it Terastallizes. */
  incomingBase?: number;
  /** It moves before the opponent (higher base Speed). */
  faster: boolean;
  /** The roster entry it comes from; null for game suggestions. */
  rosterId: string | null;
  /** The one the player marked as the best against this opponent. */
  best: boolean;
};

export type BattleOpponentView = {
  id: string;
  label: string | null;
  archived: boolean;
  /** The player has beaten it. */
  defeated: boolean;
  /** Defeated: the matchups and counters are what they were when it was marked, not worked out again. */
  locked: boolean;
  kind: 'RAID' | 'STANDARD';
  stars: number | null;
  teraType: string | null;
  notes: string | null;
  species: Named;
  formId: number;
  formSlug: string;
  isDefaultForm: boolean;
  spriteUrl: string | null;
  /** Its own types, whatever its Tera type is. */
  types: string[];
  ability: AbilityInfo | null;
  /** Moves the player has seen it use; the counters' resistance is judged against these. */
  moves: (Named & { type: string })[];
  /** Types that do something other than normal damage to it, most damaging first. */
  weaknesses: { type: string; multiplier: number }[];
  /** The strongest moves of each type it is weak to that Pokémon of this game can learn. */
  strongMoves: { type: string; multiplier: number; moves: MoveView[] }[];
  roster: CounterView[];
  suggestions: CounterView[];
};

type IndexedForm = Candidate & {
  nameEn: string;
  nameEs: string;
  spriteUrl: string | null;
  /** How it gets each move it can learn. */
  learn: Map<number, LearnWay>;
};

type GameIndex = {
  /** Fully evolved, non-legendary forms of the game, with every damaging move they can learn. */
  forms: IndexedForm[];
  moves: Map<number, MoveView & { slug: string; accuracy: number | null }>;
  /** Names of the abilities worth trying, by slug. */
  abilities: Map<string, Named>;
};

/** Moves that cost the user too much (faint, half its HP...) to be recommended as a plain attack. */
const COSTLY_MOVES = new Set([
  'explosion',
  'self-destruct',
  'misty-explosion',
  'final-gambit',
  'steel-beam',
  'mind-blown',
  'chloroform',
  'belly-drum',
  'dream-eater',
  'focus-punch',
  'last-resort',
  'fake-out',
  'first-impression',
  'upper-hand',
  // Recharge turn after the hit.
  'hyper-beam',
  'giga-impact',
  'blast-burn',
  'hydro-cannon',
  'frenzy-plant',
  'roar-of-time',
  'rock-wrecker',
  'prismatic-laser',
  'eternabeam',
  'meteor-assault',
  // Power falls with the user's HP, so the listed power is the best case.
  'eruption',
  'water-spout',
  'dragon-energy',
]);

const globalForBattle = globalThis as unknown as { battleIndex?: Map<string, Promise<GameIndex>> };
const indexes = (globalForBattle.battleIndex ??= new Map());

/** Game data does not change while the app runs (only the sync script writes it), so it is kept. */
function gameIndex(game: GameConfig): Promise<GameIndex> {
  let p = indexes.get(game.id);
  if (!p) {
    p = buildIndex(game);
    indexes.set(game.id, p);
    p.catch(() => indexes.delete(game.id));
  }
  return p;
}

async function loadMoves(): Promise<GameIndex['moves']> {
  const rows = await prisma.move.findMany({
    where: { damageClass: { not: 'status' }, power: { gt: 0 } },
    select: { id: true, slug: true, nameEn: true, nameEs: true, type: true, power: true, damageClass: true, accuracy: true },
  });
  return new Map(rows.filter((m) => !COSTLY_MOVES.has(m.slug)).map((m) => [m.id, m]));
}

/** Easiest first: levelling up (lowest level), evolving, a TM, a tutor, then breeding for it. */
const LEARN_ORDER: LearnWay['method'][] = ['level', 'evolve', 'tm', 'tutor', 'egg'];
function learnWay(method: string, level: number): LearnWay | null {
  if (method === 'level-up') return level === 0 ? { method: 'evolve' } : { method: 'level', level };
  if (method === 'machine') return { method: 'tm' };
  if (method === 'tutor') return { method: 'tutor' };
  if (method === 'egg') return { method: 'egg' };
  return null;
}
const easier = (a: LearnWay, b: LearnWay) =>
  LEARN_ORDER.indexOf(a.method) - LEARN_ORDER.indexOf(b.method) || (a.level ?? 0) - (b.level ?? 0);

async function learnable(game: GameConfig, formIds: number[]) {
  const rows = await prisma.$queryRaw<{ form_id: number; move_id: number; method: string; level: number }[]>`
    SELECT DISTINCT form_id, move_id, method, level FROM learnsets
    WHERE version_group = ANY(${game.learnsetVersionGroups}) AND form_id = ANY(${formIds})`;
  const byForm = new Map<number, Map<number, LearnWay>>();
  for (const r of rows) {
    const way = learnWay(r.method, r.level);
    if (!way) continue;
    const forForm = byForm.get(r.form_id) ?? new Map<number, LearnWay>();
    const prev = forForm.get(r.move_id);
    if (!prev || easier(way, prev) < 0) forForm.set(r.move_id, way);
    byForm.set(r.form_id, forForm);
  }
  return byForm;
}

function toMoves(
  ids: number[],
  moves: GameIndex['moves'],
  known: Set<number>,
  teraType?: string | null
): CandidateMove[] {
  const out: CandidateMove[] = [];
  for (const id of new Set([...ids, ...known])) {
    const m = moves.get(id);
    if (!m || m.power == null) continue;
    out.push({
      id,
      // Tera Blast takes the Tera type of a Terastallized user.
      type: m.slug === 'tera-blast' && teraType && teraType !== 'stellar' ? teraType : m.type,
      damageClass: m.damageClass === 'physical' ? 'physical' : 'special',
      power: m.power,
      accuracy: m.accuracy,
      known: known.has(id),
    });
  }
  return out;
}

async function buildIndex(game: GameConfig): Promise<GameIndex> {
  const moves = await loadMoves();
  const forms = await prisma.form.findMany({
    where: {
      species: {
        isBaby: false,
        isSpecial: false,
        evolvesTo: { none: {} },
        pokedexSlots: { some: { pokedex: gameDexes(game.id) } },
      },
      learnsets: { some: { versionGroup: { in: game.learnsetVersionGroups } } },
    },
    select: {
      id: true,
      speciesId: true,
      types: true,
      baseStats: true,
      spriteUrl: true,
      abilities: { select: { ability: { select: { id: true, slug: true, nameEn: true, nameEs: true } } } },
      species: { select: { nameEn: true, nameEs: true } },
    },
  });
  const byForm = await learnable(game, forms.map((f) => f.id));
  const abilities = new Map(
    forms.flatMap((f) => f.abilities.map((a) => a.ability)).filter((a) => abilityMatters(a.slug)).map((a) => [a.slug, a])
  );
  return {
    moves,
    abilities,
    forms: forms.map((f) => ({
      formId: f.id,
      speciesId: f.speciesId,
      types: f.types,
      stats: f.baseStats as BaseStats,
      spriteUrl: f.spriteUrl,
      nameEn: f.species.nameEn,
      nameEs: f.species.nameEs,
      // Only the abilities that change a matchup are worth trying.
      abilityOptions: f.abilities.map((a) => a.ability.slug).filter(abilityMatters),
      learn: byForm.get(f.id) ?? new Map(),
      moves: toMoves([...(byForm.get(f.id)?.keys() ?? [])], moves, new Set()),
    })),
  };
}

let chartCache: Promise<TypeChart> | null = null;
export function loadChart() {
  chartCache ??= prisma.typeEffect
    .findMany()
    .then((rows) => {
      // Without it every matchup would read as neutral and every suggestion would be wrong.
      if (!rows.length) throw new Error('The type chart is empty: run `npm run sync:pokeapi -- --only-types`.');
      return chartFrom(rows);
    })
    .catch((e) => {
      chartCache = null;
      throw e;
    });
  return chartCache;
}

/**
 * Loads saved opponents with what to use against each, worked out from the current roster, so a
 * Pokémon added to the roster shows up as a counter without re-saving anything.
 */
export async function loadOpponents(game: GameConfig, profileId: string, ids?: string[]): Promise<BattleOpponentView[]> {
  const rows = await prisma.battleOpponent.findMany({
    where: { profileId, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  if (!rows.length) return [];

  // Your Pokémon's Tera type only counts in games that have Terastallizing.
  const tera = game.features.teraType;
  const [chart, index, roster, dex] = await Promise.all([
    loadChart(),
    gameIndex(game),
    prisma.rosterPokemon.findMany({
      // Only what you actually have: planned Pokémon are not in your box yet, and breeders are
      // there to breed, not to battle.
      where: { profileId, owned: true, roles: { some: { role: 'ROSTER' } } },
      select: {
        id: true,
        speciesId: true,
        formId: true,
        nickname: true,
        owned: true,
        abilityId: true,
        teraType: true,
        teraStatus: true,
        species: { select: { nameEn: true, nameEs: true } },
        // Only the moves it has actually learned (DONE), not the ones it is planned to learn.
        moves: { where: { status: 'DONE', moveId: { not: null } }, select: { moveId: true } },
      },
    }),
    prisma.pokedexEntry.findMany({ where: { profileId, owned: true }, select: { speciesId: true } }),
  ]);
  const ownedSpecies = new Set(dex.map((d) => d.speciesId));

  // Forms of the opponents and of the roster; the roster's default form when none is set.
  const speciesIds = [...new Set([...rows.map((r) => r.speciesId), ...roster.map((r) => r.speciesId)])];
  const forms = await prisma.form.findMany({
    where: {
      OR: [
        { id: { in: [...rows.flatMap((r) => (r.formId ? [r.formId] : [])), ...roster.flatMap((r) => (r.formId ? [r.formId] : []))] } },
        { speciesId: { in: speciesIds }, isDefault: true },
      ],
    },
    select: {
      id: true,
      speciesId: true,
      slug: true,
      isDefault: true,
      types: true,
      baseStats: true,
      spriteUrl: true,
      abilities: { select: { abilityId: true } },
      species: { select: { id: true, nameEn: true, nameEs: true } },
    },
  });
  const formById = new Map(forms.map((f) => [f.id, f]));
  const defaultForm = new Map(forms.filter((f) => f.isDefault).map((f) => [f.speciesId, f]));
  const formOf = (speciesId: number, formId: number | null) =>
    (formId != null ? formById.get(formId) : undefined) ?? defaultForm.get(speciesId);

  const abilityIds = [
    ...new Set([...rows, ...roster].flatMap((r) => (r.abilityId ? [r.abilityId] : []))),
  ];
  const abilities = await prisma.ability.findMany({
    where: { id: { in: abilityIds } },
    select: { id: true, slug: true, nameEn: true, nameEs: true, descriptionEn: true, descriptionEs: true },
  });
  const abilityById = new Map(abilities.map((a) => [a.id, a]));
  // The rivals' own moves may be any move, status ones included, so they are read apart from the index.
  const rivalMoves = await prisma.move.findMany({
    where: { id: { in: [...new Set(rows.flatMap((r) => r.moveIds))] } },
    select: { id: true, nameEn: true, nameEs: true, type: true, damageClass: true },
  });
  const rivalMoveById = new Map(rivalMoves.map((m) => [m.id, m]));

  // Roster candidates: only the moves each has learned now (the player will not retrain them), with its ability.
  const rosterForms = roster.flatMap((r) => {
    const f = formOf(r.speciesId, r.formId);
    return f ? [{ r, f }] : [];
  });
  const rosterCandidates = rosterForms.map(({ r, f }, ref) => {
    // The Tera type it has now (marked done), not one it is meant to get.
    const teraType = tera && r.teraStatus === 'DONE' ? r.teraType : null;
    return {
      r,
      f,
      candidate: {
        ref,
        formId: f.id,
        speciesId: f.speciesId,
        types: f.types,
        stats: f.baseStats as BaseStats,
        ability: r.abilityId ? (abilityById.get(r.abilityId)?.slug ?? null) : null,
        teraType,
        moves: toMoves(
          [],
          index.moves,
          new Set(r.moves.flatMap((m) => (m.moveId != null ? [m.moveId] : []))),
          teraType
        ),
      } satisfies Candidate,
    };
  });

  const moveView = (id: number): MoveView => {
    const m = index.moves.get(id);
    return m
      ? { id, nameEn: m.nameEn, nameEs: m.nameEs, type: m.type, power: m.power, damageClass: m.damageClass }
      : { id, nameEn: `#${id}`, nameEs: `#${id}`, type: 'normal', power: null, damageClass: 'physical' };
  };
  // Moves a roster Pokémon knows might be outside the global move table when costly; keep it simple.
  const withMove = (c: Counter) => ({
    ...moveView(c.move.id),
    multiplier: c.move.multiplier,
    stab: c.move.stab,
    known: c.move.known,
  });

  type Frozen = Pick<BattleOpponentView, 'weaknesses' | 'strongMoves' | 'roster' | 'suggestions'>;
  const toFreeze: { id: string; frozen: Frozen }[] = [];
  const views = rows.map((o): BattleOpponentView => {
    const form = formOf(o.speciesId, o.formId);
    if (!form) throw new Error(`No form for species ${o.speciesId}`);
    const ability = o.abilityId ? (abilityById.get(o.abilityId) ?? null) : null;
    const known = o.moveIds.flatMap((id) => rivalMoveById.get(id) ?? []);
    // Status moves do no damage, so they say nothing about what a counter has to take.
    const damaging = known.filter((m) => m.damageClass !== 'status');
    const input: OpponentInput = {
      moveTypes: damaging.map((m) => m.type),
      types: form.types,
      teraType: o.teraType,
      stats: form.baseStats as BaseStats,
      ability: ability?.slug ?? null,
    };
    const table = weaknessTable(chart, input, BATTLE_TYPES);
    const weaknesses = Object.entries(table)
      .filter(([, m]) => m !== 1)
      .map(([type, multiplier]) => ({ type, multiplier }))
      .sort((a, b) => b.multiplier - a.multiplier);

    const strongMoves = weaknesses
      .filter((w) => w.multiplier > 1)
      .map((w) => ({
        type: w.type,
        multiplier: w.multiplier,
        moves: [...index.moves.values()]
          .filter((m) => m.type === w.type && (m.accuracy ?? 100) >= 80)
          .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
          .slice(0, 4)
          .map((m) => moveView(m.id)),
      }));

    const rankedRoster = rankCounters(
      chart,
      input,
      table,
      rosterCandidates.map((x) => x.candidate),
      8
    );
    const rosterView = (c: Counter): CounterView => {
      const entry = rosterCandidates[c.ref!];
      return {
        species: { id: entry.f.speciesId, nameEn: entry.f.species.nameEn, nameEs: entry.f.species.nameEs },
        formId: c.formId,
        spriteUrl: entry.f.spriteUrl,
        types: entry.f.types,
        source: 'roster',
        have: entry.r.owned,
        nickname: entry.r.nickname,
        move: withMove(c),
        alternatives: c.alternatives.map((a) => ({ ...moveView(a.id), ...a, id: a.id })),
        teraType: c.teraType,
        incoming: c.incoming,
        incomingBase: c.incomingBase,
        faster: c.faster,
        rosterId: entry.r.id,
        best: entry.r.id === o.bestRosterId,
      };
    };
    // The one marked as best stays first (and in the list) however the ranking changes.
    const bestEntry = o.bestRosterId ? rosterCandidates.find((x) => x.r.id === o.bestRosterId) : undefined;
    const [bestCounter] = bestEntry ? rankCounters(chart, input, table, [bestEntry.candidate], 1) : [];
    const rosterViews: CounterView[] = [
      ...(bestCounter ? [rosterView(bestCounter)] : []),
      ...rankedRoster.filter((c) => !bestCounter || c.speciesId !== bestCounter.speciesId).map(rosterView),
    ].slice(0, 8);

    const inRoster = new Set(rosterViews.map((r) => r.species.id));
    const formByIndexId = new Map(index.forms.map((f) => [f.formId, f]));
    // Suggestions are spread over move types (at most three of each) so they are not all one kind.
    const perType = new Map<string, number>();
    // Each one is tried with every Tera type and shown with the one that does best.
    const rankedGame = rankCounters(chart, input, table, index.forms, 80, tera ? BATTLE_TYPES : undefined)
      .filter((c) => !inRoster.has(c.speciesId))
      .filter((c) => {
        const type = index.moves.get(c.move.id)?.type ?? '';
        const n = perType.get(type) ?? 0;
        perType.set(type, n + 1);
        return n < 3;
      })
      .slice(0, 8);
    const suggestions: CounterView[] = rankedGame.map((c) => {
      const f = formByIndexId.get(c.formId)!;
      return {
        species: { id: f.speciesId, nameEn: f.nameEn, nameEs: f.nameEs },
        formId: c.formId,
        spriteUrl: f.spriteUrl,
        types: f.types,
        source: 'game',
        have: ownedSpecies.has(f.speciesId),
        nickname: null,
        move: { ...withMove(c), learn: f.learn.get(c.move.id) ?? null },
        alternatives: c.alternatives.map((a) => ({ ...moveView(a.id), ...a, id: a.id, learn: f.learn.get(a.id) ?? null })),
        ability: c.ability ? (index.abilities.get(c.ability) ?? null) : null,
        teraType: c.teraType,
        incoming: c.incoming,
        incomingBase: c.incomingBase,
        faster: c.faster,
        rosterId: null,
        best: false,
      };
    });

    const saved = o.defeatedAt != null ? (o.frozen as Frozen | null) : null;
    const live: Frozen = saved ?? { weaknesses, strongMoves, roster: rosterViews, suggestions };
    // Defeated before locking existed: locked the first time it is loaded.
    if (o.defeatedAt != null && !saved) toFreeze.push({ id: o.id, frozen: live });

    return {
      id: o.id,
      label: o.label,
      archived: o.archivedAt != null,
      defeated: o.defeatedAt != null,
      locked: o.defeatedAt != null,
      kind: o.kind,
      stars: o.stars,
      teraType: o.teraType,
      notes: o.notes,
      species: { id: form.species.id, nameEn: form.species.nameEn, nameEs: form.species.nameEs },
      formId: form.id,
      formSlug: form.slug,
      isDefaultForm: form.isDefault,
      spriteUrl: form.spriteUrl,
      types: form.types,
      ability: ability
        ? {
            id: ability.id,
            nameEn: ability.nameEn,
            nameEs: ability.nameEs,
            descriptionEn: ability.descriptionEn,
            descriptionEs: ability.descriptionEs,
          }
        : null,
      moves: known.map((m) => ({ id: m.id, nameEn: m.nameEn, nameEs: m.nameEs, type: m.type })),
      weaknesses: live.weaknesses,
      strongMoves: live.strongMoves,
      roster: live.roster,
      suggestions: live.suggestions,
    };
  });
  await Promise.all(
    toFreeze.map((f) =>
      prisma.battleOpponent.update({ where: { id: f.id }, data: { frozen: f.frozen as unknown as Prisma.InputJsonValue } })
    )
  );
  return views;
}
