'use client';

import { useActionState } from 'react';
import { renameAccount } from '@/app/settings/actions';
import { MAX_NAME_LENGTH } from '@/lib/auth/rules';
import { useT } from '@/lib/translate-client';
import { Field, SubmitButton } from './parts';

/** Change the first and last name on the account. */
export function NameForm({ current }: { current: { name: string; lastName: string } }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(renameAccount, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('First name')} name="name" defaultValue={state?.value ?? current.name} autoComplete="given-name" maxLength={MAX_NAME_LENGTH} />
        <Field
          label={t('Last name')}
          name="lastName"
          defaultValue={state?.lastName ?? current.lastName}
          autoComplete="family-name"
          required={false}
          maxLength={MAX_NAME_LENGTH}
        />
      </div>
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
