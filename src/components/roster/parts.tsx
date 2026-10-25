'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { POTENTIAL_LEVELS, potentialLevel } from '@/lib/potential';
import type { RosterView } from '@/lib/roster';
import { rosterProgress, type TaskKey, type TaskStatus } from '@/lib/roster-status';
import { useT } from '@/lib/translate-client';

export type Gender = RosterView['gender'];

/** ♂ / ♀ for a card: the gender recorded, or the one a single-gender species always has. Null when unknown or genderless. */
export function genderMark(p: RosterView): { symbol: string; color: string; label: { en: string; es: string } } | null {
  const male = p.gender === 'MALE' || (p.gender === 'UNKNOWN' && p.genderRate === 0);
  const female = p.gender === 'FEMALE' || (p.gender === 'UNKNOWN' && p.genderRate === 8);
  if (male) return { symbol: '♂', color: 'text-sky-400', label: { en: 'Male', es: 'Macho' } };
  if (female) return { symbol: '♀', color: 'text-pink-400', label: { en: 'Female', es: 'Hembra' } };
  return null;
}


export const progressOf = (p: RosterView) =>
  rosterProgress({
    owned: p.owned,
    itemId: p.item?.id ?? null,
    itemNote: p.itemNote,
    itemStatus: p.itemStatus,
    teraType: p.teraType,
    teraStatus: p.teraStatus,
    evs: p.evs,
    evStatus: p.evStatus,
    moves: p.moves.map((m) => ({ slot: m.slot, moveId: m.move?.id ?? null, rawName: m.rawName, status: m.status })),
  });

/** Applies a task toggle locally, mirroring what PATCH /api/roster/[id] does. */
export function withTask(p: RosterView, key: TaskKey, status: TaskStatus): RosterView {
  if (key.startsWith('move:')) {
    const slot = Number(key.slice(5));
    return { ...p, moves: p.moves.map((m) => (m.slot === slot ? { ...m, status } : m)) };
  }
  switch (key) {
    case 'owned':
      return { ...p, owned: status === 'DONE' };
    case 'item':
      return { ...p, itemStatus: status };
    case 'tera':
      return { ...p, teraStatus: status };
    default:
      return { ...p, evStatus: status };
  }
}

