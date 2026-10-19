'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from './Dialog';
import { SearchInput } from './SearchInput';
import { TypeBadge } from './TypeBadge';
import { STAT_LABELS, STAT_ORDER } from './EvInputs';
import { ComboInput, GenderControl, PokemonSprite, genderMark, PotentialSelect, type Gender } from './roster/parts';
import { IV_STATS } from '@/lib/breeding/engine';
import type { Lang } from '@/lib/i18n';
import { TYPE_COLORS } from '@/lib/pokemon-types';
import { IV_RATINGS, type IvRatings } from '@/lib/iv-ratings';
import type { EditorOptions, RosterView } from '@/lib/roster';
import { useT } from '@/lib/translate-client';
import { CheckIcon, CopyIcon, TrashIcon } from './ActionIcons';

type Named = { id: number; nameEn: string; nameEs: string };

const inputClass = 'w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm';
const PAGE = 12;

const perfectCount = (p: RosterView) => IV_STATS.filter((s) => p.ivRatings?.[s] === 'PERFECT').length;
const judgedCount = (p: RosterView) => IV_STATS.filter((s) => p.ivRatings?.[s]).length;

/**
 * The Pokémon kept for breeding: cards on the left, and on the right what the breeding
 * plans need to know about the chosen one (its IV words, nature and ability).
 */
