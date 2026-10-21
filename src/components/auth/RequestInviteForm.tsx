'use client';

import { useActionState } from 'react';
import { requestInvite } from '@/app/auth/actions';
import { TRAP_FIELD } from '@/lib/trap';
import { useT } from '@/lib/translate-client';
import { AuthError, Field, SubmitButton } from './parts';

export function RequestInviteForm() {
  const { t } = useT();
  const [state, action, pending] = useActionState(requestInvite, undefined);
  if (state?.done) {
    return (
      <div className="rounded-md border border-done/40 bg-done/10 px-3 py-3 text-sm text-done">
        {t('Thanks! Your request was sent. If there is room, you will get an invite link at that email address.')}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <AuthError code={state?.error} />
      <Field label={t('Name')} name="name" autoComplete="name" defaultValue={state?.values?.name} />
      <Field label={t('Email')} name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} />
      <label className="block">
        <span className="text-sm font-medium">{t('Which Pokémon games do you play?')}</span>
        <textarea
          name="message"
          rows={3}
          maxLength={1000}
          defaultValue={state?.values?.message}
          className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-[var(--game-accent)]"
        />
        <span className="mt-1 block text-xs text-muted">{t('Optional.')}</span>
      </label>
      {/* A field for bots: people never see it, so anything typed in it means the form was filled in by a program. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input name={TRAP_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <SubmitButton pending={pending}>{pending ? t('Sending…') : t('Request an invite')}</SubmitButton>
    </form>
  );
}
