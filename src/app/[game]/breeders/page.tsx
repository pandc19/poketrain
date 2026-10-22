import { notFound } from 'next/navigation';
import { BreedersBoard } from '@/components/BreedersBoard';
import { BreedingSwitch } from '@/components/BreedingSwitch';
import { HelpTip } from '@/components/HelpTip';
import { gameShortName } from '@/lib/games';
import { getLang, getT } from '@/lib/i18n';
import { requireGameProfile } from '@/lib/profile';
import { loadEditorOptions, loadRoster } from '@/lib/roster';

export default async function BreedersPage({ params, searchParams }: PageProps<'/[game]/breeders'>) {
  const { game: gameId } = await params;
  const { p: selected } = await searchParams;
  const { game, profileId } = await requireGameProfile(gameId);
  if (!game.features.breeding) notFound();

  const [breeders, options, lang, t] = await Promise.all([
    loadRoster(profileId, undefined, 'BREEDER'),
    loadEditorOptions(game),
    getLang(),
    getT(),
  ]);

  return (
    <div>
      <h1 className="flex items-center gap-2 text-xl font-bold">
        {t('{game} breeders', { game: gameShortName(game, lang) })}
        <HelpTip>
          <span className="block">
            {t('Breeders are the Pokémon you keep to breed with. Adding one means you caught it and you have it, so it is marked as caught and “Have” in your Pokédex.')}
          </span>
          <span className="block">
            {t('It does not need to be on your roster. The “On the roster” label only tells you if you also train it.')}
          </span>
          <span className="block">
            {t('Removing it from here does not touch your roster. If it is not on your roster, you can choose to take off its “Have” mark in the Pokédex too; it stays caught.')}
          </span>
        </HelpTip>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        {t(
          'Record the Pokémon you keep to breed with: the Judge’s word for each IV, its nature and its ability. The breeding plans pick the best pair from these, and from the Pokémon in your Pokédex.'
        )}
      </p>
      <BreedingSwitch gameId={game.id} />
      <BreedersBoard
        gameId={game.id}
        initial={breeders}
        initialSelectedId={typeof selected === 'string' ? selected : null}
        options={options}
        lang={lang}
        judge={game.features.judge}
        accent={'var(--game-accent)'}
      />
    </div>
  );
}
