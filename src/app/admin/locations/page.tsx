import { deleteLocation } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { GAMES } from '@/lib/games';
import { getLang, getT, pickName } from '@/lib/i18n';
import { pickLocation, type StoredLocation } from '@/lib/location-text';

const LOCATIONS_SHOWN = 50;

const card = 'rounded-xl border border-line bg-surface p-5';
const small = 'rounded-md border border-line px-3 py-1 text-xs font-semibold hover:text-ink';

export default async function AdminLocationsPage({ searchParams }: PageProps<'/admin/locations'>) {
  await requireAdmin();
  const { q } = await searchParams;
  const query = typeof q === 'string' ? q.trim().slice(0, 60) : '';
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const date = (d: Date) => d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const [locations, locationTotal] = await Promise.all([
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

  const gamesOf = (versionGroup: string) => GAMES.filter((g) => g.versionGroup === versionGroup).map((g) => g.shortName).join(' / ') || versionGroup;
  const placesOf = (result: unknown) => {
    const body = pickLocation(result as StoredLocation, lang);
    if (!body) return '—';
    if (!body.found || body.locations.length === 0) return t('Cannot be caught in the wild');
    const [first, ...more] = body.locations;
    return more.length ? `${first.place} (+${more.length})` : first.place;
  };

  return (
    <>
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
    </>
  );
}
