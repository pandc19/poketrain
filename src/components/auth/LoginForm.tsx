'use client';

import { useActionState } from 'react';
import { login } from '@/app/auth/actions';
import { useT } from '@/lib/translate-client';
import { AuthError, Field, SubmitButton } from './parts';

export function LoginForm({ justReset }: { justReset: boolean }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      {justReset && !state && (
        <p className="rounded-md border border-done/40 bg-done/10 px-3 py-2 text-sm text-done">{t('Your password was changed. Log in with the new one.')}</p>
      )}
      <AuthError code={state?.error} />
      <Field label={t('Email')} name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} />
      <Field label={t('Password')} name="password" type="password" autoComplete="current-password" />
      <SubmitButton pending={pending}>{pending ? t('Logging in…') : t('Log in')}</SubmitButton>
    </form>
  );
}
