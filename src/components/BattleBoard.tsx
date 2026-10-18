'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArchiveIcon, CheckIcon, CloneIcon, EditIcon, EggIcon, RestoreIcon, TrashIcon } from './ActionIcons';
import { ConfirmDialog } from './Dialog';
import { Sprite } from './Sprite';
import { TeraBadge, TypeBadge } from './TypeBadge';
import { ComboInput } from './roster/parts';
import type { BattleOpponentView, CounterView, LearnWay, MoveView } from '@/lib/battle/load';
import type { Lang } from '@/lib/i18n';
import { TYPE_NAMES_ES as TYPE_LABEL_ES } from '@/lib/pokemon-types';
import { useT } from '@/lib/translate-client';

type Named = { id: number; nameEn: string; nameEs: string };
type MoveOption = Named & { type: string };
type FormOption = {
  id: number;
  slug: string;
  isDefault: boolean;
  types: string[];
  spriteUrl: string | null;
  abilities: (Named & { isHidden: boolean; descriptionEn: string | null; descriptionEs: string | null })[];
};

/** What the form edits. `id` is set when an existing opponent is being changed. */
type Draft = {
  id: string | null;
  species: string;
  formId: number | null;
  kind: 'RAID' | 'STANDARD';
  teraType: string;
  stars: string;
  abilityId: number | null;
  moveIds: number[];
  label: string;
  notes: string;
};

const EMPTY: Draft = {
  id: null,
  species: '',
  formId: null,
  kind: 'RAID',
  teraType: '',
  stars: '',
  abilityId: null,
  moveIds: [],
  label: '',
  notes: '',
};

const iconButton = 'flex h-8 w-8 items-center justify-center rounded border border-line hover:bg-surface-2';
const inputClass = 'w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-muted';

