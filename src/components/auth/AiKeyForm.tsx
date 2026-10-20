'use client';

import { useActionState } from 'react';
import { saveAiKey, type KeyFormError } from '@/app/settings/actions';
import { useT } from '@/lib/translate-client';
import { SubmitButton } from './parts';

export function AiKeyForm({ current }: { current: 'claude' | 'openai' | null }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(saveAiKey, undefined);
  const errors: Record<KeyFormError, string> = {
    unavailable: t('Saving keys is not set up on this server yet.'),
    provider: t('Choose where the key is from.'),
    key: t('That does not look like an API key.'),
    rejected: t('The provider did not accept that key. Check it and try again.'),
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
        <p className="rounded-md border border-done/40 bg-done/10 px-3 py-2 text-sm text-done">{t('Your key was checked and saved. The AI buttons are on.')}</p>
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
            <input type="radio" name="provider" value={value} defaultChecked={(current ?? 'claude') === value} />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="block">
        <span className="text-sm font-medium">{t('API key')}</span>
        <input
          name="key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-[var(--game-accent)]"
        />
      </label>
      <SubmitButton pending={pending}>{pending ? t('Checking the key…') : current ? t('Replace the key') : t('Save the key')}</SubmitButton>
    </form>
  );
}
