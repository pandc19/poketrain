'use client';

import { useActionState } from 'react';
import { resetPassword } from '@/app/auth/actions';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/rules';
import { useT } from '@/lib/translate-client';
import { AuthError, Field, SubmitButton } from './parts';

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <AuthError code={state?.error} />
      <Field label={t('New password')} name="password" type="password" autoComplete="new-password" hint={t('At least {n} characters.', { n: MIN_PASSWORD_LENGTH })} />
      <Field label={t('Repeat the password')} name="confirm" type="password" autoComplete="new-password" />
      <SubmitButton pending={pending}>{pending ? t('Saving…') : t('Change password')}</SubmitButton>
    </form>
  );
}
