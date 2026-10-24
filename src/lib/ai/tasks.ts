import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { prisma } from '../db';
import { getGame, type GameConfig } from '../games';
import { findLocations, saveLocation } from '../locations';
import type { StoredLocation } from '../location-text';
import { learnableMoves } from '../breeding/moves';
import { evGap, evTotal, formatEvs, type EvSpread } from '../import/evs';
import { auditAsk, gameHasMints } from '../audit-ask';
import { withFixedMoves } from '../audit-locks';
import { keepLegalMoves, resolveName } from '../audit-names';
import { eggMoveHint, type Teacher } from '../egg-hint';
import { STAT_NAMES, loadEvSources } from '../ev-catalog';
import { describePlan, legalPlan, shapePlan, trainingItemsFor } from '../ev-plan';
import { syncEvStatus } from '../ev-sync';
import type { Lang } from '../i18n';
import { ivRating } from '../iv-ratings';
import type { RosterView } from '../roster';
import { type AuditAsk, type BuildAuditRaw, BilingualLocationSchema, type LocationResult, buildAuditSchema } from './schema';
import { localizeNames } from './names';
import { mintInForce, settleMint } from '../mint';
import { AiError, type AiProvider, type ModelTier } from './types';
import { RULES_VERSION, ruleAudit, type RuleInput, type RuleMove, type RuleNature } from '../audit-rules';
import { MAX_EV_TOTAL, estimateEvRange } from '../ev-estimate';
import { getGameLanguage } from '../game-language';
import type { GameLanguage } from '../name-variants';
import { spanishRules } from './spanish';
import { ivAssumption, potentialLevel } from '../potential';
import { loadChart } from '../battle/load';
import type { LearnableMoves } from '../breeding/moves';

const PROMPT_VERSION = 27;

/** `both` is for an answer stored in the shared dictionary, which carries an English and a Spanish version (Spain's). */
const system = (game: GameConfig, lang: Lang | 'both', names: GameLanguage = 'es') =>
  [
    `You are a competitive Pokémon coach helping one player with ${game.name}.`,
    `Only recommend Pokémon, moves, items and mechanics that exist in ${game.name}, including its DLC.`,
    'Be specific and practical. If you are not sure where something is found, say so rather than guessing.',
    'Prefer advice the player can act on without starting over: say what is easy, and never suggest a move the Pokémon cannot learn in this game.',
    lang === 'es'
      ? spanishRules(names)
      : lang === 'both'
        ? `Fill in two versions of every text field. The "en" object is written in English. The "es" object is written like this: ${spanishRules('es')}`
        : 'Write every text field in English.',
  ].join(' ');

/** Stored with each dictionary entry, to tell which prompt found it. Changing the prompt does not discard saved entries. */
const LOCATION_PROMPT_VERSION = 13;

/** The version of the prompt whose answers sat in the per-user cache before the shared dictionary. */
const LEGACY_LOCATION_VERSION = 12;

const hashOf = (model: string, input: unknown, version = PROMPT_VERSION) =>
  createHash('sha256').update(JSON.stringify({ v: version, model, input })).digest('hex');

/**
 * The key the per-user cache (ai_audits) saved a location answer under, in one language. Only the script
 * that moves those answers into the shared dictionary needs it.
 */
export const legacyLocationHash = (model: string, gameId: string, pokemon: string, lang: Lang) =>
  hashOf(model, { game: gameId, pokemon, lang }, LEGACY_LOCATION_VERSION);

/** Who answers an audit: a model, or the rules (which never call `generate`). */
type AuditSource = Pick<AiProvider, 'modelFor' | 'generate'> & { name: string };

/**
 * Runs an AI task through the AiAudit cache: the same question (same kind,
 * provider and input) is answered from the database and never paid for twice.
 */
async function cached<Raw, T = Raw>(
  provider: AuditSource,
  key: { kind: string; profileId: string; rosterPokemonId?: string; refresh?: boolean; lang: Lang; version?: number },
  input: unknown,
  request: {
    system: string;
    prompt: string;
    schema: z.ZodType<Raw>;
    schemaName: string;
    webSearch: boolean;
    tier: ModelTier;
    /** When everything asked for is already decided, the answer to use without calling the model. */
    local?: Raw;
    /** Turns the model's answer into what is stored and shown, before it is saved. */
    finish?: (raw: Raw) => T | Promise<T>;
  }
): Promise<T> {
  const model = provider.modelFor(request.tier);
  const inputHash = hashOf(model, input, key.version);
  // Per profile: a copy of a profile (the demo's) keeps its own rows rather than sharing the original's.
  const where = { profileId_kind_provider_inputHash: { profileId: key.profileId, kind: key.kind, provider: provider.name, inputHash } };

  if (!key.refresh) {
    const hit = await prisma.aiAudit.findUnique({ where });
    if (hit) {
      // Reusing a saved answer makes it the one the card shows, with no new request.
      await prisma.aiAudit.update({ where: { id: hit.id }, data: { createdAt: new Date() } });
      return hit.result as T;
    }
  }
  const { finish, local, ...ask } = request;
  const raw = local ?? (await provider.generate(ask));
  const result = finish ? await finish(raw) : (raw as unknown as T);
  const data = {
    profileId: key.profileId,
    rosterPokemonId: key.rosterPokemonId,
    model,
    lang: key.lang,
    result: result as object,
    createdAt: new Date(),
  };
  await prisma.aiAudit.upsert({
    where,
    update: data,
    create: { ...data, kind: key.kind, provider: provider.name, inputHash },
  });
  return result;
}

