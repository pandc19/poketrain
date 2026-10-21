import { redirect } from 'next/navigation';
import { AuthCard, CardLink } from '@/components/auth/parts';
import { RequestInviteForm } from '@/components/auth/RequestInviteForm';
import { getUser } from '@/lib/current-user';
import { getT } from '@/lib/i18n';

export default async function RequestInvitePage() {
  const [user, t] = await Promise.all([getUser(), getT()]);
  if (!user.isDemo) redirect('/');
  return (
    <AuthCard
      title={t('Request an invite')}
      intro={t('PokéTrain is a free-time project, so accounts are by invitation. Leave your details and you will get a link to create yours.')}
      footer={
        <>
          <CardLink href="/login">{t('I already have an account')}</CardLink>
          <CardLink href="/">{t('Back to the demo')}</CardLink>
        </>
      }
    >
      <RequestInviteForm />
    </AuthCard>
  );
}
