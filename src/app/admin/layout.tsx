import { PageTabs } from '@/components/PageTabs';
import { requireAdmin } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { getT } from '@/lib/i18n';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const t = await getT();
  // What is waiting for the admin, shown on its tab.
  const [suggestions, requests] = await Promise.all([
    prisma.featureSuggestion.count({ where: { archivedAt: null } }),
    prisma.inviteRequest.count({ where: { status: 'PENDING' } }),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t('Admin')}</h1>
      <PageTabs
        label={t('Admin')}
        tabs={[
          { href: '/admin', label: t('Demo') },
          { href: '/admin/suggestions', label: t('Suggestions'), badge: suggestions },
          { href: '/admin/invites', label: t('Invites'), badge: requests },
          { href: '/admin/users', label: t('Users') },
          { href: '/admin/locations', label: t('Where to find') },
        ]}
      />
      {children}
    </div>
  );
}
