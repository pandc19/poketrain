import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EggIcon, SparklesIcon } from '@/components/ActionIcons';
import { KeeperIcon, TrainingIcon } from '@/components/KeeperIcon';
import { GamePicker } from '@/components/landing/GamePicker';
import { PokeBallIcon } from '@/components/PokeBallIcon';
import { DEMO_USER_ID } from '@/lib/constants';
import { getUser } from '@/lib/current-user';
import { GAMES } from '@/lib/games';
import { getLang, getT } from '@/lib/i18n';
import { pickerGames } from '@/lib/landing';
import { pokedexSizes } from '@/lib/landing-data';
import { ownedGameIds } from '@/lib/my-games';

// Games on the way. They are named here, not in the game config, because they have no config yet.
const COMING_NEXT = ['Legends: Z-A', 'Brilliant Diamond / Shining Pearl', 'Sword / Shield'];

/**
 * The front door. Someone logged in goes straight to their game; everyone else lands here, with the demo one
 * click away.
 */
export default async function Home() {
  const user = await getUser();
  if (!user.isDemo) {
    // Straight to their first game, or to choosing one when they have none yet.
    const [first] = await ownedGameIds(user.id);
    redirect(first ? `/${first}/pokedex` : '/games/add');
  }
  const [t, lang] = await Promise.all([getT(), getLang()]);
  // The demo has the games the owner has (a copy of their saves), so only those can be opened from here.
  const demoGames = await ownedGameIds(DEMO_USER_ID);
  const demo = `/${demoGames[0] ?? GAMES[0].id}/pokedex`;

  const jobs = [
    {
      icon: <PokeBallIcon caught size={26} />,
      title: t('Pokédex'),
      text: t('Mark what you have caught, regional forms included, and see what is still missing in every Pokédex of the game, DLC too. Pokémon only the other version has are marked, so you know what needs a trade.'),
    },
    {
      icon: <TrainingIcon size={26} />,
      title: t('Roster and training'),
      text: t('One card for each Pokémon: nature, ability, held item, moves and EVs. Type in the stats the game shows and PokéTrain works out the EVs, and checks every move against what the Pokémon can really learn.'),
    },
    {
      icon: <EggIcon size={26} />,
      title: t('Breeding'),
      text: t('Plan the parents for the nature, IVs and egg moves you want, and see what you still need to catch or hatch, step by step.'),
    },
    {
      icon: <KeeperIcon size={26} />,
      title: t('Battles'),
      text: t('Save a raid boss or a hard opponent and see which of your Pokémon counter it, and why.'),
    },
  ];

  return (
    <div>
      {/* ---------- the way in ---------- */}
      <section className="grid items-center gap-10 py-8 sm:py-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-16">
        <div>
          <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            {t('Keep your Pokémon playthrough organised.')}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            {t('PokéTrain is a free-time project by someone who loves Pokémon games. It keeps track of what you have caught, who you are training, what to breed next and what is left to beat, so you can leave the spreadsheets and browser tabs behind.')}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={demo} className="rounded-lg bg-game px-6 py-3 font-display text-base font-semibold text-bg shadow-sm hover:brightness-110">
              {t('Try the demo')}
            </Link>
            <Link href="/login" className="rounded-lg border border-line px-6 py-3 font-display text-base font-semibold hover:bg-surface-2">
              {t('Log in')}
            </Link>
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            {t('The demo needs no account. Accounts are by invitation while PokéTrain is a free-time project:')}{' '}
            <Link href="/request-invite" className="font-medium text-ink underline underline-offset-4 hover:text-game">
              {t('request an invite')}
            </Link>
            .
          </p>
        </div>

        <GamePicker games={pickerGames(lang, t, await pokedexSizes(), new Set(demoGames))} />
      </section>

      {/* ---------- what it does ---------- */}
      <section className="py-10 sm:py-14">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{t('What you can do with it')}</h2>
        <div className="mt-8 grid gap-x-14 gap-y-9 sm:grid-cols-2">
          {jobs.map((job) => (
            <div key={job.title} className="flex gap-4">
              <span className="mt-0.5 shrink-0 text-game">{job.icon}</span>
              <div className="max-w-md">
                <h3 className="font-display text-lg font-semibold">{job.title}</h3>
                <p className="mt-1.5 leading-relaxed text-muted">{job.text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-9 max-w-2xl leading-relaxed text-muted">
          {t('Not sure what to run? The quick audit suggests a nature, EVs, four moves, a held item and a Tera type from the game’s own data, in one click.')}
        </p>
      </section>

      {/* ---------- AI ---------- */}
      <section className="py-10 sm:py-14">
        <div className="flex max-w-3xl gap-4 border-l-2 border-game pl-5">
          <span className="mt-1 shrink-0 text-game">
            <SparklesIcon size={26} />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">{t('AI is optional')}</h2>
            <p className="mt-2 leading-relaxed text-muted">
              {t('Everything above works without it. If you want more, add your own Anthropic or OpenAI key in Settings: the AI can review a Pokémon and look up where to catch one. The provider charges you for what you ask; PokéTrain charges nothing.')}
            </p>
          </div>
        </div>
      </section>

      {/* ---------- coming next ---------- */}
      <section className="py-10 sm:py-14">
        <h2 className="font-display text-2xl font-bold tracking-tight">{t('Coming next')}</h2>
        <p className="mt-2 max-w-xl leading-relaxed text-muted">{t('More games are added one at a time, each with its own Pokédexes and rules.')}</p>
        <p className="mt-2 max-w-xl leading-relaxed text-muted">
          {t('Missing a game, or something else?')}{' '}
          <Link href="/suggest" className="font-medium text-ink underline underline-offset-4 hover:text-game">
            {t('Suggest a feature')}
          </Link>
          .
        </p>
        <ul className="mt-5 flex flex-wrap gap-3">
          {COMING_NEXT.map((name) => (
            <li key={name} className="rounded-t-md rounded-b-sm border border-dashed border-muted/60 px-4 pb-2 pt-3 font-display text-sm font-semibold text-muted">
              {name}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- small print ---------- */}
      <footer className="mt-6 border-t border-line py-8 text-sm leading-relaxed text-muted">
        <p className="max-w-2xl">
          {t('PokéTrain is a free-time fan project. It is not affiliated with Nintendo, Game Freak or The Pokémon Company. Pokémon and its names are trademarks of their owners.')}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <Link href={demo} className="underline underline-offset-4 hover:text-ink">
            {t('Try the demo')}
          </Link>
          <Link href="/login" className="underline underline-offset-4 hover:text-ink">
            {t('Log in')}
          </Link>
          <Link href="/request-invite" className="underline underline-offset-4 hover:text-ink">
            {t('Request an invite')}
          </Link>
          <Link href="/suggest" className="underline underline-offset-4 hover:text-ink">
            {t('Suggest a feature')}
          </Link>
        </p>
      </footer>
    </div>
  );
}
