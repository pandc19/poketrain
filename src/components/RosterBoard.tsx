'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from './Dialog';
import { SearchInput } from './SearchInput';
import { RosterDetail } from './roster/RosterDetail';
import { PAGE_SIZE, RosterList } from './roster/RosterList';
import { TeamView } from './roster/TeamView';
import { ComboInput, progressOf, withTask, type Gender } from './roster/parts';
import { mintInForce } from '@/lib/mint';
import type { EvEstimateInfo } from './StatsEvs';
import type { EvSpread } from '@/lib/import/evs';
import type { Lang } from '@/lib/i18n';
import type { IvRatings } from '@/lib/iv-ratings';
import type { EditorOptions, RosterView } from '@/lib/roster';
import type { TaskKey, TaskStatus } from '@/lib/roster-status';
import { useT } from '@/lib/translate-client';
import { KeeperIcon, TrainingIcon } from './KeeperIcon';

type Filter = 'all' | 'pending' | 'done';
type Sort = 'complete' | 'progress' | 'name' | 'level' | 'levelLow';
const SORTS: Sort[] = ['complete', 'progress', 'name', 'level', 'levelLow'];
const SORT_KEY = 'roster-sort';

/**
 * The trained roster: small cards with paging on the left, and everything about
 * the chosen Pokémon on the right, editable in place.
 */
