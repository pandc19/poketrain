import { CopyToDemo } from '@/components/admin/CopyToDemo';
import { DEMO_USER_ID } from '@/lib/constants';
import { requireAdmin } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { getLang, getT } from '@/lib/i18n';

const card = 'rounded-xl border border-line bg-surface p-5';

export default async function AdminDemoPage() {
  await requireAdmin();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const dateTime = (d: Date) => d.toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const [demo, demoRoster] = await Promise.all([
    prisma.user.findUnique({ where: { id: DEMO_USER_ID }, select: { dataCopiedAt: true } }),
    prisma.rosterPokemon.count({ where: { profile: { userId: DEMO_USER_ID } } }),
  ]);

  return (
    <>
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
    </>
  );
}
