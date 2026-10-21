'use client';

import { useActionState, useState } from 'react';
import { saveAiSettings, type KeyFormError } from '@/app/settings/actions';
import { DEFAULT_MODELS, SUGGESTED_MODELS, type ProviderName } from '@/lib/ai/models';
import { useT } from '@/lib/translate-client';
import { SubmitButton } from './parts';

export type SavedAi = { provider: ProviderName; workspaceId: string | null; model: string | null };

const inputClass = 'mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-[var(--game-accent)]';

export function AiKeyForm({ current }: { current: SavedAi | null }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(saveAiSettings, undefined);
  const [provider, setProvider] = useState<ProviderName>(current?.provider ?? 'claude');
  // The saved key can stay only while the provider is the same: a key belongs to one provider.
  const keepsKey = current != null && current.provider === provider;
  const errors: Record<KeyFormError, string> = {
    unavailable: t('Saving keys is not set up on this server yet.'),
    provider: t('Choose where the key is from.'),
    key: t('That does not look like an API key.'),
    'workspace-format': t('The workspace id looks wrong.'),
    'model-format': t('The model name looks wrong.'),
    rejected: t('The provider did not accept that key. Check it and try again.'),
    workspace: t('Anthropic asks for a workspace id with this key. Add it below.'),
    'workspace-invalid': t('Anthropic did not accept that workspace id. Check it and try again.'),
    model: t('The provider does not have that model. Check the name.'),
    unreachable: t('Could not reach the provider to check the key. Try again in a moment.'),
    'rate-limit': t('Too many attempts. Try again in a few minutes.'),
  };
  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p role="alert" className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
          {errors[state.error]}
        </p>
      )}
      {state?.saved && (
        <p className="rounded-md border border-done/40 bg-done/10 px-3 py-2 text-sm text-done">{t('Your AI settings were checked and saved. The AI buttons are on.')}</p>
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('Where is the key from?')}</legend>
        {(
          [
            ['claude', 'Anthropic (Claude)'],
            ['openai', 'OpenAI'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="provider" value={value} checked={provider === value} onChange={() => setProvider(value)} />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="block">
        <span className="text-sm font-medium">{t('API key')}</span>
        <input name="key" type="password" autoComplete="off" spellCheck={false} required={!keepsKey} className={`${inputClass} font-mono`} />
        {keepsKey && <span className="mt-1 block text-xs text-muted">{t('Leave empty to keep the saved key.')}</span>}
      </label>
      {provider === 'claude' && (
        <label className="block">
          <span className="text-sm font-medium">{t('Workspace ID')}</span>
          <input name="workspace" autoComplete="off" spellCheck={false} defaultValue={current?.workspaceId ?? ''} className={`${inputClass} font-mono`} />
          <span className="mt-1 block text-xs text-muted">{t('Only if Anthropic says your key needs one.')}</span>
        </label>
      )}
      <label className="block">
        <span className="text-sm font-medium">{t('Model')}</span>
        <input
          key={provider}
          name="model"
          list={`models-${provider}`}
          autoComplete="off"
          spellCheck={false}
          defaultValue={current?.provider === provider ? (current.model ?? '') : ''}
          placeholder={DEFAULT_MODELS[provider].bulk}
          className={`${inputClass} font-mono`}
        />
        <datalist id={`models-${provider}`}>
          {SUGGESTED_MODELS[provider].map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <span className="mt-1 block text-xs text-muted">{t('Optional. Leave it empty to use {model}.', { model: DEFAULT_MODELS[provider].bulk })}</span>
      </label>
      <SubmitButton pending={pending}>{pending ? t('Checking…') : current ? t('Save the changes') : t('Save the key')}</SubmitButton>
    </form>
  );
}
