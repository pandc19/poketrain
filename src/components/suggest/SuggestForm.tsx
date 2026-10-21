'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { suggestFeature } from '@/app/suggest/actions';
import { SubmitButton } from '@/components/auth/parts';
import { MAX_SUGGESTION, MIN_SUGGESTION } from '@/lib/suggestion';
import { useT } from '@/lib/translate-client';

const input = 'mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-[var(--game-accent)]';

/** `sender` is the name of the logged-in user; a visitor gets the two optional boxes instead. */
export function SuggestForm({ sender }: { sender: string | null }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(suggestFeature, undefined);

  if (state?.done) {
    return (
      <div className="space-y-4">
        <p className="rounded-md border border-done/40 bg-done/10 px-3 py-3 text-sm text-done">{t('Thanks! Your idea was sent and will be read.')}</p>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <Link href="/suggest" className="underline underline-offset-4 hover:text-game">
            {t('Send another idea')}
          </Link>
          <Link href="/" className="underline underline-offset-4 hover:text-game">
            {t('Back to PokéTrain')}
          </Link>
        </p>
      </div>
    );
  }

  const errors = {
    short: t('Say a little more: at least {n} characters.', { n: MIN_SUGGESTION }),
    long: t('That is too long: at most {n} characters.', { n: MAX_SUGGESTION }),
    email: t('Use a valid email address, or leave it empty.'),
    'rate-limit': t('You have sent a few already. Try again in a while.'),
  } as const;

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p role="alert" className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
          {errors[state.error]}
        </p>
      )}
      <label className="block">
        <span className="text-sm font-medium">{t('Your idea')}</span>
        <textarea
          name="message"
          rows={7}
          required
          maxLength={MAX_SUGGESTION}
          defaultValue={state?.values?.message}
          placeholder={t('A game to add, a screen that is missing, something that got in your way…')}
          className={input}
        />
      </label>
      {sender ? (
        <p className="text-sm text-muted">{t('Sent as {name}.', { name: sender })}</p>
      ) : (
        <>
          <label className="block">
            <span className="text-sm font-medium">{t('Name')}</span>
            <input name="name" autoComplete="name" maxLength={100} defaultValue={state?.values?.name} className={input} />
            <span className="mt-1 block text-xs text-muted">{t('Optional.')}</span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t('Email')}</span>
            <input name="email" type="email" autoComplete="email" maxLength={200} defaultValue={state?.values?.email} className={input} />
            <span className="mt-1 block text-xs text-muted">{t('Optional. Only if you would like an answer.')}</span>
          </label>
        </>
      )}
      {/* A field for bots: people never see it, so anything typed in it means the form was filled in by a program. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <SubmitButton pending={pending}>{pending ? t('Sending…') : t('Send the idea')}</SubmitButton>
    </form>
  );
}
