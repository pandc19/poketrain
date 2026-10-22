'use client';

import { useActionState, useEffect, useRef } from 'react';
import { changePassword } from '@/app/settings/actions';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/rules';
import { useT } from '@/lib/translate-client';
import { Field, SubmitButton } from './parts';

/** Change the password: the current one, and the new one twice. */
export function PasswordForm() {
  const { t } = useT();
  const [state, action, pending] = useActionState(changePassword, undefined);
  const form = useRef<HTMLFormElement>(null);
  // The passwords are not kept in the form once they were saved.
  useEffect(() => {
    if (state?.saved) form.current?.reset();
  }, [state]);
  const errors = {
    missing: t('Enter your current password.'),
    wrong: t('The current password is not right.'),
    short: t('The password needs at least {n} characters.', { n: MIN_PASSWORD_LENGTH }),
    mismatch: t('The two passwords are not the same.'),
    'rate-limit': t('Too many attempts. Try again in a few minutes.'),
  };
  return (
    <form ref={form} action={action} className="space-y-3">
      <Field label={t('Current password')} name="current" type="password" autoComplete="current-password" />
      <Field label={t('New password')} name="password" type="password" autoComplete="new-password" hint={t('At least {n} characters.', { n: MIN_PASSWORD_LENGTH })} />
      <Field label={t('Repeat the password')} name="confirm" type="password" autoComplete="new-password" />
      {state?.error && (
        <p role="alert" className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
          {errors[state.error]}
        </p>
      )}
      {state?.saved && (
        <p className="rounded-md border border-done/40 bg-done/10 px-3 py-2 text-sm text-done">
          {t('Password changed. Your other logins were ended.')}
        </p>
      )}
      <SubmitButton pending={pending}>{pending ? t('Saving…') : t('Change password')}</SubmitButton>
    </form>
  );
}