/** The Judge's word for each stat's IV, with the IV it stands for. Only the stats that were judged. */
function describeIvRatings(p: RosterView): Record<string, string> | null {
  const names = { hp: 'HP', attack: 'Attack', defense: 'Defense', specialAttack: 'Sp. Atk', specialDefense: 'Sp. Def', speed: 'Speed' } as const;
  const out: Record<string, string> = {};
  for (const [key, label] of Object.entries(names)) {
    const r = ivRating(p.ivRatings?.[key as keyof typeof names]);
    if (r) out[label] = `${r.label} (IV ${r.low === r.high ? r.low : `${r.low}-${r.high}`})`;
  }
  return Object.keys(out).length ? out : null;
}

/** PokéAPI's stat slugs ("special-attack") as the stat names the prompt uses. */
const SLUG_NAMES: Record<string, string> = {
  attack: STAT_NAMES.attack,
  defense: STAT_NAMES.defense,
  'special-attack': STAT_NAMES.specialAttack,
  'special-defense': STAT_NAMES.specialDefense,
  speed: STAT_NAMES.speed,
};

/** "Adamant (+Attack, -Sp. Atk)", or "Hardy (neutral: raises and lowers nothing)". */
function natureEffect(name: string, natures: RuleNature[]): string {
  const n = natures.find((x) => x.nameEn.toLowerCase() === name.toLowerCase());
  if (!n) return name;
  return n.increased && n.decreased
    ? `${n.nameEn} (+${SLUG_NAMES[n.increased]}, -${SLUG_NAMES[n.decreased]})`
    : `${n.nameEn} (neutral: raises and lowers nothing)`;
}

/**
 * Its nature and Mint, said plainly: the nature it has, whether a Mint was given (one only chosen does
 * nothing yet), and the effect the game applies because of that. Models mixed these up when they were
 * three loose names.
 */
function describeNature(p: RosterView, natures: RuleNature[], planned: string | null) {
  const given = mintInForce(p);
  const chosen = !given && p.mintNature ? p.mintNature : null;
  const applied = given ?? p.currentNature ?? p.targetNature;
  const changes = planned != null && planned.toLowerCase() !== applied?.nameEn.toLowerCase();
  return {
    itsNature: p.currentNature ? natureEffect(p.currentNature.nameEn, natures) : null,
    // Not caught or not recorded yet: the nature the player is aiming for stands in for it.
    ...(p.currentNature ? {} : { natureAimedFor: p.targetNature ? natureEffect(p.targetNature.nameEn, natures) : null }),
    mint: given
      ? `${given.nameEn} Mint, already given`
      : chosen
        ? `none given (a ${chosen.nameEn} Mint is chosen but not given yet, so it changes nothing)`
        : 'none',
    effectTheGameApplies: applied ? natureEffect(applied.nameEn, natures) : null,
    // A Mint chosen or fixed but not given yet: the stats will change to this, so the build is for it.
    ...(changes ? { effectItWillHave: `${natureEffect(planned, natures)}, once that Mint is given` } : {}),
  };
}

/**
 * The nature whose effect the build is for: the Mint the player fixed in the audit, else the one chosen in
 * its Mint field (given or not, it is the plan), else the nature it has (or is aiming for).
 */
const plannedNature = (
  p: Pick<RosterView, 'mintNature' | 'currentNature' | 'targetNature'>,
  mintLock: { nature: string } | undefined
): string | null => mintLock?.nature ?? p.mintNature?.nameEn ?? (p.currentNature ?? p.targetNature)?.nameEn ?? null;

/**
 * The EVs it has, as the team view reads them: from its stats, with this plan in mind. The stats only say a
 * range of EVs, and where the plan's amount is inside it, it is taken as the amount. The EVs on record were
 * read with the plan saved at the time (none, before one is fixed), so they can be short of a plan the audit
 * proposes although the stats already show it. EVs typed in, not read from stats, are taken as they are.
 */
function evsForPlan(p: RosterView, plan: EvSpread, natures: RuleNature[]): EvSpread | null {
  if (!p.currentStats || !p.baseStats || !p.currentEvsEstimated) return p.currentEvs;
  // The nature effect the stats were read under, as when they were saved.
  const read = p.statsNature ?? mintInForce(p) ?? p.currentNature ?? p.targetNature;
  const nature = read ? (natures.find((n) => n.nameEn === read.nameEn) ?? null) : null;
  return estimateEvRange({
    stats: p.currentStats,
    level: p.level,
    baseStats: p.baseStats,
    nature,
    ivsLow: ivAssumption(p.potential).low,
    ratings: p.ivRatings,
    plan,
    maxed: p.maxedEvs,
  }).estimate;
}

/** All six values with their stat names, so a stat can never be read as an EV or the other way round. */
const statLine = (v: Record<keyof typeof STAT_NAMES, number>) =>
  Object.fromEntries(Object.entries(STAT_NAMES).map(([k, name]) => [name, v[k as keyof typeof STAT_NAMES]]));

