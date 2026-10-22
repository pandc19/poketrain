import { redirect } from 'next/navigation';
import { SettingsTabs } from '@/components/SettingsTabs';
import { getUser } from '@/lib/current-user';
import { getT } from '@/lib/i18n';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [user, t] = await Promise.all([getUser(), getT()]);
  if (user.isDemo) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t('Settings')}</h1>
      <SettingsTabs />
      {children}
    </div>
  );
}
