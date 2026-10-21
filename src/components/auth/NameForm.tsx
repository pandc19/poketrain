'use client';

import { useActionState } from 'react';
import { renameAccount } from '@/app/settings/actions';
import { MAX_NAME_LENGTH } from '@/lib/auth/rules';
import { useT } from '@/lib/translate-client';
import { SubmitButton } from './parts';

/** Change the name on the account. */
export function NameForm({ current }: { current: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(renameAccount, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium">{t('Name')}</span>
        <input
          name="name"
          defaultValue={state?.value ?? current}
          required
          maxLength={MAX_NAME_LENGTH}
          autoComplete="name"
          className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-[var(--game-accent)]"
        />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
          {state.error === 'name' ? t('Enter your name.') : t('Too many attempts. Try again in a few minutes.')}
        </p>
      )}
      {state?.saved && <p className="rounded-md border border-done/40 bg-done/10 px-3 py-2 text-sm text-done">{t('Name saved.')}</p>}
      <SubmitButton pending={pending}>{t('Save name')}</SubmitButton>
    </form>
  );
}