export function BattleBoard({
  gameId,
  initial,
  species,
  moves,
  types,
  features,
  lang,
}: {
  gameId: string;
  initial: BattleOpponentView[];
  species: Named[];
  moves: MoveOption[];
  types: string[];
  features: { raids: boolean; tera: boolean; breeding: boolean };
  lang: Lang;
}) {
  const { t } = useT();
  const [opponents, setOpponents] = useState(initial);
  const [draft, setDraftState] = useState<Draft | null>(null);
  /** A new key per opening, so the form starts from the values it was opened with. */
  const [draftKey, setDraftKey] = useState(0);
  const setDraft = (d: Draft | null) => {
    setDraftState(d);
    setDraftKey((k) => k + 1);
  };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<BattleOpponentView | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  /** On a narrow screen the list is folded away so the details take the top of the page. */
  const [listOpen, setListOpen] = useState(false);
  const active = opponents.filter((o) => !o.archived);
  const archived = opponents.filter((o) => o.archived);
  /** The opponent whose details are shown; the newest one to begin with. */
  const [selectedId, setSelectedId] = useState<string | null>(initial.find((o) => !o.archived)?.id ?? initial[0]?.id ?? null);
  const selected = opponents.find((o) => o.id === selectedId) ?? active[0] ?? null;
  // Coming back to the page shows the opponent you were last on.
  const storageKey = `battle-selected:${gameId}`;
  const restored = useRef(false);
  useEffect(() => {
    try {
      if (!restored.current) {
        restored.current = true;
        const saved = sessionStorage.getItem(storageKey);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (saved && initial.some((o) => o.id === saved)) setSelectedId(saved);
        return;
      }
      if (selectedId) sessionStorage.setItem(storageKey, selectedId);
    } catch {}
  }, [selectedId, storageKey, initial]);
  const detailRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement>(null);
  // The menu closes on Escape or a tap outside it.
  useEffect(() => {
    if (!listOpen) return;
    const away = (e: PointerEvent) => {
      if (!listRef.current?.contains(e.target as Node)) setListOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setListOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [listOpen]);
  const select = (id: string) => {
    setSelectedId(id);
    setListOpen(false);
    // On a narrow screen the details sit below the list.
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const name = (x: Named) => (lang === 'en' ? x.nameEn : x.nameEs);
  const typeName = (type: string) => <TypeBadge key={type} type={type} lang={lang} />;

  async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? t('Request failed ({status})', { status: res.status }));
    return data as T;
  }

  function draftOf(o: BattleOpponentView, mode: 'edit' | 'clone'): Draft {
    return {
      id: mode === 'edit' ? o.id : null,
      species: name(o.species),
      formId: o.formId,
      kind: o.kind,
      teraType: o.teraType ?? '',
      stars: o.stars != null ? String(o.stars) : '',
      abilityId: o.ability?.id ?? null,
      moveIds: o.moves.map((m) => m.id),
      label: o.label ?? '',
      notes: o.notes ?? '',
    };
  }

  async function save(d: Draft, speciesId: number, defaultFormId: number | null) {
    setBusy(true);
    setError(null);
    const body = {
      speciesId,
      // The default form is stored as "no form" so it follows the species.
      formId: d.formId != null && d.formId !== defaultFormId ? d.formId : null,
      kind: features.raids ? d.kind : 'STANDARD',
      teraType: features.tera && d.teraType ? d.teraType : null,
      stars: features.raids && d.kind === 'RAID' && d.stars ? Number(d.stars) : null,
      abilityId: d.abilityId,
      moveIds: d.moveIds,
      label: d.label.trim() || null,
      notes: d.notes.trim() || null,
    };
    try {
      if (d.id) {
        const data = await api<{ opponent: BattleOpponentView }>(`/api/battle/${d.id}`, 'PATCH', body);
        setOpponents((prev) => prev.map((o) => (o.id === d.id ? data.opponent : o)));
      } else {
        const data = await api<{ opponent: BattleOpponentView }>('/api/battle', 'POST', { gameId, ...body });
        setOpponents((prev) => [data.opponent, ...prev]);
        setSelectedId(data.opponent.id);
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not save that opponent. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(o: BattleOpponentView) {
    setDeleting(null);
    try {
      await api(`/api/battle/${o.id}`, 'DELETE');
      setOpponents((prev) => prev.filter((x) => x.id !== o.id));
      setSelectedId((cur) => (cur === o.id ? null : cur));
    } catch {
      setError(t('Could not delete that opponent. Try again.'));
    }
  }

  /** Works the counters out again, e.g. after the roster changed in another tab. */
  async function refresh(ids: string[]) {
    try {
      const results = await Promise.all(
        ids.map((id) => api<{ opponent: BattleOpponentView }>(`/api/battle/${id}`, 'GET').then((r) => r.opponent))
      );
      setOpponents((prev) => prev.map((o) => results.find((r) => r.id === o.id) ?? o));
    } catch {
      // Quiet: the counters shown are still valid, only possibly out of date.
    }
  }

  async function setArchived(o: BattleOpponentView, value: boolean) {
    setError(null);
    try {
      const data = await api<{ opponent: BattleOpponentView }>(`/api/battle/${o.id}`, 'PATCH', { archived: value });
      setOpponents((prev) => prev.map((x) => (x.id === o.id ? data.opponent : x)));
    } catch {
      setError(t('Could not archive that opponent. Try again.'));
    }
  }

  // The roster changes on other pages (or tabs), so the counters are worked out again when this one is
  // looked at again. Opening the page already loads them fresh.
  const activeIds = useRef<string[]>([]);
  const activeKey = active.map((o) => o.id).join(',');
  useEffect(() => {
    activeIds.current = activeKey ? activeKey.split(',') : [];
  }, [activeKey]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && activeIds.current.length > 0) void refresh(activeIds.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const multLabel = (m: number) => (m === 0 ? t('immune') : `×${m}`);
  // A multiplier says which way the hit goes: the rival's attacks on your Pokémon, or your move on the rival.
  const takenLabel = (m: number) => t('{mult} damage taken', { mult: multLabel(m) });

  const moveLine = (m: MoveView & { multiplier: number; stab: boolean; known: boolean }, rival: string) => (
    <span>
      <span className="font-medium">{name(m)}</span>{' '}
      <TypeBadge type={m.type} lang={lang} small />{' '}
      <span className="text-muted">
        {m.power} · {t('{mult} to {rival}', { mult: multLabel(m.multiplier), rival })}
        {m.stab ? ` · ${t('same type')}` : ''}
      </span>
    </span>
  );

  const learnLabel = (w: LearnWay) =>
    w.method === 'level'
      ? t('at level {level}', { level: w.level ?? 1 })
      : w.method === 'evolve'
        ? t('when it evolves')
        : w.method === 'tm'
          ? t('by TM')
          : w.method === 'tutor'
            ? t('from a tutor')
            : t('as an egg move');

  async function setDefeated(o: BattleOpponentView, value: boolean) {
    setError(null);
    try {
      const data = await api<{ opponent: BattleOpponentView }>(`/api/battle/${o.id}`, 'PATCH', { defeated: value });
      setOpponents((prev) => prev.map((x) => (x.id === o.id ? data.opponent : x)));
    } catch {
      setError(t('Could not save that choice. Try again.'));
    }
  }

  async function setBest(o: BattleOpponentView, rosterId: string | null) {
    setError(null);
    try {
      const data = await api<{ opponent: BattleOpponentView }>(`/api/battle/${o.id}`, 'PATCH', { bestRosterId: rosterId });
      setOpponents((prev) => prev.map((x) => (x.id === o.id ? data.opponent : x)));
    } catch {
      setError(t('Could not save that choice. Try again.'));
    }
  }

  const renderCounter = (c: CounterView, o: BattleOpponentView, rank: number) => (
    <li
      key={`${c.source}-${c.formId}-${c.rosterId ?? ''}`}
      className={`flex gap-2 rounded-lg border p-2 text-xs ${c.best ? 'border-star bg-star/10' : 'border-line'}`}
    >
      <span className="w-4 shrink-0 pt-1 text-center text-[11px] font-semibold text-muted">{rank}</span>
      <span className="self-center">
        <Sprite src={c.spriteUrl} alt={name(c.species)} size={64} smooth />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold">
          {c.nickname ? `${c.nickname} (${name(c.species)})` : name(c.species)}
          {c.types.map((ty) => (
            <TypeBadge key={ty} type={ty} lang={lang} small />
          ))}
          {c.teraType && (
            <span className="inline-flex items-center gap-1">
              <TeraBadge
                type={c.teraType}
                lang={lang}
                title={c.source === 'roster' ? t('Its Tera type') : t('The best Tera type to give it')}
              />
              {c.source === 'game' && <span className="text-[10px] font-normal text-muted">{t('best Tera')}</span>}
            </span>
          )}
          <span
            className={`rounded px-1 text-[10px] font-medium ${
              c.have ? 'bg-done/15 text-done' : 'bg-pending/15 text-pending'
            }`}
          >
            {c.source === 'roster' ? t('in your box') : c.have ? t('you have it') : t('not caught yet')}
          </span>
          <span className="rounded bg-surface-2 px-1 text-[10px] font-medium text-muted">
            {c.faster ? t('Faster than {rival}', { rival: name(o.species) }) : t('Slower than {rival}', { rival: name(o.species) })}
          </span>
          {c.best && <span className="rounded bg-star/20 px-1 text-[10px] font-semibold text-star">{t('Best so far')}</span>}
        </p>
        <p>
          {t('Use')} {moveLine(c.move, name(o.species))}
          <span className={c.move.known ? 'ml-1 text-done' : 'ml-1 text-star'}>
            {c.move.known ? t('knows it') : c.source === 'roster' ? t('can learn it') : t('learns it')}
            {!c.move.known && c.move.learn ? ` ${learnLabel(c.move.learn)}` : ''}
          </span>
        </p>
        {c.alternatives.length > 0 && (
          <p className="text-muted">
            {t('Also')}: {c.alternatives.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                {name(a)} <TypeBadge type={a.type} lang={lang} small />
                {!a.known && a.learn ? ` (${learnLabel(a.learn)})` : ''}
              </span>
            ))}
          </p>
        )}
        {c.ability && (
          <p className="text-muted">
            {t('Ability')}: <span className="font-medium text-ink">{name(c.ability)}</span>
          </p>
        )}
        {c.rosterId && (
          <button
            type="button"
            onClick={() => setBest(o, c.best ? null : c.rosterId)}
            className="mt-1 rounded border border-line px-1.5 py-0.5 text-[11px] hover:bg-surface-2"
          >
            {c.best ? t('Not the best anymore') : t('Mark as best')}
          </button>
        )}
        {/* How your Pokémon takes the rival's hits; "Terastallize" is you Terastallizing yours. */}
        {c.incoming >= 2 &&
          (c.teraType && c.incomingBase != null && c.incomingBase < 2 ? (
            <p className="text-pending">
              {t("Weak to {rival}'s attacks if you Terastallize it ({mult})", { rival: name(o.species), mult: takenLabel(c.incoming) })}
            </p>
          ) : (
            <p className="text-pending">{t("Weak to {rival}'s attacks ({mult})", { rival: name(o.species), mult: takenLabel(c.incoming) })}</p>
          ))}
        {c.incoming < 1 && (
          <p className="text-done">
            {c.teraType && c.incomingBase !== c.incoming
              ? c.incoming === 0
                ? t("Immune to {rival}'s attacks once you Terastallize it", { rival: name(o.species) })
                : t("Resists {rival}'s attacks once you Terastallize it", { rival: name(o.species) })
              : c.incoming === 0
                ? t("Immune to {rival}'s attacks", { rival: name(o.species) })
                : t("Resists {rival}'s attacks", { rival: name(o.species) })}
          </p>
        )}
        {c.source === 'game' && features.breeding && (
          <Link
            href={`/${gameId}/breeding?${new URLSearchParams({
              species: String(c.species.id),
              move: String(c.move.id),
              ...(c.ability ? { ability: String(c.ability.id) } : {}),
            })}`}
            className="mt-1 inline-flex rounded border border-line p-1 text-muted hover:bg-surface-2 hover:text-ink"
            title={t('Start a breeding plan for this Pokémon, with 31 in every IV')}
            aria-label={t('Plan a breed')}
          >
            <EggIcon size={14} />
          </Link>
        )}
        {c.teraType && c.incomingBase != null && c.incomingBase >= 2 && c.incoming < 2 && (
          <p className="text-pending">
            {t("Weak to {rival}'s attacks until you Terastallize it ({mult})", { rival: name(o.species), mult: takenLabel(c.incomingBase) })}
          </p>
        )}
      </div>
    </li>
  );

  const renderListItem = (o: BattleOpponentView) => {
    const on = o.id === selected?.id;
    return (
      <li key={o.id}>
        <button
          type="button"
          onClick={() => select(o.id)}
          aria-current={on ? 'true' : undefined}
          className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${
            on ? 'border-done bg-surface-2' : 'border-line bg-surface hover:bg-surface-2'
          } ${o.defeated && !on ? 'opacity-60' : ''}`}
        >
          <Sprite src={o.spriteUrl} alt={name(o.species)} size={56} smooth />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name(o.species)}</span>
            <span className="flex flex-wrap items-center gap-1">
              {o.types.map((ty) => (
                <TypeBadge key={ty} type={ty} lang={lang} small />
              ))}
              {o.kind === 'RAID' && (
                <span className="rounded bg-star/20 px-1 text-[10px] font-semibold text-star">
                  {o.stars ? `${o.stars}★` : t('Raid')}
                </span>
              )}
              {o.teraType && <TeraBadge type={o.teraType} lang={lang} title={t('Tera type')} />}
            </span>
            {o.label && <span className="block truncate text-[11px] text-muted">{o.label}</span>}
          </span>
          {o.defeated && (
            <span className="shrink-0 text-done" title={t('Defeated')}>
              <CheckIcon size={18} />
            </span>
          )}
        </button>
      </li>
    );
  };

  const renderOpponent = (o: BattleOpponentView) => {
    const groups: { label: string; items: typeof o.weaknesses; tone: string }[] = [
      { label: t('Very weak (×4)'), items: o.weaknesses.filter((w) => w.multiplier >= 4), tone: 'text-done' },
      { label: t('Weak (×2)'), items: o.weaknesses.filter((w) => w.multiplier === 2), tone: 'text-done' },
      { label: t('Resists (×0.5)'), items: o.weaknesses.filter((w) => w.multiplier === 0.5), tone: 'text-pending' },
      { label: t('Resists a lot (×0.25)'), items: o.weaknesses.filter((w) => w.multiplier > 0 && w.multiplier <= 0.25), tone: 'text-pending' },
      { label: t('Immune (×0)'), items: o.weaknesses.filter((w) => w.multiplier === 0), tone: 'text-pending' },
    ].filter((g) => g.items.length > 0);

    return (
      <div key={o.id} className="rounded-xl border border-line bg-surface">
        {/* Header and what it is weak to stay in view while the counters scroll underneath. */}
        <div className="sticky top-[var(--nav-h)] z-10 max-h-[40dvh] overflow-y-auto rounded-t-xl border-b border-line bg-surface shadow-sm lg:max-h-[60dvh]">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <Sprite src={o.spriteUrl} alt={name(o.species)} size={72} smooth />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
              {name(o.species)}
              {!o.isDefaultForm && (
                <span className="text-xs font-normal text-muted">({o.formSlug.split('-').slice(1).join(' ')})</span>
              )}
              {o.types.map((ty) => typeName(ty))}
              {o.kind === 'RAID' && (
                <span className="rounded bg-star/20 px-1.5 text-[11px] font-semibold text-star">
                  {o.stars ? t('Raid {n}★', { n: o.stars }) : t('Raid')}
                </span>
              )}
              {o.teraType && <TeraBadge type={o.teraType} lang={lang} title={t('Tera type')} />}
              {o.defeated && (
                <span className="flex items-center gap-1 rounded bg-done/15 px-1.5 text-[11px] font-semibold text-done">
                  <CheckIcon size={12} /> {t('Defeated')}
                </span>
              )}
            </p>
            <p className="text-xs text-muted">
              {[o.label, o.ability ? `${t('Ability')}: ${name(o.ability)}` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={o.defeated}
              onClick={() => setDefeated(o, !o.defeated)}
              title={o.defeated ? t('Defeated. Click to undo') : t('Mark it as defeated')}
              className={`flex h-8 items-center gap-1 rounded border px-2 text-xs font-medium ${
                o.defeated ? 'border-done bg-done/15 text-done' : 'border-line hover:bg-surface-2'
              }`}
            >
              <CheckIcon size={14} />
              {t('Defeated')}
            </button>
            <span aria-hidden className="mx-0.5 w-px self-stretch bg-line" />
            <button
              type="button"
              title={t('Edit')}
              aria-label={t('Edit')}
              onClick={() => setDraft(draftOf(o, 'edit'))}
              className={iconButton}
            >
              <EditIcon />
            </button>
            <button
              type="button"
              title={t('Make a copy to change something, like the Tera type, without losing this one')}
              aria-label={t('Clone')}
              onClick={() => setDraft(draftOf(o, 'clone'))}
              className={iconButton}
            >
              <CloneIcon />
            </button>
            <span aria-hidden className="mx-0.5 w-px self-stretch bg-line" />
            <button
              type="button"
              title={o.archived ? t('Restore') : t('Put it away so it is not shown open; you can bring it back')}
              aria-label={o.archived ? t('Restore') : t('Archive')}
              onClick={() => setArchived(o, !o.archived)}
              className={iconButton}
            >
              {o.archived ? <RestoreIcon /> : <ArchiveIcon />}
            </button>
            <span aria-hidden className="mx-0.5 w-px self-stretch bg-line" />
            <button
              type="button"
              title={t('Delete')}
              aria-label={t('Delete')}
              onClick={() => setDeleting(o)}
              className={`${iconButton} text-muted hover:text-pending`}
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        <div className="space-y-4 border-t border-line p-3">
          {o.notes && <p className="text-xs text-muted">{o.notes}</p>}
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <span className="font-medium">{t('Its moves')}:</span>
            {o.moves.length === 0 ? (
              <span className="text-muted">
                {t('Not set: what hits your Pokémon is guessed from its own types. Edit it to add the moves you saw.')}
              </span>
            ) : (
              o.moves.map((m) => (
                <span key={m.id} className="flex items-center gap-1">
                  {name(m)} <TypeBadge type={m.type} lang={lang} small />
                </span>
              ))
            )}
          </p>
          {o.locked && (
            <p className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
              {t('Locked while defeated: the matchups and counters stay as they were, whatever you change in your roster. Mark it as not defeated to update them.')}
            </p>
          )}
          {o.ability && (
            <p className="text-xs">
              <span className="font-medium">{name(o.ability)}:</span>{' '}
              <span className="text-muted">
                {(lang === 'es' ? o.ability.descriptionEs : o.ability.descriptionEn) ??
                  o.ability.descriptionEn ??
                  o.ability.descriptionEs ??
                  t('No description available.')}
              </span>
            </p>
          )}
          {o.teraType && (
            <p className="text-xs text-muted">
              {t('Terastallized: it defends as a {type} type only.', {
                type: lang === 'es' ? (TYPE_LABEL_ES[o.teraType] ?? o.teraType) : o.teraType,
              })}
            </p>
          )}

          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('Type matchups against it')}</h3>
            {groups.length === 0 ? (
              <p className="text-xs text-muted">{t('Every type does normal damage to it.')}</p>
            ) : (
              <div className="space-y-1">
                {groups.map((g) => (
                  <p key={g.label} className="flex flex-wrap items-center gap-1 text-xs">
                    <span className={`w-36 font-medium ${g.tone}`}>{g.label}</span>
                    {g.items.map((w) => typeName(w.type))}
                  </p>
                ))}
              </div>
            )}
          </section>

          {o.strongMoves.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">{t('Strongest moves against it')}</h3>
              <ul className="space-y-1 text-xs">
                {o.strongMoves.map((g) => (
                  <li key={g.type} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="flex w-24 items-center gap-1">
                      {typeName(g.type)} <span className="text-muted">{multLabel(g.multiplier)}</span>
                    </span>
                    {g.moves.map((m, i) => (
                      <span key={m.id}>
                        {i > 0 && <span className="text-muted">· </span>}
                        {name(m)} <span className="text-muted">{m.power}</span>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        </div>

        <div className="space-y-4 p-3">
          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('From your roster')}</h3>
            {o.roster.length === 0 ? (
              <p className="text-xs text-muted">
                {o.teraType
                  ? t('Nothing in your roster knows a move that is super effective against its Tera type. Look at the suggestions below.')
                  : t('Nothing in your roster can hit it well. Add Pokémon to your roster, or look at the suggestions below.')}
              </p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">{o.roster.map((c, i) => renderCounter(c, o, i + 1))}</ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('Other good picks in this game')}</h3>
            {o.suggestions.length === 0 ? (
              <p className="text-xs text-muted">{t('No suggestions: this game has no Pokémon that can hit it well.')}</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">{o.suggestions.map((c, i) => renderCounter(c, o, i + 1))}</ul>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <div>
      {draft ? (
        <OpponentForm
          key={draftKey}
          gameId={gameId}
          draft={draft}
          species={species}
          moves={moves}
          types={types}
          features={features}
          lang={lang}
          busy={busy}
          onCancel={() => setDraft(null)}
          onSave={save}
        />
      ) : (
        <button
          type="button"
          onClick={() => setDraft({ ...EMPTY, kind: features.raids ? 'RAID' : 'STANDARD' })}
          className="mb-6 rounded-md bg-done px-4 py-2 text-sm font-semibold text-bg"
        >
          {t('Add opponent')}
        </button>
      )}
      {error && <p className="mb-4 text-sm text-pending">{error}</p>}

      {opponents.length === 0 ? (
        <p className="text-sm text-muted">{t('No opponents yet. Add the Pokémon you have to beat.')}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <aside ref={listRef} className="relative lg:sticky lg:top-[calc(var(--nav-h)+1rem)] lg:max-h-[calc(100dvh-var(--nav-h)-2rem)] lg:self-start lg:overflow-y-auto">
            <button
              type="button"
              aria-expanded={listOpen}
              onClick={() => setListOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-left lg:hidden"
            >
              {selected && <Sprite src={selected.spriteUrl} alt="" size={40} smooth />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{selected ? name(selected.species) : ''}</span>
                <span className="block text-[11px] text-muted">{t('Opponents ({n})', { n: opponents.length })}</span>
              </span>
              <span aria-hidden className="text-xs text-muted">
                {listOpen ? '▲' : '▼'}
              </span>
            </button>
            <div
              className={`${
                listOpen
                  ? 'absolute inset-x-0 top-full z-30 mt-1 max-h-[70dvh] overflow-y-auto rounded-lg border border-line bg-surface p-2 shadow-lg'
                  : 'hidden'
              } lg:static lg:mt-0 lg:block lg:max-h-none lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
            >
            <ul className="space-y-1.5">{active.map(renderListItem)}</ul>
            {archived.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  className="mb-2 text-xs font-medium text-muted hover:text-ink"
                >
                  {showArchived ? '▼' : '▶'} {t('Archived ({n})', { n: archived.length })}
                </button>
                {showArchived && <ul className="space-y-1.5">{archived.map(renderListItem)}</ul>}
              </div>
            )}
            </div>
          </aside>

          <div ref={detailRef} className="min-w-0 scroll-mt-16">
            {selected ? (
              renderOpponent(selected)
            ) : (
              <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
                {t('Select an opponent to see its counters.')}
              </p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleting != null}
        title={t('Delete this opponent?')}
        confirmLabel={t('Delete')}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting)}
      >
        {t('It is removed from your list. Its counters are worked out from the game data, so nothing else is lost.')}
      </ConfirmDialog>
    </div>
  );
}

function OpponentForm({
  gameId,
  draft: initial,
  species,
  moves,
  types,
  features,
  lang,
  busy,
  onCancel,
  onSave,
}: {
  gameId: string;
  draft: Draft;
  species: Named[];
  moves: MoveOption[];
  types: string[];
  features: { raids: boolean; tera: boolean };
  lang: Lang;
  busy: boolean;
  onCancel: () => void;
  onSave: (d: Draft, speciesId: number, defaultFormId: number | null) => void;
}) {
  const { t } = useT();
  const [d, setD] = useState(initial);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [moveText, setMoveText] = useState('');
  const name = (x: Named) => (lang === 'en' ? x.nameEn : x.nameEs);
  const text = d.species.trim().toLowerCase();
  const chosen = species.find((s) => s.nameEn.toLowerCase() === text || s.nameEs.toLowerCase() === text);
  const speciesId = chosen?.id ?? null;
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  // The forms and abilities of the chosen Pokémon.
  useEffect(() => {
    if (speciesId == null) return;
    const controller = new AbortController();
    fetch(`/api/battle/options?gameId=${encodeURIComponent(gameId)}&speciesId=${speciesId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { forms: FormOption[] }) => {
        setLoadError(false);
        setForms(data.forms);
        setD((prev) => {
          const keep = data.forms.find((f) => f.id === prev.formId) ?? data.forms[0];
          const ability = keep?.abilities.some((a) => a.id === prev.abilityId) ? prev.abilityId : null;
          return { ...prev, formId: keep?.id ?? null, abilityId: ability };
        });
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setLoadError(true);
      });
    return () => controller.abort();
  }, [speciesId, gameId]);

  const form = forms.find((f) => f.id === d.formId) ?? forms[0];
  const chosenAbility = form?.abilities.find((a) => a.id === d.abilityId);
  const chosenMoves = d.moveIds.flatMap((id) => moves.find((m) => m.id === id) ?? []);

  /** Adds the typed move once it matches one by name (either language). */
  function addMove(text: string) {
    setMoveText(text);
    const q = text.trim().toLowerCase();
    const m = q ? moves.find((x) => x.nameEn.toLowerCase() === q || x.nameEs.toLowerCase() === q) : undefined;
    if (!m || d.moveIds.includes(m.id) || d.moveIds.length >= 4) return;
    set({ moveIds: [...d.moveIds, m.id] });
    setMoveText('');
  }
  const defaultFormId = forms.find((f) => f.isDefault)?.id ?? null;

  const typeLabel = (ty: string) => (lang === 'es' ? (TYPE_LABEL_ES[ty] ?? ty) : ty);
  const heading = 'section-title mb-2 border-b border-line pb-1.5';
  const labelClass = 'mb-1 block text-xs font-medium text-muted';
  /** A pill of a segmented choice. */
  const pill = (on: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm ${
      on ? 'border-done bg-done/15 font-semibold text-done' : 'border-line text-muted hover:bg-surface-2 hover:text-ink'
    }`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (speciesId != null) onSave(d, speciesId, defaultFormId);
      }}
      className="mb-6 rounded-xl border border-line bg-surface p-4"
    >
      <h2 className="mb-4 text-base font-semibold">
        {d.id ? t('Edit opponent') : initial.species ? t('New opponent (copy)') : t('New opponent')}
      </h2>

      <div className="space-y-5">
        {/* ---------- who ---------- */}
        <section>
          <h3 className={heading}>{t('Who is it?')}</h3>
          <div className="flex flex-wrap items-start gap-4">
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-line bg-bg"
              aria-hidden
            >
              {form?.spriteUrl && speciesId != null ? (
                <Sprite src={form.spriteUrl} alt="" size={80} smooth />
              ) : (
                <span className="text-2xl text-muted">?</span>
              )}
            </div>
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block sm:col-span-2 lg:col-span-1">
                <span className={labelClass}>{t('Pokémon')}</span>
                <ComboInput
                  list="battle-species"
                  value={d.species}
                  onChange={(v) => set({ species: v })}
                  placeholder={t('e.g. Charizard')}
                  required
                  className={inputClass}
                />
              </label>
              {forms.length > 1 && (
                <label className="block">
                  <span className={labelClass}>{t('Form')}</span>
                  <select
                    value={form?.id ?? ''}
                    onChange={(e) => set({ formId: Number(e.target.value), abilityId: null })}
                    className={inputClass}
                  >
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.isDefault ? t('Normal') : f.slug.split('-').slice(1).join(' ')} ({f.types.join(' / ')})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {form && form.abilities.length > 0 && (
                <label className="block">
                  <span className={labelClass}>{t('Ability (optional)')}</span>
                  <select
                    value={d.abilityId ?? ''}
                    onChange={(e) => set({ abilityId: e.target.value ? Number(e.target.value) : null })}
                    className={inputClass}
                  >
                    <option value="">{t('Not set')}</option>
                    {form.abilities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {name(a)}
                        {a.isHidden ? ` (${t('hidden')})` : ''}
                      </option>
                    ))}
                  </select>
                  {chosenAbility && (
                    <span className="mt-1 block text-xs text-muted">
                      {(lang === 'es' ? chosenAbility.descriptionEs : chosenAbility.descriptionEn) ??
                        chosenAbility.descriptionEn ??
                        chosenAbility.descriptionEs}
                    </span>
                  )}
                </label>
              )}
              {form && (
                <div className="flex flex-wrap items-center gap-1 sm:col-span-2 lg:col-span-3">
                  {form.types.map((ty) => (
                    <TypeBadge key={ty} type={ty} lang={lang} />
                  ))}
                </div>
              )}
              {speciesId == null && !d.species.trim() && (
                <p className="text-xs text-muted sm:col-span-2 lg:col-span-3">
                  {t('Pick a Pokémon to see its forms and abilities.')}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ---------- the battle ---------- */}
        {(features.raids || features.tera) && (
          <section>
            <h3 className={heading}>{t('The battle')}</h3>
            <div className="space-y-3">
              {features.raids && (
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                  <div>
                    <span className={labelClass}>{t('Battle')}</span>
                    <div className="flex gap-1.5">
                      <button type="button" aria-pressed={d.kind === 'RAID'} onClick={() => set({ kind: 'RAID' })} className={pill(d.kind === 'RAID')}>
                        {t('Raid boss')}
                      </button>
                      <button
                        type="button"
                        aria-pressed={d.kind === 'STANDARD'}
                        onClick={() => set({ kind: 'STANDARD', stars: '' })}
                        className={pill(d.kind === 'STANDARD')}
                      >
                        {t('Other battle')}
                      </button>
                    </div>
                  </div>
                  {d.kind === 'RAID' && (
                    <div>
                      <span className={labelClass}>{t('Stars')}</span>
                      <div className="flex flex-wrap gap-1">
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={d.stars === String(n)}
                            onClick={() => set({ stars: d.stars === String(n) ? '' : String(n) })}
                            className={`${pill(d.stars === String(n))} !px-2.5`}
                          >
                            {n}★
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {features.tera && (
                <div>
                  <span className={labelClass}>{t('Tera type')}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      aria-pressed={d.teraType === ''}
                      onClick={() => set({ teraType: '' })}
                      className={`${pill(d.teraType === '')} !py-0.5 text-xs`}
                    >
                      {t('Not Terastallized')}
                    </button>
                    {types.map((ty) => (
                      <button
                        key={ty}
                        type="button"
                        aria-pressed={d.teraType === ty}
                        title={typeLabel(ty)}
                        onClick={() => set({ teraType: d.teraType === ty ? '' : ty })}
                        className={`rounded p-0.5 ${d.teraType === ty ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : 'opacity-70 hover:opacity-100'}`}
                      >
                        <TypeBadge type={ty} lang={lang} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ---------- its moves ---------- */}
        <section>
          <h3 className={heading}>{t('Its moves')}</h3>
          <p className="mb-2 text-xs text-muted">{t('Up to 4. The suggestions avoid Pokémon that are weak to them.')}</p>
          <div className="flex flex-wrap items-center gap-2">
            {chosenMoves.map((m) => (
              <span key={m.id} className="flex items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1 text-sm">
                {name(m)} <TypeBadge type={m.type} lang={lang} small />
                <button
                  type="button"
                  aria-label={t('Remove')}
                  onClick={() => set({ moveIds: d.moveIds.filter((id) => id !== m.id) })}
                  className="text-muted hover:text-pending"
                >
                  ×
                </button>
              </span>
            ))}
            {d.moveIds.length < 4 ? (
              <ComboInput
                list="battle-moves"
                value={moveText}
                onChange={addMove}
                placeholder={t('Add a move, e.g. Flamethrower')}
                className={`${inputClass} !w-56`}
              />
            ) : null}
            {chosenMoves.length === 0 && <span className="text-xs text-muted">{t('No moves added yet')}</span>}
          </div>
        </section>

        {/* ---------- extras ---------- */}
        <section>
          <h3 className={heading}>{t('Extras')}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className={labelClass}>{t('Name for this opponent (optional)')}</span>
              <input
                value={d.label}
                maxLength={80}
                onChange={(e) => set({ label: e.target.value })}
                placeholder={t('e.g. Wednesday 7★ raid')}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>{t('Notes (optional)')}</span>
              <input value={d.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} className={inputClass} />
            </label>
          </div>
        </section>
      </div>

      {d.species.trim() && speciesId == null && (
        <p className="mt-3 text-xs text-pending">
          {t('"{name}" is not a Pokémon. Pick one from the suggestions.', { name: d.species })}
        </p>
      )}
      {loadError && <p className="mt-3 text-xs text-pending">{t('Could not load the forms for that Pokémon. Try again.')}</p>}

      <div className="mt-5 flex gap-2 border-t border-line pt-4">
        <button
          type="submit"
          disabled={busy || speciesId == null}
          className="rounded-md bg-done px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
        >
          {busy ? t('Saving…') : d.id ? t('Save changes') : t('Add opponent')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-line px-4 py-2 text-sm">
          {t('Cancel')}
        </button>
      </div>
      <datalist id="battle-moves">
        {moves.map((m) => (
          <option key={m.id} value={name(m)} label={lang === 'en' ? m.nameEs : m.nameEn} />
        ))}
      </datalist>
      <datalist id="battle-species">
        {species.map((s) => (
          <option key={s.id} value={name(s)} label={lang === 'en' ? s.nameEs : s.nameEn} />
        ))}
      </datalist>
    </form>
  );
}