/** A single micro-task: orange while pending, green once checked off. */
export function TaskToggle({
  status,
  onToggle,
  label,
  warning,
  accent,
  title,
}: {
  status: TaskStatus;
  onToggle: () => void;
  /** Text next to the tick. Leave out for a bare tick. */
  label?: React.ReactNode;
  warning?: string;
  accent?: string;
  title?: string;
}) {
  const { t } = useT();
  const done = status === 'DONE';
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={{ scale: 0.94 }}
      aria-pressed={done}
      title={warning ?? title ?? (done ? t('Done. Click to mark pending') : t('Pending. Click to mark done'))}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
        done
          ? 'border-done/50 bg-done/15 text-done'
          : 'border-pending/50 bg-pending/10 text-pending hover:bg-pending/20'
      }`}
      style={accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : undefined}
    >
      <span aria-hidden className="text-[11px]">
        {done ? '✓' : '○'}
      </span>
      {label != null && <span className="truncate">{label}</span>}
      {warning && (
        <span aria-label={warning} className="text-danger">
          ⚠
        </span>
      )}
    </motion.button>
  );
}

/** Which form of the species it is, for the ones that look or breed differently. Nothing shows when it has just one. */
export function FormControl({ p, onChange, className }: { p: RosterView; onChange: (formId: number | null) => void; className: string }) {
  const { t } = useT();
  if (p.formOptions.length < 2) return null;
  return (
    <select value={p.formSet ?? 0} onChange={(e) => onChange(Number(e.target.value) || null)} className={className}>
      <option value={0}>{t('Not recorded')}</option>
      {p.formOptions.map((f) => (
        <option key={f.id} value={f.id}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

/** ♂ / ♀: a Pokémon is one or the other, so choosing one replaces the other. Fixed for single-gender and genderless species. */
export function GenderControl({ p, onChange }: { p: RosterView; onChange: (g: Gender) => void }) {
  const { t } = useT();
  if (p.genderRate === -1) return <span className="text-xs text-muted">{t('Genderless')}</span>;
  if (p.genderRate === 0) return <span className="text-xs text-sky-400">♂ {t('always male')}</span>;
  if (p.genderRate === 8) return <span className="text-xs text-pink-400">♀ {t('always female')}</span>;

  const male = p.gender === 'MALE';
  const female = p.gender === 'FEMALE';
  // Older records may say "both": that is not a real Pokémon, so ask which one it is.
  const legacyBoth = p.gender === 'BOTH';

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-pressed={male}
        onClick={() => onChange(male ? 'UNKNOWN' : 'MALE')}
        title={male ? t('It is a male. Click to clear') : t('Click if it is a male')}
        className={`h-7 w-9 rounded text-sm font-bold ${
          male ? 'bg-sky-500 text-white' : 'border border-line text-muted hover:text-sky-400'
        }`}
      >
        ♂
      </button>
      <button
        type="button"
        aria-pressed={female}
        onClick={() => onChange(female ? 'UNKNOWN' : 'FEMALE')}
        title={female ? t('It is a female. Click to clear') : t('Click if it is a female')}
        className={`h-7 w-9 rounded text-sm font-bold ${
          female ? 'bg-pink-500 text-white' : 'border border-line text-muted hover:text-pink-400'
        }`}
      >
        ♀
      </button>
      <span className="text-[11px] text-muted">
        {legacyBoth
          ? t('It was saved as both a male and a female. Pick the one it really is.')
          : male
            ? t('male')
            : female
              ? t('female')
              : t('not set')}
      </span>
    </div>
  );
}

/** The Pokémon's picture: animated when one exists, a silhouette while it is not obtained. */
export function PokemonSprite({ p, size = 80, animated = true }: { p: RosterView; size?: number; animated?: boolean }) {
  const moving =
    animated && p.formId
      ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${p.formId}.gif`
      : null;
  // The moving picture is tried first, and the still one used if it fails. Remembered per Pokémon, so a card
  // that shows another Pokémon later (the team closes up when a slot is emptied) shows that one's own picture.
  const lookKey = `${p.id}:${moving ?? ''}`;
  const [fellBack, setFellBack] = useState<string | null>(null);
  const src = fellBack === lookKey ? p.spriteUrl : (moving ?? p.spriteUrl);
  if (!src) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
        style={{ width: size, height: size }}
      >
        ?
      </span>
    );
  }
  return (
    <span className="grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => src !== p.spriteUrl && setFellBack(lookKey)}
        style={{ maxWidth: size, maxHeight: size }}
        className={`${p.owned ? '' : 'sprite-silhouette'} ${src === p.spriteUrl ? 'sprite' : ''}`}
      />
    </span>
  );
}

/** The Judge's verdict as a coloured select, so the colour tells you the tier at a glance. */
export function PotentialSelect({ p, onChange }: { p: RosterView; onChange: (v: RosterView['potential']) => void }) {
  const { t, lang } = useT();
  const level = potentialLevel(p.potential);
  return (
    <select
      value={p.potential ?? ''}
      onChange={(e) => onChange((e.target.value || null) as RosterView['potential'])}
      aria-label={t('Potential from the in-game Judge')}
      title={t('What the in-game Judge (Juez) says about this Pokémon')}
      className={`rounded-md border bg-surface px-2 py-1 text-xs ${level?.className ?? 'border-line text-muted'}`}
    >
      <option value="">{t('Not judged')}</option>
      {POTENTIAL_LEVELS.map((l) => (
        <option key={l.value} value={l.value}>
          {lang === 'en' ? l.label : l.labelEs}
        </option>
      ))}
    </select>
  );
}

const MAX_SUGGESTIONS = 40;
const plain = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").toLowerCase();

/** The options of a <datalist> on the page, as plain data. */
function readDatalist(id: string): { value: string; label: string }[] {
  const el = document.getElementById(id) as HTMLDataListElement | null;
  return el ? Array.from(el.options, (o) => ({ value: o.value, label: o.label && o.label !== o.value ? o.label : '' })) : [];
}

