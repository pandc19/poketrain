'use client';

import { Sparkles } from '@/lib/sparkle';
import { useState } from 'react';
import { NO_EVS, STAT_LABELS, STAT_ORDER, cleanNumber } from './EvInputs';
import { IV_RATINGS, ivRating, type IvRatingValue, type IvRatings } from '@/lib/iv-ratings';
import { MAX_EV_TOTAL, estimateEvRange, mayBeFull, levelHints, statsAboveMax, type NatureEffect } from '@/lib/ev-estimate';
import { ivAssumption } from '@/lib/potential';
import { evTotal, type EvSpread } from '@/lib/import/evs';
import { useDismissed } from './useDismissed';
import { useT } from '@/lib/translate-client';

/** What is needed to turn the stats the game shows back into EVs. */
export type EvEstimateInfo = {
  baseStats: EvSpread;
  nature: NatureEffect;
  /** Display name of the nature that is applied, when there is one. */
  natureName: string | null;
  /** A Mint's effect is applied in place of the nature's own, so it is worth saying which one was used. */
  mint?: boolean;
  /**
   * The nature effect in force now. `nature` is the one the recorded stats were read under; stats typed
   * now are read under this one.
   */
  live?: { nature: NatureEffect; natureName: string | null };
};

const STAT_KEY: Record<string, keyof typeof STAT_LABELS> = {
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'specialAttack',
  'special-defense': 'specialDefense',
  speed: 'speed',
};

/** "Firme (+Ataque, −At. Esp.)": the nature and what it does to the stats. */
function natureText(info: EvEstimateInfo, lang: 'es' | 'en'): string {
  const label = (slug: string) => (STAT_KEY[slug] ? STAT_LABELS[STAT_KEY[slug]][lang] : slug);
  const { increased, decreased } = info.nature ?? { increased: null, decreased: null };
  return increased && decreased
    ? `${info.natureName} (+${label(increased)}, −${label(decreased)})`
    : `${info.natureName}`;
}

/** The marks with one stat switched: the first mark also says the others do not sparkle. */
export const toggleMaxed = (maxed: (keyof EvSpread)[] | null, key: keyof EvSpread): (keyof EvSpread)[] =>
  maxed?.includes(key) ? maxed.filter((k) => k !== key) : [...(maxed ?? []), key];

/**
 * Says whether the game shows this stat's EVs sparkling, which only 252 does. The stats alone often cannot
 * tell 252 from a few fewer, so this is what settles it.
 */
export function SparkleToggle({
  stat,
  on,
  onToggle,
}: {
  stat: keyof EvSpread;
  on: boolean;
  onToggle: () => void;
}) {
  const { t, lang } = useT();
  const label = t('{stat}: its EVs sparkle in the game (252)', { stat: STAT_LABELS[stat][lang] });
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`rounded px-1 text-[11px] leading-none ${on ? 'font-bold text-star' : 'text-muted/50 hover:text-muted'}`}
    >
      ✦
    </button>
  );
}

// Corners of the hexagon, from the top and clockwise, as the game draws it.
const ANGLES = [-90, -30, 30, 90, 150, 210].map((d) => (d * Math.PI) / 180);

