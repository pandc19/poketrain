'use client';

import { useEffect, useState } from 'react';
import { AiBadge } from './AiBadge';
import { Dialog } from './Dialog';
import { SearchInput } from './SearchInput';
import { Sprite } from './Sprite';
import { useCachedLocations } from './useCachedLocations';
import type { BuildAudit, LocationResult } from '@/lib/ai/schema';
import type { EvSpread } from '@/lib/import/evs';
import { useT } from '@/lib/translate-client';

export type EvSource = NonNullable<NonNullable<BuildAudit['evPlan']['sources']>[number]['species']>[number] & {
  /** Sent when the full list is loaded; audits saved earlier do not have it. */
  spriteUrl?: string | null;
};

/** One Pokémon to battle for EVs, with a button that researches where it lives in this game. */
export function SourceRow({
  s,
  gameId,
  aiEnabled,
  known,
  card = false,
}: {
  s: EvSource;
  gameId?: string;
  aiEnabled?: boolean;
  /** An answer saved earlier, so it survives a reload. */
  known?: LocationResult;
  /** A small card with the picture, instead of a bullet in a list. */
  card?: boolean;
}) {
  const { t, lang } = useT();
  const [state, setState] = useState<{ busy: boolean; result?: LocationResult; error?: string }>({ busy: false });
  // A saved answer starts collapsed; a lookup you just made opens.
  const [open, setOpen] = useState(false);
  const result = state.result ?? known;

  async function locate(refresh = false) {
    setState({ busy: true });
    try {
      const res = await fetch('/api/ai/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, speciesId: s.id, refresh }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? t('Lookup failed.'));
      setState({ busy: false, result: data.result });
      setOpen(true);
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : t('Lookup failed.') });
    }
  }

  const body = (
    <>
      <span className="font-medium">{lang === 'es' ? s.nameEs : s.nameEn}</span>
      <span className="text-muted"> · +{s.amount}</span>
      {gameId && (result || aiEnabled) && (
        <button
          onClick={result ? () => setOpen(!open) : () => locate()}
          disabled={state.busy}
          title={result ? undefined : t('Researched on the web with AI, then saved for everyone')}
          className="ml-2 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink disabled:opacity-40"
        >
          {state.busy ? t('Searching…') : result ? (open ? t('Hide') : t('Show')) : t('Where do I find it?')}
        </button>
      )}
      {gameId && !result && !aiEnabled && <p className="mt-0.5 text-[10px] text-muted">{t('Nobody has found where it lives yet. Turn on AI to look it up.')}</p>}
      {state.error && <p className="text-pending">{state.error}</p>}
      {result && open && (
        <div className="mt-1 rounded bg-surface p-2 text-muted">
          <p className="mb-1">
            <AiBadge />
          </p>
          {result.locations.map((l, i) => (
            <p key={i}>
              <span className="font-medium text-ink">{l.place}</span>
              {l.nearby && ` · ${t('Near')}: ${l.nearby}`} · {l.details}
            </p>
          ))}
          {result.notes && <p className="mt-1">{result.notes}</p>}
          {aiEnabled && (
            <button onClick={() => locate(true)} disabled={state.busy} className="mt-1 text-[10px] underline disabled:opacity-40">
              {state.busy ? t('Searching…') : t('Search again')}
            </button>
          )}
        </div>
      )}
    </>
  );
  return card ? (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-2">
      <span className="grid h-10 w-10 shrink-0 place-items-center">
        <Sprite src={s.spriteUrl ?? null} alt="" size={40} />
      </span>
      <div className="min-w-0 flex-1">{body}</div>
    </div>
  ) : (
    <li>{body}</li>
  );
}


const plain = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").trim().toLowerCase();

/** The Pokémon whose name (in either language) has what was typed in it. */
export function filterSources<T extends { nameEn: string; nameEs: string }>(list: T[], query: string): T[] {
  const q = plain(query);
  return q ? list.filter((s) => plain(s.nameEn).includes(q) || plain(s.nameEs).includes(q)) : list;
}

// Lists fetched this visit, by game and stat.
const loaded = new Map<string, EvSource[]>();

/** Every Pokémon of the game that gives EVs in one stat, best to battle first, each evolution line together. */
export function EvSourcesDialog({
  open,
  onClose,
  gameId,
  stat,
  statLabel,
  aiEnabled,
}: {
  open: boolean;
  onClose: () => void;
  gameId: string;
  /** The stat key ('attack', 'specialDefense'…). */
  stat: keyof EvSpread;
  /** The stat's name as shown to the player. */
  statLabel: string;
  aiEnabled?: boolean;
}) {
  const { t } = useT();
  const key = `${gameId}:${stat}`;
  const [fetched, setFetched] = useState<{ key: string; species: EvSource[] | null; error: string | null } | null>(null);
  const [query, setQuery] = useState('');
  const species = loaded.get(key) ?? (fetched?.key === key ? fetched.species : null);
  const error = fetched?.key === key ? fetched.error : null;
  const known = useCachedLocations(gameId, species?.map((x) => x.id) ?? []);

  useEffect(() => {
    if (!open || loaded.has(key)) return;
    const controller = new AbortController();
    fetch(`/api/ev-sources?gameId=${encodeURIComponent(gameId)}&stat=${encodeURIComponent(stat)}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? t('Lookup failed.'));
        loaded.set(key, data.species);
        setFetched({ key, species: data.species, error: null });
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') setFetched({ key, species: null, error: e instanceof Error ? e.message : t('Lookup failed.') });
      });
    return () => controller.abort();
  }, [open, key, gameId, stat, t]);

  return (
    <Dialog open={open} onClose={onClose} title={t('Battle for {stat} EVs', { stat: statLabel })} wide>
      <p className="mb-3 text-xs text-muted">{t('Best to battle first, each evolution line in order.')}</p>
      {error && <p className="text-sm text-pending">{error}</p>}
      {!species && !error && <p className="py-8 text-center text-sm text-muted">{t('Searching…')}</p>}
      {species && species.length === 0 && <p className="py-8 text-center text-sm text-muted">{t('Nothing found.')}</p>}
      {species && species.length > 0 && (
        <SearchInput value={query} onChange={setQuery} placeholder={t('Search a Pokémon')} label={t('Search a Pokémon')} className="mb-3" />
      )}
      {species && species.length > 0 && filterSources(species, query).length === 0 && (
        <p className="py-6 text-center text-sm text-muted">{t('No Pokémon match this filter.')}</p>
      )}
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        {filterSources(species ?? [], query).map((sp) => (
          <SourceRow key={sp.id} s={sp} gameId={gameId} aiEnabled={aiEnabled} known={known[sp.id]} card />
        ))}
      </div>
    </Dialog>
  );
}
