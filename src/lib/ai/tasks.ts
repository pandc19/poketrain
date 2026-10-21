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
import { STAT_NAMES, loadEvSources } from '../ev-catalog';
import { describePlan, legalPlan, trainingItemsFor } from '../ev-plan';
import { syncEvStatus } from '../ev-sync';
import type { Lang } from '../i18n';
import { ivRating } from '../iv-ratings';
import { potentialLevel } from '../potential';
import type { RosterView } from '../roster';
import { type AuditAsk, type BuildAuditRaw, BilingualLocationSchema, type LocationResult, buildAuditSchema } from './schema';
import { localizeNames } from './names';
import { mintInForce } from '../mint';
import { AiError, type AiProvider, type ModelTier } from './types';
import { RULES_VERSION, ruleAudit, type RuleMove, type RuleNature } from '../audit-rules';
import { loadChart } from '../battle/load';
import type { LearnableMoves } from '../breeding/moves';

const PROMPT_VERSION = 20;

const SPANISH_RULES =
  'Write every text field in Spanish from Spain (español de España), in the plain and direct way a player would say it. ' +
  'In sentences, name Pokémon, moves, items (TMs, vitamins, berries, Mints), abilities, natures, types, towns, areas and fast-travel points exactly as the Spanish (Spain) version of the game shows them, ' +
  'as the Spanish WikiDex lists them (for example Roca Afilada, Cinta Elegida, Proteína, Firme, Intimidación), never a translation of your own. ' +
  'If you are not sure of the Spanish name, write the English one rather than inventing it. ' +
  'The only exception are fields that hold an identifier the app matches (the move, the item, the nature of a Mint, a Tera type and a Pokémon to look up): those stay in English exactly as the English game spells them.';