/** A compact, language-neutral description of a Pokémon as it is now, used both as prompt and cache key. */
function describeBuild(p: RosterView, natures: RuleNature[], planned: string | null, hasEvs = true) {
  const gap = hasEvs && p.evs && p.currentEvs ? evGap(p.evs, p.currentEvs) : null;
  // A Pokémon that has yet to evolve is judged as the stage it is meant to end as: that is what the EVs,
  // moves and item are for. Its stats, ability and level are still those of the stage it is at now.
  const final = p.finalSpecies;
  return {
    pokemon: final?.nameEn ?? p.species.nameEn,
    types: final?.types ?? p.types,
    baseStats: final?.baseStats ?? p.baseStats,
    ...(final
      ? {
          // Said plainly so the model does not read the numbers below as the final stage's.
          currentStage: p.species.nameEn,
          currentStageBaseStats: p.baseStats,
          abilitiesAtFinalStage: final.abilityOptions.map((a) => `${a.nameEn}${a.isHidden ? ' (hidden)' : ''}`),
        }
      : {}),
    level: p.level,
    // The stats it actually has right now, as the game shows them. These are NOT EVs.
    currentStats: p.currentStats ? statLine(p.currentStats) : null,
    natureAndMint: describeNature(p, natures, planned),
    ability: p.ability?.nameEn ?? null,
    heldItem: p.item?.nameEn ?? p.itemNote,
    ...(hasEvs
      ? {
          // EVs per stat, all six listed. Not the same thing as the stats above.
          currentEvs: p.currentEvs ? statLine(p.currentEvs) : null,
          maxEvsPerStat: 252,
          maxEvsTotal: MAX_EV_TOTAL,
          currentEvsTotal: p.currentEvs ? evTotal(p.currentEvs) : null,
          evsLeftToTrain: p.currentEvs ? Math.max(0, MAX_EV_TOTAL - evTotal(p.currentEvs)) : null,
          // Worked out from the stats and IV ratings, so they may be a little low.
          currentEvsAreEstimated: p.currentEvs ? p.currentEvsEstimated : null,
          // What the game shows: sparkles on a stat mean it has the full 252. Once looked at, the rest are not full.
          statsWithFullEvsInGame: p.maxedEvs ? p.maxedEvs.map((k) => STAT_NAMES[k]) : null,
          // The spread the player is training towards, when there is one. The plan is then fixed.
          ...(p.evs
            ? {
                targetEvs: statLine(p.evs),
                evsStillMissing: gap && evTotal(gap) > 0 ? formatEvs(gap) : null,
              }
            : {}),
        }
      : {}),
    teraType: p.teraType,
    // What the in-game Judge said about its IVs, when the player has had it judged.
    judgePotential: potentialLevel(p.potential)?.label ?? null,
    ivRatings: describeIvRatings(p),
    moves: p.moves.map((m) => ({ name: m.move?.nameEn ?? m.rawName, known: m.status === 'DONE' })),
  };
}

/**
 * Egg moves it can really get in this game, and how. A move it learns only by breeding is possible only when
 * some Pokémon that knows it without breeding is in the game (or one of the player's does): that one can pass it
 * on, in a nursery or at a picnic with a Mirror Herb. An egg move nobody can teach (Heal Bell on a Blissey, which
 * only Chimecho knows, and not in its egg group) is not in the pool, so it is never suggested. The hint of each
 * move it does not have says who can teach it.
 */
