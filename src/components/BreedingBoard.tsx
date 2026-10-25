'use client';

import { useEffect, useRef, useState } from 'react';
import { AiHelp, AiUnavailable, DemoAiNote, useAiAccess } from './AiAccess';
import { AiBadge } from './AiBadge';
import { ConfirmDialog, Dialog } from './Dialog';
import { HatchDialog } from './HatchDialog';
import { ComboInput } from './roster/parts';
import { Sprite } from './Sprite';
import { useCachedLocations } from './useCachedLocations';
import { STAT_LABELS } from './EvInputs';
import type { LocationResult } from '@/lib/ai/schema';
import { IV_STATS, type IvStat, type MoveOption, type MovePlan, type ShoppingItem, type SpeciesRef, type Step } from '@/lib/breeding/engine';
import type { BreedingGoalView } from '@/lib/breeding/goals';
import { ABILITY_PATCH, DESTINY_KNOT, EVERSTONE, MIRROR_HERB, POWER_ITEMS } from '@/lib/breeding/items';
import type { IvPlan, ParentPick } from '@/lib/breeding/ivs';
import type { Lang } from '@/lib/i18n';
import { useT } from '@/lib/translate-client';
import { EditIcon, TrashIcon } from './ActionIcons';
import { PokedexButton } from './PokemonInfoDialog';

type Named = { id: number; nameEn: string; nameEs: string };
type RosterBuild = { speciesId: number; species: Named; moves: Named[] };
type LocationState = { busy: boolean; result?: LocationResult; error?: string };

/** How far a plan is from being ready: 0 = everything is at hand; a Pokémon that cannot breed comes last. */
const missingCount = (goal: BreedingGoalView) =>
  !goal.plan ? 500 : !goal.plan.parents.canBreed ? 1000 : goal.plan.shopping.filter((s) => s.have !== 'ready').length;
/** Closest to ready first; plans just as far keep the order they came in (newest first). */
const byCloseness = (goals: BreedingGoalView[]) => [...goals].sort((a, b) => missingCount(a) - missingCount(b));

const heading = 'section-title mb-2 border-b border-line pb-1.5';
const labelClass = 'mb-1 block text-xs font-medium text-muted';
const inputClass = 'w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm placeholder:text-muted';
const symbol = (g?: 'male' | 'female') => (g === 'male' ? '♂ ' : g === 'female' ? '♀ ' : '');