/** The EVs as a hexagon, like the yellow shape in the game, with the number at each corner. */
export function EvGraph({
  evs,
  nature,
  over = [],
}: {
  evs: EvSpread;
  nature?: EvEstimateInfo['nature'];
  /** Stats whose typed value is more than the Pokémon can have: no EVs can be read from them. */
  over?: (keyof EvSpread)[];
}) {
  const { lang } = useT();
  const size = { w: 230, h: 190, cx: 115, cy: 95, r: 56 };
  const point = (index: number, fraction: number, radius = size.r) => ({
    x: size.cx + Math.cos(ANGLES[index]) * radius * fraction,
    y: size.cy + Math.sin(ANGLES[index]) * radius * fraction,
  });
  const ring = (fraction: number) =>
    STAT_ORDER.map((_, i) => point(i, fraction)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const shape = STAT_ORDER.map((key, i) => point(i, Math.min(1, evs[key] / 252)))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${size.w} ${size.h}`} className="mx-auto w-full max-w-[230px]" role="img" aria-label="EVs">
      <polygon points={ring(1)} fill="none" stroke="var(--color-line)" strokeWidth="1" />
      <polygon points={ring(0.5)} fill="none" stroke="var(--color-line)" strokeWidth="0.5" strokeDasharray="2 3" />
      {STAT_ORDER.map((_, i) => {
        const edge = point(i, 1);
        return <line key={i} x1={size.cx} y1={size.cy} x2={edge.x} y2={edge.y} stroke="var(--color-line)" strokeWidth="0.5" />;
      })}
      <polygon points={shape} fill="var(--color-star)" fillOpacity="0.35" stroke="var(--color-star)" strokeWidth="1.5" />
      {/* With no EVs the shape shrinks to nothing, so a dot marks the centre. */}
      {STAT_ORDER.every((key) => evs[key] === 0) && <circle cx={size.cx} cy={size.cy} r="3" fill="var(--color-star)" />}
      {/* A stat at its 252 maximum lights up its corner. */}
      {STAT_ORDER.map((key, i) => {
        if (evs[key] < 252 || over.includes(key)) return null;
        const p = point(i, 1);
        return (
          <g key={key}>
            <Sparkles cx={p.x} cy={p.y} />
          </g>
        );
      })}
      {STAT_ORDER.map((key, i) => {
        const at = point(i, 1, size.r + 17);
        const anchor = Math.abs(Math.cos(ANGLES[i])) < 0.2 ? 'middle' : Math.cos(ANGLES[i]) > 0 ? 'start' : 'end';
        // Like the game: a red up arrow for the stat the nature raises, a blue down arrow for the one it lowers.
        const trend =
          nature?.increased && STAT_KEY[nature.increased] === key
            ? { arrow: '▲', color: '#ef4444' }
            : nature?.decreased && STAT_KEY[nature.decreased] === key
              ? { arrow: '▼', color: '#3b82f6' }
              : null;
        return (
          <text key={key} x={at.x} y={at.y} textAnchor={anchor} fontSize="9" fill="var(--color-muted)">
            <tspan x={at.x}>
              {STAT_LABELS[key][lang]}
              {trend && (
                <tspan dx="2" fill={trend.color}>
                  {trend.arrow}
                </tspan>
              )}
            </tspan>
            <tspan
              x={at.x}
              dy="11"
              fontSize="11"
              fontWeight={evs[key] >= 252 && !over.includes(key) ? 700 : 600}
              fill={
                over.includes(key)
                  ? 'var(--color-pending)'
                  : evs[key] >= 252
                    ? 'var(--color-star)'
                    : 'var(--color-ink)'
              }
            >
              {evs[key] >= 252 && !over.includes(key) ? `✦ ${evs[key]}` : evs[key]}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

/**
 * Where a Pokémon's training is recorded. The game shows its stats as numbers
 * (the blue graph) and its EVs only as a shape, so the stats and level are what
 * you type, and the EVs are worked out and drawn.
 *
 * Controlled: the parent keeps the stats and level and decides when to save.
 */
export function StatsEvsEditor({
  stats,
  level,
  ratings,
  onChange,
  onCommit,
  info,
  potential,
  savedEvs,
  savedEstimated,
  plan,
  maxed,
  onMaxedChange,
  hintKey,
}: {
  stats: EvSpread | null;
  level: number;
  /** What the Judge said about each stat's IV. */
  ratings: IvRatings;
  onChange: (stats: EvSpread | null, level: number, ratings: IvRatings) => void;
  /** Focus left the stats and level boxes. */
  onCommit?: () => void;
  info?: EvEstimateInfo;
  /** The Judge's potential, which says roughly what IVs to assume. */
  potential: string | null;
  /** The EVs on record, shown when no stats are typed. */
  savedEvs: EvSpread | null;
  savedEstimated: boolean;
  /** The EV plan, if any: where it fits what the stats can show, it is taken as the amount. */
  plan?: EvSpread | null;
  /** The stats the game shows sparkling (252 EVs); null when the player has not looked. */
  maxed?: (keyof EvSpread)[] | null;
  /** The sparkle marks changed; without it they are not offered. */
  onMaxedChange?: (maxed: (keyof EvSpread)[]) => void;
  /** Identifies this Pokémon, so a hint it has waved away stays away. */
  hintKey?: string;
}) {
  const { t, lang } = useT();
  const hasStats = stats != null && evTotal(stats) > 0;
  const iv = ivAssumption(potential);
  const range =
    hasStats && info
      ? estimateEvRange({ stats, level, baseStats: info.baseStats, nature: info.nature, ivsLow: iv.low, ratings, plan, maxed })
      : null;
  const above =
    hasStats && info ? statsAboveMax({ stats, level, baseStats: info.baseStats, nature: info.nature, ratings }) : {};
  const aboveKeys = Object.keys(above) as (keyof EvSpread)[];
  const hints =
    hasStats && info && range
      ? levelHints({ stats, level, baseStats: info.baseStats, nature: info.nature, ratings, estimate: range.estimate })
      : { overTotal: null, atMax: [] as (keyof EvSpread)[] };
  // Waving the level hint away holds for this Pokémon, level and set of stats at their maximum.
  const [levelHintGone, goneLevelHint] = useDismissed(`level:${hintKey ?? 'none'}:${level}:${hints.atMax.join(',')}`);
  const live = range?.estimate ?? null;
  const evs = live ?? savedEvs;
  const estimated = live != null || savedEstimated;
  const rated = STAT_ORDER.filter((key) => ivRating(ratings[key]) != null);
  const hasInfo = rated.length > 0 || iv.fromPotential;
  // Every IV pinned to one value: the EVs are not a range any more.
  const exact =
    range != null &&
    STAT_ORDER.every((key) => {
      const r = ivRating(ratings[key]);
      return r != null && r.low === r.high;
    });
  const total = evs ? evTotal(evs) : 0;
  const highTotalShown = range ? Math.min(MAX_EV_TOTAL, evTotal(range.high)) : total;
  const realRange =
    highTotalShown > total
      ? t('Real total: between {low} and {high}.', { low: total, high: highTotalShown })
      : t('Real total: {total}.', { total });

  const [copied, setCopied] = useState(false);
  /** The level, the stats and the EVs as plain text, to paste somewhere else. */
  async function copyText() {
    const line = (v: EvSpread) => STAT_ORDER.map((key) => `${STAT_LABELS[key][lang]} ${v[key]}`).join(' / ');
    const text = [
      `${t('Level')}: ${level}`,
      hasStats ? `${t('Stats')}: ${line(stats!)}` : null,
      evs
        ? `EVs${estimated ? ` (${t('estimated')})` : ''}: ${line(evs)} · ${t('Total {total} / {max}', { total, max: MAX_EV_TOTAL })}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: nothing to do.
    }
  }

  const [levelText, setLevelText] = useState(String(level));
  // When the level changes from outside the box, show it; what is being typed is left alone.
  const [seenLevel, setSeenLevel] = useState(level);
  if (seenLevel !== level) {
    setSeenLevel(level);
    if (Number(levelText) !== level && !(Number(levelText) > 100 && level === 100)) setLevelText(String(level));
  }

  return (
    <div className="space-y-2">
      <div
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit?.();
        }}
      >
        <div className="grid grid-cols-3 gap-x-1.5 gap-y-2">
          {STAT_ORDER.map((key) => (
            <div key={key} className="relative min-w-0">
              {/* Outside the label, so a tap on the stat's name still goes to its box. */}
              {onMaxedChange && (
                <span className="absolute right-0 top-0">
                  <SparkleToggle
                    stat={key}
                    on={maxed?.includes(key) ?? false}
                    onToggle={() => onMaxedChange(toggleMaxed(maxed ?? null, key))}
                  />
                </span>
              )}
              <label className="block">
                <span className="block truncate pr-4 text-[10px] text-muted">{STAT_LABELS[key][lang]}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={(stats ?? NO_EVS)[key] || ''}
                  onChange={(e) => onChange({ ...(stats ?? NO_EVS), [key]: cleanNumber(e.target.value) }, level, ratings)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  aria-label={STAT_LABELS[key][lang]}
                  className="w-full rounded border border-line bg-bg px-1 py-0.5 text-xs"
                />
              </label>
              <select
                value={ratings[key] ?? ''}
                onChange={(e) =>
                  onChange(stats, level, { ...ratings, [key]: (e.target.value || null) as IvRatingValue | null })
                }
                aria-label={`${STAT_LABELS[key][lang]}: ${t("IV rating from the game's Judge")}`}
                title={ivRating(ratings[key])
                  ? `${lang === 'en' ? ivRating(ratings[key])!.label : ivRating(ratings[key])!.labelEs}: IV ${ivRating(ratings[key])!.low === ivRating(ratings[key])!.high ? ivRating(ratings[key])!.low : `${ivRating(ratings[key])!.low}-${ivRating(ratings[key])!.high}`}`
                  : t("IV rating from the game's Judge")}
                className="mt-0.5 w-full rounded border border-line bg-bg px-0.5 py-0.5 text-[10px]"
              >
                <option value="">{t('IV: not judged')}</option>
                {[...IV_RATINGS].reverse().map((r) => (
                  <option key={r.value} value={r.value}>
                    {lang === 'en' ? r.label : r.labelEs}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {onMaxedChange && (
          <p className="mt-1.5 text-[10px] text-muted">
            {maxed
              ? t('✦ marks the stats whose EVs sparkle in the game (252). The others are read as not full.')
              : t('Tap ✦ on each stat whose EVs sparkle in the game (252): the stats alone cannot always tell 252 from a few fewer.')}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <label className="flex w-24 items-center gap-1.5 text-[11px] text-muted">
            {t('Level')}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={levelText}
              onChange={(e) => {
                // Kept as typed: clearing the box to type a new level must not snap it to 1 first.
                setLevelText(e.target.value);
                const n = cleanNumber(e.target.value);
                if (n > 0) onChange(stats, Math.min(100, n), ratings);
              }}
              onBlur={() => setLevelText(String(level))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="w-full rounded border border-line bg-bg px-1 py-0.5 text-xs text-ink"
            />
          </label>
          <button
            type="button"
            onClick={copyText}
            title={t('Copy the level, stats and EVs as text')}
            className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-ink"
          >
            {copied ? t('Copied') : t('Copy')}
          </button>
        </div>
      </div>

      {evs ? (
        <div>
          <p className="text-center text-xs font-semibold">{t('Current EVs')}</p>
          <EvGraph evs={evs} nature={info?.nature} over={aboveKeys} />
          <p className="text-center text-[11px] text-muted">
            {t('Total {total} / {max}', { total, max: MAX_EV_TOTAL })} ·{' '}
            {t('{n} EVs still to spend', { n: Math.max(0, MAX_EV_TOTAL - total) })}
          </p>
          {aboveKeys.map((key) => (
            <p key={key} role="alert" className="mt-1 text-center text-[11px] text-pending">
              {t('{stat} {value} is more than it can have at level {level} (the most is {max}). Check the level.', {
                stat: STAT_LABELS[key][lang],
                value: stats![key],
                level,
                max: above[key]!,
              })}
            </p>
          ))}
          {hints.overTotal != null && (
            <p role="alert" className="mt-1 text-center text-[11px] text-pending">
              {t('These stats ask for {total} EVs, more than the {max} a Pokémon can have. If it has leveled up, change the level.', {
                total: hints.overTotal,
                max: MAX_EV_TOTAL,
              })}
            </p>
          )}
          {hints.atMax.length > 0 && !levelHintGone && (
            <p className="mt-1 text-center text-[11px] text-star">
              {t('{stats} at the most it can be at level {level}. If the game does not show its EVs full, it may have leveled up: check the level.', {
                stats: hints.atMax.map((k) => STAT_LABELS[k][lang]).join(', '),
                level,
              })}{' '}
              <button type="button" onClick={goneLevelHint} className="underline">
                {t('Got it')}
              </button>
            </p>
          )}
          {/* An IV the Judge left open means more EVs may be hidden; at the 510 limit nothing more is gained. */}
          {estimated && range && total < MAX_EV_TOTAL && mayBeFull(range.high) && (
            <p role="note" className="mt-1 text-center text-[11px] text-star">
              {t('Not every IV is known, so it may already have the most EVs it can have ({max}). If so, the EVs it gains in battle are lost: lower a stat it does not need (with a berry) first.', { max: MAX_EV_TOTAL })}
            </p>
          )}
          {estimated && (
            <div className="mt-0.5 space-y-0.5 text-center text-[10px] text-muted">
              <p>
                {exact
                  ? t('Exact: every IV is known from the ratings.')
                  : hasInfo
                    ? realRange
                    : t('The fewest EVs that give these stats. Rate its IVs or set its potential to see how many more it could have.')}
              </p>
              {/* Only when it is not obvious: no nature set (none applied), or a Mint's effect used. */}
              {info && (!info.natureName || info.mint) && (
                <p>
                  {info.natureName
                    ? t('Nature used for the calculation: {nature}.', { nature: natureText(info, lang) })
                    : t('Its nature is not set, so none is applied.')}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted">{t('Fill in the stats to see the EVs.')}</p>
      )}

    </div>
  );
}
