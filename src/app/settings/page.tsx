import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NameForm } from '@/components/auth/NameForm';
import { PasswordForm } from '@/components/auth/PasswordForm';
import { MyGames } from '@/components/games/MyGames';
import { getUser } from '@/lib/current-user';
import { GAMES } from '@/lib/games';
import { getT } from '@/lib/i18n';
import { gameDataOf } from '@/lib/my-games';

export default async function SettingsPage() {
  const [user, t] = await Promise.all([getUser(), getT()]);
  if (user.isDemo) redirect('/login');
  const games = (await gameDataOf(user.id)).map((d) => {
    const g = GAMES.find((x) => x.id === d.gameId)!;
    return { ...d, id: g.id, name: g.name, shortName: g.shortName };
  });
  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="section-title">{t('Account')}</h2>
        <p className="mt-3 text-sm">
          <span className="text-muted">{t('Email')}</span> <span className="ml-2 break-all">{user.email}</span>
        </p>
        <div className="mt-4">
          <NameForm current={{ name: user.name, lastName: user.lastName }} />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="section-title">{t('Password')}</h2>
        <div className="mt-4">
          <PasswordForm />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="section-title">{t('My games')}</h2>
        <MyGames games={games} />
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="section-title">{t('Ideas')}</h2>
        <p className="mt-2 text-sm text-muted">
          {t('Something missing, or something that got in your way?')}{' '}
          <Link href="/suggest" className="font-medium text-ink underline underline-offset-4 hover:text-game">
            {t('Suggest a feature')}
          </Link>
          .
        </p>
      </section>
    </>
  );
}
