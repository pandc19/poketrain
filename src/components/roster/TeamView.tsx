'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useDismissed } from '../useDismissed';
import { Dialog } from '../Dialog';
import { SearchInput } from '../SearchInput';
import { ExpandIcon, MinusCircleIcon } from '../ActionIcons';
import { PokedexButton } from '../PokemonInfoDialog';
import { TeraBadge, TypeBadge } from '../TypeBadge';
import { STAT_LABELS } from '../EvInputs';
import type { EvEstimateInfo } from '../StatsEvs';
import { EvSourcesDialog } from '../EvSources';
import { HEX_ORDER, HexChart } from './HexChart';
import { PokemonSprite, genderMark, progressOf } from './parts';
import { estimateEvRange, levelHints, statValue } from '@/lib/ev-estimate';
import { evTotal, type EvSpread } from '@/lib/import/evs';
import type { Lang } from '@/lib/i18n';
import type { IvRatings } from '@/lib/iv-ratings';
import { ivAssumption } from '@/lib/potential';
import { mintInForce } from '@/lib/mint';
import { TYPE_NAMES_ES } from '@/lib/pokemon-types';
import type { RosterView } from '@/lib/roster';
import { useT } from '@/lib/translate-client';

const SAVE_DELAY_MS = 700;
const KEYS = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'] as const;