export async function reachableEggMoves(
  game: GameConfig,
  lang: Lang,
  p: RosterView,
  profileId: string,
  pool: LearnableMoves
): Promise<{ pool: LearnableMoves; hints: Map<string, string> }> {
  const ids = pool.egg.map((m) => m.id);
  if (!ids.length) return { pool, hints: new Map() };
  const dexes = game.pokedexes.map((d) => d.slug);
  const [learners, owned, herb] = await Promise.all([
    prisma.learnset.findMany({
      where: { moveId: { in: ids }, versionGroup: { in: game.learnsetVersionGroups }, method: { not: 'egg' } },
      select: { moveId: true, form: { select: { speciesId: true } } },
      distinct: ['moveId', 'formId'],
    }),
    // Its own moves count as they are (a planned one too); another Pokémon teaches only what it has learned.
    prisma.rosterMove.findMany({
      where: { moveId: { in: ids }, rosterPokemon: { profileId }, OR: [{ rosterPokemonId: p.id }, { status: 'DONE' }] },
      select: { moveId: true, rosterPokemonId: true, rosterPokemon: { select: { speciesId: true } } },
    }),
    prisma.item.findUnique({ where: { slug: 'mirror-herb' }, select: { nameEn: true, nameEs: true } }),
  ]);
  const speciesIds = [...new Set([...learners.map((l) => l.form.speciesId), ...owned.map((o) => o.rosterPokemon.speciesId)])];
  const [species, slots] = await Promise.all([
    prisma.species.findMany({ where: { id: { in: speciesIds } }, select: { id: true, nameEn: true, nameEs: true, eggGroups: true } }),
    prisma.pokedexSlot.findMany({
      where: { speciesId: { in: speciesIds }, pokedex: { slug: { in: dexes } } },
      select: { speciesId: true, pokedex: { select: { slug: true } } },
    }),
  ]);
  const byId = new Map(species.map((s) => [s.id, s]));
  const inGame = new Map<number, string[]>();
  for (const s of slots) inGame.set(s.speciesId, [...(inGame.get(s.speciesId) ?? []), s.pokedex.slug]);

  const teacher = (id: number, isOwned: boolean): Teacher | null => {
    const s = byId.get(id);
    const found = inGame.get(id);
    if (!s || (!found && !isOwned)) return null;
    const home = game.pokedexes.find((d) => found?.includes(d.slug));
    return {
      nameEn: s.nameEn,
      nameEs: s.nameEs,
      owned: isOwned,
      breeds: !s.eggGroups.includes('no-eggs'),
      inBaseGame: found?.includes(game.pokedexes[0].slug) ?? false,
      where: home && home !== game.pokedexes[0] ? home.note[lang === 'en' ? 'en' : 'es'] : null,
    };
  };
  const knownNow = new Set(p.moves.flatMap((m) => (m.move ? [m.move.nameEn] : [])));
  const hints = new Map<string, string>();
  const egg = pool.egg.filter((m) => {
    if (knownNow.has(m.nameEn)) return true;
    // One entry for each species; the player's own replaces the game's when they are the same species.
    const teachers = new Map<number, Teacher>();
    const add = (id: number, isOwned: boolean) => {
      const t = teacher(id, isOwned);
      if (t) teachers.set(id, t);
    };
    for (const l of learners) if (l.moveId === m.id) add(l.form.speciesId, false);
    for (const o of owned) if (o.moveId === m.id && o.rosterPokemonId !== p.id) add(o.rosterPokemon.speciesId, true);
    const list = [...teachers.values()];
    if (!list.length) return false;
    hints.set(
      m.nameEn,
      eggMoveHint(lang, lang === 'en' ? (herb?.nameEn ?? 'Mirror Herb') : (herb?.nameEs ?? 'Hierba Copia'), list)
    );
    return true;
  });
  return { pool: { ...pool, egg }, hints };
}

/** What the rules need to know about the audit being made, once it has been worked out what to ask. */
type RulesContext = {
  pool: LearnableMoves;
  ask: AuditAsk;
  fixedMoves: string[];
  freeEvs: boolean;
  /** The nature whose effect the build is for (see `plannedNature`). */
  planned: string | null;
  natures: RuleNature[];
};

/**
 * What the rules need to work out an audit of this Pokémon, from game data alone (the quick audit, and what
 * fills the moves a model got wrong). Nothing when there is too little data on the Pokémon.
 */
async function ruleInputFor(
  game: GameConfig,
  lang: Lang,
  p: RosterView,
  ctx: Pick<RulesContext, 'pool' | 'ask' | 'fixedMoves' | 'freeEvs' | 'planned' | 'natures'>
): Promise<RuleInput | null> {
  const final = p.finalSpecies;
  const baseStats = final?.baseStats ?? p.baseStats;
  if (!baseStats) return null;
  const [itemRows, chart] = await Promise.all([
    game.features.heldItems ? prisma.item.findMany({ where: { slug: { in: RULE_ITEMS } }, select: { slug: true, nameEn: true } }) : [],
    loadChart(),
  ]);
  const known = new Set(p.moves.map((m) => m.move?.nameEn));
  const moves: RuleMove[] = [...ctx.pool.egg, ...ctx.pool.other].map((m) => ({
    slug: m.slug,
    nameEn: m.nameEn,
    type: m.type,
    damageClass: m.damageClass,
    power: m.power,
    accuracy: m.accuracy,
    known: known.has(m.nameEn),
  }));
  const items = Object.fromEntries(itemRows.map((i) => [i.slug, i.nameEn]));
  const effect = mintInForce(p) ?? p.currentNature ?? p.targetNature;
  return {
    lang,
    types: final?.types ?? p.types,
    baseStats,
    moves,
    natures: ctx.natures,
    effectNature: ctx.natures.find((n) => n.nameEn === effect?.nameEn) ?? null,
    plannedNature: ctx.natures.find((n) => n.nameEn === ctx.planned) ?? null,
    fixedMoves: ctx.fixedMoves,
    currentEvs: p.currentEvs,
    freeEvs: ctx.freeEvs,
    items,
    chart,
    ask: ctx.ask,
    currentItemSlug: Object.entries(items).find(([, name]) => name === p.item?.nameEn)?.[0] ?? null,
  };
}

/**
 * The moves a model suggested, as the game's own. Each is matched to a move this Pokémon can learn here, in
 * English or Spanish: the app finds a move by its name, and a model writes it as it likes. A move it cannot
 * learn is dropped (the model was told to choose only from the pool), and the free slot is filled by the rules,
 * so every provider gives the player a set they can apply.
 */
