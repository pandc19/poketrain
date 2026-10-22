import { ImportWizard } from '@/components/ImportWizard';
import { gameShortName } from '@/lib/games';
import { getLang, getT } from '@/lib/i18n';
import { requireGameProfile } from '@/lib/profile';

export default async function ImportPage({ params }: PageProps<'/[game]/import'>) {
  const { game: gameId } = await params;
  const { game } = await requireGameProfile(gameId);
  const [lang, t] = await Promise.all([getLang(), getT()]);
  return (
    <div>
      <h1 className="text-xl font-bold">{t('Import a spreadsheet')}</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        {t(
          'Bring your {game} training sheet in as roster Pokémon. You choose what each column means, review how it was read, then import.',
          { game: gameShortName(game, lang) }
        )}
      </p>
      <ImportWizard gameId={game.id} gameName={gameShortName(game, lang)} lang={lang} hasEvs={game.features.evs} hasEvTarget={game.features.evTarget} />
    </div>
  );
}