/** The team being trained: six slots to choose from, and the chosen one's stats and EVs to adjust with arrows. */
export function TeamView({
  roster,
  team,
  selectedId,
  lang,
  accent,
  viewSwitch,
  gameId,
  training,
  onTraining,
  tera,
  estimateFor,
  onSelect,
  onSetSlot,
  onSaveStats,
  onStatsRead,
  onOpenDetails,
}: {
  roster: RosterView[];
  /** Roster ids by slot; null for an empty slot. */
  team: (string | null)[];
  selectedId: string | null;
  lang: Lang;
  accent: string;
  /** The switch between the list and the team, kept in the bar at the top. */
  viewSwitch: React.ReactNode;
  gameId: string;
  /** The stat being trained, if one is chosen. */
  training: keyof EvSpread | null;
  onTraining: (stat: keyof EvSpread | null) => void;
  /** The game has Tera types. */
  tera: boolean;
  estimateFor: (p: RosterView) => EvEstimateInfo | undefined;
  onSelect: (id: string) => void;
  onSetSlot: (slot: number, id: string | null) => void;
  onSaveStats: (p: RosterView, stats: EvSpread | null, level: number, ratings: IvRatings) => void;
  /** The stats on record are up to date under the nature effect in force now. */
  onStatsRead: (p: RosterView) => void;
  /** Opens the full details of a Pokémon in the list view. */
  onOpenDetails: (id: string) => void;
}) {
  const { t } = useT();
  const [picking, setPicking] = useState<number | null>(null);
  // Opened from an empty slot: after each choice the next empty slot comes up, until the team is full.
  const [filling, setFilling] = useState(false);
  const [query, setQuery] = useState('');
  const [fighting, setFighting] = useState(false);
  // Order the cards by how close each Pokémon is to its plan in the stat being trained. Display only: the
  // slots, and so the order in the game, are not touched. Remembered on this device.
  const [byProgress, setByProgress] = useState(() => {
    try {
      return localStorage.getItem('team-by-progress') === '1';
    } catch {
      return false;
    }
  });
  const chooseByProgress = (on: boolean) => {
    setByProgress(on);
    try {
      localStorage.setItem('team-by-progress', on ? '1' : '0');
    } catch {}
  };

  const byId = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const members = team.map((id) => (id ? (byId.get(id) ?? null) : null));
  const name = (p: RosterView) => p.nickname ?? (lang === 'en' ? p.species.nameEn : p.species.nameEs);
  const speciesName = (p: RosterView) => (lang === 'en' ? p.species.nameEn : p.species.nameEs);

  /** What a member still has to train in the chosen stat: null when its plan has nothing for it. */
  const leftIn = (p: RosterView | null): number | null => {
    if (!p || !training) return null;
    const target = p.evs?.[training] ?? 0;
    if (target <= 0) return null;
    return target - (p.currentEvs?.[training] ?? 0);
  };

  // The order the cards are shown in: slot order, or by progress in the stat being trained. The closest to finishing
  // comes first, then the ones with more to go, then the ones already there, then those with no plan for the stat;
  // empty slots last. It follows the saved numbers, so it moves once an edit has settled and not on every tap.
  const order = useMemo(() => {
    const indices = members.map((_, i) => i);
    if (!byProgress || !training) return indices;
    const group = (p: RosterView | null) => {
      if (!p) return 4;
      const left = leftIn(p);
      return left == null ? 3 : left > 0 ? 0 : 2;
    };
    return indices.sort((a, b) => {
      const ma = members[a];
      const mb = members[b];
      const ga = group(ma);
      const gb = group(mb);
      if (ga !== gb) return ga - gb;
      if (ga === 0) return (leftIn(ma) ?? 0) - (leftIn(mb) ?? 0) || a - b;
      return a - b;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, byProgress, training]);

  // The one shown: the selected Pokémon when it is in the team, otherwise the first of the team.
  const shown = members.find((m) => m && m.id === selectedId) ?? members.find(Boolean) ?? null;
  const shownSlot = shown ? team.indexOf(shown.id) : -1;

  const ratio = (p: RosterView) => {
    const { done, total } = progressOf(p);
    return total ? done / total : 1;
  };

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster
      .filter((p) => {
        // While filling, the ones already chosen are done with.
        if (filling && team.includes(p.id)) return false;
        if (!q) return true;
        return (
          p.species.nameEn.toLowerCase().includes(q) ||
          p.species.nameEs.toLowerCase().includes(q) ||
          (p.nickname ?? '').toLowerCase().includes(q)
        );
      })
      // Fully trained first, then by how much is done; ties by name.
      .sort((a, b) => ratio(b) - ratio(a) || name(a).localeCompare(name(b), lang) || b.level - a.level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, query, lang, filling, team]);

  /** The empty slot to fill after `index`: the next one in order, otherwise the first one left. */
  const nextEmpty = (slots: (string | null)[], index: number) => {
    const after = slots.findIndex((x, i) => i > index && x == null);
    return after >= 0 ? after : slots.findIndex((x) => x == null);
  };

  // The training bar sticks under the site tabs; the big slot's header sticks right under it, so its
  // height is measured instead of guessed (a guess leaves a strip where the content scrolls through).
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState<number | null>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setBarH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={barH != null ? ({ '--team-bar': `${barH}px` } as React.CSSProperties) : undefined}>
    {/* ---------- what the team is training now ---------- */}
    <div ref={barRef} className="-mx-4 mb-4 bg-bg/95 px-4 py-2 backdrop-blur md:sticky md:top-[var(--nav-h)] md:z-30">
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-3 py-2.5">
      <h2 className="text-sm font-semibold">{t('Training')}</h2>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Stat being trained')}>
        {HEX_ORDER.map((key) => {
          const on = training === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => onTraining(on ? null : key)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                on ? 'border-done/60 bg-done/15 font-semibold text-done' : 'border-line text-muted hover:text-ink'
              }`}
            >
              {STAT_LABELS[key][lang]}
            </button>
          );
        })}
      </div>
      {training && (
        <button
          type="button"
          aria-pressed={byProgress}
          onClick={() => chooseByProgress(!byProgress)}
          title={t('Shows the closest to finishing this stat first. The slots and the order in the game do not change.')}
          className={`rounded-md border px-3 py-1.5 text-xs ${
            byProgress ? 'border-done/60 bg-done/15 font-semibold text-done' : 'border-line text-muted hover:text-ink'
          }`}
        >
          {t('Order by progress')}
        </button>
      )}
      {training ? (
        <button
          type="button"
          onClick={() => setFighting(true)}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-done/50 hover:text-done"
        >
          {t('Who to battle for {stat}', { stat: STAT_LABELS[training][lang] })}
        </button>
      ) : (
        <span className="text-xs text-muted">{t('Choose a stat to see who to battle for it.')}</span>
      )}
      <span className="ml-auto">{viewSwitch}</span>
    </section>
    </div>
    {training && (
      <EvSourcesDialog
        open={fighting}
        onClose={() => setFighting(false)}
        gameId={gameId}
        stat={training}
        statLabel={STAT_LABELS[training][lang]}
      />
    )}

    <div className="grid gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
      {/* ---------- the six slots ---------- */}
      <ol className="grid grid-cols-2 content-start gap-2 lg:sticky lg:top-[calc(var(--nav-h)+6rem)] lg:-m-1 lg:max-h-[calc(100dvh-var(--nav-h)-7rem)] lg:grid-cols-1 lg:self-start lg:overflow-y-auto lg:p-1">
        {order.map((i) => {
          const p = members[i];
          const slot = i + 1;
          if (!p) {
            return (
              <motion.li key={`empty-${slot}`} layout transition={{ duration: 0.25 }}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setFilling(true);
                    setPicking(slot);
                  }}
                  className="flex h-full min-h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm text-muted hover:border-muted hover:text-ink"
                >
                  <span className="text-lg leading-none">＋</span> {t('Add to slot {n}', { n: slot })}
                </button>
              </motion.li>
            );
          }
          const prog = progressOf(p);
          const active = shown?.id === p.id;
          const left = leftIn(p);
          return (
            <motion.li key={p.id} layout transition={{ duration: 0.25 }} className="relative">
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                aria-current={active ? 'true' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 pr-12 text-left ${
                  active ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2'
                } ${prog.complete ? 'border-done/60' : 'border-line'}`}
                style={active ? { outline: `2px solid ${accent}`, outlineOffset: 1 } : undefined}
              >
                <PokemonSprite p={p} size={56} animated={false} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    <span className="truncate">{name(p)}</span>
                    {genderMark(p) && (
                      <span className={`shrink-0 font-bold ${genderMark(p)!.color}`} title={genderMark(p)!.label[lang]}>
                        {genderMark(p)!.symbol}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted">
                    {t('Lv. {level}', { level: p.level })}
                    {byProgress && ` · ${t('slot {n}', { n: slot })}`}
                  </span>
                  {training && left != null && (
                    <span className={`block text-[11px] font-medium ${left > 0 ? 'text-pending' : 'text-done'}`}>
                      {STAT_LABELS[training][lang]} · {left > 0 ? t('{n} to go', { n: left }) : `✓ ${t('Done')}`}
                    </span>
                  )}
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-bg">
                    <span
                      className={`block h-full rounded-full ${prog.complete ? 'bg-done' : 'bg-pending'}`}
                      style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }}
                    />
                  </span>
                </span>
              </button>
              <span className="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setFilling(false);
                    setPicking(slot);
                  }}
                  aria-label={t('Change the Pokémon in slot {n}', { n: slot })}
                  title={t('Change')}
                  className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-muted hover:text-ink"
                >
                  ⇄
                </button>
                <button
                  type="button"
                  onClick={() => onSetSlot(slot, null)}
                  aria-label={t('Empty slot {n}', { n: slot })}
                  title={t('Drop from the team')}
                  className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-muted hover:border-danger/60 hover:text-danger"
                >
                  ✕
                </button>
              </span>
            </motion.li>
          );
        })}
      </ol>

      {/* ---------- the chosen one ---------- */}
      <div>
        {shown ? (
          <TeamDetail
            key={shown.id}
            p={shown}
            gameId={gameId}
            lang={lang}
            tera={tera}
            info={estimateFor(shown)}
            speciesName={speciesName(shown)}
            onSaveStats={onSaveStats}
            onStatsRead={() => onStatsRead(shown)}
            onOpenDetails={() => onOpenDetails(shown.id)}
            slot={shownSlot + 1}
            training={training}
            onRemove={() => onSetSlot(shownSlot + 1, null)}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
            {t('Your team is empty. Add a Pokémon from your roster to a slot.')}
          </p>
        )}
      </div>

      {/* ---------- choose from the roster ---------- */}
      <Dialog
        open={picking != null}
        onClose={() => setPicking(null)}
        wide
        title={t('Choose a Pokémon for slot {n}', { n: picking ?? 0 })}
      >
        {filling && (
          <p className="mb-2 flex items-center justify-between text-xs text-muted">
            <span>{t('{n} of 6 in the team', { n: team.filter(Boolean).length })}</span>
            <button type="button" onClick={() => setPicking(null)} className="rounded border border-line px-2 py-1 hover:text-ink">
              {t('Done')}
            </button>
          </p>
        )}
        <SearchInput value={query} onChange={setQuery} placeholder={t('Search the roster')} label={t('Search the roster')} className="mb-3" />
        {candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t('No Pokémon match this filter.')}</p>
        ) : (
          <ul className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {candidates.map((p) => {
              const inSlot = team.indexOf(p.id);
              const here = picking != null && inSlot === picking - 1;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (picking == null) return;
                      if (!here) onSetSlot(picking, p.id);
                      if (filling) {
                        // On to the next empty slot, in the order they were started; the dialog closes when none is left.
                        const next = nextEmpty(
                          team.map((x, i) => (i === picking - 1 ? p.id : x)),
                          picking - 1
                        );
                        setQuery('');
                        setPicking(next >= 0 ? next + 1 : null);
                      } else {
                        setPicking(null);
                      }
                    }}
                    className={`flex w-full flex-col items-center rounded-lg border px-2 py-2 text-center hover:bg-surface-2 ${
                      inSlot >= 0 ? 'border-star/50' : 'border-line'
                    }`}
                  >
                    <PokemonSprite p={p} size={56} animated={false} />
                    <span className="mt-0.5 w-full truncate text-xs font-medium">{name(p)}</span>
                    <span className="text-[10px] text-muted">
                      {t('Lv. {level}', { level: p.level })}
                      {inSlot >= 0 && ` · ${t('slot {n}', { n: inSlot + 1 })}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {picking != null && !filling && team[picking - 1] && (
          <button
            type="button"
            onClick={() => {
              onSetSlot(picking, null);
              setPicking(null);
            }}
            className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
          >
            {t('Empty this slot')}
          </button>
        )}
        <p className="mt-3 text-[11px] text-muted">
          {t('Choosing one that is already in the team swaps the two places.')}
        </p>
      </Dialog>
    </div>
    </div>
  );
}

/**
 * An arrow button that repeats while it is held: once on press, then after a short pause again and again,
 * faster the longer it is held. Keyboard presses (Enter/Space) act once per press.
 */
function HoldButton({
  onAct,
  className,
  children,
  ...rest
}: {
  onAct: () => void;
  className?: string;
  children: React.ReactNode;
  'aria-label': string;
}) {
  const act = useRef(onAct);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kept current after every render, so a repeat uses the latest values.
  useEffect(() => {
    act.current = onAct;
  });
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const repeat = (delay: number) => {
    timer.current = setTimeout(() => {
      act.current();
      repeat(Math.max(40, delay * 0.85));
    }, delay);
  };
  return (
    <button
      type="button"
      {...rest}
      className={`${className ?? ''} touch-none select-none`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        stop();
        act.current();
        repeat(400);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      // A pointer press already acted; a click with no pointer (the keyboard) acts here.
      onClick={(e) => {
        if (e.detail === 0) act.current();
      }}
    >
      {children}
    </button>
  );
}

/** One team member: the quick facts, the stats with arrows, and the EVs they imply. Remounted per Pokémon. */
function TeamDetail({
  p,
  gameId,
  lang,
  tera,
  info,
  speciesName,
  slot,
  training,
  onSaveStats,
  onStatsRead,
  onOpenDetails,
  onRemove,
}: {
  p: RosterView;
  gameId: string;
  lang: Lang;
  tera: boolean;
  info: EvEstimateInfo | undefined;
  speciesName: string;
  slot: number;
  training: keyof EvSpread | null;
  onSaveStats: (p: RosterView, stats: EvSpread | null, level: number, ratings: IvRatings) => void;
  onStatsRead: () => void;
  onOpenDetails: () => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const label = (x: { nameEn: string; nameEs: string } | null | undefined) => (x ? (lang === 'en' ? x.nameEn : x.nameEs) : '');
  const ratings: IvRatings = p.ivRatings ?? {};

  // Without recorded stats the arrows start from what a Pokémon with no EVs would show.
  const baseline = useMemo<EvSpread | null>(() => {
    if (!info) return null;
    const out = {} as EvSpread;
    for (const k of KEYS) out[k] = statValue(k, info.baseStats[k], 31, 0, p.level, info.nature);
    return out;
  }, [info, p.level]);

  const [stats, setStats] = useState<EvSpread | null>(p.currentStats ?? baseline);
  const [level, setLevel] = useState(p.level);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ stats, level });
  const saveRef = useRef(onSaveStats);
  const pRef = useRef(p);
  // Kept current after every render, so a save that fires later (or on leaving) uses the latest values.
  useEffect(() => {
    saveRef.current = onSaveStats;
    pRef.current = p;
  });

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    saveRef.current(pRef.current, latest.current.stats, latest.current.level, pRef.current.ivRatings ?? {});
  };
  // Leaving this Pokémon (or the view) saves what is pending.
  useEffect(() => flush, []);

  const touch = (nextStats: EvSpread | null, nextLevel: number) => {
    setStats(nextStats);
    setLevel(nextLevel);
    latest.current = { stats: nextStats, level: nextLevel };
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  // Reads the latest values, not the render's, so a held arrow keeps adding up between renders.
  const step = (key: keyof EvSpread, d: number) => {
    const base = latest.current.stats ?? baseline;
    if (!base) return;
    touch({ ...base, [key]: Math.min(999, Math.max(1, base[key] + d)) }, latest.current.level);
  };
  const stepLevel = (d: number) =>
    touch(latest.current.stats, Math.min(100, Math.max(1, latest.current.level + d)));

  const iv = ivAssumption(p.potential);
  const range = useMemo(
    () =>
      stats && info
        ? estimateEvRange({
            stats,
            level,
            baseStats: info.baseStats,
            nature: info.nature,
            ivsLow: iv.low,
            ratings,
            plan: p.evs,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats, level, info, iv.low, p.ivRatings, p.evs]
  );
  const evs = range?.estimate ?? p.currentEvs;
  const hints =
    stats && info && range
      ? levelHints({ stats, level, baseStats: info.baseStats, nature: info.nature, ratings, estimate: range.estimate })
      : null;
  // Waving the level hint away holds for this Pokémon, level and set of stats at their maximum.
  const [levelHintGone, goneLevelHint] = useDismissed(`level:${p.id}:${level}:${(hints?.atMax ?? []).join(',')}`);
  // The stats alone could allow more than a Pokémon can hold; what it can have is 510 at most.
  const highRaw = range ? evTotal(range.high) : 0;
  const total = evs ? evTotal(evs) : 0;
  const natureShown = mintInForce(p) ?? p.currentNature ?? p.targetNature;
  const nowNature = natureShown;
  const moves = p.moves.flatMap((m) => (m.move ? [m.move] : m.rawName ? [{ nameEn: m.rawName, nameEs: m.rawName, type: '' }] : []));
  // The stats the nature (or the Mint) in force raises and lowers, marked on both graphs like the game does.
  const KEY_OF_NATURE: Record<string, keyof EvSpread> = {
    attack: 'attack',
    defense: 'defense',
    'special-attack': 'specialAttack',
    'special-defense': 'specialDefense',
    speed: 'speed',
  };
  const natureNow = info?.live?.nature ?? info?.nature ?? null;
  const raised = natureNow?.increased ? KEY_OF_NATURE[natureNow.increased] : null;
  const lowered = natureNow?.decreased ? KEY_OF_NATURE[natureNow.decreased] : null;
  const natureMark = (key: keyof EvSpread) =>
    key === raised ? (
      <span className="font-bold text-danger" title={t('Raised by the nature')} aria-label={t('Raised by the nature')}>
        ↑
      </span>
    ) : key === lowered ? (
      <span className="font-bold text-sky-500" title={t('Lowered by the nature')} aria-label={t('Lowered by the nature')}>
        ↓
      </span>
    ) : null;
  const natureTint = (key: keyof EvSpread) => (key === raised ? 'text-danger' : key === lowered ? 'text-sky-500' : 'text-muted');
  const arrow =
    'grid h-9 w-11 place-items-center rounded-md border border-line bg-surface text-sm text-muted active:bg-surface-2 hover:text-ink';

  return (
    <article className="@container space-y-4 rounded-xl border border-line bg-surface p-4">
      {/* quick facts */}
      {/* Stays in view right under the site tabs and the training bar (its height is measured) while the rest of the card scrolls. */}
      <header className="z-10 -mx-4 -mt-4 flex flex-wrap items-start gap-3 rounded-t-xl border-b border-line bg-surface px-4 pb-3 pt-4 md:sticky md:top-[calc(var(--nav-h)+var(--team-bar,6rem))]">
        <PokemonSprite p={p} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">
              {p.nickname ?? speciesName}
              {genderMark(p) && (
                <span className={`ml-1.5 ${genderMark(p)!.color}`} title={genderMark(p)!.label[lang]}>
                  {genderMark(p)!.symbol}
                </span>
              )}
            </h2>
            {p.nickname && <span className="text-xs text-muted">{speciesName}</span>}
            <span className="text-xs text-muted">{t('slot {n}', { n: slot })}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.types.map((ty) => (
              <TypeBadge key={ty} type={ty} lang={lang} />
            ))}
            {tera && p.teraType && (
              <TeraBadge
                type={p.teraType}
                lang={lang}
                title={`${t('Tera type')}: ${lang === 'es' ? (TYPE_NAMES_ES[p.teraType] ?? p.teraType) : p.teraType}`}
              />
            )}
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted">{t('Nature')}</dt>
            <dd>
              {label(p.currentNature ?? p.targetNature) || '—'}
              {mintInForce(p) && <span className="text-muted"> · {t('Mint')}: {label(p.mintNature)}</span>}
            </dd>
            <dt className="text-muted">{t('Ability')}</dt>
            <dd>{label(p.ability) || '—'}</dd>
            <dt className="text-muted">{t('Held item')}</dt>
            <dd>{label(p.item) || p.itemNote || t('No item')}</dd>
            <dt className="text-muted">{t('Moves')}</dt>
            <dd>{moves.length ? moves.map((m) => label(m)).join(' · ') : '—'}</dd>
          </dl>
        </div>
        <div className="ml-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <PokedexButton speciesId={p.species.id} gameId={gameId} lang={lang} form={p.formSlug ?? ''} />
            <button
              type="button"
              onClick={onOpenDetails}
              title={t('Open full details')}
              aria-label={t('Open full details')}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted hover:text-ink"
            >
              <ExpandIcon />
            </button>
            <button
              type="button"
              onClick={onRemove}
              title={t('Remove from team')}
              aria-label={t('Remove from team')}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted hover:text-danger"
            >
              <MinusCircleIcon />
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted">{t('Level')}</span>
            <HoldButton className={arrow} aria-label={t('Lower the level')} onAct={() => stepLevel(-1)}>
              ▼
            </HoldButton>
            <span className="w-9 text-center text-lg font-semibold tabular-nums">{level}</span>
            <HoldButton className={arrow} aria-label={t('Raise the level')} onAct={() => stepLevel(1)}>
              ▲
            </HoldButton>
          </div>
        </div>
      </header>

      {p.currentStats && p.statsNature && nowNature && p.statsNature.id !== nowNature.id && (
        <div className="rounded-md border border-star/40 bg-star/10 px-3 py-2 text-xs text-star">
          <p>
            {t('These stats were read with {old}, and the game now applies {now}. Type the numbers it shows now, then confirm. Until then the EVs are worked out with {old}.', {
              old: label(p.statsNature),
              now: label(nowNature),
            })}
          </p>
          <button
            type="button"
            onClick={onStatsRead}
            className="mt-1.5 rounded border border-star/50 px-2 py-1 font-medium hover:bg-star/10"
          >
            {t('The stats are up to date')}
          </button>
        </div>
      )}

      {!info || !stats ? (
        <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
          {t('There is no data to draw the graphs for this Pokémon.')}
        </p>
      ) : (
        // Side by side when there is room, so the stats can be changed with the EVs they give in view.
        <div className="grid gap-x-8 gap-y-4 @[54rem]:grid-cols-2">
          {/* stats */}
          <section>
            <div className="mb-1 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{t('Stats')}</h3>
            </div>
            {hints?.overTotal != null && (
              <p role="alert" className="mb-1 text-xs text-pending">
                {t('These stats ask for {total} EVs, more than the 508 a Pokémon can use. If it has leveled up, change the level.', {
                  total: hints.overTotal,
                })}
              </p>
            )}
            {hints && hints.atMax.length > 0 && !levelHintGone && (
              <p className="mb-1 text-xs text-star">
                {t('{stats} at the most it can be at level {level}. If the game does not show its EVs full, it may have leveled up: check the level.', {
                  stats: hints.atMax.map((k) => STAT_LABELS[k][lang]).join(', '),
                  level,
                })}{' '}
                <button type="button" onClick={goneLevelHint} className="underline">
                  {t('Got it')}
                </button>
              </p>
            )}
            <HexChart
              values={stats}
              max={Math.max(150, ...KEYS.map((k) => stats[k])) * 1.05}
              color="#3b82f6"
              renderControl={(key) => (
                <div className="flex w-24 flex-col items-center gap-1 text-center">
                  <HoldButton className={arrow} aria-label={`${STAT_LABELS[key][lang]} +1`} onAct={() => step(key, 1)}>
                    ▲
                  </HoldButton>
                  <div className="leading-tight">
                    <span className={`block text-[10px] font-semibold uppercase ${natureTint(key)}`}>
                      {STAT_LABELS[key][lang]} {natureMark(key)}
                    </span>
                    <span className="block text-base font-bold tabular-nums">{stats[key]}</span>
                  </div>
                  <HoldButton className={arrow} aria-label={`${STAT_LABELS[key][lang]} −1`} onAct={() => step(key, -1)}>
                    ▼
                  </HoldButton>
                </div>
              )}
            />
          </section>

          {/* EVs */}
          <section>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{t('EVs')}</h3>
              <p className="text-xs text-muted">
                {t('Total {total} / 508', { total })} · {t('{n} EVs still to spend', { n: Math.max(0, 508 - total) })}
              </p>
            </div>
            <HexChart
              values={evs ?? { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 }}
              max={252}
              overlay={p.evs}
              color="#22c55e"
              shine={HEX_ORDER.filter((k) => (evs?.[k] ?? 0) >= 252)}
              renderControl={(key) => {
                const have = evs?.[key] ?? 0;
                const plan = p.evs?.[key];
                return (
                  <div className="w-20 text-center leading-tight">
                    <span className={`block text-[10px] font-semibold uppercase ${natureTint(key)}`}>
                      {STAT_LABELS[key][lang]} {natureMark(key)}
                    </span>
                    <span className={`block text-base font-bold tabular-nums ${have >= 252 ? 'text-star' : ''}`}>
                      {have >= 252 && <span aria-hidden>✦ </span>}
                      {have}
                    </span>
                    {plan != null && <span className="block text-[10px] text-muted">/ {plan}</span>}
                  </div>
                );
              }}
            />
            {highRaw >= 508 && (
              <p role="note" className="mt-2 text-xs text-star">
                {t('Not every IV is known, so it may already have the most EVs it can use (508). If so, the EVs it gains in battle are lost: lower a stat it does not need (with a berry) first.')}
              </p>
            )}
            {/* The plan in numbers: what is still to train in each stat, and which ones to stop at. */}
            {p.evs ? (
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {HEX_ORDER.map((key) => {
                  const have = evs?.[key] ?? 0;
                  const target = p.evs![key];
                  const left = target - have;
                  const state = target === 0 && have === 0 ? 'none' : left > 0 ? 'todo' : left === 0 ? 'done' : 'over';
                  return (
                    <li
                      key={key}
                      className={`rounded-lg border px-2 py-1.5 text-center leading-tight ${training === key ? 'ring-2 ring-offset-1 ring-offset-surface' : ''} ${
                        state === 'done'
                          ? 'border-done/50 bg-done/10'
                          : state === 'over'
                            ? 'border-danger/60 bg-danger/10'
                            : state === 'todo'
                              ? 'border-pending/50 bg-pending/10'
                              : 'border-line'
                      }`}
                    >
                      <span className="block text-[10px] font-semibold uppercase text-muted">{STAT_LABELS[key][lang]}</span>
                      <span className="block text-sm font-bold tabular-nums">
                        {have} <span className="font-normal text-muted">/ {target}</span>
                      </span>
                      <span
                        className={`block text-[11px] font-medium ${
                          state === 'done' ? 'text-done' : state === 'over' ? 'text-danger' : state === 'todo' ? 'text-pending' : 'text-muted'
                        }`}
                      >
                        {state === 'done'
                          ? `✓ ${t('Done')}`
                          : state === 'over'
                            ? t('{n} over the plan', { n: -left })
                            : state === 'todo'
                              ? t('{n} to go', { n: left })
                              : '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-line px-3 py-2 text-center text-xs text-muted">
                {t('No EV plan yet. Fix one in the audit or set a target in the full details.')}
              </p>
            )}
            <p className="mt-1 text-center text-[11px] text-muted">
              {range ? t('Worked out from the stats.') : t('The EVs on record.')}
              {p.evs ? ` ${t('The dashed line is your plan.')}` : ''}
              {natureShown ? '' : ` ${t('Its nature is not set, so none is applied.')}`}
            </p>
          </section>
        </div>
      )}
    </article>
  );
}
