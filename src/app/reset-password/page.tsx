import { AuthCard, CardLink } from '@/components/auth/parts';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { checkPasswordReset } from '@/lib/auth/accounts';
import { getT } from '@/lib/i18n';

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const [t, { token }] = await Promise.all([getT(), searchParams]);
  const value = typeof token === 'string' ? token : '';
  const good = value ? await checkPasswordReset(value) : false;

  if (!good) {
    return (
      <AuthCard
        title={t('This link does not work')}
        intro={t('It is not valid, or it has expired. Ask for a new one.')}
        footer={<CardLink href="/login">{t('Log in')}</CardLink>}
      >
        <p className="text-sm text-muted">{t('A password link works once and for a day.')}</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('Choose a new password')} intro={t('You will be logged out everywhere and can log in with the new one.')}>
      <ResetPasswordForm token={value} />
    </AuthCard>
  );
}
