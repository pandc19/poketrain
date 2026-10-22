import { SearchBoard } from '@/components/SearchBoard';
import { gameShortName } from '@/lib/games';
import { getLang, getT } from '@/lib/i18n';
import { requireGameProfile } from '@/lib/profile';
import { loadRoster } from '@/lib/roster';

export default async function SearchPage({ params }: PageProps<'/[game]/search'>) {
  const { game: gameId } = await params;
  const { game, profileId } = await requireGameProfile(gameId);
  const [roster, lang, t] = await Promise.all([loadRoster(profileId, undefined, 'ROSTER'), getLang(), getT()]);

  return (
    <div>
      <h1 className="text-xl font-bold">{t('{game} roster search', { game: gameShortName(game, lang) })}</h1>
      <p className="mb-5 mt-1 max-w-3xl text-sm text-muted">
        {t('Find the Pokémon in your roster by what they have. Add a move or an ability and you get every Pokémon that has it.')}
      </p>
      <SearchBoard gameId={game.id} roster={roster} lang={lang} accent={'var(--game-accent)'} />
    </div>
  );
}
