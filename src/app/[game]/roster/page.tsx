import { HelpTip } from '@/components/HelpTip';
import { RosterBoard } from '@/components/RosterBoard';
import { getAiProvider } from '@/lib/ai';
import { gameHasMints } from '@/lib/audit-ask';
import { getLang, getT } from '@/lib/i18n';
import { requireGameProfile } from '@/lib/profile';
import { loadEditorOptions, loadRoster } from '@/lib/roster';
import { loadTeam, loadTrainingStat } from '@/lib/team';

export default async function RosterPage({ params, searchParams }: PageProps<'/[game]/roster'>) {
  const { game: gameId } = await params;
  const { p: selected } = await searchParams;
  const { game, profileId } = await requireGameProfile(gameId);
  const [roster, team, trainingStat, options, lang, t] = await Promise.all([
    loadRoster(profileId, undefined, 'ROSTER'),
    loadTeam(profileId),
    loadTrainingStat(profileId),
    loadEditorOptions(game),
    getLang(),
    getT(),
  ]);
  const provider = getAiProvider();

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold">
        {t('{game} trained roster', { game: game.shortName })}
        <HelpTip>
          <span className="block">
            {t('Your roster is the Pokémon you train: the ones you have, with their moves, items and EVs, and the ones you plan to get.')}
          </span>
          <span className="block">
            {t('Mark “Have” on the ones you own now. Those also count as caught in your Pokédex.')}
          </span>
          <span className="block">
            {t('A Pokémon can be both on the roster and a breeder: it is kept once and shows on both pages. Removing it from one list leaves it in the other.')}
          </span>
        </HelpTip>
      </h1>
      <RosterBoard
        gameId={game.id}
        initial={roster}
        initialTeam={team}
        initialTraining={trainingStat}
        initialSelectedId={typeof selected === 'string' ? selected : null}
        options={options}
        lang={lang}
        judge={game.features.judge}
        evs={game.features.evs}
        evTarget={game.features.evTarget}
        tera={game.features.teraType}
        mints={gameHasMints(game)}
        breeding={game.features.breeding}
        accent={'var(--game-accent)'}
        aiEnabled={provider != null}
      />
    </div>
  );
}
