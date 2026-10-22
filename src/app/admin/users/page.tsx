import { ResetLinkButton } from '@/components/admin/LinkForms';
import { requireAdmin } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { getLang, getT } from '@/lib/i18n';

const card = 'rounded-xl border border-line bg-surface p-5';

export default async function AdminUsersPage() {
  await requireAdmin();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const date = (d: Date) => d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, lastName: true, email: true, role: true, aiProvider: true, createdAt: true, _count: { select: { sessions: true } } },
  });

  return (
    <>
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
    </>
  );
}