/** `both` is for an answer stored in the shared dictionary, which carries an English and a Spanish version. */
const system = (game: GameConfig, lang: Lang | 'both') =>
  [
    `You are a competitive Pokémon coach helping one player with ${game.name}.`,
    `Only recommend Pokémon, moves, items and mechanics that exist in ${game.name}, including its DLC.`,
    'Be specific and practical. If you are not sure where something is found, say so rather than guessing.',
    'Prefer advice the player can act on without starting over: say what is easy, and never suggest a move the Pokémon cannot learn in this game.',
    lang === 'es'
      ? SPANISH_RULES
      : lang === 'both'
        ? `Fill in two versions of every text field. The "en" object is written in English. The "es" object is written like this: ${SPANISH_RULES}`
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
  const where = { kind_provider_inputHash: { kind: key.kind, provider: provider.name, inputHash } };

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

/** All six values with their stat names, so a stat can never be read as an EV or the other way round. */
const statLine = (v: Record<keyof typeof STAT_NAMES, number>) =>
  Object.fromEntries(Object.entries(STAT_NAMES).map(([k, name]) => [name, v[k as keyof typeof STAT_NAMES]]));

/** A compact, language-neutral description of a Pokémon as it is now, used both as prompt and cache key. */
function describeBuild(p: RosterView, hasEvs = true) {
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
    // The nature it has now, when known, and the one the player is aiming for.
    currentNature: p.currentNature?.nameEn ?? null,
    targetNature: p.targetNature?.nameEn ?? null,
    // The Mint it was given, when there is one. Its effect, not the real nature's, is what the game applies to the stats.
    mintNature: mintInForce(p)?.nameEn ?? null,
    ability: p.ability?.nameEn ?? null,
    heldItem: p.item?.nameEn ?? p.itemNote,
    ...(hasEvs
      ? {
          // EVs per stat, all six listed. Not the same thing as the stats above.
          currentEvs: p.currentEvs ? statLine(p.currentEvs) : null,
          evsLeftToTrain: p.currentEvs ? Math.max(0, 508 - evTotal(p.currentEvs)) : null,
          // Worked out from the stats and IV ratings, so they may be a little low.
          currentEvsAreEstimated: p.currentEvs ? p.currentEvsEstimated : null,
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

/** What the rules need to know about the audit being made, once it has been worked out what to ask. */
type RulesContext = { pool: LearnableMoves; ask: AuditAsk; fixedMoves: string[]; freeEvs: boolean };

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
  // Where EVs are easy to reset, a target spread makes sense; elsewhere work from what it has.
  const hasTarget = hasEvs && game.features.evTarget;
  const build = describeBuild(p, hasEvs);
  const illegal = p.moves.filter((m) => m.legal === false).map((m) => m.move!.nameEn);

  // Everything it can legally have in this game, so suggestions come from real options.
  const pool = await learnableMoves(game, p.finalSpecies?.id ?? p.species.id);
  // Each move with its type, category and power, so advice about which stat it uses comes from data.
  const describeMove = (m: { nameEn: string; type: string; damageClass: string; power: number | null }) =>
    `${m.nameEn} (${m.type}, ${m.damageClass}${m.power ? `, power ${m.power}` : ''})`;
  const legalMovePool = {
    eggMoves: pool.egg.map(describeMove),
    learnedNormally: pool.other.map(describeMove),
  };
  const details = new Map([...pool.egg, ...pool.other].map((m) => [m.nameEn, describeMove(m)]));
  build.moves = build.moves.map((m) => ({ ...m, name: details.get(m.name ?? '') ?? m.name }));

  const locks = p.auditLocks;
  const hasTera = game.features.teraType;
  const hasMint = gameHasMints(game);
  // What the player has fixed is not asked again, by any kind of audit: it is kept, and the rest is worked out.
  const { ask, mintLock, planFixed, nothingToAsk } = auditAsk(p, { hasEvs, hasTera, hasMint });

  /** What is fixed, said once so the model chooses the rest to go with it. */
  const fixedNotes = [
    planFixed ? 'EV plan (fixed): targetEvs is the spread it finishes with. Choose the rest for those EVs.' : '',
    locks?.heldItem ? `Held item (fixed): ${locks.heldItem.item}.` : '',
    (locks?.moves?.length ?? 0) >= 4 ? `Moves (fixed): ${locks!.moves!.map((m) => m.move).join(', ')}.` : '',
    hasTera && locks?.teraType ? `Tera type (fixed): ${locks.teraType.type}.` : '',
    mintLock ? `Mint (fixed): ${mintLock.nature}.` : '',
  ].filter(Boolean);

  // With every part fixed there is nothing to ask: the audit is the fixed parts, and it is saved as such rather
  // than as something the model wrote.
  const source = rules || !nothingToAsk ? provider : FIXED_SOURCE;
  return cached(
    source,
    { kind: 'build', profileId, rosterPokemonId: p.id, refresh, lang },
    // Rules and fixed parts are deterministic and cheap, so each Pokémon keeps its own: the answer is not shared by identical builds.
    { build, illegal, legalMovePool, lang, locks: p.auditLocks, ...(rules || nothingToAsk ? { pokemonId: p.id } : {}) },
    {
      system: system(game, lang),
      schema: buildAuditSchema(ask, hasEvs),
      finish: async (raw) => {
        const locks = p.auditLocks;
        // What the player fixed is kept as it is; the model only filled the rest.
        const parts = {
          heldItem: locks?.heldItem ?? raw.heldItem,
          recommendedMoves: withFixedMoves(locks?.moves, raw.recommendedMoves ?? []),
          ...(hasTera ? { teraType: locks?.teraType ?? raw.teraType } : {}),
          ...(hasMint ? { mint: mintLock ? { ...mintLock, keep: true } : raw.mint } : {}),
          ...(raw.nature ? { nature: raw.nature } : {}),
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
        // A fixed plan is kept, only made legal again (amounts in fours, 252 and 508 caps).
        const plan = legalPlan((p.evs ?? raw.evPlan?.spread) as EvSpread, p.currentEvs, !hasTarget);
        if (p.evs && formatEvs(plan) !== formatEvs(p.evs)) {
          // The fixed plan was saved before these rules: save it as it now reads.
          await prisma.rosterPokemon.update({ where: { id: p.id }, data: { evs: plan } });
          await syncEvStatus(prisma, p.id);
        }
        const { spread, toTrain } = describePlan(plan, p.currentEvs, lang === 'es' ? 'nada' : 'nothing');
        const gap = evGap(plan, p.currentEvs);
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
        ? await rules({ pool, ask, fixedMoves: locks?.moves?.map((m) => m.move) ?? [], freeEvs: hasTarget })
        : nothingToAsk
          ? ({} as Partial<BuildAuditRaw>)
          : undefined,
      // Item and EV advice depends on how this game works, so let it look things up.
      webSearch: true,
      // One Pokémon at a time is the everyday request; "deeper" is the user's choice.
      tier: deep ? 'deep' : 'bulk',
      prompt: [
        'Give exactly what the player needs for this Pokémon as it is right now, and nothing else. ' +
          'Work with what it already has: its nature, ability, potential, current EVs, held item and known moves are the starting point. Do not propose rebuilding it. ' +
          'When ability is not null it is part of the build, so every part below must work with it: choose the item, moves, nature, EVs and Tera type that make use of it, ' +
          'avoid ones it makes pointless or works against, and name the ability in a reason when it is why you chose something. When it is null, do not assume one. ' +
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
            'currentEvs are the EVs it has trained, per stat, and evsLeftToTrain is how many of the 508 are still free. ' +
            'spread is the EVs it should finish with, as numbers per stat: multiples of 4 only (the game counts EVs in fours, so 6 is no better than 4), at most 252 each and 508 in total. ' +
            (hasTarget
              ? 'EVs are easy to retrain in this game, so choose the best spread for its role, nature, base stats and moves; currentEvs only says where it starts. '
              : 'Its EVs are hard to change in this game, so every stat must stay at or above its currentEvs: only add to them with the evsLeftToTrain still free, and never start over. ') +
            'The EVs you add in total must not go over evsLeftToTrain, and it is fine to leave some unspent: ' +
            'put them only into the stats its role really needs (a physical attacker needs no Sp. Atk, and a slow bulky Pokémon rarely needs Speed). ' +
            'Do not say which Pokémon to battle, or give vitamin counts or EV arithmetic: the app works those out.' +
            (game.evNote ? ` About EV training in this game: ${game.evNote}` : '')
          : '',
        ask.heldItem
          ? 'heldItem: the best held item for it as it is now. If the one it holds is already the best, name it and say to keep it.'
          : '',
        ask.moves
          ? (locks?.moves?.length
              ? `The player has fixed these moves, so they stay: ${locks.moves.map((m) => m.move).join(', ')}. ` +
                `recommendedMoves lists only the other ${4 - locks.moves.length} to add, chosen to work with the fixed ones (no duplicated role). `
              : '') +
            `recommendedMoves: the best four moves for it given its nature${hasEvs ? ' and the EVs it will finish with' : ''}, chosen ONLY from legalMovePool. ` +
            'Prefer moves it already knows over ones it would have to get. ' +
            'Do not recommend moves that use a stat it is not investing in: no special attacks when its Sp. Atk gets no EVs and its nature does not raise it, ' +
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
          ? 'mint: a Mint changes which stats a nature raises and lowers without changing the nature. The effect the game applies is mintNature when it is given, otherwise currentNature (or targetNature when currentNature is unknown). ' +
            'Judge that effect against its role, base stats and the moves it will have: the raised stat should be the one it attacks or speeds with, and the lowered one a stat it never uses (Attack for a special attacker, Sp. Atk for a physical one). ' +
            'If the effect it has is already the best one, set keep to true and nature to that nature. Otherwise set keep to false and nature to the better one, in English. ' +
            (mintInForce(p)
              ? 'It holds a Mint now, so keep true means to leave it as it is. '
              : 'It has NO Mint: never tell the player to keep a Mint. If its own nature already has the best effect, set keep to true and say in the reason that no Mint is needed; ' +
                'otherwise set keep to false and suggest using that nature’s Mint. ') +
            'Give a one-sentence reason.'
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
      'For each: place is the area name; nearby is the nearest fast-travel point, town or region to head to; ' +
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
  const final = p.finalSpecies;
  const baseStats = final?.baseStats ?? p.baseStats;
  if (!baseStats) throw new AiError('There is not enough data on this Pokémon to suggest how to set it up.');

  return auditBuild(RULES_SOURCE, game, lang, profileId, p, true, false, async ({ pool, ask, fixedMoves, freeEvs }) => {
    const [natures, itemRows, chart] = await Promise.all([
      prisma.nature.findMany({ select: { nameEn: true, increased: true, decreased: true } }),
      game.features.heldItems ? prisma.item.findMany({ where: { slug: { in: RULE_ITEMS } }, select: { slug: true, nameEn: true } }) : [],
      loadChart(),
    ]);
    const known = new Set(p.moves.map((m) => m.move?.nameEn));
    const moves: RuleMove[] = [...pool.egg, ...pool.other].map((m) => ({
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
    const effectNature: RuleNature | null = natures.find((n) => n.nameEn === effect?.nameEn) ?? null;
    const raw = ruleAudit({
      lang,
      types: final?.types ?? p.types,
      baseStats,
      moves,
      natures,
      effectNature,
      fixedMoves,
      currentEvs: p.currentEvs,
      freeEvs,
      items,
      chart,
      ask,
      currentItemSlug: Object.entries(items).find(([, name]) => name === p.item?.nameEn)?.[0] ?? null,
    });
    return raw as Partial<BuildAuditRaw>;
  });
}