/**
 * A text box with a list of suggestions that is easy to change: clicking into
 * it empties it (the current value stays visible as the placeholder), so the
 * list is not filtered by the old choice. Leaving it untouched keeps the old
 * value.
 *
 * `list` names a <datalist> whose options are the suggestions. They are drawn
 * here rather than by the browser, because the browser's own list does not
 * show up reliably on an iPad.
 *
 * Without `onChange` it is a "saved value" box: it shows `value`, and
 * `onCommit` gets the text typed once you click away.
 */
export function ComboInput({
  value,
  onChange,
  onCommit,
  placeholder,
  list,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange?: (text: string) => void;
  onCommit?: (text: string) => void | Promise<void>;
}) {
  // null = not being edited: show `value`.
  const [typing, setTyping] = useState<string | null>(null);
  const touched = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when a suggestion was chosen: the blur that follows has nothing left to save.
  const picked = useRef(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  async function commit(text: string) {
    // Keep showing what was typed while it saves, so it does not flash back.
    try {
      await onCommit?.(text);
    } finally {
      setTyping(null);
    }
  }

  async function finish() {
    setOpen(false);
    if (picked.current) {
      picked.current = false;
      return;
    }
    const text = typing;
    if (text === null) return;
    if (!touched.current) {
      setTyping(null);
      return;
    }
    await commit(text);
  }

  const suggestions = useMemo(() => {
    if (!open || !list || typeof document === 'undefined') return [];
    const q = plain((typing ?? '').trim());
    const all = readDatalist(list);
    if (!q) return all.slice(0, MAX_SUGGESTIONS);
    const starts: typeof all = [];
    const contains: typeof all = [];
    for (const o of all) {
      const v = plain(o.value);
      const l = plain(o.label);
      // The label is the name in the other language, so searching in either one ranks the same.
      if (v.startsWith(q) || l.startsWith(q)) starts.push(o);
      else if (v.includes(q) || l.includes(q)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [open, list, typing]);

  // Place the list under the box, or above it when the keyboard leaves no room below.
  useEffect(() => {
    if (!open || suggestions.length === 0) return;
    const place = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const below = viewport - r.bottom - 8;
      if (below >= 180 || below >= r.top) {
        setBox({ left: r.left, width: r.width, top: r.bottom + 4, maxHeight: Math.min(288, below) });
      } else {
        setBox({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(288, r.top - 8) });
      }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [open, suggestions.length]);

  function pick(text: string) {
    touched.current = true;
    setTyping(text);
    onChange?.(text);
    setOpen(false);
    setActive(-1);
    picked.current = true;
    void commit(text);
    inputRef.current?.blur();
  }

  return (
    <>
      <input
        {...rest}
        ref={inputRef}
        autoComplete="off"
        value={typing ?? value}
        placeholder={typing === '' && value ? value : placeholder}
        onFocus={(e) => {
          touched.current = false;
          picked.current = false;
          setTyping('');
          setOpen(Boolean(list));
          setActive(-1);
          rest.onFocus?.(e);
        }}
        onChange={(e) => {
          touched.current = true;
          setTyping(e.target.value);
          setOpen(Boolean(list));
          setActive(-1);
          onChange?.(e.target.value);
        }}
        onBlur={(e) => {
          void finish();
          rest.onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (open && suggestions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((a) => (a + step + suggestions.length) % suggestions.length);
          } else if (e.key === 'Enter' && open && active >= 0 && suggestions[active]) {
            e.preventDefault();
            pick(suggestions[active].value);
            return;
          } else if (e.key === 'Escape') {
            setOpen(false);
          } else if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
          rest.onKeyDown?.(e);
        }}
      />
      {open && box && suggestions.length > 0 &&
        createPortal(
          <ul
            role="listbox"
            style={{ position: 'fixed', left: box.left, width: Math.max(box.width, 180), top: box.top, bottom: box.bottom, maxHeight: box.maxHeight }}
            className="z-[100] overflow-y-auto rounded-md border border-line bg-surface py-1 text-sm shadow-lg"
          >
            {suggestions.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={i === active}
                // Keep the focus in the box; choose when the finger or pointer lifts (a scroll cancels it).
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onPointerUp={() => pick(o.value)}
                onPointerEnter={() => setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-2 px-3 py-2 ${i === active ? 'bg-surface-2' : ''}`}
              >
                <span className="truncate">{o.value}</span>
                {o.label && <span className="shrink-0 text-xs text-muted">{o.label}</span>}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  );
}
