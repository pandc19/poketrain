import { redirect } from 'next/navigation';
import { AuthCard, CardLink } from '@/components/auth/parts';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { checkInvite } from '@/lib/auth/accounts';
import { getUser } from '@/lib/current-user';
import { getT } from '@/lib/i18n';

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const [user, t, { invite }] = await Promise.all([getUser(), getT(), searchParams]);
  if (!user.isDemo) redirect('/');
  const code = typeof invite === 'string' ? invite : '';
  const check = code ? await checkInvite(code) : null;

  if (!check?.ok) {
    return (
      <AuthCard
        title={t('This invite link does not work')}
        intro={t('It is not valid, or it has already been used. Each invite works once.')}
        footer={
          <>
            <CardLink href="/request-invite">{t('Request an invite')}</CardLink>
            <CardLink href="/login">{t('Log in')}</CardLink>
          </>
        }
      >
        <p className="text-sm text-muted">{t('Accounts are by invitation for now. You can ask for one and you will get a new link.')}</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={t('Create your account')}
      intro={t('You were invited. Choose how you log in.')}
      footer={<CardLink href="/login">{t('I already have an account')}</CardLink>}
    >
      <RegisterForm invite={code} email={check.email} />
    </AuthCard>
  );
}
