'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AiBadge } from '../AiBadge';
import { AuditPanel } from '../AuditPanel';
import { BoltIcon, EyeIcon, EyeOffIcon, SparklesIcon } from '../ActionIcons';
import { AiHelp, AiUnavailable, useAiAccess } from '../AiAccess';
import { ConfirmDialog } from '../Dialog';
import { PokedexButton } from '../PokemonInfoDialog';
import { StatsEvsEditor, type EvEstimateInfo } from '../StatsEvs';
import { TypeBadge } from '../TypeBadge';
import { ComboInput, GenderControl, PokemonSprite, PotentialSelect, TaskToggle, progressOf, type Gender } from './parts';
import { mintInForce } from '@/lib/mint';
import { auditAsk } from '@/lib/audit-ask';
import { auditSuggestions } from '@/lib/audit-compare';
import { evTotal, formatEvs, type EvSpread } from '@/lib/import/evs';
import type { Lang } from '@/lib/i18n';
import type { IvRatings } from '@/lib/iv-ratings';
import { TYPE_COLORS, TYPE_NAMES_ES, TYPE_SLUGS } from '@/lib/pokemon-types';
import type { EditorOptions, RosterView } from '@/lib/roster';
import type { TaskKey, TaskStatus } from '@/lib/roster-status';
import { useT } from '@/lib/translate-client';
import { KeeperIcon, TrainingIcon } from '../KeeperIcon';
import { EggIcon, TrashIcon } from '../ActionIcons';

type Named = { id: number; nameEn: string; nameEs: string };

/** Short stat names for the +/− shown next to a nature. */
const STAT_SHORT: Record<string, { en: string; es: string }> = {
  attack: { en: 'Atk', es: 'Atq' },
  defense: { en: 'Def', es: 'Def' },
  'special-attack': { en: 'SpA', es: 'AtEsp' },
  'special-defense': { en: 'SpD', es: 'DefEsp' },
  speed: { en: 'Spe', es: 'Vel' },
};

/**
 * The stage it is at now (switch it when it evolves in the game, or back if it was recorded at the wrong
 * one) and the stage it is meant to end as, which the audit judges. Only shown for lines with several stages.
 */