async function legalMoveSuggestions(
  picks: { move: string; reason: string }[],
  fixed: string[],
  game: GameConfig,
  lang: Lang,
  p: RosterView,
  ctx: Pick<RulesContext, 'pool' | 'freeEvs' | 'planned' | 'natures'>
): Promise<{ move: string; reason: string }[]> {
  const kept = keepLegalMoves(picks, fixed, [...ctx.pool.egg, ...ctx.pool.other]);
  if (fixed.length + kept.length >= 4) return kept;
  const none = { evPlan: false, heldItem: false, moves: true, tera: false, nature: false, mint: false };
  const input = await ruleInputFor(game, lang, p, { ...ctx, ask: none, fixedMoves: [...fixed, ...kept.map((k) => k.move)] });
  return [...kept, ...(input ? (ruleAudit(input).recommendedMoves ?? []) : [])];
}

export async function auditBuild(
  provider: AuditSource,
  game: GameConfig,
  lang: Lang,
  profileId: string,
  p: RosterView,
  refresh: boolean,
  deep = false,
  /** Answers from game data instead of asking a model (see `quickAudit`). */
  rules?: (ctx: RulesContext) => Promise<Partial<BuildAuditRaw>>
) {
  const hasEvs = game.features.evs;
  // The Spanish its sentences are written in: the player's game language, the one that names things on screen.
  const names = await getGameLanguage();
  // Where EVs are easy to reset, a target spread makes sense; elsewhere work from what it has.
  const hasTarget = hasEvs && game.features.evTarget;
  // Every nature with what it raises and lowers, so the model reads effects from data rather than memory.
  const natures: RuleNature[] = await prisma.nature.findMany({
    select: { nameEn: true, nameEs: true, increased: true, decreased: true },
  });
  const locks = p.auditLocks;
  const hasTera = game.features.teraType;
  const hasMint = gameHasMints(game);
  // What the player has fixed is not asked again, by any kind of audit: it is kept, and the rest is worked out.
  const { ask, mintLock, planFixed, nothingToAsk } = auditAsk(p, { hasEvs, hasTera, hasMint });
  const planned = hasMint ? plannedNature(p, mintLock) : (p.currentNature ?? p.targetNature)?.nameEn ?? null;
  const build = describeBuild(p, natures, planned, hasEvs);
  const illegal = p.moves.filter((m) => m.legal === false).map((m) => m.move!.nameEn);

  // Everything it can legally have in this game, so suggestions come from real options.
  const { pool, hints: eggHints } = await reachableEggMoves(
    game,
    lang,
    p,
    profileId,
    await learnableMoves(game, p.finalSpecies?.id ?? p.species.id)
  );
  // Each move with its type, category and power, so advice about which stat it uses comes from data.
  const describeMove = (m: { nameEn: string; type: string; damageClass: string; power: number | null }) =>
    `${m.nameEn} (${m.type}, ${m.damageClass}${m.power ? `, power ${m.power}` : ''})`;
  const legalMovePool = {
    eggMoves: pool.egg.map(describeMove),
    learnedNormally: pool.other.map(describeMove),
  };
  const details = new Map([...pool.egg, ...pool.other].map((m) => [m.nameEn, describeMove(m)]));
  build.moves = build.moves.map((m) => ({ ...m, name: details.get(m.name ?? '') ?? m.name }));

  /** What is fixed, said once so the model chooses the rest to go with it. */
  const fixedNotes = [
    planFixed ? 'EV plan (fixed): targetEvs is the spread it finishes with. Choose the rest for those EVs.' : '',
    locks?.heldItem ? `Held item (fixed): ${locks.heldItem.item}.` : '',
    (locks?.moves?.length ?? 0) >= 4 ? `Moves (fixed): ${locks!.moves!.map((m) => m.move).join(', ')}.` : '',
    hasTera && locks?.teraType ? `Tera type (fixed): ${locks.teraType.type}.` : '',
    mintLock ? `Mint (fixed): ${mintLock.nature}. Choose the rest for its effect.` : '',
  ].filter(Boolean);

  // With every part fixed there is nothing to ask: the audit is the fixed parts, and it is saved as such rather
  // than as something the model wrote.
  const source = rules || !nothingToAsk ? provider : FIXED_SOURCE;
  return cached(
    source,
    { kind: 'build', profileId, rosterPokemonId: p.id, refresh, lang },
    // Rules and fixed parts are deterministic and cheap, so each Pokémon keeps its own: the answer is not shared by identical builds.
    {
      build,
      illegal,
      legalMovePool,
      lang,
      locks: p.auditLocks,
      // Spain keeps the answers it has; Latin America gets its own, as the names in the sentences differ.
      ...(lang === 'es' && names === 'es-419' ? { names } : {}),
      ...(rules || nothingToAsk ? { pokemonId: p.id } : {}),
    },
    {
      system: system(game, lang, names),
      schema: buildAuditSchema(ask, hasEvs),
      finish: async (raw) => {
        const locks = p.auditLocks;
        // The Mint as the card shows it, fixed or not: kept only when the effect in force is already the one named,
        // so a fixed change stays a change until that Mint is given.
        const settledMint = (m: { nature: string; reason: string } | undefined) =>
          m ? settleMint(m, (mintInForce(p) ?? p.currentNature ?? p.targetNature)?.nameEn, natures) : undefined;
        // The model writes names as it likes (Spanish, a near miss): the app needs the game's English ones.
        const fixedMoves = locks?.moves?.map((m) => m.move) ?? [];
        const suggestedMoves = ask.moves
          ? await legalMoveSuggestions(raw.recommendedMoves ?? [], fixedMoves, game, lang, p, { pool, freeEvs: hasTarget, planned, natures })
          : [];
        const itemNamed = ask.heldItem && raw.heldItem
          ? resolveName(raw.heldItem.item, await prisma.item.findMany({ select: { nameEn: true, nameEs: true } }))
          : undefined;
        const natureNamed = raw.nature ? resolveName(raw.nature.nature, natures) : undefined;
        // What the player fixed is kept as it is; the model only filled the rest.
        const parts = {
          heldItem: locks?.heldItem ?? (raw.heldItem && itemNamed ? { ...raw.heldItem, item: itemNamed.nameEn } : raw.heldItem),
          recommendedMoves: withFixedMoves(locks?.moves, suggestedMoves).map((m) => {
            const how = eggHints.get(m.move);
            return how ? { ...m, how } : m;
          }),
          ...(hasTera ? { teraType: locks?.teraType ?? raw.teraType } : {}),
          ...(hasMint ? { mint: settledMint(mintLock ?? raw.mint) } : {}),
          ...(raw.nature ? { nature: natureNamed ? { ...raw.nature, nature: natureNamed.nameEn } : raw.nature } : {}),
        };
        // In Spanish, game names the model left in English inside its sentences are put in the game's own Spanish.
        const say = (text: string) => localizeNames(text, lang);
        parts.heldItem = parts.heldItem ? { ...parts.heldItem, reason: await say(parts.heldItem.reason) } : parts.heldItem;
        parts.recommendedMoves = await Promise.all(parts.recommendedMoves.map(async (m) => ({ ...m, reason: await say(m.reason) })));
        if ('teraType' in parts && parts.teraType) parts.teraType = { ...parts.teraType, reason: await say(parts.teraType.reason) };
        if ('mint' in parts && parts.mint) parts.mint = { ...parts.mint, reason: await say(parts.mint.reason) };
        if ('nature' in parts && parts.nature) parts.nature = { ...parts.nature, reason: await say(parts.nature.reason) };
        if (!hasEvs) return parts;
        // The spread is the model's proposal (or the player's fixed plan); what it means for this Pokémon is worked out here.
        // A fixed plan is kept, only made legal again (252 and 510 caps).
        const proposed = legalPlan((p.evs ?? raw.evPlan?.spread) as EvSpread, p.currentEvs, !hasTarget);
        // A proposed spread finishes two stats at 252 and spends the last 6 (where EVs are hard to change, as far as
        // what it has allows): a plan the player fixed is kept as it is.
        const plan = p.evs ? proposed : shapePlan(proposed, hasTarget ? null : p.currentEvs);
        if (p.evs && formatEvs(plan) !== formatEvs(p.evs)) {
          // The fixed plan was saved before these rules: save it as it now reads.
          await prisma.rosterPokemon.update({ where: { id: p.id }, data: { evs: plan } });
          await syncEvStatus(prisma, p.id);
        }
        // What is still missing is counted against the EVs read with this plan, as the team view counts them.
        const current = evsForPlan(p, plan, natures);
        const { spread, toTrain } = describePlan(plan, current, lang === 'es' ? 'nada' : 'nothing');
        const gap = evGap(plan, current);
        const missing = (Object.keys(gap) as (keyof typeof gap)[]).filter((k) => gap[k] > 0);
        return {
          ...parts,
          evPlan: {
            spread,
            toTrain,
            // Who to battle comes from the games' own data, not from the model.
            sources: (await loadEvSources(game.id, missing)).map((x) => ({ ...x, stat: STAT_NAMES[x.stat] })),
            items: trainingItemsFor(gap, lang === 'es'),
          },
        };
      },
      schemaName: 'build_audit',
      // Everything is fixed: nothing is left for the model to decide.
      local: rules
        ? await rules({ pool, ask, fixedMoves: locks?.moves?.map((m) => m.move) ?? [], freeEvs: hasTarget, planned, natures })
        : nothingToAsk
          ? ({} as Partial<BuildAuditRaw>)
          : undefined,
      // Item and EV advice depends on how this game works, so let it look things up.
      webSearch: true,
      // One Pokémon at a time is the everyday request; "deeper" is the user's choice.
      tier: deep ? 'deep' : 'bulk',
      prompt: [
        'Give exactly what the player needs for this Pokémon as it is right now, and nothing else. ' +
          'Work with what it already has: its nature (and Mint), ability, potential, current EVs, held item and known moves are the starting point. Do not propose rebuilding it. ' +
          'The data below is its current state as the player recorded it; trust it over assumptions, and where a value is null it is not known. ' +
          'When ability is not null it is part of the build, so every part below must work with it: choose the item, moves, nature, EVs and Tera type that make use of it, ' +
          'avoid ones it makes pointless or works against, and name the ability in a reason when it is why you chose something. When it is null, do not assume one. ' +
          'Build every part for the stats it will have once its nature effect is settled, not only as it is now (a Mint changes the stats): ' +
          (ask.mint
            ? 'decide the mint first, and choose the rest for the effect of the nature you give there. '
            : ask.nature
              ? 'decide the nature first, and choose the rest for its effect. '
              : 'that is natureAndMint.effectItWillHave when it is there, otherwise natureAndMint.effectTheGameApplies. ') +
          'Answer only the parts asked for below.',
        JSON.stringify({ pokemon: build, legalMovePool }, null, 2),
        p.finalSpecies
          ? `It is a ${p.species.nameEn} now and will end as ${p.finalSpecies.nameEn}: choose everything for ${p.finalSpecies.nameEn}, ` +
            `using baseStats (its) and not currentStageBaseStats. currentStats, level and ability are those of ${p.species.nameEn}; ` +
            `its ability may change when it evolves (abilitiesAtFinalStage), so do not treat it as a problem.`
          : '',
        fixedNotes.length ? `The player has fixed these parts, so they are not asked again:\n${fixedNotes.join('\n')}` : '',
        ask.evPlan
          ? 'evPlan: currentStats are the numbers the game shows (HP 331, Attack 328…). They are NOT EVs, so never use them for the plan. ' +
            'EV rules, which the spread must follow exactly: ' +
            '(1) A stat holds at most 252 EVs (maxEvsPerStat). ' +
            `(2) A Pokémon holds at most ${MAX_EV_TOTAL} EVs in all (maxEvsTotal). ` +
            '(3) Every amount is a whole number of EVs. ' +
            '(4) The spread is what it should HAVE when finished, per stat, not what to add. currentEvs is what it has now, currentEvsTotal their sum, and evsLeftToTrain is maxEvsTotal minus that sum. ' +
            'statsWithFullEvsInGame, when not null, lists the stats the game shows with the full 252; every other stat has fewer. ' +
            `(5) The six numbers add up to exactly ${MAX_EV_TOTAL}: 252 in each of the two stats its role needs most, and the last 6 in a third (for example 252 / 252 / 6), because EVs left unspent are stat points thrown away. ` +
            'When it already has EVs that cannot be taken back, still aim for 252 in two stats; if the EVs it has elsewhere leave no room for that, give the first one 252 and the second as many as are left. ' +
            (hasTarget
              ? 'EVs are easy to retrain in this game, so choose the best spread for its role, nature, base stats and moves; currentEvs only says where it starts. '
              : 'Its EVs are hard to change in this game, so every stat must stay at or above its currentEvs: only add to them, never start over, and the EVs you add in total must not go over evsLeftToTrain. ') +
            'Put them only into the stats its role really needs (a physical attacker needs no Sp. Atk, and a slow bulky Pokémon rarely needs Speed); the last 6 go to HP or the bulk stat it benefits from. ' +
            'Do not say which Pokémon to battle, or give vitamin counts or EV arithmetic: the app works those out.' +
            (game.evNote ? ` About EV training in this game: ${game.evNote}` : '')
          : '',
        ask.heldItem
          ? 'heldItem: the best held item for it. If the one it holds is already the best, name it and say to keep it.'
          : '',
        ask.moves
          ? (locks?.moves?.length
              ? `The player has fixed these moves, so they stay: ${locks.moves.map((m) => m.move).join(', ')}. ` +
                `recommendedMoves lists only the other ${4 - locks.moves.length} to add, chosen to work with the fixed ones (no duplicated role). `
              : '') +
            `recommendedMoves: the best four moves for it given the nature effect it will have${hasEvs ? ' and the EVs it will finish with' : ''}, chosen ONLY from legalMovePool. ` +
            'Prefer moves it already knows over ones it would have to get. ' +
            'legalMovePool.eggMoves are egg moves it can only get by a picnic or breeding with a Pokémon that already knows them: suggest one only when it clearly beats what it learns normally (the app tells the player how to get it). ' +
            'Do not recommend moves that use a stat it is not investing in: no special attacks when its Sp. Atk gets no EVs and that effect does not raise it, ' +
            'and no physical attacks when its Attack gets none. Status and setup moves are fine. ' +
            'Use the type, category and power given; do not invent move effects. Keep each reason to one short sentence.'
          : '',
        ask.nature
          ? 'nature: it has no nature on record, so say which nature to aim for (to catch or breed one with); do not suggest a Mint. ' +
            'Work it out from the Pokémon itself: compare its Attack against its Sp. Atk, and its Speed, using baseStats and the moves it can use (legalMovePool and its moves). ' +
            'Raise the stat it attacks with, or its Speed when it is a fast attacker that wants to outspeed; lower a stat it never uses. ' +
            'Do not fall back on a common nature: the answer must follow from this Pokémon. Give the nature in English and a one-sentence reason.'
          : '',
        ask.mint
          ? 'mint: a Mint makes the game apply another nature’s stat effect, without changing the nature itself. ' +
            'natureAndMint.effectTheGameApplies is the effect it has right now (natureAndMint.mint says whether a Mint was given; a Mint only chosen changes nothing). ' +
            'Say which of the 25 natures has the best effect for it: the raised stat should be the one it attacks or speeds with, and the lowered one a stat it never uses (Attack for a special attacker, Sp. Atk for a physical one), ' +
            'judged against its role, base stats, ability and the moves it will have. If the effect it has now is already the best, name the nature it applies now. ' +
            'Give the nature in English, and a one-sentence reason saying what that effect raises and lowers and why that suits it. ' +
            'Do not say in the reason whether it has a Mint, nor whether to keep, use or buy one: the app says that from your answer and its current state.'
          : '',
        ask.tera
          ? 'teraType: the best Tera type for it, given its ability, held item and moves: one that covers a weakness or powers up its main attacks. ' +
            'teraType in the data is the one the player has now; if it is already the best, return it and say to keep it. Give the type as its English lowercase name and a one-sentence reason.'
          : '',
        ask.moves && illegal.length
          ? `Game data says this Pokémon cannot learn: ${illegal.join(', ')}. Replace each with a move from legalMovePool.`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    }
  );
}

/**
 * Where to catch a Pokémon, from the shared dictionary or else from the model. PokéAPI has no encounter
 * data for recent games, so a miss is researched on the web, in both languages at once, and saved for
 * everyone. With `refresh` the dictionary is skipped and the entry replaced.
 */
export async function researchLocation(
  provider: AiProvider,
  game: GameConfig,
  userId: string,
  speciesId: number,
  pokemon: string,
  refresh = false
): Promise<StoredLocation> {
  if (!refresh) {
    const saved = (await findLocations(game, [speciesId])).get(speciesId);
    if (saved) return saved;
  }
  const names = sharedGameName(game);
  const raw = await provider.generate({
    system: system(game, 'both'),
    schema: BilingualLocationSchema,
    schemaName: 'location',
    webSearch: true,
    tier: 'bulk',
    prompt:
      `Where can ${pokemon} be caught in ${names}? Be brief: at most two places, best first. ` +
      'For each: place is the area name, exactly as the English game spells it; nearby is the nearest fast-travel point, town or region to head to; ' +
      'details is at most one short sentence on where in the area or how to get there (DLC area or raid only, if that applies). ' +
      (game.locationNote ? `${game.locationNote} ` : '') +
      (game.pair
        ? 'The two versions share one map, and this answer is shared by players of both. Say where it is found in the version that has it; ' +
          'if only one version has it, still set found to true and say in notes which version. '
        : '') +
      'Do not explain what you could not confirm: leave it out. ' +
      'If it cannot be caught in the wild, set found to false and say in one sentence how it is obtained. ' +
      'notes stays empty unless one short sentence is essential (for example, it needs the DLC).',
  });
  // The Spanish version has the game names left in English put in the game's own Spanish.
  const localize = async (b: LocationResult): Promise<LocationResult> => ({
    ...b,
    locations: await Promise.all(
      b.locations.map(async (l) => ({
        ...l,
        place: await localizeNames(l.place, 'es'),
        nearby: l.nearby ? await localizeNames(l.nearby, 'es') : l.nearby,
        details: l.details ? await localizeNames(l.details, 'es') : l.details,
      }))
    ),
    notes: b.notes ? await localizeNames(b.notes, 'es') : b.notes,
  });
  const result: StoredLocation = { en: raw.en, es: await localize(raw.es) };
  await saveLocation(game, speciesId, result, {
    userId,
    provider: provider.name,
    model: provider.modelFor('bulk'),
    promptVersion: LOCATION_PROMPT_VERSION,
  });
  return result;
}

/** "Pokémon Scarlet and Violet" for a pair that shares a map, otherwise the game's own name. */
function sharedGameName(game: GameConfig): string {
  const pair = game.pair ? getGame(game.pair) : undefined;
  if (!pair) return game.name;
  const [first, second] = [game, pair].sort((a, b) => a.shortName.localeCompare(b.shortName));
  return `${first.name} and ${second.shortName}`;
}

/** The "provider" of an audit made by rules: it has a name and a version, and never answers a request. */
const RULES_SOURCE: AuditSource = {
  name: 'rules',
  modelFor: () => `rules-v${RULES_VERSION}`,
  generate: () => Promise.reject(new Error('The rule-based audit never asks a model.')),
};

/** The "provider" of an audit with every part fixed: built from what the player fixed, and no model was asked. */
const FIXED_SOURCE: AuditSource = {
  name: 'fixed',
  modelFor: () => 'fixed-parts',
  generate: () => Promise.reject(new Error('An audit with every part fixed never asks a model.')),
};

/** Held items the rules may suggest, looked up by slug so only ones this database has are named. */
const RULE_ITEMS = ['focus-sash', 'choice-band', 'choice-specs', 'life-orb', 'leftovers', 'assault-vest'];

/**
 * The audit without AI: the same answer as `auditBuild`, worked out from base stats, the moves the Pokémon can
 * learn and the type chart. It is saved like an AI audit (provider "rules"), so the card shows it the same way.
 * Always made again, since it is free and instant.
 */
export async function quickAudit(game: GameConfig, lang: Lang, profileId: string, p: RosterView) {
  if (!(p.finalSpecies?.baseStats ?? p.baseStats)) throw new AiError('There is not enough data on this Pokémon to suggest how to set it up.');

  return auditBuild(RULES_SOURCE, game, lang, profileId, p, true, false, async (ctx) => {
    const input = await ruleInputFor(game, lang, p, ctx);
    return (input ? ruleAudit(input) : {}) as Partial<BuildAuditRaw>;
  });
}
