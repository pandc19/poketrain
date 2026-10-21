import { redirect } from 'next/navigation';
import { AuthCard, CardLink } from '@/components/auth/parts';
import { LoginForm } from '@/components/auth/LoginForm';
import { getUser } from '@/lib/current-user';
import { getT } from '@/lib/i18n';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const [user, t, { reset }] = await Promise.all([getUser(), getT(), searchParams]);
  if (!user.isDemo) redirect('/');
  return (
    <AuthCard
      title={t('Log in')}
      intro={t('Your own Pokédex, roster and breeding plans, saved to your account.')}
      footer={
        <>
          <CardLink href="/request-invite">{t('Request an invite')}</CardLink>
          <CardLink href="/">{t('Back to the demo')}</CardLink>
        </>
      }
    >
      <LoginForm justReset={reset === '1'} />
    </AuthCard>
  );
}
