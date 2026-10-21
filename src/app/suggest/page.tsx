import { AuthCard, CardLink } from '@/components/auth/parts';
import { SuggestForm } from '@/components/suggest/SuggestForm';
import { getUser } from '@/lib/current-user';
import { getT } from '@/lib/i18n';

export default async function SuggestPage() {
  const [user, t] = await Promise.all([getUser(), getT()]);
  return (
    <AuthCard
      title={t('Suggest a feature')}
      intro={t('PokéTrain is a free-time project. Say what would make it better: a game you want, a screen that is missing, something that got in your way. Every idea is read, though not every one can be built.')}
      footer={
        <>
          <CardLink href="/">{t('Back to PokéTrain')}</CardLink>
        </>
      }
    >
      <SuggestForm sender={user.isDemo ? null : user.name} />
    </AuthCard>
  );
}
