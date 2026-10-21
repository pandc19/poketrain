import { redirect } from 'next/navigation';
import { AddGamesForm, type GroupView } from '@/components/games/AddGamesForm';
import { getUser } from '@/lib/current-user';
import { GAMES } from '@/lib/games';
import { getLang, getT } from '@/lib/i18n';
import { pickerGames } from '@/lib/landing';
import { groupGames, ownedGameIds } from '@/lib/my-games';

/** Where an account chooses the games it plays: the first thing a new account sees, and open to add more any time. */
export default async function AddGamePage({ searchParams }: PageProps<'/games/add'>) {
  const [user, t, lang, { game }] = await Promise.all([getUser(), getT(), getLang(), searchParams]);
  if (user.isDemo) redirect('/login');
  const owned = new Set(await ownedGameIds(user.id));
  const info = new Map(pickerGames(lang, t).map((g) => [g.id, g]));
  // A game someone was sent here for (they opened it without having added it) starts ticked.
  const wanted = typeof game === 'string' && GAMES.some((g) => g.id === game) ? game : null;

  const groups: GroupView[] = groupGames().map((group) => {
    const versions = [...group].sort((a, b) => a.shortName.localeCompare(b.shortName));
    const first = info.get(group[0].id)!;
    return {
      key: group.map((g) => g.id).join('-'),
      title: versions.length > 1 ? `Pokémon ${versions.map((g) => g.shortName).join(' / ')}` : group[0].name,
      detail: [first.generation, first.pokedexes.map((d) => d.name).join(', ')].join(' · '),
      versions: versions.map((g) => ({ id: g.id, shortName: g.shortName, from: g.theme.from, to: g.theme.to, owned: owned.has(g.id), chosen: g.id === wanted })),
    };
  });

  const first = owned.size === 0;
  return (
    <div className="mx-auto w-full max-w-2xl py-4">
      <h1 className="font-display text-3xl font-bold tracking-tight">{first ? t('Choose your games') : t('Add a game')}</h1>
      <p className="mt-2 max-w-xl leading-relaxed text-muted">
        {first
          ? t('Pick the games you play to get started. Each one has its own Pokédex, roster and plans, kept apart, and Scarlet and Violet are two saves, as in the games. You can add more any time.')
          : t('Each game has its own Pokédex, roster and plans, kept apart, and Scarlet and Violet are two saves, as in the games. The ones you already have are marked.')}
      </p>
      <div className="mt-6">
        <AddGamesForm groups={groups} first={first} />
      </div>
    </div>
  );
}
