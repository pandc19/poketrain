import { archiveSuggestion, declineRequest, deleteLocation, deleteSuggestion, restoreSuggestion, revokeInvite } from '@/app/admin/actions';
import { CopyToDemo } from '@/components/admin/CopyToDemo';
import { InviteFromRequest, NewInviteForm, ResetLinkButton } from '@/components/admin/LinkForms';
import { DEMO_USER_ID } from '@/lib/constants';
import { requireAdmin } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { GAMES } from '@/lib/games';
import { getLang, getT, pickName } from '@/lib/i18n';
import { pickLocation, type StoredLocation } from '@/lib/location-text';

const LOCATIONS_SHOWN = 50;
const HANDLED_REQUESTS_SHOWN = 10;
const ARCHIVED_SUGGESTIONS_SHOWN = 20;

const card = 'rounded-xl border border-line bg-surface p-5';
const small = 'rounded-md border border-line px-3 py-1 text-xs font-semibold hover:text-ink';

export default async function AdminPage({ searchParams }: PageProps<'/admin'>) {
  await requireAdmin();
  const { q } = await searchParams;
  const query = typeof q === 'string' ? q.trim().slice(0, 60) : '';
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const dateTime = (d: Date) => d.toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const date = (d: Date) => d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const suggestionSelect = { id: true, message: true, name: true, email: true, createdAt: true, user: { select: { name: true, email: true } } } as const;
  const [demo, demoRoster, suggestions, archivedSuggestions, pending, handled, openInvites, users, locations, locationTotal] = await Promise.all([
    prisma.user.findUnique({ where: { id: DEMO_USER_ID }, select: { dataCopiedAt: true } }),
    prisma.rosterPokemon.count({ where: { profile: { userId: DEMO_USER_ID } } }),
    prisma.featureSuggestion.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 100, select: suggestionSelect }),
    prisma.featureSuggestion.findMany({ where: { archivedAt: { not: null } }, orderBy: { archivedAt: 'desc' }, take: ARCHIVED_SUGGESTIONS_SHOWN, select: suggestionSelect }),
    prisma.inviteRequest.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
    prisma.inviteRequest.findMany({ where: { status: { not: 'PENDING' } }, orderBy: { createdAt: 'desc' }, take: HANDLED_REQUESTS_SHOWN }),
    prisma.invite.findMany({
      where: { usedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, createdAt: true, request: { select: { name: true } } },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, lastName: true, email: true, role: true, aiProvider: true, createdAt: true, _count: { select: { sessions: true } } },
    }),
    prisma.pokemonLocation.findMany({
      where: query ? { species: { OR: [{ nameEn: { contains: query, mode: 'insensitive' } }, { nameEs: { contains: query, mode: 'insensitive' } }] } } : {},
      orderBy: { updatedAt: 'desc' },
      take: LOCATIONS_SHOWN,
      select: {
        id: true,
        versionGroup: true,
        result: true,
        provider: true,
        updatedAt: true,
        species: { select: { nameEn: true, nameEs: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.pokemonLocation.count(),
  ]);

  /** Who sent a suggestion: their account, or the name and email they left, or nobody. */
  const who = (s: { name: string | null; email: string | null; user: { name: string; email: string | null } | null }, anonymous: string) => {
    const name = s.user?.name ?? s.name;
    const email = s.user?.email ?? s.email;
    return [name, email].filter(Boolean).join(' · ') || anonymous;
  };
  const gamesOf = (versionGroup: string) => GAMES.filter((g) => g.versionGroup === versionGroup).map((g) => g.shortName).join(' / ') || versionGroup;
  const placesOf = (result: unknown) => {
    const body = pickLocation(result as StoredLocation, lang);
    if (!body) return '—';
    if (!body.found || body.locations.length === 0) return t('Cannot be caught in the wild');
    const [first, ...more] = body.locations;
    return more.length ? `${first.place} (+${more.length})` : first.place;
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t('Admin')}</h1>

      {/* ---------- the demo ---------- */}
      <section className={card}>
        <h2 className="section-title">{t('Demo')}</h2>
        <p className="mt-2 text-sm text-muted">
          {t('Anyone who is not logged in uses the demo, which has its own copy of your data. Copy again when you add a game or a Pokémon you want it to have.')}
        </p>
        <p className="mt-2 text-sm">
          {demo?.dataCopiedAt
            ? t('Last copied {when}.', { when: dateTime(demo.dataCopiedAt) })
            : t('Never copied: the demo has only what visitors added.')}{' '}
          <span className="text-muted">{t('{n} Pokémon in the demo now.', { n: demoRoster })}</span>
        </p>
        <div className="mt-4">
          <CopyToDemo />
        </div>
      </section>

      {/* ---------- ideas people sent ---------- */}
      <section className={card}>
        <h2 className="section-title">
          {t('Suggestions')}
          {suggestions.length > 0 && <span className="ml-2 rounded-full bg-star/15 px-2 py-0.5 text-[10px] font-semibold text-star">{suggestions.length}</span>}
        </h2>
        {suggestions.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('No new suggestions.')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {suggestions.map((s) => (
              <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                <p className="whitespace-pre-line break-words text-sm leading-relaxed">{s.message}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="min-w-0 break-all text-xs text-muted">{who(s, t('Anonymous'))} · {date(s.createdAt)}</p>
                  <form action={archiveSuggestion.bind(null, s.id)}>
                    <button type="submit" className={small}>
                      {t('Archive')}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {archivedSuggestions.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">{t('Archived suggestions')}</summary>
            <ul className="mt-2 divide-y divide-line">
              {archivedSuggestions.map((s) => (
                <li key={s.id} className="py-2.5">
                  <p className="whitespace-pre-line break-words text-muted">{s.message}</p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <p className="min-w-0 break-all text-xs text-muted">{who(s, t('Anonymous'))} · {date(s.createdAt)}</p>
                    <span className="flex gap-2">
                      <form action={restoreSuggestion.bind(null, s.id)}>
                        <button type="submit" className={small}>
                          {t('Restore')}
                        </button>
                      </form>
                      <form action={deleteSuggestion.bind(null, s.id)}>
                        <button type="submit" className={small}>
                          {t('Delete')}
                        </button>
                      </form>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ---------- invite requests ---------- */}
      <section className={card}>
        <h2 className="section-title">{t('Invite requests')}</h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('Nobody is waiting for an invite.')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {pending.map((r) => (
              <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.name} <span className="font-normal text-muted">· {date(r.createdAt)}</span>
                    </p>
                    <p className="break-all text-sm text-muted">{r.email}</p>
                    {r.message && <p className="mt-1 whitespace-pre-line break-words text-sm">“{r.message}”</p>}
                  </div>
                  <div className="flex items-start gap-2">
                    <InviteFromRequest requestId={r.id} />
                    <form action={declineRequest.bind(null, r.id)}>
                      <button type="submit" className={small}>
                        {t('Decline')}
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {handled.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">{t('Answered requests')}</summary>
            <ul className="mt-2 space-y-2">
              {handled.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 break-all">
                    {r.name} <span className="text-muted">· {r.email} · {date(r.createdAt)}</span>
                  </span>
                  <span className="flex items-start gap-2">
                    <span className={r.status === 'INVITED' ? 'text-done' : 'text-muted'}>{r.status === 'INVITED' ? t('Invited') : t('Declined')}</span>
                    {r.status === 'INVITED' && <InviteFromRequest requestId={r.id} />}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ---------- invites ---------- */}
      <section className={card}>
        <h2 className="section-title">{t('Invites')}</h2>
        <div className="mt-3">
          <NewInviteForm />
        </div>
        {openInvites.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-medium">{t('Not used yet')}</h3>
            <ul className="mt-2 divide-y divide-line text-sm">
              {openInvites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <span className="min-w-0 break-all">
                    {i.email ?? t('Anyone with the link')} <span className="text-muted">· {date(i.createdAt)}{i.request ? ` · ${i.request.name}` : ''}</span>
                  </span>
                  <form action={revokeInvite.bind(null, i.id)}>
                    <button type="submit" className={small}>
                      {t('Revoke')}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">{t('A link cannot be shown again. If one is lost, revoke it and make another.')}</p>
          </div>
        )}
      </section>

      {/* ---------- users ---------- */}
      <section className={card}>
        <h2 className="section-title">{t('Users')}</h2>
        <ul className="mt-3 divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {[u.name, u.lastName].filter(Boolean).join(' ')}{' '}
                    {u.role === 'ADMIN' && <span className="ml-1 rounded-full bg-star/15 px-2 py-0.5 text-[10px] font-semibold text-star">{t('Admin')}</span>}
                  </p>
                  <p className="break-all text-sm text-muted">{u.email ?? t('The demo: nobody logs in as it')}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {t('Since {date}', { date: date(u.createdAt) })} · {u._count.sessions === 1 ? t('1 login') : t('{n} logins', { n: u._count.sessions })} ·{' '}
                    {u.aiProvider ? t('AI set up: {provider}', { provider: u.aiProvider === 'openai' ? 'OpenAI' : 'Anthropic' }) : t('No AI')}
                  </p>
                </div>
                {u.email && <ResetLinkButton userId={u.id} />}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- where to catch each Pokémon ---------- */}
      <section className={card}>
        <h2 className="section-title">{t('Where to catch each Pokémon')}</h2>
        <p className="mt-2 text-sm text-muted">
          {t('Answers found by the AI and shared with everyone. Delete a wrong one and the next lookup makes a new one.')} {t('{n} saved', { n: locationTotal })}
        </p>
        <form method="get" className="mt-3 flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder={t('Search a Pokémon')}
            aria-label={t('Search a Pokémon')}
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-1.5 text-sm"
          />
          <button type="submit" className={small}>
            {t('Search')}
          </button>
        </form>
        {locations.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('Nothing saved yet.')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {locations.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {pickName(l.species, lang)} <span className="font-normal text-muted">· {gamesOf(l.versionGroup)}</span>
                  </p>
                  <p className="break-words text-muted">{placesOf(l.result)}</p>
                  <p className="text-xs text-muted">
                    {date(l.updatedAt)} · {l.user?.name ?? (l.provider ? l.provider : t('Brought over from the old cache'))}
                  </p>
                </div>
                <form action={deleteLocation.bind(null, l.id)}>
                  <button type="submit" className={small}>
                    {t('Delete')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {locationTotal > locations.length && !query && (
          <p className="mt-2 text-xs text-muted">{t('Showing the {n} newest. Search to find another.', { n: LOCATIONS_SHOWN })}</p>
        )}
      </section>
    </div>
  );
}
