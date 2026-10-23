'use client';

import { useState } from 'react';
import { useCachedLocations } from './useCachedLocations';
import { createContext, useContext } from 'react';
import { DemoAiNote } from './AiAccess';
import { AiBadge } from './AiBadge';
import { Dialog } from './Dialog';
import { SourceRow, filterSources, type EvSource } from './EvSources';
import { SearchInput } from './SearchInput';
import { TypeBadge } from './TypeBadge';
import { activeMint, type AuditLocks } from '@/lib/audit-locks';
import type { BuildAudit, LocationResult } from '@/lib/ai/schema';
import { useT } from '@/lib/translate-client';

/** A stored audit. Audits saved by earlier versions hold other sections, which are no longer shown. */
type StoredAudit = Partial<BuildAudit>;

/** The Pokémon to battle for one stat: the best few, and a button for all of them. */
function SourceGroup({
  group,
  gameId,
  saved,
}: {
  group: NonNullable<BuildAudit['evPlan']['sources']>[number];
  gameId?: string;
  saved: Record<number, LocationResult>;
}) {
  const { t } = useT();
  const [all, setAll] = useState<{ busy: boolean; open: boolean; species?: EvSource[]; error?: string }>({
    busy: false,
    open: false,
  });
  const [query, setQuery] = useState('');
  const extraSaved = useCachedLocations(gameId, (all.species ?? []).map((x) => x.id));
  const known = { ...saved, ...extraSaved };

  async function toggleAll() {
    if (all.species) return setAll({ ...all, open: true });
    setAll({ busy: true, open: false });
    try {
      const res = await fetch(`/api/ev-sources?gameId=${encodeURIComponent(gameId!)}&stat=${encodeURIComponent(group.stat)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? t('Lookup failed.'));
      setAll({ busy: false, open: true, species: data.species });
    } catch (e) {
      setAll({ busy: false, open: false, error: e instanceof Error ? e.message : t('Lookup failed.') });
    }
  }

  return (
    <div className="mt-2">
      <p className="text-muted">
        {t('Battle for {stat} EVs', { stat: group.stat })}
        {gameId && (
          <button onClick={toggleAll} disabled={all.busy} className="ml-2 text-[10px] underline disabled:opacity-40">
            {all.busy ? t('Searching…') : t('Show all ({n})', { n: all.species?.length ?? '…' })}
          </button>
        )}
      </p>
      {all.error && <p className="text-pending">{all.error}</p>}
      <ul className="list-disc space-y-1 pl-4">
        {group.species.map((sp) => (
          <SourceRow key={sp.id} s={sp} gameId={gameId} known={known[sp.id]} />
        ))}
      </ul>
      <Dialog
        open={all.open}
        onClose={() => setAll((a) => ({ ...a, open: false }))}
        title={t('Battle for {stat} EVs', { stat: group.stat })}
        wide
      >
        <p className="mb-3 text-xs text-muted">{t('Best to battle first, each evolution line in order.')}</p>
        <SearchInput value={query} onChange={setQuery} placeholder={t('Search a Pokémon')} label={t('Search a Pokémon')} className="mb-3" />
        {filterSources(all.species ?? [], query).length === 0 && (
          <p className="py-6 text-center text-sm text-muted">{t('No Pokémon match this filter.')}</p>
        )}
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {filterSources(all.species ?? [], query).map((sp) => (
            <SourceRow key={sp.id} s={sp} gameId={gameId} known={known[sp.id]} card />
          ))}
        </div>
      </Dialog>
    </div>
  );
}

/** One part of the audit in its own box, with a button that fixes it (and takes the fix away). */
/** Only an audit an AI wrote has AI badges on its sections. */
const MadeByAi = createContext(true);

function Box({
  title,
  fixed,
  onToggle,
  fixTitle,
  ai = true,
  children,
}: {
  title: string;
  fixed: boolean;
  /** Written by the AI (until the player fixes it, which makes it theirs). */
  ai?: boolean;
  /** Without it the part cannot be fixed. */
  onToggle?: () => void;
  fixTitle?: string;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const byAi = useContext(MadeByAi);
  return (
    <section className={`rounded-lg border bg-surface p-3 ${fixed ? 'border-done/50' : 'border-line'}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="section-title">
          {fixed && <span className="mr-1 text-done">✓</span>}
          {title}
          {ai && byAi && !fixed && <AiBadge className="ml-2" />}
        </h4>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title={fixed ? t('Fixed parts stay the same when you run the audit again.') : fixTitle ?? t('Fixed parts stay the same when you run the audit again.')}
            className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
              fixed ? 'border-done/50 text-done hover:bg-done/10' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {fixed ? t('Unfix') : t('Fix')}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Shows a stored AI audit of one Pokémon. */
export function AuditPanel({
  gameId,
  locks,
  onLocksChange,
  compare,
  localize,
  currentTera,
  onMint,
  mintGiven,
  realNature,
  lockedPlan,
  onLockPlan,
  onUnlockPlan,
  audit,
  auditLang,
  meta,
  madeBy = 'ai',
  onChangeLanguage,
  busy,
}: {
  /** Lets the Pokémon to battle be looked up. */
  gameId?: string;
  /** The held item and moves the player has fixed. */
  locks?: AuditLocks | null;
  onLocksChange?: (locks: AuditLocks | null) => void;
  /** The name of a move, item or Mint (given in English by the audit) as the player's language shows it. */
  localize?: (kind: 'item' | 'move' | 'mint' | 'nature', english: string) => string;
  /** What it has now against what the audit suggests, one row per part. */
  compare?: { key: string; label: string; now: string; ai: string; same: boolean }[];
  /** The Tera type it has now, to show beside the suggestion. */
  currentTera?: string | null;
  /** The nature (English name) of the Mint it was given, if any (one only chosen does not count): "keep" is not said of a Mint it does not have. */
  mintGiven?: string | null;
  /** Its own nature (English name), what counts when it has no Mint. */
  realNature?: string | null;
  /** Records the suggested Mint as given (true) or takes it back (false). */
  onMint?: (nature: string, given: boolean) => void;
  /** The EV spread the player has fixed as the plan, if any. */
  lockedPlan?: string | null;
  onLockPlan?: (spread: string) => void;
  onUnlockPlan?: () => void;
  audit: StoredAudit;
  /** The language the saved answer is written in. */
  auditLang?: string;
  meta: string;
  /** Written by an AI, made by the quick audit's rules, or built from the parts the player fixed. */
  madeBy?: 'ai' | 'rules' | 'fixed';
  /** Get the audit in the selected language: a saved copy if there is one, otherwise a new request. */
  onChangeLanguage?: () => void;
  busy: boolean;
}) {
  const { t, lang } = useT();
  const saved = useCachedLocations(
    gameId,
    (audit.evPlan?.sources ?? []).flatMap((g) => g.species.map((x) => x.id))
  );
  const setLocks = (next: AuditLocks) => {
    const empty = !next.heldItem && !(next.moves ?? []).length && !next.teraType && !next.mint;
    onLocksChange?.(empty ? null : next);
  };
  const itemFixed = Boolean(locks?.heldItem);
  const movesFixed = locks?.moves ?? [];
  const teraFixed = locks?.teraType;
  const hasMint = mintGiven != null;
  const mintName = (nature: string) => (localize ? localize('mint', nature) : nature);
  // A fixed Mint only counts while it still holds; an answer saved before that changed is not shown.
  const mintFixed = activeMint(locks, mintGiven, realNature);
  const sameNature = (a?: string | null, b?: string | null) => a != null && b != null && a.toLowerCase() === b.toLowerCase();
  const staleMint =
    !mintFixed && audit.mint != null && !hasMint && audit.mint.keep && !sameNature(audit.mint.nature, realNature);
  const mintShown = mintFixed ? { ...mintFixed, keep: true } : audit.mint && !staleMint ? audit.mint : undefined;
  const recommended = audit.recommendedMoves ?? [];
  const without = (key: keyof AuditLocks): AuditLocks => {
    const rest = { ...locks };
    delete rest[key];
    return rest;
  };
  // Each part is fixed on its own; a fixed part stays as it is when the audit runs again, and is not asked of the AI.
  const toggleItem = () =>
    setLocks(
      itemFixed || !audit.heldItem
        ? without('heldItem')
        : { ...locks, heldItem: { item: audit.heldItem.item, reason: audit.heldItem.reason } }
    );
  const toggleMoves = () =>
    setLocks(
      movesFixed.length > 0 || recommended.length === 0
        ? without('moves')
        : { ...locks, moves: recommended.slice(0, 4).map((m) => ({ move: m.move, reason: m.reason })) }
    );
  const toggleTera = () =>
    setLocks(
      teraFixed || !audit.teraType
        ? without('teraType')
        : { ...locks, teraType: { type: audit.teraType.type, reason: audit.teraType.reason } }
    );
  const toggleMint = () => {
    if (mintFixed || !mintShown) return setLocks(without('mint'));
    // A Mint that is to change is chosen when it is fixed; it counts as given only once the player marks it.
    if (!mintShown.keep) onMint?.(mintShown.nature, true);
    setLocks({ ...locks, mint: { nature: mintShown.nature, reason: mintShown.reason } });
  };
  const languageName = (code: string) => (code === 'en' ? t('English') : t('Spanish'));
  // The saved answer is never translated: switching language keeps it until it is re-run.
  const otherLanguage = auditLang != null && auditLang !== lang;

  return (
    <MadeByAi.Provider value={madeBy === 'ai'}>
    <div className="mt-3 space-y-3 rounded-lg bg-surface-2 p-3 text-xs">
      {otherLanguage && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-star/40 bg-star/10 px-2 py-1.5 text-star">
          <span>
            {t('This audit was written in {from}. Re-run it to get it in {to}.', {
              from: languageName(auditLang),
              to: languageName(lang),
            })}
          </span>
          {onChangeLanguage && (
            <button
              onClick={onChangeLanguage}
              disabled={busy}
              className="rounded border border-star/50 px-2 py-0.5 font-medium disabled:opacity-40"
            >
              {busy ? t('Refreshing…') : t('Re-run in {language}', { language: languageName(lang) })}
            </button>
          )}
        </div>
      )}

      {compare && compare.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-3">
          <h4 className="section-title mb-2">
            {madeBy === 'rules' ? t('Now vs quick audit') : madeBy === 'fixed' ? t('Now vs audit') : t('Now vs AI')}{' '}
            {madeBy === 'ai' && <AiBadge className="ml-1" />}
          </h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            {compare.map((r) => (
              <div key={r.key} className="contents">
                <dt className="text-muted">{r.label}</dt>
                <dd className={r.same ? 'text-done' : ''}>
                  {r.same ? (
                    <>✓ {r.now}</>
                  ) : (
                    <>
                      <span className="text-muted">{r.now}</span>
                      <span className="mx-1 text-pending">→</span>
                      <span className="font-medium">{r.ai}</span>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {audit.evPlan && (
        <Box
          title={t('EV plan')}
          fixed={Boolean(lockedPlan)}
          onToggle={
            lockedPlan
              ? onUnlockPlan
              : onLockPlan && audit.evPlan.spread !== 'nothing' && audit.evPlan.spread !== 'nada'
                ? () => onLockPlan(audit.evPlan!.spread)
                : undefined
          }
          fixTitle={t('Saves this spread as your plan. The checklist marks it done once the Pokémon reaches it.')}
        >
          <dl className="space-y-1">
            <div>
              <dt className="inline text-muted">{t('Finish with')}: </dt>
              <dd className="inline font-medium">{audit.evPlan.spread}</dd>
            </div>
            <div>
              <dt className="inline text-muted">{t('Still to train')}: </dt>
              <dd className="inline">{audit.evPlan.toTrain === 'nothing' || audit.evPlan.toTrain === 'nada' ? t('Nothing') : audit.evPlan.toTrain}</dd>
            </div>
          </dl>
          {audit.evPlan.items && audit.evPlan.items.length > 0 && (
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {audit.evPlan.items.map((it, i) => (
                <li key={i}>
                  <span className="font-medium">{it.item}</span>
                  <span className="text-muted"> · {it.stat}: {it.why}</span>
                </li>
              ))}
            </ul>
          )}
          {(audit.evPlan.sources ?? []).map((group) => (
            <SourceGroup key={group.stat} group={group} gameId={gameId} saved={saved} />
          ))}
          {(audit.evPlan.steps ?? []).length > 0 && !audit.evPlan.sources && (
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {audit.evPlan.steps!.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </Box>
      )}

      {!audit.evPlan && !audit.heldItem && !(audit.recommendedMoves ?? []).length && !audit.teraType && (
        <p className="text-muted">{t('This audit is in an older format. Re-run it to get the EV plan, held item and moves.')}</p>
      )}

      {audit.heldItem && (
        <Box title={t('Held item')} fixed={itemFixed} onToggle={onLocksChange ? toggleItem : undefined}>
          <p>
            <span className="font-medium">{localize ? localize('item', audit.heldItem.item) : audit.heldItem.item}</span>
            <span className="text-muted"> · {audit.heldItem.reason}</span>
          </p>
        </Box>
      )}

      {recommended.length > 0 && (
        <Box title={t('Recommended moves')} fixed={movesFixed.length > 0} onToggle={onLocksChange ? toggleMoves : undefined}>
          <ul className="space-y-1">
            {recommended.map((m, i) => (
              <li key={i}>
                <span className="font-medium">{localize ? localize('move', m.move) : m.move}</span>
                <span className="text-muted"> · {m.reason}</span>
              </li>
            ))}
          </ul>
        </Box>
      )}

      {(audit.teraType || teraFixed) && (
        <Box title={t('Tera type')} fixed={Boolean(teraFixed)} onToggle={onLocksChange ? toggleTera : undefined}>
          {(() => {
            // A type the player fixed is the one a re-run keeps, so it is the one shown.
            const shown = teraFixed ?? audit.teraType!;
            return (
              <p className="flex flex-wrap items-center gap-2">
                <TypeBadge type={shown.type} lang={lang} />
                {shown.reason && <span className="text-muted">· {shown.reason}</span>}
              </p>
            );
          })()}
          {currentTera && currentTera !== (teraFixed ?? audit.teraType)?.type && (
            <p className="mt-1 flex items-center gap-2 text-muted">
              {t('Current Tera type')}: <TypeBadge type={currentTera} lang={lang} />
            </p>
          )}
        </Box>
      )}

      {audit.nature && (
        <Box title={t('Nature')} fixed={false}>
          <p>
            <span className="font-medium">
              {t('Aim for a {nature} Pokémon', { nature: localize ? localize('nature', audit.nature.nature) : audit.nature.nature })}
            </span>
            <span className="text-muted"> · {audit.nature.reason}</span>
          </p>
        </Box>
      )}

      {mintShown && (
        <Box title={t('Mint')} fixed={Boolean(mintFixed)} onToggle={onLocksChange ? toggleMint : undefined}>
          <p>
            <span className="font-medium">
              {mintShown.keep
                ? hasMint
                  ? t('Keep it: {nature}', { nature: mintName(mintShown.nature) })
                  : t('No Mint needed: {nature} is already the best', {
                      nature: localize ? localize('nature', mintShown.nature) : mintShown.nature,
                    })
                : hasMint
                  ? t('Change to {nature}', { nature: mintName(mintShown.nature) })
                  : t('Use a {nature} Mint', { nature: localize ? localize('nature', mintShown.nature) : mintShown.nature })}
            </span>
            <span className="text-muted"> · {mintShown.reason}</span>
          </p>
        </Box>
      )}

      <p className="text-[10px] text-muted">
        {madeBy === 'rules'
          ? t('Rule-based suggestion from game data ({meta}). An AI audit looks deeper.', { meta })
          : madeBy === 'fixed'
            ? t('Built from the parts you fixed. Nothing was asked of an AI.')
            : t('AI-generated ({meta}). Check locations in game before relying on them.', { meta })}
        {auditLang && ` · ${languageName(auditLang)}`}
      </p>
      {madeBy === 'ai' && <DemoAiNote />}
    </div>
    </MadeByAi.Provider>
  );
}
