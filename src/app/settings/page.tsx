import { redirect } from 'next/navigation';
import { AiKeyForm } from '@/components/auth/AiKeyForm';
import { removeAiKey } from '@/app/settings/actions';
import { serverAiKeyConfigured } from '@/lib/ai';
import { getUser } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { getT } from '@/lib/i18n';
import { canStoreSecrets } from '@/lib/secret-box';

export default async function SettingsPage() {
  const [user, t] = await Promise.all([getUser(), getT()]);
  if (user.isDemo) redirect('/login');
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { aiProvider: true, aiKeyHint: true, aiKeyEncrypted: true } });
  const providerName = row.aiProvider === 'openai' ? 'OpenAI' : 'Anthropic';
  const paidByServer = user.aiEnabled && serverAiKeyConfigured();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t('Settings')}</h1>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="section-title">{t('Account')}</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">{t('Name')}</dt>
          <dd>{user.name}</dd>
          <dt className="text-muted">{t('Email')}</dt>
          <dd>{user.email}</dd>
        </dl>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="section-title">{t('AI')}</h2>
        <p className="mt-2 text-sm text-muted">
          {t('The AI can write a build audit for a Pokémon and look up where to catch one. Everything else, including the quick audit, works without it.')}
        </p>
        <p className="mt-2 text-sm text-muted">
          {t('It uses your own API key, from Anthropic or OpenAI. The provider charges you for what you ask; Poké Train charges nothing.')}
        </p>

        <div className="mt-4 rounded-md bg-surface-2 px-3 py-2.5 text-sm">
          {row.aiKeyEncrypted ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {t('Using your {provider} key ending in {hint}.', { provider: providerName, hint: row.aiKeyHint ?? '••••' })}
              </span>
              <form action={removeAiKey}>
                <button type="submit" className="rounded-md border border-line px-3 py-1 text-xs hover:text-ink">
                  {t('Remove the key')}
                </button>
              </form>
            </div>
          ) : paidByServer ? (
            <span>{t('AI is on for your account, with the key of the server.')}</span>
          ) : (
            <span className="text-muted">{t('AI is off. Add your key below to turn it on.')}</span>
          )}
        </div>

        <div className="mt-5">
          {canStoreSecrets() ? (
            <AiKeyForm current={row.aiProvider === 'openai' ? 'openai' : row.aiProvider === 'claude' ? 'claude' : null} />
          ) : (
            <p className="text-sm text-muted">{t('Saving keys is not set up on this server yet.')}</p>
          )}
        </div>
        <p className="mt-4 text-xs text-muted">
          {t('The key is checked with the provider, then stored encrypted and used only for your requests. It is never shown again, only its last four characters. You can remove it at any time.')}
        </p>
      </section>
    </div>
  );
}