export function BreedingBoard({
  gameId,
  initial,
  species,
  sprites,
  natures,
  lang,
  rosterBuilds,
  picnic,
}: {
  gameId: string;
  initial: BreedingGoalView[];
  species: Named[];
  /** Picture of each Pokémon (by species id). */
  sprites: Record<number, string>;
  natures: Named[];
  lang: Lang;
  rosterBuilds: RosterBuild[];
  /** The game has picnics (Egg Power sandwiches). */
  picnic: boolean;
}) {
  const { t } = useT();
  const { enabled: aiEnabled } = useAiAccess();
  const optionTitles: Record<MoveOption['kind'], string> = {
    'mirror-herb': t('Mirror Herb picnic (no egg needed)'),
    breed: t('Breed with a father that knows it'),
    chain: t('Chain breeding (several generations)'),
  };
  const [goals, setGoals] = useState(initial);
  /** The plan whose details are shown; the one closest to ready to begin with. */
  const [selectedId, setSelectedId] = useState<string | null>(byCloseness(initial)[0]?.id ?? null);
  const selected = goals.find((g) => g.id === selectedId) ?? byCloseness(goals)[0] ?? null;
  const detailRef = useRef<HTMLDivElement>(null);
  const select = (id: string) => {
    setSelectedId(id);
    setListOpen(false);
    // On a narrow screen the details sit below the list.
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };
  /** The parent whose details are open in the dialog. */
  const [viewing, setViewing] = useState<ParentPick | null>(null);
  // Coming back to the page shows the plan you were last on.
  const storageKey = `breeding-plan:${gameId}`;
  const restored = useRef(false);
  useEffect(() => {
    try {
      if (!restored.current) {
        restored.current = true;
        const saved = sessionStorage.getItem(storageKey);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (saved && initial.some((g) => g.id === saved)) setSelectedId(saved);
        return;
      }
      if (selectedId) sessionStorage.setItem(storageKey, selectedId);
    } catch {}
  }, [selectedId, storageKey, initial]);
  const [hatchOpen, setHatchOpen] = useState(false);
  /** The new-plan form is shown on demand once there are plans. */
  const [formOpen, setFormOpen] = useState(initial.length === 0);
  /** The plan being edited in the form; null when it makes a new one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** The Pokémon of the plan being edited: its moves are kept instead of being filled in from the roster. */
  const editSpecies = useRef<number | null>(null);
  /** On a narrow screen the plan list is a dropdown, folded away until asked for. */
  const [listOpen, setListOpen] = useState(false);
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
  const [target, setTarget] = useState('');
  /** One move id (or none) per slot, chosen from the moves the Pokémon can have. */
  const [wanted, setWanted] = useState<(number | null)[]>([null, null, null, null]);
  const [options, setOptions] = useState<{ egg: Named[]; other: Named[]; hiddenAbility: Named | null } | null>(null);
  /** What the offspring should be like, besides its moves. */
  // A perfect Pokémon is the point of breeding, so every IV starts as a target.
  const [ivTargets, setIvTargets] = useState<IvStat[]>([...IV_STATS]);
  const [natureText, setNatureText] = useState('');
  const [hiddenAbility, setHiddenAbility] = useState(false);
  const [filledFromRoster, setFilledFromRoster] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<Record<number, LocationState>>({});
  // Lookups opened this visit; answers saved earlier start collapsed.
  const [openLocations, setOpenLocations] = useState<Set<number>>(new Set());
  const savedLocations = useCachedLocations(
    gameId,
    goals.flatMap((g) => g.plan?.shopping.filter((s) => s.have === 'missing').map((s) => s.species.id) ?? [])
  );
  const [deleting, setDeleting] = useState<BreedingGoalView | null>(null);

  const name = (x: Named | SpeciesRef) => (lang === 'en' ? x.nameEn : x.nameEs);
  const pic = (x: { id: number }, size = 44) => <Sprite src={sprites[x.id] ?? null} alt="" size={size} />;
  const find = (list: Named[], text: string) => {
    const t = text.trim().toLowerCase();
    return list.find((x) => x.nameEn.toLowerCase() === t || x.nameEs.toLowerCase() === t);
  };

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

  const targetId = find(species, target)?.id ?? null;

  /** A plan started from a Battle suggestion or a roster nature: the Pokémon, and the move, ability or nature it was started with. */
  const prefill = useRef<{ move: number | null; ability: number | null } | null>(null);
  useEffect(() => {
    // Read after mount on purpose: the address is not known to the server render.
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search);
    // A link from the roster or Pokédex to a plan that exists.
    const planId = q.get('plan');
    if (planId && initial.some((g) => g.id === planId)) {
      setSelectedId(planId);
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    const s = species.find((x) => x.id === Number(q.get('species')));
    if (!s) return;
    prefill.current = {
      move: Number(q.get('move')) || null,
      ability: Number(q.get('ability')) || null,
    };
    setTarget(name(s));
    const nature = natures.find((x) => x.id === Number(q.get('nature')));
    if (nature) setNatureText(name(nature));
    setFormOpen(true);
    window.history.replaceState(null, '', window.location.pathname);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Choosing a different Pokémon starts the move slots over. */
  function onTargetChange(text: string) {
    setTarget(text);
    if ((find(species, text)?.id ?? null) !== targetId) {
      setWanted([null, null, null, null]);
      setOptions(null);
      setFilledFromRoster(false);
      setSkipped(0);
    }
  }

  // Load what this Pokémon can have, then fill in the build from your roster when you have one.
  useEffect(() => {
    if (targetId == null) return;
    const controller = new AbortController();
    fetch(`/api/breeding/moves?gameId=${encodeURIComponent(gameId)}&speciesId=${targetId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { egg: Named[]; other: Named[]; hiddenAbility: Named | null }) => {
        setOptions(data);
        const wish = prefill.current;
        prefill.current = null;
        if (wish) {
          if (wish.move && data.egg.some((m) => m.id === wish.move)) setWanted([wish.move, null, null, null]);
          if (wish.ability && data.hiddenAbility?.id === wish.ability) setHiddenAbility(true);
          return;
        }
        const build = rosterBuilds.find((b) => b.speciesId === targetId);
        if (!build || editSpecies.current === targetId) return;
        // Only egg moves need breeding; the rest the Pokémon learns normally, so they are not slots to fill.
        const eggIds = new Set(data.egg.map((m) => m.id));
        const usable = build.moves.map((m) => m.id).filter((id) => eggIds.has(id)).slice(0, 4);
        setWanted([0, 1, 2, 3].map((i) => usable[i] ?? null));
        setSkipped(build.moves.length - usable.length);
        // Only "filled in" when something went into a slot.
        setFilledFromRoster(usable.length > 0);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setError(t('Could not load the moves for that Pokémon. Try again.'));
      });
    return () => controller.abort();
  }, [targetId, gameId, rosterBuilds, t]);

  function resetForm() {
    setEditingId(null);
    editSpecies.current = null;
    setTarget('');
    setIvTargets([...IV_STATS]);
    setNatureText('');
    setHiddenAbility(false);
    setWanted([null, null, null, null]);
    setOptions(null);
    setFilledFromRoster(false);
    setSkipped(0);
    setError(null);
  }

  /** Opens the form with the plan's current choices. */
  function startEdit(goal: BreedingGoalView) {
    // Not resetForm: when the Pokémon is the same, the moves already loaded are still the right ones.
    if (goal.species.id !== targetId) setOptions(null);
    setFilledFromRoster(false);
    setSkipped(0);
    setError(null);
    setEditingId(goal.id);
    editSpecies.current = goal.species.id;
    setTarget(name(goal.species));
    setWanted([0, 1, 2, 3].map((i) => goal.moves[i]?.id ?? null));
    setIvTargets(goal.ivTargets);
    setNatureText(goal.nature ? name(goal.nature) : '');
    setHiddenAbility(goal.hiddenAbility);
    setFormOpen(true);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const s = find(species, target);
    if (!s) {
      setError(t('"{name}" is not a Pokémon available in this game. Pick one from the suggestions.', { name: target }));
      return;
    }
    const moveIds = wanted.filter((m): m is number => m != null);
    const nature = natureText.trim() ? find(natures, natureText) : undefined;
    if (natureText.trim() && !nature) {
      setError(t('"{name}" is not a nature. Pick one from the suggestions.', { name: natureText }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fields = { speciesId: s.id, moveIds, ivTargets, natureId: nature?.id ?? null, hiddenAbility };
      if (editingId) {
        const data = await api<{ goal: BreedingGoalView }>(`/api/breeding/${editingId}`, 'PATCH', fields);
        setGoals((prev) => prev.map((g) => (g.id === editingId ? data.goal : g)));
        setSelectedId(data.goal.id);
      } else {
        const data = await api<{ goal: BreedingGoalView }>('/api/breeding', 'POST', { gameId, ...fields });
        setGoals((prev) => [data.goal, ...prev]);
        setSelectedId(data.goal.id);
      }
      resetForm();
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not create the plan.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(goal: BreedingGoalView) {
    setDeleting(null);
    try {
      await api(`/api/breeding/${goal.id}`, 'DELETE');
      setGoals((prev) => prev.filter((g) => g.id !== goal.id));
    } catch {
      setError(t('Could not delete that plan. Try again.'));
    }
  }

  async function locate(s: SpeciesRef, refresh = false) {
    setLocations((prev) => ({ ...prev, [s.id]: { busy: true } }));
    try {
      const data = await api<{ result: LocationResult }>('/api/ai/location', 'POST', { gameId, speciesId: s.id, refresh });
      setLocations((prev) => ({ ...prev, [s.id]: { busy: false, result: data.result } }));
      setOpenLocations((prev) => new Set(prev).add(s.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('Lookup failed.');
      setLocations((prev) => ({ ...prev, [s.id]: { busy: false, error: message } }));
    }
  }

  const moveName = (goal: BreedingGoalView, id?: number) => {
    const m = goal.moves.find((x) => x.id === id);
    return m ? name(m) : t('the move');
  };

  const describe = (goal: BreedingGoalView, item: ShoppingItem): string => {
    const forMove = moveName(goal, item.forMoveId);
    if (item.have === 'ready') {
      if (item.role === 'mother') return t('You have a female. She will be the mother.');
      if (item.role === 'father') return t('You have a male that knows {move}.', { move: forMove });
      return t('You have it.');
    }
    if (item.have === 'caught') {
      if (item.role === 'father') {
        return t(
          'You have it, but either its gender is not recorded or it does not know {move}. Record the gender in your Pokédex, or teach it {move}.',
          { move: forMove }
        );
      }
      if (item.role === 'mother') {
        return t('You have caught this line, but not a recorded female. Record her gender in your Pokédex or roster.');
      }
      return t('You have caught it, but it does not know the move yet.');
    }
    if (item.wrongGender) {
      return item.gender === 'male'
        ? t('You only have the other gender registered. You need a male one.')
        : item.gender === 'female'
          ? t('You only have the other gender registered. You need a female one.')
          : t('You only have the other gender registered. You need a matching one.');
    }
    return t('You do not have this yet.');
  };

  const roleLabel = (goal: BreedingGoalView, item: ShoppingItem) => {
    if (item.role === 'mother') return t('mother (the egg hatches as her species)');
    if (item.role === 'ditto') return t('Ditto (the other parent)');
    if (item.role === 'father') return t('father, passes down {move}', { move: moveName(goal, item.forMoveId) });
    return t('knows {move}, shares it at a picnic', { move: moveName(goal, item.forMoveId) });
  };

  const renderItem = (goal: BreedingGoalView, item: ShoppingItem, key: number) => {
    const result = locations[item.species.id]?.result ?? savedLocations[item.species.id];
    const location = locations[item.species.id];
    const isOpen = openLocations.has(item.species.id);
    const canLookUp = item.have === 'missing';
    return (
      <li key={key} className="rounded-lg border border-line p-2 text-xs">
        <div className="flex items-center gap-2">
          {pic(item.species, 48)}
          <p className="text-sm font-semibold">
            {symbol(item.gender)}
            {name(item.species)} <span className="text-xs font-normal text-muted">· {roleLabel(goal, item)}</span>
          </p>
        </div>
        <p className="mt-1">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              item.have === 'ready'
                ? 'bg-done/15 text-done'
                : item.have === 'caught'
                  ? 'bg-star/15 text-star'
                  : 'bg-pending/15 text-pending'
            }`}
          >
            {item.have === 'ready' ? t('Ready') : item.have === 'caught' ? t('Check it') : t('You need it')}
          </span>
        </p>
        {item.have !== 'ready' && (
          <p className={`mt-1 ${item.have === 'caught' ? 'text-star' : 'text-pending'}`}>{describe(goal, item)}</p>
        )}
        {canLookUp && (result || aiEnabled) && (
          <button
            onClick={() =>
              result
                ? setOpenLocations((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(item.species.id)) next.add(item.species.id);
                    return next;
                  })
                : locate(item.species)
            }
            disabled={location?.busy}
            className="mt-1 rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-ink disabled:opacity-40"
          >
            {location?.busy
              ? t('Searching…')
              : result
                ? isOpen
                  ? t('Hide')
                  : t('Show')
                : t('Where do I catch it?')}
          </button>
        )}
        {/* The button that asks the AI explains itself; an answer that is already there does not need to. */}
        {canLookUp && !result && aiEnabled && <span className="ml-1"><AiHelp kind="location" /></span>}
        {canLookUp && !result && !aiEnabled && (
          <p className="mt-1 text-[10px] text-muted">
            {t('Nobody has found where it lives yet.')} <AiUnavailable kind="location" />
          </p>
        )}
        {location?.error && <p className="mt-1 text-pending">{location.error}</p>}
        {result && isOpen && (
          <div className="mt-1 rounded bg-surface-2 p-2 text-muted">
            {result.locations.map((l, i) => (
              <p key={i}>
                <span className="font-medium text-ink">{l.place}</span>
                {l.nearby && ` · ${t('Near')}: ${l.nearby}`} · {l.details}
              </p>
            ))}
            {result.notes && <p className="mt-1">{result.notes}</p>}
            {aiEnabled && (
              <button onClick={() => locate(item.species, true)} disabled={location?.busy} className="mt-1 text-[10px] underline disabled:opacity-40">
                {location?.busy ? t('Searching…') : t('Search again')}
              </button>
            )}
            <p className="mt-1 flex items-center gap-1.5 text-[10px]">
              <AiBadge /> {t('AI-researched. Check in game before relying on it.')}
            </p>
            <DemoAiNote />
          </div>
        )}
      </li>
    );
  };

  const renderStep = (step: Step, key: number) => {
    /** The picture(s) of the Pokémon a step is about, then its text. */
    const row = (pics: SpeciesRef[], text: React.ReactNode) => (
      <li key={key} className="flex items-center gap-2">
        <span className="flex shrink-0">{pics.map((x) => <span key={`${x.id}`}>{pic(x, 40)}</span>)}</span>
        <span>{text}</span>
      </li>
    );
    switch (step.action) {
      case 'obtain':
        return row(
          [step.species],
          <>
            {step.have === 'ready' ? t('Use your') : t('Get a')}{' '}
            <span className="font-medium">
              {symbol(step.gender)}
              {name(step.species)}
            </span>
            .
          </>
        );
      case 'teach':
        return row(
          [step.species],
          step.method === 'level-up'
            ? step.level === 0
              ? t('{name} learns the move when it evolves (or relearn it from the moves menu).', { name: name(step.species) })
              : step.level === 1
                ? t('{name} knows the move from the start (relearn it from the moves menu if it was forgotten).', {
                    name: name(step.species),
                  })
                : t('Raise {name} to level {level} so it learns the move.', { name: name(step.species), level: step.level })
            : step.method === 'machine'
              ? t('Teach {name} the move with its TM.', { name: name(step.species) })
              : t('Teach {name} the move ({method}).', { name: name(step.species), method: step.method })
        );
      case 'breed':
        return row(
          [step.father, step.mother],
          <>
            {t('Breed')} <span className="font-medium">{name(step.father)} ♂</span> {t('with')}{' '}
            <span className="font-medium">{name(step.mother)} ♀</span>.{' '}
            {t('The {name} that hatches knows the move.', { name: name(step.offspring) })}
          </>
        );
      case 'picnic':
        return row(
          [step.to, step.from],
          <>
            {t('Give')} <span className="font-medium">{name(step.to)}</span>{' '}
            {t('a Mirror Herb and leave one move slot empty, then have a picnic with')}{' '}
            <span className="font-medium">{name(step.from)}</span> {t('in the party.')}
          </>
        );
    }
  };

  const pct = (x: number) => {
    const v = x * 100;
    return `${v >= 10 ? Math.round(v) : v >= 1 ? v.toFixed(1) : v.toFixed(2)}%`;
  };
  const statList = (stats: IvStat[]) => stats.map((s) => STAT_LABELS[s][lang]).join(', ');
  const sourceLabel = (p: ParentPick) =>
    p.source === 'breeder' ? t('from your breeders') : p.source === 'roster' ? t('from your roster') : t('from your Pokédex, IVs unknown');

  /** What tells two Pokémon of one species apart besides IVs: the nature and the ability. */
  const pickTraits = (p: ParentPick) => {
    const nature = natures.find((n) => n.id === p.natureId);
    return [nature && name(nature), p.hiddenAbility ? t('hidden ability') : null].filter(Boolean).join(' · ');
  };

  /** A parent to put in the nursery: the Pokémon chosen for it, whether you have it, and what it brings. */
  const renderParent = (goal: BreedingGoalView, role: string, pick: ParentPick | null, item: ShoppingItem | undefined) => {
    const species = pick?.species ?? item?.species;
    if (!species) return null;
    const have = item?.have ?? 'ready';
    const sex = pick ? (pick.gender === 'any' ? undefined : pick.gender) : item?.gender;
    return (
      <li key={role} className="rounded-lg border border-line p-3 text-xs">
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted">{role}</p>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              have === 'ready' ? 'bg-done/15 text-done' : have === 'caught' ? 'bg-star/15 text-star' : 'bg-pending/15 text-pending'
            }`}
          >
            {have === 'ready' ? t('Ready') : have === 'caught' ? t('Check it') : t('You need it')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pic(species, 56)}
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {symbol(sex)}
              {pick?.label ?? name(species)}
              {pick?.label && <span className="text-xs font-normal text-muted"> · {name(species)}</span>}
            </p>
            {pick && (
              <p className="text-muted">
                {sourceLabel(pick)}
              </p>
            )}
            {pick && (
              <ul className="mt-1 flex flex-wrap items-center gap-1" aria-label={t('perfect IVs')}>
                <li className={`text-[10px] font-semibold ${pick.perfect.length >= 5 ? 'text-star' : pick.perfect.length > 0 ? 'text-done' : 'text-muted'}`}>
                  {pick.perfect.length}/6 {t('perfect')}
                </li>
                {pick.perfect.map((s) => (
                  <li key={s} className="rounded-full border border-done/40 bg-done/15 px-1.5 text-[10px] font-semibold leading-4 text-done">
                    {STAT_LABELS[s][lang]}
                  </li>
                ))}
              </ul>
            )}
            {pick && pickTraits(pick) && <p className="text-muted">{pickTraits(pick)}</p>}
            {pick?.id && pick.source === 'breeder' && (
              <button type="button" onClick={() => setViewing(pick)} className="underline">
                {t('Which one is it?')}
              </button>
            )}
          </div>
        </div>
        {item && have !== 'ready' && (
          <p className={`mt-1 ${have === 'caught' ? 'text-star' : 'text-pending'}`}>{describe(goal, item)}</p>
        )}
      </li>
    );
  };

  const renderIvs = (goal: BreedingGoalView, ivs: IvPlan) => {
    const heading = (
      <h4 className="section-title mb-2">{t('What to expect from the egg')}</h4>
    );
    if (ivs.reason === 'no-breeding') return null;
    if (ivs.reason === 'no-base' || ivs.reason === 'no-partner' || !ivs.base || !ivs.partner) {
      return (
        <div className="mt-4">
          {heading}
          <p className="text-xs text-pending">
            {ivs.reason === 'no-partner'
              ? t('No partner to pair it with: you need a male that shares its egg group, or a Ditto. Record one in Breeders.')
              : t('No {name} (or one of its line) recorded as a female. Add it in Breeders or record it in the Pokédex.', {
                  name: name(goal.species),
                })}
          </p>
        </div>
      );
    }
    return (
      <div className="mt-4">
        {heading}
        {ivs.targets.length > 0 && (
          <p className="mt-2 text-xs">
            {t('Chance that all of {stats} come out perfect:', { stats: statList(ivs.targets) })}{' '}
            <span className="font-semibold text-star">{pct(ivs.chance.all)}</span>{' '}
            <span className="text-muted">
              ({t('about {n} of {total} on average', { n: ivs.chance.expected.toFixed(1), total: ivs.targets.length })})
            </span>
          </p>
        )}
        {ivs.gaps.length > 0 && (
          <p className="mt-1 text-xs text-pending">
            {t('Neither parent has a perfect {stats} recorded. Breed or catch one that does, or fix it afterwards with a Bottle Cap.', {
              stats: statList(ivs.gaps),
            })}
          </p>
        )}
        {ivs.unrecorded && (
          <p className="mt-1 text-xs text-muted">
            {t('One of these parents comes from the Pokédex, so its IVs are not known and the chance is a minimum. Record it in Breeders.')}
          </p>
        )}
        {ivs.natureOk === false && (
          <p className="mt-1 text-xs text-pending">
            {ivs.items.everstoneForForm
              ? t('The mother needs the Everstone to keep her form, so the egg gets her nature. Fix the effect with a Mint.')
              : t('Neither parent has the nature you want. Breed without an Everstone and fix the effect with a Mint.')}
          </p>
        )}
        {ivs.formOk === false && goal.plan?.parents.formLock && (
          <p className="mt-1 text-xs text-pending">
            {t('The mother is not recorded as {form}. Set her form on the roster, or use one that is.', {
              form: goal.plan.parents.formLock.name[lang],
            })}
          </p>
        )}
        {ivs.hiddenOk === false && (
          <p className="mt-1 text-xs text-pending">
            {t('The mother does not have the hidden ability recorded. Use one that has it, or an Ability Patch afterwards.')}
          </p>
        )}
      </div>
    );
  };

  /** Everything to hold or have ready for a plan, from the moves, the IV pair and the hidden ability. */
  const renderBring = (goal: BreedingGoalView) => {
    const plan = goal.plan;
    if (!plan?.parents.canBreed) return null;
    const lines: string[] = [];
    const ivs = goal.ivs;
    if (ivs?.base && ivs.partner) {
      const who = (w: 'base' | 'partner' | null) => {
        const p = w === 'base' ? ivs.base : ivs.partner;
        return p ? `${symbol(p.gender === 'any' ? undefined : p.gender)}${p.label ?? name(p.species)}` : '';
      };
      lines.push(
        ivs.items.knotHolder === 'either'
          ? `${DESTINY_KNOT.name[lang]} ${t('(either parent holds it; 5 IVs are passed on instead of 3)')}`
          : `${DESTINY_KNOT.name[lang]} ${t('on {name}: 5 IVs are passed on instead of 3', { name: who(ivs.items.knotHolder) })}`
      );
      if (ivs.items.powerItem) {
        lines.push(
          `${POWER_ITEMS[ivs.items.powerItem].name[lang]} ${t('on {name}, so its {stat} IV is always passed on', {
            name: who(ivs.items.powerHolder),
            stat: STAT_LABELS[ivs.items.powerItem][lang],
          })}`
        );
      }
      if (ivs.items.everstoneForForm && plan.parents.formLock) {
        lines.push(
          `${EVERSTONE.name[lang]} ${t('on {name}, so the egg hatches as {form}', {
            name: who('base'),
            form: plan.parents.formLock.name[lang],
          })}${ivs.items.everstone === 'base' && ivs.natureOk ? ` ${t('and gets its nature')}` : ''}`
        );
      } else if (ivs.items.everstone) {
        lines.push(
          `${EVERSTONE.name[lang]} ${t('on {name}, so the egg gets its nature', { name: who(ivs.items.everstone) })}`
        );
      }
    }
    // A picnic is the plan's best way for at least one egg move.
    if (plan.moves.some((m) => m.kind === 'egg' && m.options[0]?.kind === 'mirror-herb')) {
      lines.push(
        `${MIRROR_HERB.name[lang]} ${t('on the Pokémon that gets the egg move, with a free move slot, for the picnic')}`
      );
    }
    if (goal.hiddenAbility && (!ivs?.base || ivs.hiddenOk !== true)) {
      lines.push(
        `${ABILITY_PATCH.name[lang]} ${t('after hatching, to give it the hidden ability (no hidden-ability mother needed)')}`
      );
    }
    const needsEgg =
      ivs?.base != null || plan.moves.some((m) => m.kind === 'egg' && m.options.some((o) => o.kind !== 'mirror-herb'));
    if (lines.length === 0 && !needsEgg) return null;
    return (
      <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs">
        <p className="font-medium">{t('Bring')}:</p>
        {lines.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-muted">{t('No special items are needed for this plan.')}</p>
        )}
        {needsEgg && (
          <p className="mt-2 text-muted">{t('A sandwich with Egg Power at the picnic makes the eggs appear sooner.')}</p>
        )}
        <p className="mt-1 text-muted">{t('Find them in the Catalog (button at the bottom right).')}</p>
      </div>
    );
  };

  const renderMove = (goal: BreedingGoalView, plan: MovePlan) => (
    <div key={plan.moveId} className="rounded-lg border border-line p-3">
      <h4 className="text-sm font-semibold">{moveName(goal, plan.moveId)}</h4>
      {plan.kind === 'illegal' && (
        <p className="mt-1 text-xs text-danger">{t('This Pokémon cannot have this move in this game.')}</p>
      )}
      {plan.kind === 'egg' && plan.options.length === 0 && (
        <p className="mt-1 text-xs text-pending">
          {t('This is an egg move, but no parent available in this game can pass it on.')}
        </p>
      )}
      {plan.options.map((option, i) => (
        <div key={i} className="mt-2">
          <p className="text-xs font-medium">
            {optionTitles[option.kind]}
            {option.ready && <span className="ml-2 rounded bg-done/15 px-1.5 py-0.5 text-[10px] text-done">{t('ready now')}</span>}
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs">{option.steps.map(renderStep)}</ol>
        </div>
      ))}
    </div>
  );

  /** Whether the parents of a plan are all at hand, in a few words for the list and the summary. */
  const readiness = (goal: BreedingGoalView) => {
    const plan = goal.plan;
    if (!plan) return { label: '', tone: 'text-muted', need: [] as ShoppingItem[] };
    if (!plan.parents.canBreed) return { label: t('Cannot breed'), tone: 'text-danger', need: [] as ShoppingItem[] };
    const need = plan.shopping.filter((s) => s.have !== 'ready');
    return need.length === 0
      ? { label: t('Ready to breed'), tone: 'text-done', need }
      : { label: t('Missing {n}', { n: need.length }), tone: 'text-pending', need };
  };

  /** Everything the plan needs from you, ticked off as your Pokédex, roster and breeders come to have it. */
  const checklist = (goal: BreedingGoalView) => {
    const plan = goal.plan;
    if (!plan?.parents.canBreed) return [];
    const rows = plan.shopping.map((item, i) => ({
      key: `p${i}`,
      done: item.have === 'ready',
      label: `${symbol(item.gender)}${name(item.species)} · ${roleLabel(goal, item)}`,
      note: item.have === 'ready' ? null : describe(goal, item),
    }));
    if (goal.hiddenAbility && goal.ivs?.base && goal.ivs.hiddenOk != null) {
      rows.push({
        key: 'hidden',
        done: goal.ivs.hiddenOk === true,
        label: goal.hiddenAbilityName
          ? t('Mother with {ability} (hidden ability)', { ability: name(goal.hiddenAbilityName) })
          : t('Mother with the hidden ability'),
        note: goal.ivs.hiddenOk ? null : t('Record it in Breeders, or use an Ability Patch afterwards.'),
      });
    }
    // What is still to do comes first.
    return rows.sort((a, b) => Number(a.done) - Number(b.done));
  };

  const renderGoal = (goal: BreedingGoalView) => {
    const plan = goal.plan;
    const state = readiness(goal);
    // The pair for the nursery: the specimens the IV plan chose, with their entry in the shopping list.
    const ivs = goal.ivs && goal.ivs.base && goal.ivs.partner ? goal.ivs : null;
    const motherPick = ivs?.base ?? null;
    const partnerPick = ivs?.partner ?? null;
    const shopping = plan?.shopping ?? [];
    const motherItem = shopping.find((s) => s.role === 'mother');
    const partnerItem = partnerPick
      ? shopping.find((s) => s.species.id === partnerPick.species.id && (s.role === 'father' || s.role === 'ditto'))
      : (shopping.find((s) => s.role === 'ditto') ?? shopping.find((s) => s.role === 'father'));
    // What is left (fathers that know a move, donors...), what is missing first.
    const others = shopping
      .filter((s) => s !== motherItem && s !== partnerItem)
      .sort((a, b) => Number(a.have === 'ready') - Number(b.have === 'ready'));
    const natural = plan?.moves.filter((m) => m.kind === 'natural') ?? [];
    return (
      <div className="rounded-xl border border-line bg-surface">
        {/* Who it is, what it needs and whether you are ready stay in view while the plan scrolls underneath. */}
        <div className="sticky top-[var(--nav-h)] z-10 md:top-[calc(var(--nav-h)+3.25rem)] max-h-[40dvh] overflow-y-auto rounded-t-xl border-b border-line bg-surface p-4 shadow-sm lg:max-h-[60dvh]">
        <div className="flex flex-wrap items-center gap-3">
          {pic(goal.species, 64)}
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              {name(goal.species)}
              <PokedexButton speciesId={goal.species.id} gameId={gameId} lang={lang} />
            </h3>
            {goal.moves.length > 0 && <p className="text-xs text-muted">{goal.moves.map(name).join(' · ')}</p>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              // startEdit sets a ref, in the click handler only; the lint rule cannot tell it is not read while rendering.
              // eslint-disable-next-line react-hooks/refs
              onClick={() => startEdit(goal)}
              title={t('Edit')}
              aria-label={t('Edit')}
              className="flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:text-ink"
            >
              <EditIcon />
            </button>
            <button
              onClick={() => setDeleting(goal)}
              title={t('Delete')}
              aria-label={t('Delete')}
              className="flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:text-danger"
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        {(goal.ivTargets.length > 0 || goal.nature || goal.hiddenAbility) && (
          <p className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {goal.ivTargets.map((s) => (
              <span key={s} className="rounded border border-done/50 bg-done/10 px-1.5 py-0.5 text-done">
                {STAT_LABELS[s][lang]} 31
              </span>
            ))}
            {goal.nature && <span className="rounded border border-line px-1.5 py-0.5">{name(goal.nature)}</span>}
            {goal.hiddenAbility && (
              <span className="rounded border border-line px-1.5 py-0.5">
                {goal.hiddenAbilityName ? `${name(goal.hiddenAbilityName)} (${t('hidden')})` : t('Hidden ability')}
              </span>
            )}
          </p>
        )}

        {plan && !plan.parents.canBreed && (
          <p className="mt-3 text-sm text-danger">
            {t('{name} cannot breed (it is in the "no eggs" group), so it has to be caught.', { name: name(goal.species) })}
          </p>
        )}

        {goal.match && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-done/10 px-3 py-2 text-sm text-done">
            <span className="min-w-0 flex-1 font-medium">
              {t('You already have one that matches this plan: {name}.', {
                name: goal.match.label ? `${goal.match.label} (${name(goal.species)})` : name(goal.species),
              })}
            </span>
            <button
              type="button"
              onClick={() => setDeleting(goal)}
              className="rounded-md border border-done/50 px-3 py-1 text-xs font-semibold hover:bg-done/10"
            >
              {t('Delete the plan')}
            </button>
          </div>
        )}

        {plan && plan.parents.canBreed && !goal.match && checklist(goal).length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {checklist(goal).map((c) => (
              <li key={c.key} className="flex items-start gap-2">
                <span aria-hidden className={c.done ? 'text-done' : 'text-pending'}>
                  {c.done ? '✓' : '○'}
                </span>
                <span className={c.done ? 'text-muted line-through decoration-muted/40' : undefined}>
                  <span className={c.done ? undefined : 'font-medium'}>{c.label}</span>
                  {c.note && <span className="text-muted"> · {c.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {plan && plan.parents.canBreed && !goal.match && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
              state.need.length === 0 ? 'bg-done/10 text-done' : 'bg-pending/10 text-pending'
            }`}
          >
            {state.need.length === 0
              ? t('You have everything. Go breed!')
              : t('Still missing: {names}', { names: state.need.map((s) => name(s.species)).join(', ') })}
          </div>
        )}
        </div>

        <div className="p-4 pt-0">
        {plan && plan.parents.canBreed && (
          <>
            <h4 className="section-title mb-2 mt-4">
              {t('1. Parents to put in the nursery')}
            </h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {renderParent(goal, t('Mother (the egg hatches as her species)'), motherPick, motherItem)}
              {renderParent(goal, partnerItem?.role === 'ditto' || partnerPick?.species.id === 132 ? t('Ditto') : t('Father'), partnerPick, partnerItem)}
            </ul>
            {others.length > 0 && (
              <>
                <h4 className="section-title mb-2 mt-4">
                  {t('2. Also needed for the moves')}
                </h4>
                <ul className="grid gap-2 xl:grid-cols-2">{others.map((s, i) => renderItem(goal, s, i))}</ul>
              </>
            )}
            <p className="mt-3 text-xs text-muted">
              {t('The egg hatches as')} <span className="text-ink">{name(plan.parents.hatchesAs)}</span>
              {plan.parents.needsDitto ? `. ${t('This Pokémon can only breed with Ditto.')}` : '.'}{' '}
              {plan.parents.formLock &&
                `${t('Only a {form} hatches eggs that can evolve into {name}.', {
                  form: plan.parents.formLock.name[lang],
                  name: name(plan.target),
                })}${plan.parents.formLock.item ? ` ${t('It must hold an {item}.', { item: plan.parents.formLock.item.name[lang] })}` : ''} `}
              {t('This list updates itself from what you record in your Pokédex, roster and breeders.')}
            </p>
          </>
        )}

        {goal.ivs && plan?.parents.canBreed && renderIvs(goal, goal.ivs)}
        {renderBring(goal)}

        {plan && (natural.length > 0 || plan.moves.some((m) => m.kind !== 'natural')) && (
          <div className="mt-4">
            <h4 className="section-title mb-2">{t('Moves')}</h4>
            {natural.length > 0 && (
              <p className="mb-2 text-xs text-muted">
                {t('No breeding needed for')}{' '}
                <span className="text-ink">{natural.map((m) => moveName(goal, m.moveId)).join(', ')}</span>:{' '}
                {natural.length > 1
                  ? t('{name} learns them normally.', { name: name(goal.species) })
                  : t('{name} learns it normally.', { name: name(goal.species) })}
              </p>
            )}
            <div className="grid gap-3 xl:grid-cols-2">
              {plan.moves.filter((m) => m.kind !== 'natural').map((m) => renderMove(goal, m))}
            </div>
          </div>
        )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!formOpen && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
            className="rounded-md bg-done px-4 py-2 text-sm font-semibold text-bg"
          >
            {t('New plan')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setHatchOpen(true)}
          className="rounded-md border border-line px-3 py-2 text-xs font-medium hover:bg-surface-2 sm:ml-auto"
        >
          🥚 {t('Hatch eggs faster')}
        </button>
      </div>
      <HatchDialog open={hatchOpen} onClose={() => setHatchOpen(false)} gameId={gameId} lang={lang} picnic={picnic} />
      {error && !formOpen && (
        <p role="alert" className="mb-4 text-sm text-pending">
          {error}
        </p>
      )}
      {formOpen && (
        <form onSubmit={create} className="mb-6 rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-4 text-base font-semibold">{editingId ? t('Edit plan') : t('New plan')}</h2>
          <div className="space-y-5">
            {/* ---------- who ---------- */}
            <section>
              <h3 className={heading}>{t('Pokémon you want')}</h3>
              <div className="flex items-center gap-3">
                {targetId != null ? pic({ id: targetId }, 56) : <span className="block h-14 w-14 shrink-0 rounded-lg border border-dashed border-line" />}
                <label className="block w-full max-w-sm">
                  <span className={labelClass}>{t('Pokémon you want')}</span>
                  <ComboInput
                    list="breed-species"
                    value={target}
                    onChange={onTargetChange}
                    placeholder={t('e.g. Garchomp')}
                    required
                    className={inputClass}
                  />
                </label>
              </div>
            </section>

            {/* ---------- egg moves ---------- */}
            <section>
              <h3 className={heading}>{t('Egg moves')}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {wanted.map((value, i) => {
                  const taken = new Set(wanted.filter((m, k) => m != null && k !== i));
                  const list = (moves: Named[]) => moves.filter((m) => !taken.has(m.id));
                  return (
                    <label key={i} className="block">
                      <span className={labelClass}>{t('Move {n}', { n: i + 1 })}</span>
                      <select
                        value={value ?? ''}
                        disabled={!options}
                        onChange={(e) => {
                          setFilledFromRoster(false);
                          setWanted((prev) => prev.map((w, k) => (k === i ? (e.target.value ? Number(e.target.value) : null) : w)));
                        }}
                        className={inputClass}
                      >
                        <option value="">{options ? t('None') : t('Pick a Pokémon first')}</option>
                        {options && value != null && !options.egg.some((m) => m.id === value) && (
                          <option value={value}>
                            {name(goals.find((g) => g.id === editingId)?.moves.find((m) => m.id === value) ?? { id: value, nameEn: `#${value}`, nameEs: `#${value}` })}
                          </option>
                        )}
                        {options && list(options.egg).length > 0 && (
                          <optgroup label={t('Egg moves (need breeding)')}>
                            {list(options.egg).map((m) => (
                              <option key={m.id} value={m.id}>
                                {name(m)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">
                {!targetId
                  ? t('Choose a Pokémon to see the egg moves it can get in this game.')
                  : !options
                    ? t('Loading its moves…')
                    : [
                        filledFromRoster
                          ? t('Egg moves filled in from the build you are training in your roster.')
                          : options.egg.length === 0
                            ? t('This Pokémon has no egg moves in this game: everything it can have it learns normally.')
                            : t('{egg} egg moves this Pokémon can get from breeding. Pick the ones you want (up to 4); they are optional.', {
                                egg: options.egg.length,
                              }),
                        skipped > 0
                          ? t('{count} of its other moves are learned normally (or cannot be learned here), so they need no breeding and were left out.', { count: skipped })
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
              </p>
            </section>

            {/* ---------- what it should be like ---------- */}
            <section>
              <h3 className={heading}>{t('How it should be')}</h3>
              <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
                <fieldset>
                  <legend className={labelClass}>{t('IVs that must be 31 (Best)')}</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {IV_STATS.map((stat) => {
                      const on = ivTargets.includes(stat);
                      return (
                        <button
                          key={stat}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setIvTargets((prev) => (on ? prev.filter((s) => s !== stat) : [...prev, stat]))}
                          className={`rounded-md border px-2.5 py-1 text-xs ${
                            on ? 'border-done/60 bg-done/15 text-done' : 'border-line text-muted hover:text-ink'
                          }`}
                        >
                          {STAT_LABELS[stat][lang]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <label className="block">
                  <span className={labelClass}>{t('Nature')}</span>
                  <ComboInput
                    list="breed-natures"
                    value={natureText}
                    onChange={setNatureText}
                    placeholder={t('Any')}
                    className={inputClass}
                  />
                </label>
                <div>
                  {/* An empty caption keeps the checkbox on the same line as the fields beside it. */}
                  <span aria-hidden className={`${labelClass} select-none`}>
                    &nbsp;
                  </span>
                  <label
                    className="flex h-[2.125rem] items-center gap-2 text-sm"
                    title={t('The plan looks for a mother with the hidden ability recorded in Breeders. An Ability Patch is the alternative.')}
                  >
                    <input type="checkbox" checked={hiddenAbility} onChange={(e) => setHiddenAbility(e.target.checked)} />
                    {t('Hidden ability')}
                    {options &&
                      (options.hiddenAbility ? (
                        <span className="font-medium">: {name(options.hiddenAbility)}</span>
                      ) : (
                        <span className="text-muted"> ({t('it has none')})</span>
                      ))}
                  </label>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button disabled={busy} className="rounded-md bg-done px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">
              {busy ? t('Planning…') : editingId ? t('Save changes') : t('Make a plan')}
            </button>
            {goals.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
                className="rounded-md border border-line px-4 py-2 text-sm"
              >
                {t('Cancel')}
              </button>
            )}
            {error && (
              <span role="alert" className="text-sm text-pending">
                {error}
              </span>
            )}
          </div>
          <datalist id="breed-natures">
            {natures.map((n) => (
              <option key={n.id} value={name(n)} label={lang === 'en' ? n.nameEs : n.nameEn} />
            ))}
          </datalist>
          <datalist id="breed-species">
            {species.map((s) => (
              <option key={s.id} value={name(s)} label={lang === 'en' ? s.nameEs : s.nameEn} />
            ))}
          </datalist>
        </form>
      )}

      {goals.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t('No breeding plans yet. Create one above.')}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <aside ref={listRef} className="relative lg:sticky lg:top-[calc(var(--nav-h)+4rem)] lg:max-h-[calc(100dvh-var(--nav-h)-5rem)] lg:self-start lg:overflow-y-auto">
            <button
              type="button"
              aria-expanded={listOpen}
              onClick={() => setListOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-left lg:hidden"
            >
              {selected && pic(selected.species, 40)}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{selected ? name(selected.species) : ''}</span>
                <span className="block text-[11px] text-muted">{t('Plans ({n})', { n: goals.length })}</span>
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
            <ul className="space-y-1.5">
              {byCloseness(goals).map((goal) => {
                const on = goal.id === selected?.id;
                const state = readiness(goal);
                return (
                  <li key={goal.id}>
                    <button
                      type="button"
                      onClick={() => select(goal.id)}
                      aria-current={on ? 'true' : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${
                        on ? 'border-done bg-surface-2' : 'border-line bg-surface hover:bg-surface-2'
                      }`}
                    >
                      {pic(goal.species, 40)}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{name(goal.species)}</span>
                        {goal.moves.length > 0 && (
                          <span className="block truncate text-[11px] text-muted">{goal.moves.map(name).join(' · ')}</span>
                        )}
                        <span className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className={state.tone}>{state.label}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            </div>
          </aside>

          <div ref={detailRef} className="min-w-0 scroll-mt-16">
            {selected && renderGoal(selected)}
          </div>
        </div>
      )}

      <Dialog open={viewing !== null} onClose={() => setViewing(null)} title={viewing ? (viewing.label ?? name(viewing.species)) : ''}>
        {viewing && (
          <div className="text-sm">
            <div className="flex items-center gap-4 rounded-lg bg-surface-2 p-3">
              {pic(viewing.species, 88)}
              <div className="min-w-0 space-y-1">
                <p className="text-base font-semibold">
                  {name(viewing.species)}
                  {viewing.gender !== 'any' && (
                    <span className={`ml-1.5 font-bold ${viewing.gender === 'male' ? 'text-blue-500' : 'text-pink-500'}`}>
                      {viewing.gender === 'male' ? '♂' : '♀'}
                    </span>
                  )}
                </p>
                {viewing.label && <p className="text-muted">“{viewing.label}”</p>}
                <p className="text-xs text-muted">{sourceLabel(viewing)}</p>
              </div>
            </div>
            <p className={`${labelClass} mt-4`}>{t('IVs')}</p>
            <ul className="grid grid-cols-3 gap-1.5">
              {IV_STATS.map((stat) => {
                const perfect = viewing.perfect.includes(stat);
                return (
                  <li
                    key={stat}
                    className={`rounded-md border px-2 py-1 text-center text-xs ${
                      perfect ? 'border-done/40 bg-done/15 font-semibold text-done' : 'border-line text-muted'
                    }`}
                  >
                    {STAT_LABELS[stat][lang]}
                    <span className="block text-[10px]">{perfect ? '31' : '—'}</span>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted">{t('Nature')}</dt>
              <dd className="font-medium">{natures.find((n) => n.id === viewing.natureId) ? name(natures.find((n) => n.id === viewing.natureId)!) : '—'}</dd>
              <dt className="text-muted">{t('Ability')}</dt>
              <dd className="font-medium">{viewing.hiddenAbility ? t('Hidden ability') : viewing.hiddenAbility === false ? t('Regular') : '—'}</dd>
            </dl>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={deleting != null}
        title={t('Delete this breeding plan?')}
        confirmLabel={t('Delete')}
        danger
        onConfirm={() => deleting && remove(deleting)}
        onCancel={() => setDeleting(null)}
      >
        <p>
          {t('The plan for {name} will be deleted. Your roster and Pokédex are not changed.', {
            name: deleting ? name(deleting.species) : '',
          })}
        </p>
      </ConfirmDialog>
    </div>
  );
}
