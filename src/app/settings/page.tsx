import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AiKeyForm } from '@/components/auth/AiKeyForm';
import { NameForm } from '@/components/auth/NameForm';
import { removeAiSettings } from '@/app/settings/actions';
import { DEFAULT_MODELS, type ProviderName } from '@/lib/ai/models';
import { getUser } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { getT } from '@/lib/i18n';
import { canStoreSecrets } from '@/lib/secret-box';

export default async function SettingsPage() {
  const [user, t] = await Promise.all([getUser(), getT()]);
  if (user.isDemo) redirect('/login');
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { aiProvider: true, aiKeyHint: true, aiKeyEncrypted: true, aiWorkspaceId: true, aiModel: true },
  });
  const provider: ProviderName = row.aiProvider === 'openai' ? 'openai' : 'claude';
  const providerName = provider === 'openai' ? 'OpenAI' : 'Anthropic';
  const saved = row.aiKeyEncrypted ? { provider, workspaceId: row.aiWorkspaceId, model: row.aiModel } : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t('Settings')}</h1>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="section-title">{t('Account')}</h2>
        <p className="mt-3 text-sm">
          <span className="text-muted">{t('Email')}</span> <span className="ml-2 break-all">{user.email}</span>
        </p>
        <div className="mt-4">
          <NameForm current={user.name} />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="section-title">{t('AI')}</h2>
        <p className="mt-2 text-sm text-muted">
          {t('The AI can review a Pokémon and suggest its held item, moves, EVs, nature and Tera type, and look up where to catch one. Everything else, including the quick audit, works without it.')}
        </p>
        <p className="mt-2 text-sm text-muted">
          {t('It uses your own API key, from Anthropic or OpenAI. The provider charges you for what you ask; PokéTrain charges nothing.')}
        </p>

        <div className="mt-4 rounded-md bg-surface-2 px-3 py-2.5 text-sm">
          {saved ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <ul className="space-y-0.5">
                <li>{t('Using {provider}, key ending in {hint}.', { provider: providerName, hint: row.aiKeyHint ?? '••••' })}</li>
                <li className="text-muted">
                  {row.aiModel
                    ? t('Model: {model}', { model: row.aiModel })
                    : t('Model: {model} (the default)', { model: DEFAULT_MODELS[provider].bulk })}
                </li>
                {row.aiWorkspaceId && <li className="text-muted">{t('Workspace: {id}', { id: row.aiWorkspaceId })}</li>}
              </ul>
              <form action={removeAiSettings}>
                <button type="submit" className="rounded-md border border-line px-3 py-1 text-xs hover:text-ink">
                  {t('Remove the key')}
                </button>
              </form>
            </div>
          ) : (
            <span className="text-muted">{t('AI is off. Add your key below to turn it on.')}</span>
          )}
        </div>

        <div className="mt-5">
          {canStoreSecrets() ? (
            <AiKeyForm current={saved} />
          ) : (
            <p className="text-sm text-muted">{t('Saving keys is not set up on this server yet.')}</p>
          )}
        </div>
        <p className="mt-4 text-xs text-muted">
          {t('The key and the model are checked with the provider before they are saved. The key is stored encrypted and used only for your requests, and it is never shown again, only its last four characters. You can remove it at any time.')}
        </p>
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
    </div>
  );
}