export function BreedersBoard({
  gameId,
  initial,
  initialSelectedId,
  options,
  lang,
  judge,
  accent,
}: {
  gameId: string;
  initial: RosterView[];
  initialSelectedId: string | null;
  options: EditorOptions;
  lang: Lang;
  judge: boolean;
  accent: string;
}) {
  const { t } = useT();
  const [list, setList] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.some((p) => p.id === initialSelectedId) ? initialSelectedId : (initial[0]?.id ?? null)
  );
  // Coming back to the page shows the Pokémon you were last on, unless a link names one.
  const storageKey = `breeders-selected:${gameId}`;
  const restored = useRef(false);
  useEffect(() => {
    try {
      if (!restored.current) {
        restored.current = true;
        const saved = sessionStorage.getItem(storageKey);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!initialSelectedId && saved && initial.some((p) => p.id === saved)) setSelectedId(saved);
        return;
      }
      if (selectedId) sessionStorage.setItem(storageKey, selectedId);
    } catch {}
  }, [selectedId, storageKey, initial, initialSelectedId]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState('');
  const [fromRoster, setFromRoster] = useState('');
  const [rosterChoices, setRosterChoices] = useState<RosterView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RosterView | null>(null);
  /** When removing: also take its Have mark off in the Pokédex. */
  const [clearHave, setClearHave] = useState(true);

  const name = (x: Named | null | undefined) => (x ? (lang === 'en' ? x.nameEn : x.nameEs) : '');
  const other = (x: Named) => (lang === 'en' ? x.nameEs : x.nameEn);
  const find = (items: Named[], text: string) => {
    const q = text.trim().toLowerCase();
    return items.find((x) => x.nameEn.toLowerCase() === q || x.nameEs.toLowerCase() === q);
  };
  const replace = (p: RosterView) => setList((prev) => prev.map((x) => (x.id === p.id ? p : x)));

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

  /** Saves fields and shows what the server sends back. */
  async function save(p: RosterView, set: Record<string, unknown>) {
    setError(null);
    try {
      const data = await api<{ pokemon: RosterView }>(`/api/roster/${p.id}`, 'PATCH', { set });
      replace(data.pokemon);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not save'));
    }
  }

  /** Switches a breeder to the stage before or after it; moves, IVs and the rest stay. */
  async function changeStage(p: RosterView, speciesId: number) {
    setError(null);
    const data = await api<{ pokemon: RosterView }>(`/api/roster/${p.id}/evolve`, 'POST', { speciesId });
    replace(data.pokemon);
  }

  async function remove(p: RosterView) {
    setRemoving(null);
    try {
      // A breeder is one you have, so taking it out can take the Have mark off too (the Pokédex keeps it caught).
      // Still on the roster, it is still one you have: nothing to ask or change there.
      if (clearHave && p.owned && !p.roles.includes('ROSTER')) await api(`/api/roster/${p.id}`, 'PATCH', { task: { key: 'owned', status: 'PENDING' } });
      await api(`/api/roster/${p.id}?role=BREEDER`, 'DELETE');
      const rest = list.filter((x) => x.id !== p.id);
      setList(rest);
      if (selectedId === p.id) setSelectedId(rest[0]?.id ?? null);
    } catch {
      setError(t('Could not remove that Pokémon. Try again.'));
    }
  }

  /** A copy of this breeder, to record another with different IVs or nature for the plans to choose from. */
  async function clone(p: RosterView) {
    setError(null);
    try {
      const data = await api<{ pokemon: RosterView }>('/api/roster', 'POST', { gameId, cloneId: p.id, role: 'BREEDER' });
      setList((prev) => [...prev, data.pokemon]);
      setQuery('');
      setSelectedId(data.pokemon.id);
    } catch {
      setError(t('Could not clone that Pokémon. Try again.'));
    }
  }

  async function add() {
    const species = find(options.species, adding);
    if (!species) {
      setError(t('"{name}" is not a Pokémon you can get in this game. Pick one from the suggestions.', { name: adding }));
      return;
    }
    setError(null);
    try {
      const data = await api<{ pokemon: RosterView }>('/api/roster', 'POST', { gameId, speciesId: species.id, role: 'BREEDER' });
      setList((prev) => [...prev, data.pokemon]);
      setAdding('');
      setQuery('');
      setPage(Math.floor(list.length / PAGE));
      setSelectedId(data.pokemon.id);
    } catch {
      setError(t('Could not add that Pokémon. Try again.'));
    }
  }

  /** Roster Pokémon that are not breeders yet, loaded when the picker is first used. */
  async function openRosterPicker() {
    if (rosterChoices) return;
    try {
      const data = await api<{ pokemon: RosterView[] }>(`/api/roster?gameId=${encodeURIComponent(gameId)}&role=ROSTER`, 'GET');
      setRosterChoices(data.pokemon.filter((p) => !p.roles.includes('BREEDER')));
    } catch {
      setRosterChoices([]);
    }
  }

  async function addFromRoster() {
    const choice = rosterChoices?.find((p) => `${name(p.species)}${p.nickname ? ` (${p.nickname})` : ''}` === fromRoster);
    if (!choice) return;
    setError(null);
    try {
      const data = await api<{ pokemon: RosterView }>('/api/roster', 'POST', { gameId, existingId: choice.id, role: 'BREEDER' });
      setList((prev) => [...prev, data.pokemon]);
      setRosterChoices((prev) => prev?.filter((p) => p.id !== choice.id) ?? null);
      setFromRoster('');
      setSelectedId(data.pokemon.id);
    } catch {
      setError(t('Could not add that Pokémon. Try again.'));
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...list].sort(
      (a, b) => a.nationalNumber - b.nationalNumber || perfectCount(b) - perfectCount(a)
    );
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.species.nameEn.toLowerCase().includes(q) ||
        p.species.nameEs.toLowerCase().includes(q) ||
        (p.nickname ?? '').toLowerCase().includes(q)
    );
  }, [list, query]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = visible.slice(currentPage * PAGE, currentPage * PAGE + PAGE);
  const selected = list.find((p) => p.id === selectedId) ?? null;

  const addBar = (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex gap-1"
      >
        <ComboInput
          list="breeder-species"
          value={adding}
          onChange={setAdding}
          placeholder={t('Add Pokémon…')}
          aria-label={t('Add a Pokémon by name')}
          className="w-40 rounded-md border border-line bg-surface px-2 py-1.5 text-xs placeholder:text-muted"
        />
        <button disabled={!adding.trim()} className="rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40">
          {t('Add')}
        </button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addFromRoster();
        }}
        className="flex gap-1"
      >
        <ComboInput
          list="breeder-from-roster"
          value={fromRoster}
          onChange={setFromRoster}
          onFocus={() => void openRosterPicker()}
          placeholder={t('From my roster…')}
          aria-label={t('Add a Pokémon that is already on the roster')}
          className="w-44 rounded-md border border-line bg-surface px-2 py-1.5 text-xs placeholder:text-muted"
        />
        <button disabled={!fromRoster.trim()} className="rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40">
          {t('Add')}
        </button>
      </form>
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">{t('{count} breeders', { count: list.length })}</p>
        <div className="ml-auto">{addBar}</div>
      </div>
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
          {error}
        </p>
      )}

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          {t('No breeders yet. Add a Pokémon above, or take one from your roster.')}
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
          <aside>
            <SearchInput
              value={query}
              onChange={(v) => {
                setQuery(v);
                setPage(0);
              }}
              placeholder={t('Search the breeders')}
              label={t('Search the breeders')}
              className="mb-3"
            />
            {shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">{t('No Pokémon match this filter.')}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {shown.map((p) => {
                  const active = p.id === selectedId;
                  const perfect = perfectCount(p);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        aria-current={active ? 'true' : undefined}
                        className={`flex h-full w-full flex-col items-center rounded-lg border border-line px-1.5 pb-2 pt-1.5 text-center ${
                          active ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2'
                        } ${p.breedingOff ? 'opacity-50' : ''}`}
                        style={active ? { outline: `2px solid ${accent}`, outlineOffset: 1 } : undefined}
                      >
                        <PokemonSprite p={p} size={56} animated={false} />
                        <span className="mt-0.5 flex w-full items-center justify-center gap-1 text-xs font-medium">
                          <span className="truncate">{p.nickname ?? name(p.species)}</span>
                          {genderMark(p) && (
                            <span className={`shrink-0 font-bold ${genderMark(p)!.color}`} title={genderMark(p)!.label[lang]}>
                              {genderMark(p)!.symbol}
                            </span>
                          )}
                        </span>
                        {p.currentNature && <span className="mt-0.5 text-[10px] text-muted">{name(p.currentNature)}</span>}
                        <span className={`mt-1 text-[10px] ${perfect >= 5 ? 'text-star' : perfect > 0 ? 'text-done' : 'text-muted'}`}>
                          {judgedCount(p) === 0 ? t('IVs not recorded') : `${perfect}/6 ${t('perfect')}`}
                        </span>
                        {/* The line is always there so every card has the same height. */}
                        <span className="h-3.5 text-[10px] leading-3.5 text-muted">
                          {p.breedingOff ? t('left out of the plans') : p.roles.includes('ROSTER') ? t('also on the roster') : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {pageCount > 1 && (
              <nav className="mt-3 flex items-center justify-between text-xs" aria-label={t('Pages')}>
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 0}
                  className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40"
                >
                  ← {t('Previous')}
                </button>
                <span className="text-muted">{t('Page {page} of {pages}', { page: currentPage + 1, pages: pageCount })}</span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= pageCount - 1}
                  className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40"
                >
                  {t('Next')} →
                </button>
              </nav>
            )}
          </aside>

          <div className="min-w-0">
            {selected ? (
              <BreederDetail
                key={selected.id}
                gameId={gameId}
                p={selected}
                options={options}
                lang={lang}
                judge={judge}
                onSave={(set) => save(selected, set)}
                onGender={(g: Gender) => save(selected, { gender: g })}
                onPotential={(v) => save(selected, { potential: v })}
                onStage={(speciesId) => changeStage(selected, speciesId).catch((e) => setError(e instanceof Error ? e.message : t('Could not change its stage. Try again.')))}
                onClone={() => void clone(selected)}
                onRemove={() => {
                  setClearHave(true);
                  setRemoving(selected);
                }}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
                {t('Select a Pokémon to see and edit it.')}
              </p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={removing != null}
        title={t('Remove from the breeders?')}
        confirmLabel={t('Remove')}
        danger
        onConfirm={() => removing && remove(removing)}
        onCancel={() => setRemoving(null)}
      >
        <p>
          {removing?.roles.includes('ROSTER')
            ? t('{name} stays on your roster. Only its place in the breeders is removed.', {
                name: removing ? (removing.nickname ?? name(removing.species)) : '',
              })
            : t('{name} will be deleted from the breeders.', {
                name: removing ? (removing.nickname ?? name(removing.species)) : '',
              })}
        </p>
        {removing?.owned && !removing.roles.includes('ROSTER') && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" checked={clearHave} onChange={(e) => setClearHave(e.target.checked)} className="mt-1" />
            <span>
              {t('Also take off its Have mark in the Pokédex (it stays caught).')}
              <span className="block text-xs text-muted">
                {t('Leave it ticked if you no longer have this Pokémon; untick it if you still do.')}
              </span>
            </span>
          </label>
        )}
      </ConfirmDialog>
      <datalist id="breeder-species">
        {options.species.map((s) => (
          <option key={s.id} value={name(s)} label={other(s)} />
        ))}
      </datalist>
      <datalist id="breeder-from-roster">
        {(rosterChoices ?? []).map((p) => (
          <option key={p.id} value={`${name(p.species)}${p.nickname ? ` (${p.nickname})` : ''}`} />
        ))}
      </datalist>
    </div>
  );
}