function StagePanel({
  p,
  label,
  onStage,
}: {
  p: RosterView;
  label: (x: Named) => string;
  onStage: (body: { speciesId?: number; finalSpeciesId?: number | null }) => Promise<string | null>;
}) {
  const { t } = useT();
  const key = `${p.id}:${p.species.id}:${p.finalSpecies?.id ?? ''}`;
  const [loaded, setLoaded] = useState<{ key: string; before: Named[]; after: Named[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/roster/${p.id}/evolve`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setLoaded({ key, before: data.before, after: data.after }))
      .catch(() => {});
    return () => controller.abort();
  }, [p.id, key]);
  const stages = loaded?.key === key ? loaded : null;
  if (!stages || stages.before.length + stages.after.length === 0) return null;

  async function run(body: { speciesId?: number; finalSpeciesId?: number | null }) {
    setBusy(true);
    setError(null);
    const message = await onStage(body);
    setBusy(false);
    if (message) setError(message);
  }
  const button = 'rounded-md border border-line px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40';
  return (
    <div className="mt-2 w-full space-y-1.5 text-xs" title={t('The stage it is at now. Switch it when it evolves in the game.')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted">{t('Stage')}:</span>
        {[...stages.before].reverse().map((prev) => (
          <button key={prev.id} disabled={busy} onClick={() => run({ speciesId: prev.id })} className={button}>
            ← {label(prev)}
          </button>
        ))}
        {stages.after.map((next) => (
          <button key={next.id} disabled={busy} onClick={() => run({ speciesId: next.id })} className={button}>
            {label(next)} →
          </button>
        ))}
        {stages.after.length > 0 && (
          <label className="ml-2 flex items-center gap-1.5 text-muted">
            {t('Final stage')}
            <select
              value={p.finalSpecies?.id ?? ''}
              disabled={busy}
              onChange={(e) => run({ finalSpeciesId: Number(e.target.value) || null })}
              className="rounded-md border border-line bg-bg px-2 py-1.5 text-ink"
            >
              <option value="">{label(p.species)} ({t('this one')})</option>
              {stages.after.map((s) => (
                <option key={s.id} value={s.id}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-[10px] text-muted">
        {t('The audit and the EV plan are for the final stage. Stats are read with the base stats of the stage it is at, so enter them again after it evolves.')}
      </p>
      {error && <p className="text-pending">{error}</p>}
    </div>
  );
}

const inputClass = 'w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm';

function Field({
  label,
  hint,
  children,
  action,
  actionBesideLabel,
}: {
  label: string;
  hint?: string;
  children?: React.ReactNode;
  /** A status toggle that sits beside the control. */
  action?: React.ReactNode;
  /** Puts the action next to the label, with the control below it. */
  actionBesideLabel?: boolean;
}) {
  if (actionBesideLabel) {
    return (
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">{label}</span>
          {action}
        </div>
        {children}
        {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
      </div>
    );
  }
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {action}
      </div>
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

/** `columns` lays the fields out side by side when there is room instead of one per row. */
function Section({ title, columns, children }: { title: string; columns?: 2 | 3; children: React.ReactNode }) {
  // Container queries: what matters is the width this section gets, not the screen's.
  const grid =
    columns === 3 ? 'grid gap-3 @xl:grid-cols-3' : columns === 2 ? 'grid gap-3 @md:grid-cols-2' : 'space-y-3';
  return (
    <section className="@container space-y-3">
      <h3 className="section-title border-b border-line pb-1.5">{title}</h3>
      <div className={grid}>{children}</div>
    </section>
  );
}

/**
 * Who made the audit being shown, so its suggestions are not all called the AI's: a model, the rules of the
 * quick audit, or the parts the player fixed (when nothing was left to ask).
 */
type MadeBy = 'ai' | 'rules' | 'fixed';
const SuggestedBy = createContext<MadeBy>('ai');

/** The audit's answer for one field: it matches what the Pokémon has, or here is what it suggests. */
function Suggestion({
  same,
  title,
  onApply,
  children,
}: {
  same: boolean;
  /** The reason the AI gave. */
  title?: string;
  onApply?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const by = useContext(SuggestedBy);
  if (same) {
    return (
      <p className="mt-1 text-[11px] text-done">
        ✓ {by === 'rules' ? t('Matches the quick audit') : by === 'fixed' ? t('Matches the audit') : t('Matches the AI audit')}
      </p>
    );
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" title={title}>
      <span className="text-pending">
        {by === 'ai' && <AiBadge className="mr-1" />} {by === 'rules' ? t('Quick audit suggests') : by === 'fixed' ? t('The audit suggests') : t('AI suggests')}:{' '}
        <span className="font-medium">{children}</span>
      </span>
      {onApply && (
        <button
          type="button"
          onClick={onApply}
          className="rounded border border-line px-1.5 py-0.5 text-muted hover:border-done/50 hover:text-done"
        >
          {t('Apply')}
        </button>
      )}
    </p>
  );
}

/** The stats section: type the stats and level, see the EVs. Saves when you click away. */
function StatsSection({
  p,
  info,
  onSave,
  onStatsRead,
  onMaxed,
}: {
  p: RosterView;
  info?: EvEstimateInfo;
  onSave: (stats: EvSpread | null, level: number, ratings: IvRatings) => void;
  /** The numbers on record were read again under the nature effect in force now. */
  onStatsRead: () => void;
  /** Saves which stats the game shows sparkling (252 EVs). */
  onMaxed: (maxed: (keyof EvSpread)[]) => void;
}) {
  const { t, lang } = useT();
  const pickName = (n: { nameEn: string; nameEs: string } | null) => (n ? (lang === 'en' ? n.nameEn : n.nameEs) : '');
  const nowNature = mintInForce(p) ?? p.currentNature ?? p.targetNature;
  // A Mint (or another nature) came after the stats were read: the numbers are not read under what the game applies now.
  const staleStats = Boolean(p.currentStats && p.statsNature && nowNature && p.statsNature.id !== nowNature.id);
  const statsNatureName = pickName(p.statsNature);
  const nowNatureName = pickName(nowNature);
  const [stats, setStats] = useState<EvSpread | null>(p.currentStats);
  const [level, setLevel] = useState(p.level);
  const [ratings, setRatings] = useState<IvRatings>(p.ivRatings ?? {});
  const [maxed, setMaxed] = useState(p.maxedEvs);
  const commit = () => {
    const next = stats && evTotal(stats) > 0 ? stats : null;
    const changed =
      JSON.stringify(next) !== JSON.stringify(p.currentStats) ||
      level !== p.level ||
      JSON.stringify(ratings) !== JSON.stringify(p.ivRatings ?? {});
    if (changed) onSave(next, level, ratings);
  };
  return (
    <div className="space-y-2">
    {staleStats && (
      <div className="rounded-md border border-star/40 bg-star/10 px-3 py-2 text-xs text-star">
        <p>
          {t('These stats were read with {old}, and the game now applies {now}. Type the numbers it shows now, then confirm. Until then the EVs are worked out with {old}.', {
            old: statsNatureName,
            now: nowNatureName,
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
    <StatsEvsEditor
      stats={stats}
      level={level}
      ratings={ratings}
      onChange={(nextStats, nextLevel, nextRatings) => {
        setStats(nextStats);
        setLevel(nextLevel);
        setRatings(nextRatings);
      }}
      onCommit={commit}
      info={info}
      potential={p.potential}
      savedEvs={p.currentEvs}
      savedEstimated={p.currentEvsEstimated}
      plan={p.evs}
      maxed={maxed}
      onMaxedChange={(next) => {
        setMaxed(next);
        onMaxed(next);
      }}
      hintKey={p.id}
    />
    </div>
  );
}

/**
 * Everything about one Pokémon, editable in place. Selects save as soon as you
 * choose; text boxes save when you click away. Parents give it `key={p.id}` so
 * the drafts start fresh for each Pokémon.
 */
export function RosterDetail({
  gameId,
  p,
  options,
  lang,
  judge,
  evs,
  evTarget,
  tera,
  mints,
  breeding,
  estimate,
  numberLabel,
  auditing,
  auditOpen,
  onToggle,
  onSet,
  onGender,
  onPotential,
  onSaveStats,
  onAudit,
  onQuickAudit,
  onToggleAudit,
  onBreeder,
  onRemove,
  onStage,
  teamSlot,
  teamFull,
  onAddToTeam,
}: {
  gameId: string;
  p: RosterView;
  options: EditorOptions;
  lang: Lang;
  judge: boolean;
  evs: boolean;
  evTarget: boolean;
  /** The game has Tera types. */
  tera: boolean;
  /** The game has Mints. */
  mints: boolean;
  /** The game has breeding: a nature can start a breeding plan. */
  breeding: boolean;
  estimate?: EvEstimateInfo;
  numberLabel: string;
  auditing: boolean;
  auditOpen: boolean;
  onToggle: (key: TaskKey, current: TaskStatus) => void;
  /** Saves fields; resolves to an error message, or null when it worked. */
  onSet: (set: Record<string, unknown>) => Promise<string | null>;
  /** Moves it to another stage of its line, or sets the stage it is meant to end as. */
  onStage: (body: { speciesId?: number; finalSpeciesId?: number | null }) => Promise<string | null>;
  /** The team slot it is in (1 to 6), or null. */
  teamSlot: number | null;
  teamFull: boolean;
  onAddToTeam: () => void;
  onGender: (g: Gender) => void;
  onPotential: (v: RosterView['potential']) => void;
  onSaveStats: (stats: EvSpread | null, level: number, ratings: IvRatings) => void;
  onAudit: (refresh: boolean, deep: boolean) => void;
  /** The audit made from game data alone, which needs no AI. */
  onQuickAudit: () => void;
  onToggleAudit: () => void;
  /** Adds it to, or takes it off, the breeders. */
  onBreeder: (on: boolean) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const { enabled: aiEnabled } = useAiAccess();
  const label = (x: Named | null | undefined) => (x ? (lang === 'en' ? x.nameEn : x.nameEs) : '');
  // The name in the other language: the suggestion list matches on it too.
  const other = (x: Named) => (lang === 'en' ? x.nameEs : x.nameEn);
  const mintName = (n: Named) => (lang === 'en' ? `${n.nameEn} Mint` : `Menta ${n.nameEs}`);
  const mintEffect = mintInForce(p) != null;
  const stat = (slug: string) => (STAT_SHORT[slug] ? STAT_SHORT[slug][lang] : slug);
  const find = (list: Named[], text: string) => {
    const q = text.trim().toLowerCase();
    return list.find((x) => x.nameEn.toLowerCase() === q || x.nameEs.toLowerCase() === q);
  };

  const [error, setError] = useState<string | null>(null);
  // A new audit replaces the one the card shows, so it is confirmed when there is one.
  const [replacing, setReplacing] = useState<'quick' | 'ai' | null>(null);
  const [nickname, setNickname] = useState(p.nickname ?? '');
  const savedEvs = p.evs ? formatEvs(p.evs) : '';
  const [targetEvs, setTargetEvs] = useState(savedEvs);
  // The plan can be fixed from the audit, outside this box: show what was saved.
  const [shownSaved, setShownSaved] = useState(savedEvs);
  if (shownSaved !== savedEvs) {
    setShownSaved(savedEvs);
    setTargetEvs(savedEvs);
  }

  const prog = progressOf(p);

  /** Saves, and shows what went wrong next to the thing that was edited. */
  async function save(set: Record<string, unknown>) {
    setError(null);
    const message = await onSet(set);
    if (message) setError(message);
  }

  const savedMove = (slot: number) => {
    const m = p.moves.find((x) => x.slot === slot);
    return m ? (m.move ? label(m.move) : (m.rawName ?? '')) : '';
  };

  async function commitMove(slot: number, text: string) {
    if (text.trim() === savedMove(slot).trim()) return;
    if (!text.trim()) {
      await save({ moves: [{ slot, moveId: null }] });
      return;
    }
    const move = find(options.moves, text);
    if (!move) {
      setError(t('Move {n}: "{name}" is not a known move. Pick one from the suggestions.', { n: slot, name: text }));
      return;
    }
    await save({ moves: [{ slot, moveId: move.id }] });
  }

  // Shown in the current language, so it follows the language switch.
  const itemText = p.item ? label(p.item) : (p.itemNote ?? '');

  async function commitItem(item: string) {
    const current = itemText;
    if (item.trim() === current.trim()) return;
    // "No item" in either language takes the item (and any note) away.
    if (['no item', 'sin objeto'].includes(item.trim().toLowerCase())) {
      if (p.item || p.itemNote) await save({ itemId: null, itemNote: null });
      return;
    }
    const matched = item.trim() ? find(options.items, item) : undefined;
    await save({
      itemId: matched?.id ?? null,
      // Text that is not an exact item name is kept as a note ("Life Orb or Choice Band").
      itemNote: item.trim() && !matched ? item.trim() : null,
    });
  }

  // The ability it has stays selectable even if the species cannot normally have it.
  const abilityChoices =
    p.ability && !p.abilityOptions.some((a) => a.id === p.ability!.id)
      ? [...p.abilityOptions, { ...p.ability, isHidden: false }]
      : p.abilityOptions;


  // What the saved audit suggests against what it has now (the answer may be older than the latest edits).
  const sug = auditSuggestions(p.audit?.result as Parameters<typeof auditSuggestions>[0], {
    item: p.item?.nameEn ?? p.itemNote,
    moves: p.moves.flatMap((m) => (m.move ? [m.move.nameEn] : [])),
    tera: p.teraType,
    mintGiven: mintInForce(p)?.nameEn ?? null,
    realNature: (p.currentNature ?? p.targetNature)?.nameEn ?? null,
    evs: p.evs ? formatEvs(p.evs) : null,
  });
  const itemOf = (name: string) => find(options.items, name);
  const moveOf = (name: string) => find(options.moves, name);
  const natureOf = (name: string) => options.natures.find((n) => n.nameEn.toLowerCase() === name.toLowerCase());
  // The nature a breeding plan would aim for: the one planned, else the one the audit suggests.
  const breedNature = p.targetNature ?? (sug.nature ? natureOf(sug.nature.nature) : undefined);
  const itemName = (name: string) => label(itemOf(name)) || name;
  const moveName = (name: string) => label(moveOf(name)) || name;
  const typeName = (type: string) => (lang === 'es' ? (TYPE_NAMES_ES[type] ?? type) : type);
  const mintLabel = (nature: string) => {
    const n = natureOf(nature);
    return n ? mintName(n) : nature;
  };
  // The summary at the top of the audit: what it has now, what the AI suggests, and whether they agree.
  const dash = '—';
  const compareRows: { key: string; label: string; now: string; ai: string; same: boolean }[] = [
    ...(sug.item
      ? [{ key: 'item', label: t('Held item'), now: itemText || dash, ai: itemName(sug.item.name), same: sug.item.same }]
      : []),
    ...(sug.moves
      ? [
          {
            key: 'moves',
            label: t('Moves'),
            now: p.moves.flatMap((m) => (m.move ? [label(m.move)] : [])).join(', ') || dash,
            ai: sug.moves.map((m) => moveName(m.move)).join(', '),
            same: sug.moves.every((m) => m.has),
          },
        ]
      : []),
    ...(sug.tera
      ? [{ key: 'tera', label: t('Tera type'), now: p.teraType ? typeName(p.teraType) : dash, ai: typeName(sug.tera.type), same: sug.tera.same }]
      : []),
    ...(sug.nature
      ? [
          {
            key: 'nature',
            label: t('Nature'),
            now: label(p.currentNature ?? p.targetNature) || dash,
            ai: label(natureOf(sug.nature.nature)) || sug.nature.nature,
            same: sug.nature.same,
          },
        ]
      : []),
    ...(sug.mint
      ? [
          {
            key: 'mint',
            label: t('Mint'),
            now: p.mintNature ? mintName(p.mintNature) : t('No mint'),
            ai: sug.mint.keep && !p.mintNature ? t('No mint') : mintLabel(sug.mint.nature),
            same: sug.mint.same,
          },
        ]
      : []),
    ...(sug.evs
      ? [{ key: 'evs', label: t('EV plan'), now: p.evs ? formatEvs(p.evs) : dash, ai: sug.evs.spread, same: sug.evs.same }]
      : []),
  ];

  /**
   * The n-th suggested move goes to the n-th slot. When the Pokémon already has it in another slot the two swap,
   * so a move is never listed twice.
   */
  function applyMove(name: string, slot: number) {
    const move = moveOf(name);
    if (!move) return;
    const slotOf = (n: number) => p.moves.find((x) => x.slot === n);
    const there = [1, 2, 3, 4].find((n) => slotOf(n)?.move?.id === move.id);
    const displaced = slotOf(slot)?.move;
    const changes: { slot: number; moveId: number | null }[] = [{ slot, moveId: move.id }];
    if (there != null && there !== slot) changes.push({ slot: there, moveId: displaced?.id ?? null });
    void save({ moves: changes });
  }

  const madeBy: MadeBy = p.audit?.provider === 'rules' ? 'rules' : p.audit?.provider === 'fixed' ? 'fixed' : 'ai';
  // With every part fixed an AI audit has nothing to ask, so it costs nothing (see auditAsk).
  const asksNothing = auditAsk(p, { hasEvs: evs, hasTera: tera, hasMint: mints }).nothingToAsk;
  return (
    <SuggestedBy.Provider value={madeBy}>
    <article className="@container rounded-xl border border-line bg-surface p-4">
      {/* ---------- header ---------- */}
      <header className="flex flex-wrap items-start gap-4">
        <PokemonSprite p={p} size={96} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{label(p.species)}</h2>
            <PokedexButton speciesId={p.species.id} gameId={gameId} lang={lang} form={p.formSlug ?? ''} />
            <span className="readout text-xs text-muted">{numberLabel}</span>
            {p.finalSpecies && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">→ {label(p.finalSpecies)}</span>
            )}
            {/* min-w-0 all the way down, so on a narrow screen the nickname box shrinks instead of pushing the page wide. */}
            <div className="ml-auto flex min-w-0 max-w-full items-center gap-2 text-xs">
              <label className="flex min-w-0 items-center gap-2 text-muted">
                {t('Nickname')}
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  onBlur={() => nickname.trim() !== (p.nickname ?? '') && save({ nickname: nickname.trim() || null })}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="w-40 min-w-0 rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink"
                />
              </label>
              <button
                onClick={onRemove}
                title={t('Remove')}
                aria-label={t('Remove')}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted hover:text-danger"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted">
            {p.baseSpecies ? t('from {name}', { name: label(p.baseSpecies) }) : ''}
            {p.origin !== 'UNKNOWN' ? `${p.baseSpecies ? ' · ' : ''}${p.origin === 'BRED' ? t('bred') : t('caught')}` : ''}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.types.map((type) => (
              <TypeBadge key={type} type={type} lang={lang} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              aria-pressed={p.keeper}
              onClick={() => save({ keeper: !p.keeper })}
              title={t('A keeper: finished and kept for good. Marked ones show crossed swords and can be filtered.')}
              className={`rounded-md border px-2.5 py-1 ${p.keeper ? 'border-violet-500/60 bg-violet-500/10 font-semibold text-violet-500' : 'border-line text-muted hover:text-ink'}`}
            >
              <span className="flex items-center gap-1.5">
                <KeeperIcon size={16} />
                {t('Keeper')}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={p.training}
              onClick={() => save({ training: !p.training })}
              title={t('Being trained right now. A keeper is not being trained, so marking one clears the other.')}
              className={`rounded-md border px-2.5 py-1 ${p.training ? 'border-teal-500/60 bg-teal-500/10 font-semibold text-teal-500' : 'border-line text-muted hover:text-ink'}`}
            >
              <span className="flex items-center gap-1.5">
                <TrainingIcon size={16} />
                {t('Training')}
              </span>
            </button>
            {teamSlot != null ? (
              <span className="rounded-md border border-line px-2.5 py-1 text-muted">
                {t('In the team, slot {n}', { n: teamSlot })}
              </span>
            ) : (
              <button
                type="button"
                onClick={onAddToTeam}
                disabled={teamFull}
                title={teamFull ? t('The team is full (6)') : t('Add to the team')}
                className="rounded-md border border-line px-2.5 py-1 text-muted hover:text-ink disabled:opacity-40"
              >
                + {t('Add to the team')}
              </button>
            )}
          </div>
          <StagePanel p={p} label={label} onStage={onStage} />
          <div className="mt-2 flex items-center gap-3">
            <span className={`text-sm font-semibold ${prog.complete ? 'text-done' : 'text-pending'}`}>
              {prog.complete ? t('Ready') : `${prog.done}/${prog.total}`}
            </span>
            <span className="h-2 w-40 overflow-hidden rounded-full bg-bg">
              <motion.span
                className={`block h-full rounded-full ${prog.complete ? 'bg-done' : 'bg-pending'}`}
                animate={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }}
                transition={{ type: 'spring', stiffness: 160, damping: 22 }}
              />
            </span>
          </div>
        </div>
      </header>

      <p className="mt-3 text-xs text-muted">
        <span className="text-pending">{t('Orange')}</span> = {t('still to do')},{' '}
        <span className="text-done">{t('green')}</span> = {t('done')}. {t('Click any chip to flip it.')}
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
          {error}
        </p>
      )}

      {/* ---------- body ---------- */}
      <div className="mt-4 grid gap-6 @2xl:grid-cols-2">
        <div className="space-y-5">
          <Section title={t('Basics')}>
            <div className="flex flex-wrap gap-2">
              <TaskToggle
                status={p.owned ? 'DONE' : 'PENDING'}
                onToggle={() => onToggle('owned', p.owned ? 'DONE' : 'PENDING')}
                label={p.owned ? t('I have it') : t('I do not have it')}
                title={p.owned ? t('You have this Pokémon. Click to undo') : t('Not obtained yet. Click when you have it')}
              />
              <TaskToggle
                status={p.roles.includes('BREEDER') ? 'DONE' : 'PENDING'}
                onToggle={() => onBreeder(!p.roles.includes('BREEDER'))}
                label={p.roles.includes('BREEDER') ? t('Is a breeder') : t('Not a breeder')}
                title={t('A breeder is kept on the Breeders page with its IVs, and used as a parent by the breeding planner.')}
              />
              {breeding && p.planId && (
                <Link
                  href={`/${gameId}/breeding?plan=${p.planId}`}
                  className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-done hover:bg-surface-2"
                  title={t('Open its breeding plan')}
                >
                  <EggIcon size={14} /> {t('Has a breeding plan')}
                </Link>
              )}
            </div>
            <Field label={t('Gender')} hint={t('Used by the breeding planner to know which parents you have.')}>
              <GenderControl p={p} onChange={onGender} />
            </Field>
          </Section>

          <Section title={t('Build')}>
            <Field
              label={t('Nature')}
              action={
                breeding && breedNature && (
                  <Link
                    href={`/${gameId}/breeding?${new URLSearchParams({ species: String(p.species.id), nature: String(breedNature.id) })}`}
                    className="inline-flex rounded border border-line p-1 text-muted hover:bg-surface-2 hover:text-ink"
                    title={`${t('Plan a breed')}: ${label(p.species)} · ${label(breedNature)}. ${t('31 in every IV')}`}
                    aria-label={t('Plan a breed')}
                  >
                    <EggIcon size={14} />
                  </Link>
                )
              }
              hint={
                p.currentNature && p.targetNature && p.currentNature.id !== p.targetNature.id
                  ? t('It has {current} now; you are aiming for {target}.', {
                      current: label(p.currentNature),
                      target: label(p.targetNature),
                    })
                  : undefined
              }
            >
              <select
                value={p.targetNature?.id ?? 0}
                onChange={(e) => save({ targetNatureId: Number(e.target.value) || null })}
                className={inputClass}
              >
                <option value={0}>{t('No nature planned')}</option>
                {options.natures.map((n) => (
                  <option key={n.id} value={n.id}>
                    {label(n)}
                    {n.increased ? ` (+${stat(n.increased)} −${stat(n.decreased!)})` : ''}
                  </option>
                ))}
              </select>
              {sug.nature &&
                (sug.nature.same ? (
                  <Suggestion same>{null}</Suggestion>
                ) : (
                  <Suggestion
                    same={false}
                    title={sug.nature.reason}
                    onApply={() => {
                      const n = natureOf(sug.nature!.nature);
                      if (n) void save({ targetNatureId: n.id });
                    }}
                  >
                    {label(natureOf(sug.nature.nature)) || sug.nature.nature}
                  </Suggestion>
                ))}
            </Field>
            <Field
              label={t('Mint')}
              action={
                p.mintNature && (
                  <TaskToggle
                    status={p.mintStatus}
                    onToggle={() => save({ mintStatus: p.mintStatus === 'DONE' ? 'PENDING' : 'DONE' })}
                    title={p.mintStatus === 'DONE' ? t('Mint given. Click to undo') : t('Click once you have given the Mint')}
                  />
                )
              }
              hint={
                mintEffect
                  ? t('The game now shows the effect of {nature}; its real nature stays {real}. The stats chart uses the mint.', {
                      nature: label(p.mintNature),
                      real: label(p.currentNature ?? p.targetNature) || '—',
                    })
                  : p.mintNature
                    ? t('Mint chosen but not given yet: the stats stay as they are until you mark it given.')
                    : t('A Mint changes which stats the nature raises and lowers, without changing the nature itself.')
              }
            >
              <select
                value={p.mintNature?.id ?? 0}
                onChange={(e) => save({ mintNatureId: Number(e.target.value) || null })}
                className={inputClass}
              >
                <option value={0}>{t('No mint')}</option>
                {options.natures
                  .filter((n) => n.increased || n.slug === 'serious')
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {mintName(n)}
                      {n.increased ? ` (+${stat(n.increased)} −${stat(n.decreased!)})` : ` (${t('no change')})`}
                    </option>
                  ))}
              </select>
              {sug.mint &&
                (sug.mint.same ? (
                  <Suggestion same>{null}</Suggestion>
                ) : (
                  <Suggestion
                    same={false}
                    title={sug.mint.reason}
                    onApply={() => {
                      const n = natureOf(sug.mint!.nature);
                      if (n) void save({ mintNatureId: n.id });
                    }}
                  >
                    {mintLabel(sug.mint.nature)}
                  </Suggestion>
                ))}
            </Field>
            <Field
              label={t('Ability')}
              hint={
                p.abilityLegal === false
                  ? t('{name} cannot have this ability', { name: label(p.species) })
                  : undefined
              }
            >
              <select
                value={p.ability?.id ?? 0}
                onChange={(e) => save({ abilityId: Number(e.target.value) || null })}
                className={inputClass}
              >
                <option value={0}>{t('No ability')}</option>
                {abilityChoices.map((a) => (
                  <option key={a.id} value={a.id}>
                    {label(a)}
                    {a.isHidden ? ` (${t('hidden')})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t('Held item')}
              hint={t('Pick from the list, or type your own note such as “Vidasfera o Cinta Elegida”.')}
              action={
                (p.item || p.itemNote) && (
                  <TaskToggle status={p.itemStatus} onToggle={() => onToggle('item', p.itemStatus)} />
                )
              }
            >
              <div className="flex items-center gap-2">
                {p.item?.spriteUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.item.spriteUrl} alt="" width={24} height={24} className="sprite shrink-0" />
                )}
                <ComboInput
                  list="detail-items"
                  value={itemText}
                  placeholder={t('No item')}
                  onCommit={commitItem}
                  className={inputClass}
                />
              </div>
              {sug.item && (
                <Suggestion
                  same={sug.item.same}
                  title={sug.item.reason}
                  onApply={() => {
                    const match = itemOf(sug.item!.name);
                    void save({ itemId: match?.id ?? null, itemNote: match ? null : sug.item!.name });
                  }}
                >
                  {itemName(sug.item.name)}
                </Suggestion>
              )}
            </Field>
            <Field
              label={t('Tera type')}
              action={
                p.teraType && <TaskToggle status={p.teraStatus} onToggle={() => onToggle('tera', p.teraStatus)} />
              }
            >
              <select
                value={p.teraType ?? ''}
                onChange={(e) => save({ teraType: e.target.value || null })}
                className={inputClass}
              >
                <option value="">{t('Not planned')}</option>
                {TYPE_SLUGS.map((type) => (
                  <option key={type} value={type}>
                    {lang === 'es' ? TYPE_NAMES_ES[type] : type}
                  </option>
                ))}
              </select>
              {sug.tera && (
                <Suggestion
                  same={sug.tera.same}
                  title={sug.tera.reason}
                  onApply={() => void save({ teraType: sug.tera!.type })}
                >
                  {typeName(sug.tera.type)}
                </Suggestion>
              )}
            </Field>
          </Section>
        </div>

        <div className="space-y-5">
          <Section title={t('Moves')}>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((slot) => {
                const m = p.moves.find((x) => x.slot === slot);
                const exists = Boolean(m && (m.move || m.rawName));
                return (
                  <div key={slot} className="flex items-center gap-2">
                    {exists && m ? (
                      <TaskToggle
                        status={m.status}
                        onToggle={() => onToggle(`move:${slot}`, m.status)}
                        accent={m.move ? TYPE_COLORS[m.move.type] : undefined}
                        warning={
                          m.move == null
                            ? t('This move name was not recognised. Edit the Pokémon to fix it')
                            : m.legal === false
                              ? t('{name} cannot learn this move in this game', { name: label(p.species) })
                              : undefined
                        }
                      />
                    ) : (
                      <span className="w-[3.1rem] shrink-0 text-center text-xs text-muted">—</span>
                    )}
                    <ComboInput
                      list="detail-moves"
                      value={savedMove(slot)}
                      placeholder={t('Move {n}', { n: slot })}
                      aria-label={t('Move {n}', { n: slot })}
                      onCommit={(text) => commitMove(slot, text)}
                      className={inputClass}
                    />
                    {savedMove(slot) && (
                      <button
                        type="button"
                        onClick={() => void commitMove(slot, '')}
                        aria-label={t('Remove this move')}
                        title={t('Remove this move')}
                        className="shrink-0 rounded border border-line px-2 py-1.5 text-xs text-muted hover:text-danger"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {sug.moves && (
              <div className="rounded-md border border-line bg-bg p-2 text-[11px]">
                <p className="mb-1 text-muted">
                  {madeBy === 'ai' && <AiBadge className="mr-1" />}{' '}
                  {madeBy === 'rules'
                    ? t('The quick audit suggests, in order. Tap one to put it in that slot.')
                    : madeBy === 'fixed'
                      ? t('The audit suggests, in order. Tap one to put it in that slot.')
                      : t('AI suggests, in order. Tap one to put it in that slot.')}
                </p>
                <ol className="space-y-1">
                  {sug.moves.slice(0, 4).map((m, i) => {
                    const slot = i + 1;
                    const current = p.moves.find((x) => x.slot === slot)?.move;
                    const same = current != null && current.nameEn.toLowerCase() === m.move.toLowerCase();
                    return (
                      <li key={m.move} title={m.reason} className="flex items-center gap-2">
                        <span className="w-4 shrink-0 text-center text-muted">{slot}</span>
                        {same ? (
                          <span className="flex-1 rounded border border-done/50 px-2 py-1 text-done">✓ {moveName(m.move)}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => applyMove(m.move, slot)}
                            className="flex-1 rounded border border-pending/50 px-2 py-1 text-left text-pending hover:bg-pending/10"
                          >
                            {moveName(m.move)}
                            {m.has && <span className="ml-1 text-muted">({t('in another slot')})</span>}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            <p className="text-[11px] text-muted">{t('A move you change is marked pending until you tick it as learned.')}</p>
          </Section>

          {(evs || judge) && (
            <Section title={evs ? t('Stats and IVs') : t('Potential')}>
              {evs && (evTarget || p.evs) && (
                <Field
                  label={t('Target EV spread')}
                  hint={t('For example 252 Atk / 4 SpD / 252 Spe. English or Spanish stat names work.')}
                  action={
                    p.evs && <TaskToggle status={p.evStatus} onToggle={() => onToggle('evs', p.evStatus)} />
                  }
                >
                  <input
                    value={targetEvs}
                    onChange={(e) => setTargetEvs(e.target.value)}
                    onBlur={() =>
                      targetEvs.trim() !== (p.evs ? formatEvs(p.evs) : '') && save({ evs: targetEvs.trim() || null })
                    }
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className={inputClass}
                  />
                  {sug.evs && (
                    <Suggestion same={sug.evs.same} onApply={() => void save({ evs: sug.evs!.spread })}>
                      {sug.evs.spread}
                    </Suggestion>
                  )}
                </Field>
              )}
              {evs && (
                <StatsSection
                  p={p}
                  info={estimate}
                  onSave={onSaveStats}
                  onStatsRead={() => void save({ statsRead: true })}
                  onMaxed={(maxedEvs) => void save({ maxedEvs })}
                />
              )}
              {judge && (
                <Field label={t('Potential')}>
                  <PotentialSelect p={p} onChange={onPotential} />
                </Field>
              )}
            </Section>
          )}

        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {p.audit && (
          <button
            onClick={onToggleAudit}
            disabled={auditing}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40"
          >
            {auditOpen ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
            {auditOpen ? t('Hide audit') : t('Show audit')}
          </button>
        )}
        <button
          onClick={() => (p.audit ? setReplacing('quick') : onQuickAudit())}
          disabled={auditing}
          title={t('Suggests a nature, EVs, four moves, an item and a Tera type from the game data. Free and instant, no AI.')}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40"
        >
          <BoltIcon size={14} />
          {auditing ? t('Auditing…') : t('Quick audit')}
        </button>
        {/* The AI audit looks deeper. Where there is no AI, a line says why and what to do instead of a button. */}
        {aiEnabled ? (
          <>
            <button
              onClick={() => (p.audit ? setReplacing('ai') : onAudit(false, false))}
              disabled={auditing}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <SparklesIcon size={14} />
              {t('AI audit')}
            </button>
            <span className="self-center">
              <AiHelp kind="audit" />
            </span>
          </>
        ) : (
          <span className="self-center">
            <AiUnavailable kind="audit" />
          </span>
        )}
      </div>

      {auditOpen && p.audit && (
        <AuditPanel
          gameId={gameId}
          locks={p.auditLocks}
          onLocksChange={(locks) => void save({ auditLocks: locks })}
          compare={compareRows}
          localize={(kind, english) =>
            kind === 'item'
              ? itemName(english)
              : kind === 'move'
                ? moveName(english)
                : kind === 'nature'
                  ? label(natureOf(english)) || english
                  : mintLabel(english)
          }
          currentTera={p.teraType}
          mintGiven={mintInForce(p)?.nameEn ?? null}
          realNature={(p.currentNature ?? p.targetNature)?.nameEn ?? null}
          onMint={(nature, given) => {
            const match = options.natures.find((n) => n.nameEn.toLowerCase() === nature.toLowerCase());
            if (match) void save({ mintNatureId: given ? match.id : null });
          }}
          lockedPlan={p.evs ? formatEvs(p.evs) : null}
          onLockPlan={(spread) => void save({ evs: spread })}
          onUnlockPlan={() => void save({ evs: null })}
          audit={p.audit.result as Parameters<typeof AuditPanel>[0]['audit']}
          // Fixed parts keep the words they were saved with, so there is no language to change.
          auditLang={madeBy === 'fixed' ? undefined : p.audit.lang}
          meta={`${p.audit.provider} · ${p.audit.model}`}
          madeBy={madeBy}
          onChangeLanguage={madeBy === 'rules' ? onQuickAudit : madeBy === 'ai' && aiEnabled ? () => onAudit(false, false) : undefined}
          busy={auditing}
        />
      )}

      <ConfirmDialog
        open={replacing != null}
        title={t('Replace the current audit?')}
        confirmLabel={t('Replace')}
        onConfirm={() => {
          const next = replacing;
          setReplacing(null);
          if (next === 'quick') onQuickAudit();
          // An AI audit shown now is asked again; any other is replaced, reusing a saved AI answer if the build is unchanged.
          else if (next === 'ai') onAudit(madeBy === 'ai', false);
        }}
        onCancel={() => setReplacing(null)}
      >
        <p>
          {replacing === 'ai'
            ? asksNothing
              ? t('Every part is fixed, so nothing will be asked of the AI and your AI key is not used. The audit is rebuilt from your fixed parts.')
              : madeBy === 'ai'
                ? t('The AI audit on this card will be asked again and replaced. This uses your AI key. Parts you have fixed stay.')
                : t('The audit on this card will be replaced by an AI audit, which uses your AI key. Parts you have fixed stay.')
            : madeBy === 'rules'
              ? t('The quick audit on this card will be made again from the current data. Parts you have fixed stay.')
              : madeBy === 'fixed'
                ? t('The audit on this card, built from your fixed parts, will be replaced by a quick audit. Parts you have fixed stay.')
                : t('The AI audit on this card will be replaced by a quick audit. Parts you have fixed stay.')}
        </p>
      </ConfirmDialog>

      <datalist id="detail-moves">
        {options.moves.map((m) => (
          <option key={m.id} value={label(m)} label={other(m)} />
        ))}
      </datalist>
      <datalist id="detail-items">
        <option value={t('No item')} />
        {options.items.map((it) => (
          <option key={it.id} value={label(it)} label={other(it)} />
        ))}
      </datalist>
    </article>
    </SuggestedBy.Provider>
  );
}