export function RosterBoard({
  gameId,
  initial,
  initialTeam,
  initialTraining,
  initialSelectedId,
  options,
  lang,
  judge,
  evs,
  evTarget,
  tera,
  breeding,
  aiEnabled,
  accent,
}: {
  gameId: string;
  initial: RosterView[];
  /** Roster ids of the team being trained, by slot (null for an empty slot). */
  initialTeam: (string | null)[];
  /** The stat the team is being trained in, if any. */
  initialTraining: keyof EvSpread | null;
  /** The Pokémon named in the address, if any. */
  initialSelectedId: string | null;
  options: EditorOptions;
  lang: Lang;
  /** The game has a Judge ("Juez"), so each Pokémon can carry its Potential. */
  judge: boolean;
  /** The game has EV training. */
  evs: boolean;
  /** A target spread is planned too (EVs are easy to retrain in this game). */
  evTarget: boolean;
  /** The game has Tera types. */
  tera: boolean;
  /** The game has breeding, so a nature can start a breeding plan. */
  breeding: boolean;
  aiEnabled: boolean;
  accent: string;
}) {
  const { t } = useT();
  const sortLabels: Record<Sort, string> = {
    complete: t('Completed first'),
    progress: t('Unfinished first'),
    name: t('Name (A–Z)'),
    level: t('Level (high to low)'),
    levelLow: t('Level (low to high)'),
  };

  const selectedKey = `roster-selected:${gameId}`;
  // A Pokémon to turn the list to once it has it: one just added, or the one left last.
  const [reveal, setReveal] = useState<string | null>(null);
  const [pickedId, setSelectedId] = useState<string | null>(
    initial.some((p) => p.id === initialSelectedId) ? initialSelectedId : null
  );
  const [roster, setRoster] = useState(initial);
  const [slots, setSlots] = useState(initialTeam);
  const [training, setTraining] = useState(initialTraining);
  // The list of cards, or the team being trained. Remembered between visits.
  const [view, setView] = useState<'list' | 'team'>('list');
  const [filter, setFilter] = useState<Filter>('all');
  // The player's marks narrow the list further, whichever of all / pending / done is chosen.
  const [onlyKeeper, setOnlyKeeper] = useState(false);
  const [onlyTraining, setOnlyTraining] = useState(false);
  const [sort, setSort] = useState<Sort>('complete');
  const [query, setQuery] = useState('');
  // Remembered between visits; read after mount so the server and first client render agree.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY) as Sort | null;
      // Read after mount on purpose: the server render has no localStorage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && SORTS.includes(saved)) setSort(saved);
      if (localStorage.getItem('roster-view') === 'team') setView('team');
    } catch {}
    // Coming back to the page shows the Pokémon you were last on, on its page of the list. A link naming one wins.
    // Done here so the list is already in the saved sort when the page is worked out.
    try {
      const last = sessionStorage.getItem(selectedKey);
      if (!initialSelectedId && last && initial.some((p) => p.id === last)) {
        setSelectedId(last);
        setReveal(last);
      }
    } catch {}
    // Mount only: it reads what the last visit left.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A link with ?p= opens that Pokémon once; the address is then cleaned, so coming back to the page later
  // (a restored tab on a tablet, say) starts fresh instead of on the page and Pokémon left last.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const [page, setPage] = useState(() => {
    const index = initial.findIndex((p) => p.id === initialSelectedId);
    return index >= 0 ? Math.floor(index / PAGE_SIZE) : 0;
  });
  // Until the player picks one (or the address names one), the first in the current sort is shown.
  const [removing, setRemoving] = useState<RosterView | null>(null);
  const [auditing, setAuditing] = useState<string | null>(null);
  // A saved audit is shown by default; these are the ones the player hid.
  const [hiddenAudits, setHiddenAudits] = useState<Set<string>>(new Set());
  const setAuditShown = (id: string, shown: boolean) =>
    setHiddenAudits((prev) => {
      const next = new Set(prev);
      if (shown) next.delete(id);
      else next.add(id);
      return next;
    });
  const [adding, setAdding] = useState('');
  const [error, setError] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const name = useCallback(
    (x: { nameEn: string; nameEs: string } | null | undefined) => (x ? (lang === 'en' ? x.nameEn : x.nameEs) : ''),
    [lang]
  );

  const replace = (p: RosterView) => setRoster((prev) => prev.map((x) => (x.id === p.id ? p : x)));

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

  // Where the page was scrolled when another Pokémon was chosen, so the details stay in the same spot.
  const keepScroll = useRef<number | null>(null);

  function select(id: string) {
    const wide = !window.matchMedia('(max-width: 1023px)').matches;
    keepScroll.current = wide ? window.scrollY : null;
    setSelectedId(id);
    try {
      sessionStorage.setItem(selectedKey, id);
    } catch {}
    // On a narrow screen the detail is below the list: bring it into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function toggle(p: RosterView, key: TaskKey, current: TaskStatus) {
    const status: TaskStatus = current === 'DONE' ? 'PENDING' : 'DONE';
    setError(null);
    replace(withTask(p, key, status));
    try {
      await api(`/api/roster/${p.id}`, 'PATCH', { task: { key, status } });
    } catch {
      replace(p);
      setError(t('Could not save that change. It has been undone; try again.'));
    }
  }

  async function changeGender(p: RosterView, gender: Gender) {
    setError(null);
    replace({ ...p, gender });
    try {
      await api(`/api/roster/${p.id}`, 'PATCH', { set: { gender } });
    } catch {
      replace(p);
      setError(t('Could not save the gender. It has been undone; try again.'));
    }
  }

  async function changePotential(p: RosterView, potential: RosterView['potential']) {
    setError(null);
    replace({ ...p, potential });
    try {
      // The server sends the Pokémon back: a new potential changes what the EVs mean.
      const data = await api<{ pokemon: RosterView }>(`/api/roster/${p.id}`, 'PATCH', { set: { potential } });
      replace(data.pokemon);
    } catch {
      replace(p);
      setError(t('Could not save the potential. It has been undone; try again.'));
    }
  }

  /** What the stats-to-EVs panel needs for this Pokémon: its base stats and the nature it really has. */
  const estimateFor = (p: RosterView): EvEstimateInfo | undefined => {
    if (!p.baseStats) return undefined;
    const effectOf = (n: { id: number } | null) => {
      const found = n ? options.natures.find((x) => x.id === n.id) : null;
      return found ? { increased: found.increased, decreased: found.decreased } : null;
    };
    // The nature effect in force now (a Mint's, else the nature it has), and the one the stats were read under.
    const now = mintInForce(p) ?? p.currentNature ?? p.targetNature;
    const read = p.currentStats && p.statsNature ? p.statsNature : now;
    return {
      baseStats: p.baseStats,
      nature: effectOf(read),
      natureName: read ? name(read) : null,
      mint: mintInForce(p) != null,
      live: { nature: effectOf(now), natureName: now ? name(now) : null },
    };
  };

  /** Saves the stats and level; the server works the EVs out and sends the Pokémon back. */
  async function saveStats(
    p: RosterView,
    stats: EvSpread | null,
    level: number,
    ivRatings: IvRatings
  ) {
    setError(null);
    replace({ ...p, currentStats: stats, level, ivRatings });
    try {
      const data = await api<{ pokemon: RosterView }>(`/api/roster/${p.id}`, 'PATCH', {
        set: {
          currentStats: stats,
          level,
          ivRatings: Object.values(ivRatings).some(Boolean) ? ivRatings : null,
        },
      });
      replace(data.pokemon);
    } catch {
      replace(p);
      setError(t('Could not save that change. It has been undone; try again.'));
    }
  }

  /** Saves any fields; resolves to an error message, or null when it worked. */
  async function saveSet(p: RosterView, set: Record<string, unknown>): Promise<string | null> {
    try {
      const data = await api<{ pokemon: RosterView }>(`/api/roster/${p.id}`, 'PATCH', { set });
      replace(data.pokemon);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : t('Could not save');
    }
  }

  /** Moves it to another stage of its line, and/or sets the stage it is meant to end as. */
  async function changeStage(
    p: RosterView,
    body: { speciesId?: number; finalSpeciesId?: number | null }
  ): Promise<string | null> {
    try {
      const data = await api<{ pokemon: RosterView }>(`/api/roster/${p.id}/evolve`, 'POST', body);
      replace(data.pokemon);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : t('Could not save');
    }
  }

  async function remove(p: RosterView) {
    setRemoving(null);
    try {
      await api(`/api/roster/${p.id}?role=ROSTER`, 'DELETE');
      const index = roster.findIndex((x) => x.id === p.id);
      const rest = roster.filter((x) => x.id !== p.id);
      setRoster(rest);
      setSlots((prev) => prev.map((id) => (id === p.id ? null : id)));
      if (selectedId === p.id) {
        const next = rest[Math.min(index, rest.length - 1)];
        setSelectedId(next?.id ?? null);
      }
    } catch {
      setError(t('Could not remove that Pokémon. Try again.'));
    }
  }

  /** Adds or takes away the "also a breeder" role. */
  async function setBreeder(p: RosterView, on: boolean) {
    setError(null);
    try {
      if (on) {
        const data = await api<{ pokemon: RosterView }>('/api/roster', 'POST', {
          gameId,
          existingId: p.id,
          role: 'BREEDER',
        });
        replace(data.pokemon);
      } else {
        await api(`/api/roster/${p.id}?role=BREEDER`, 'DELETE');
        replace({ ...p, roles: p.roles.filter((r) => r !== 'BREEDER') });
      }
    } catch {
      setError(t('Could not save that change. It has been undone; try again.'));
    }
  }

  async function add() {
    const wanted = adding.trim().toLowerCase();
    const species = options.species.find((s) => s.nameEn.toLowerCase() === wanted || s.nameEs.toLowerCase() === wanted);
    if (!species) {
      setError(t('"{name}" is not a Pokémon you can get in this game. Pick one from the suggestions.', { name: adding }));
      return;
    }
    setError(null);
    try {
      const data = await api<{ pokemon: RosterView }>('/api/roster', 'POST', {
        gameId,
        speciesId: species.id,
        role: 'ROSTER',
      });
      setRoster((prev) => [...prev, data.pokemon]);
      setAdding('');
      // Show it and open it, wherever the sort puts it: clear what could hide it, then go to its page.
      setFilter('all');
      setOnlyKeeper(false);
      setOnlyTraining(false);
      setQuery('');
      setReveal(data.pokemon.id);
      select(data.pokemon.id);
    } catch {
      setError(t('Could not add that Pokémon. Try again.'));
    }
  }

  function changeView(next: 'list' | 'team') {
    setView(next);
    try {
      localStorage.setItem('roster-view', next);
    } catch {}
  }

  /** Chooses (or clears) the stat the team is training in. */
  async function chooseTraining(stat: keyof EvSpread | null) {
    const before = training;
    setTraining(stat);
    try {
      await api('/api/team', 'PATCH', { gameId, trainingStat: stat });
    } catch {
      setTraining(before);
      setError(t('Could not change the team. Try again.'));
    }
  }

  /** Puts a roster Pokémon in a team slot (or empties it); the server answers with the team as it is. */
  async function setSlot(slot: number, id: string | null, choose = true) {
    const before = slots;
    setError(null);
    setSlots((prev) => {
      const next = [...prev];
      if (id == null) {
        // Emptying a slot: the ones after it move up.
        next.splice(slot - 1, 1);
        next.push(null);
        return next;
      }
      const from = next.indexOf(id);
      if (from >= 0) next[from] = next[slot - 1];
      next[slot - 1] = id;
      return next;
    });
    try {
      const data = await api<{ team: (string | null)[] }>('/api/team', 'PUT', { gameId, slot, rosterPokemonId: id });
      setSlots(data.team);
      if (id && choose) select(id);
    } catch {
      setSlots(before);
      setError(t('Could not change the team. Try again.'));
    }
  }

  /** Puts a roster Pokémon in the first empty team slot, until the team is full. */
  function addToTeam(id: string) {
    if (slots.includes(id)) return;
    const empty = slots.indexOf(null);
    if (empty < 0) return;
    void setSlot(empty + 1, id, false);
  }

  async function audit(p: RosterView, refresh = false, deep = false, quick = false) {
    setAuditing(p.id);
    setAuditShown(p.id, true);
    setError(null);
    try {
      const data = quick
        ? await api<{ pokemon: RosterView }>('/api/audit/quick', 'POST', { rosterPokemonId: p.id })
        : await api<{ pokemon: RosterView }>('/api/ai/audit', 'POST', { rosterPokemonId: p.id, refresh, deep });
      replace(data.pokemon);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('The audit failed.'));
    } finally {
      setAuditing(null);
    }
  }

  const complete = useMemo(() => roster.filter((p) => progressOf(p).complete).length, [roster]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = roster.filter((p) => {
      if (filter !== 'all' && progressOf(p).complete !== (filter === 'done')) return false;
      if (onlyKeeper && !p.keeper) return false;
      if (onlyTraining && !p.training) return false;
      if (!q) return true;
      return (
        p.species.nameEn.toLowerCase().includes(q) ||
        p.species.nameEs.toLowerCase().includes(q) ||
        (p.nickname ?? '').toLowerCase().includes(q) ||
        String(p.nationalNumber) === q
      );
    });
    const byName = (a: RosterView, b: RosterView) =>
      name(a.species).localeCompare(name(b.species), lang) || a.nationalNumber - b.nationalNumber;
    const ratio = (p: RosterView) => {
      const { done, total } = progressOf(p);
      return total ? done / total : 1;
    };
    // Keepers, then the ones in training, then the rest.
    const group = (p: RosterView) => (p.keeper ? 0 : p.training ? 1 : 2);
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'name':
          return byName(a, b);
        case 'level':
          return b.level - a.level || byName(a, b);
        case 'levelLow':
          return a.level - b.level || byName(a, b);
        case 'complete':
          // Keepers, training, the rest; in each, fully trained first, then by how much is done; ties by name.
          return group(a) - group(b) || ratio(b) - ratio(a) || byName(a, b);
        default:
          // The other way round: the rest, training, keepers; in each, the least finished first.
          return group(b) - group(a) || ratio(a) - ratio(b) || byName(a, b);
      }
    });
  }, [roster, filter, onlyKeeper, onlyTraining, sort, query, lang, name]);

  // A Pokémon just added: once the list has it, turn to the page it is on.
  if (reveal) {
    const index = visible.findIndex((p) => p.id === reveal);
    if (index >= 0) {
      setReveal(null);
      setPage(Math.floor(index / PAGE_SIZE));
    }
  }

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const selectedId = roster.some((p) => p.id === pickedId) ? pickedId : (visible[0]?.id ?? null);
  const selected = roster.find((p) => p.id === selectedId) ?? null;

  // The details are replaced by the other Pokémon's, and the page stays where it was.
  useLayoutEffect(() => {
    if (keepScroll.current != null) {
      window.scrollTo({ top: keepScroll.current });
      keepScroll.current = null;
    }
  }, [selectedId]);

  const numberLabel = (p: RosterView) => `#${String(p.nationalNumber).padStart(3, '0')}`;

  const dialogs = (
    <>
      <ConfirmDialog
        open={removing != null}
        title={t('Remove from the roster?')}
        confirmLabel={t('Remove')}
        danger
        onConfirm={() => removing && remove(removing)}
        onCancel={() => setRemoving(null)}
      >
        <p>
          {t('{name} and its checklist will be deleted. Your Pokédex is not changed.', {
            name: removing ? (removing.nickname ?? name(removing.species)) : '',
          })}
        </p>
      </ConfirmDialog>
      <datalist id="species-list">
        {options.species.map((s) => (
          <option key={s.id} value={name(s)} label={lang === 'en' ? s.nameEs : s.nameEn} />
        ))}
      </datalist>
    </>
  );

  const addBox = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
      className="flex gap-1"
    >
      <ComboInput
        list="species-list"
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
  );

  const viewSwitch = (
    <div className="inline-flex rounded-md border border-line text-sm" role="tablist" aria-label={t('View')}>
      {(['list', 'team'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => {
            changeView(v);
            // Back to the list: open the page the selected Pokémon is on, not the one the list was left at.
            const index = v === 'list' ? visible.findIndex((p) => p.id === selectedId) : -1;
            if (index >= 0) setPage(Math.floor(index / PAGE_SIZE));
          }}
          className={`px-4 py-1.5 ${view === v ? 'bg-surface-2 font-semibold' : 'text-muted hover:text-ink'}`}
        >
          {v === 'list' ? t('List') : t('Team')}
        </button>
      ))}
    </div>
  );

  if (roster.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center">
        <p className="text-lg font-semibold">{t('Your roster is empty')}</p>
        <p className="mt-1 text-sm text-muted">{t('Add a Pokémon by name to start.')}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">{addBox}</div>
        {error && <p className="mt-4 text-sm text-pending">{error}</p>}
        {dialogs}
      </div>
    );
  }

  return (
    <div>
      {/* ---------- the switch between the list and the team ---------- */}
      {view === 'list' && (
        <div className="-mx-4 mb-3 flex flex-wrap items-center gap-3 bg-bg/95 px-4 py-2 backdrop-blur md:sticky md:top-[var(--nav-h)] md:z-30">
          <p className="text-sm">
            <span className="font-semibold text-done">{complete}</span>
            <span className="text-muted"> {t('of {total} fully trained', { total: roster.length })}</span>
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {addBox}
            {viewSwitch}
          </div>
        </div>
      )}

      {view === 'list' && !aiEnabled && (
        <p className="mb-3 text-xs text-muted">
          {t(
            'AI audits are off: no API key is configured. The quick audit and the move legality checks still run, since they use game data rather than AI.'
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
          {error}
        </p>
      )}

      {/* ---------- list of cards, or the team being trained ---------- */}
      {view === 'team' ? (
        <TeamView
          roster={roster}
          team={slots}
          selectedId={selectedId}
          lang={lang}
          accent={accent}
          viewSwitch={viewSwitch}
          gameId={gameId}
          aiEnabled={aiEnabled}
          training={training}
          onTraining={chooseTraining}
          tera={tera}
          estimateFor={estimateFor}
          onSelect={select}
          onSetSlot={setSlot}
          onSaveStats={saveStats}
          onStatsRead={(p) => void saveSet(p, { statsRead: true })}
          onOpenDetails={(id) => {
            changeView('list');
            setReveal(id);
            select(id);
          }}
        />
      ) : (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
        {/* ---------- the list: stays in view while the details scroll (it scrolls itself when taller than the screen) ---------- */}
        <aside className="lg:sticky lg:top-[calc(var(--nav-h)+4rem)] lg:max-h-[calc(100dvh-var(--nav-h)-5rem)] lg:self-start lg:-m-1 lg:overflow-y-auto lg:p-1">
          <div className="mb-3 space-y-2">
            <SearchInput
              value={query}
              onChange={(v) => {
                setQuery(v);
                setPage(0);
              }}
              placeholder={t('Search the roster')}
              label={t('Search the roster')}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={onlyKeeper}
                onClick={() => {
                  setOnlyKeeper(!onlyKeeper);
                  setOnlyTraining(false);
                  setPage(0);
                }}
                className={`rounded-md border px-3 py-1.5 text-xs ${onlyKeeper ? 'border-violet-500/60 bg-violet-500/10 font-semibold text-violet-500' : 'border-line text-muted'}`}
              >
                <span className="flex items-center gap-1.5">
                  <KeeperIcon size={16} />
                  {t('Keeper')}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={onlyTraining}
                onClick={() => {
                  setOnlyTraining(!onlyTraining);
                  setOnlyKeeper(false);
                  setPage(0);
                }}
                className={`rounded-md border px-3 py-1.5 text-xs ${onlyTraining ? 'border-teal-500/60 bg-teal-500/10 font-semibold text-teal-500' : 'border-line text-muted'}`}
              >
                <span className="flex items-center gap-1.5">
                  <TrainingIcon size={16} />
                  {t('Training')}
                </span>
              </button>
              <div className="flex rounded-md border border-line text-xs">
                {(['all', 'done', 'pending'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setFilter(f);
                      setPage(0);
                    }}
                    className={`px-3 py-1.5 ${filter === f ? 'bg-surface-2 font-semibold' : 'text-muted'}`}
                  >
                    {f === 'all' ? t('All') : f === 'pending' ? t('Pending') : t('Done')}
                  </button>
                ))}
              </div>
              <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
                {t('Sort')}
                <select
                  value={sort}
                  onChange={(e) => {
                    const next = e.target.value as Sort;
                    setSort(next);
                    setPage(0);
                    try {
                      localStorage.setItem(SORT_KEY, next);
                    } catch {}
                  }}
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-ink"
                >
                  {(Object.keys(sortLabels) as Sort[]).map((key) => (
                    <option key={key} value={key}>
                      {sortLabels[key]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <RosterList
            items={visible}
            selectedId={selectedId}
            onSelect={select}
            page={currentPage}
            pageCount={pageCount}
            onPage={setPage}
            total={visible.length}
            lang={lang}
            numberOf={numberLabel}
            accent={accent}
            team={slots}
            onAddToTeam={addToTeam}
          />
        </aside>

        {/* ---------- the detail ---------- */}
        <div ref={detailRef} className="min-w-0 scroll-mt-4">
          {selected ? (
            <RosterDetail
              key={selected.id}
              gameId={gameId}
              p={selected}
              options={options}
              lang={lang}
              judge={judge}
              evs={evs}
              evTarget={evTarget}
              breeding={breeding}
              estimate={estimateFor(selected)}
              numberLabel={numberLabel(selected)}
              aiEnabled={aiEnabled}
              auditing={auditing === selected.id}
              auditOpen={!hiddenAudits.has(selected.id)}
              onToggle={(key, current) => toggle(selected, key, current)}
              onSet={(set) => saveSet(selected, set)}
              onStage={(body) => changeStage(selected, body)}
              teamSlot={slots.indexOf(selected.id) >= 0 ? slots.indexOf(selected.id) + 1 : null}
              teamFull={!slots.includes(null)}
              onAddToTeam={() => addToTeam(selected.id)}
              onGender={(g) => changeGender(selected, g)}
              onPotential={(v) => changePotential(selected, v)}
              onSaveStats={(stats, level, ratings) => saveStats(selected, stats, level, ratings)}
              onAudit={(refresh, deep) => audit(selected, refresh, deep)}
              onQuickAudit={() => audit(selected, false, false, true)}
              onToggleAudit={() => setAuditShown(selected.id, hiddenAudits.has(selected.id))}
              onBreeder={(on) => setBreeder(selected, on)}
              onRemove={() => setRemoving(selected)}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
              {t('Select a Pokémon to see and edit it.')}
            </p>
          )}
        </div>
      </div>
      )}
      {dialogs}
    </div>
  );
}