/** `inline` puts the control beside the label, for a single yes/no switch. */
function Field({
  label,
  hint,
  inline,
  children,
}: {
  label: string;
  hint?: string;
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      {inline ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">{label}</span>
          {children}
        </div>
      ) : (
        <>
          <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
          {children}
        </>
      )}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

const NATURE_STAT: Record<string, { en: string; es: string }> = {
  attack: { en: 'Atk', es: 'Atq' },
  defense: { en: 'Def', es: 'Def' },
  'special-attack': { en: 'SpA', es: 'AtEsp' },
  'special-defense': { en: 'SpD', es: 'DefEsp' },
  speed: { en: 'Spe', es: 'Vel' },
};

function BreederDetail({
  gameId,
  p,
  options,
  lang,
  judge,
  onSave,
  onGender,
  onPotential,
  onStage,
  onClone,
  onRemove,
}: {
  gameId: string;
  p: RosterView;
  options: EditorOptions;
  lang: Lang;
  judge: boolean;
  onSave: (set: Record<string, unknown>) => Promise<void>;
  onGender: (g: Gender) => void;
  onPotential: (v: RosterView['potential']) => void;
  onStage: (speciesId: number) => Promise<void>;
  onClone: () => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const label = (x: Named | null | undefined) => (x ? (lang === 'en' ? x.nameEn : x.nameEs) : '');
  const [nickname, setNickname] = useState(p.nickname ?? '');
  const [notes, setNotes] = useState(p.notes ?? '');
  const [moveError, setMoveError] = useState<string | null>(null);
  const perfect = perfectCount(p);

  // What this species can have: egg moves are the ones worth passing on, so they head the suggestions.
  const [learnable, setLearnable] = useState<{ egg: Named[]; other: Named[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/breeding/moves?gameId=${encodeURIComponent(gameId)}&speciesId=${p.species.id}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setLearnable(data))
      .catch(() => {});
    return () => controller.abort();
  }, [gameId, p.species.id]);
  // The stages next to this one, to swap the breeder for a better specimen of another stage.
  const [stagesFor, setStagesFor] = useState<{
    key: string;
    before: Named[];
    after: Named[];
  } | null>(null);
  const [changing, setChanging] = useState(false);
  const stageKey = `${p.id}:${p.species.id}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/roster/${p.id}/evolve`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setStagesFor({ key: stageKey, ...data }))
      .catch(() => {});
    return () => controller.abort();
  }, [p.id, stageKey]);
  // Only what was loaded for this very Pokémon and stage.
  const stages = stagesFor?.key === stageKey ? stagesFor : null;
  const eggIds = useMemo(() => new Set((learnable?.egg ?? []).map((m) => m.id)), [learnable]);

  const setRating = (stat: (typeof IV_STATS)[number], value: string) => {
    const next: IvRatings = { ...(p.ivRatings ?? {}), [stat]: value || null };
    const any = Object.values(next).some(Boolean);
    void onSave({ ivRatings: any ? next : null });
  };

  const savedMove = (slot: number) => {
    const m = p.moves.find((x) => x.slot === slot);
    return m ? (m.move ? label(m.move) : (m.rawName ?? '')) : '';
  };
  async function commitMove(slot: number, text: string) {
    if (text.trim() === savedMove(slot).trim()) return;
    setMoveError(null);
    if (!text.trim()) return onSave({ moves: [{ slot, moveId: null }] });
    const known = learnable ? [...learnable.egg, ...learnable.other] : options.moves;
    const q = text.trim().toLowerCase();
    const move = known.find((m) => m.nameEn.toLowerCase() === q || m.nameEs.toLowerCase() === q);
    if (!move) {
      setMoveError(t('Move {n}: "{name}" is not a known move. Pick one from the suggestions.', { n: slot, name: text }));
      return;
    }
    // Recorded here means it knows it now, so the planner counts it as a father or picnic donor.
    await onSave({ moves: [{ slot, moveId: move.id, status: 'DONE' }] });
  }

  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <header className="flex flex-wrap items-start gap-4">
        <PokemonSprite p={p} size={96} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{label(p.species)}</h2>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <label className="flex items-center gap-2 text-muted">
              {t('Nickname')}
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onBlur={() => nickname.trim() !== (p.nickname ?? '') && void onSave({ nickname: nickname.trim() || null })}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-40 rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <button
              onClick={onClone}
              title={t('Clone: record another one like this, then change its IVs or nature')}
              aria-label={t('Clone')}
              className="flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-muted hover:text-ink"
            >
              <CopyIcon /> {t('Clone')}
            </button>
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
          <div className="mt-1 flex flex-wrap gap-1">
            {p.types.map((type) => (
              <TypeBadge key={type} type={type} lang={lang} />
            ))}
          </div>
          <p className={`mt-2 text-sm font-semibold ${perfect >= 5 ? 'text-star' : perfect > 0 ? 'text-done' : 'text-muted'}`}>
            {perfect}/6 {t('perfect IVs')}
          </p>
          <div className="mt-2 text-xs">
            {stages && stages.before.length + stages.after.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-1.5"
                title={t('Swap this breeder for another stage of its line. Its moves, IVs and nature stay.')}
              >
                {[...stages.before].reverse().map((prev) => (
                  <button
                    key={prev.id}
                    disabled={changing}
                    onClick={async () => {
                      setChanging(true);
                      await onStage(prev.id).finally(() => setChanging(false));
                    }}
                    className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40"
                  >
                    ← {label(prev)}
                  </button>
                ))}
                {stages.after.map((next) => (
                  <button
                    key={next.id}
                    disabled={changing}
                    onClick={async () => {
                      setChanging(true);
                      await onStage(next.id).finally(() => setChanging(false));
                    }}
                    className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40"
                  >
                    {label(next)} →
                  </button>
                ))}
                <p className="basis-full text-[10px] text-muted">
                  {t('Swap it for another stage of its line. Breeding plans update by themselves.')}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          {/* Being here means you have it; whether it is also trained is just information. */}
          <span
            title={t('A trained Pokémon can be a breeder too: it is kept once and shows on both pages.')}
            className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
              p.roles.includes('ROSTER') ? 'border-done/50 bg-done/10 text-done' : 'border-line text-muted'
            }`}
          >
            {p.roles.includes('ROSTER') ? (
              <>
                <CheckIcon size={12} /> {t('On the roster')}
              </>
            ) : (
              <>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted/60" /> {t('Not on the roster')}
              </>
            )}
          </span>
          <label
            title={t('Turn it off to leave this Pokémon out of the breeding plans, e.g. a repeated one, while it stays recorded here.')}
            className="flex w-fit cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              role="switch"
              checked={!p.breedingOff}
              onChange={(e) => void onSave({ breedingOff: !e.target.checked })}
              className="h-4 w-4 accent-[var(--game-accent)]"
            />
            <span className={p.breedingOff ? 'text-muted' : 'font-medium'}>
              {p.breedingOff ? t('Left out of the plans') : t('Counts in the plans')}
            </span>
          </label>
          <Field label={t('Gender')}>
            <GenderControl p={p} onChange={onGender} />
          </Field>
          <Field label={t('Nature it has')} hint={t('Needed to pick the parent that holds the Everstone.')}>
            <select
              value={p.currentNature?.id ?? 0}
              onChange={(e) => void onSave({ currentNatureId: Number(e.target.value) || null })}
              className={inputClass}
            >
              <option value={0}>{t('Not recorded')}</option>
              {options.natures.map((n) => (
                <option key={n.id} value={n.id}>
                  {label(n)}
                  {n.increased && n.decreased
                    ? ` (+${NATURE_STAT[n.increased]?.[lang] ?? n.increased} −${NATURE_STAT[n.decreased]?.[lang] ?? n.decreased})`
                    : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Ability')} hint={t('A hidden ability is passed down by the mother.')}>
            <select
              value={p.ability?.id ?? 0}
              onChange={(e) => void onSave({ abilityId: Number(e.target.value) || null })}
              className={inputClass}
            >
              <option value={0}>{t('Not recorded')}</option>
              {p.abilityOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {label(a)}
                  {a.isHidden ? ` (${t('hidden')})` : ''}
                </option>
              ))}
            </select>
          </Field>
          {judge && (
            <Field label={t('Potential')} hint={t('The overall verdict. Used when the IV words are not all recorded.')}>
              <PotentialSelect p={p} onChange={onPotential} />
            </Field>
          )}
        </div>

        <div className="space-y-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('IVs, as the Judge says')}</h3>
            <div className="grid grid-cols-3 gap-2">
              {STAT_ORDER.map((stat) => {
                const value = p.ivRatings?.[stat] ?? '';
                return (
                  <label key={stat} className="block">
                    <span className="mb-1 block text-[11px] text-muted">{STAT_LABELS[stat][lang]}</span>
                    <select
                      value={value}
                      onChange={(e) => setRating(stat, e.target.value)}
                      className={`${inputClass} ${value === 'PERFECT' ? 'border-done/60 text-done' : ''}`}
                    >
                      <option value="">{t('Not judged')}</option>
                      {IV_RATINGS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {lang === 'en' ? r.label : r.labelEs}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {t('Only “Best” (Inmejorable) is a 31, the one worth passing on.')}
            </p>
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">{t('Moves it knows')}</h3>
            <p className="mb-2 text-[11px] text-muted">
              {t('These are its four moves, the same ones the roster shows. The ones marked “egg move” can be passed on to the offspring.')}
            </p>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((slot) => {
                const m = p.moves.find((x) => x.slot === slot);
                return (
                  <div key={slot} className="flex items-center gap-2">
                    <ComboInput
                      list="breeder-moves"
                      value={savedMove(slot)}
                      placeholder={t('Move {n}', { n: slot })}
                      aria-label={t('Move {n}', { n: slot })}
                      onCommit={(text) => commitMove(slot, text)}
                      className={inputClass}
                      style={m?.move ? { borderLeftColor: TYPE_COLORS[m.move.type], borderLeftWidth: 3 } : undefined}
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
                    {m?.move && learnable && (
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
                          eggIds.has(m.move.id) ? 'border-star/50 bg-star/10 text-star' : 'border-line text-muted'
                        }`}
                      >
                        {eggIds.has(m.move.id) ? t('egg move') : t('not an egg move')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {moveError && <p className="mt-1 text-xs text-pending">{moveError}</p>}
          </section>

          <Field label={t('Notes')}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes.trim() !== (p.notes ?? '') && void onSave({ notes: notes.trim() || null })}
              rows={3}
              className={inputClass}
            />
          </Field>
        </div>
      </div>
      <datalist id="breeder-moves">
        {(learnable ? [...learnable.egg, ...learnable.other] : options.moves).map((m) => (
          <option key={m.id} value={label(m)} label={lang === 'en' ? m.nameEs : m.nameEn} />
        ))}
      </datalist>
    </article>
  );
}
