'use client';

import { useActionState } from 'react';
import { register } from '@/app/auth/actions';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/rules';
import { useT } from '@/lib/translate-client';
import { AuthError, Field, SubmitButton } from './parts';

export function RegisterForm({ invite, email }: { invite: string; email: string | null }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(register, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="invite" value={invite} />
      <AuthError code={state?.error} />
      <Field label={t('Name')} name="name" autoComplete="name" defaultValue={state?.values?.name} />
      <Field label={t('Email')} name="email" type="email" autoComplete="email" defaultValue={state?.values?.email ?? email ?? ''} />
      <Field
        label={t('Password')}
        name="password"
        type="password"
        autoComplete="new-password"
        hint={t('At least {n} characters.', { n: MIN_PASSWORD_LENGTH })}
      />
      <Field label={t('Repeat the password')} name="confirm" type="password" autoComplete="new-password" />
      <SubmitButton pending={pending}>{pending ? t('Creating your account…') : t('Create account')}</SubmitButton>
    </form>
  );
}
