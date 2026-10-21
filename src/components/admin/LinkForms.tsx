'use client';

import { useActionState } from 'react';
import { createInviteLink, createResetLink, inviteFromRequest, type LinkState } from '@/app/admin/actions';
import { useT } from '@/lib/translate-client';
import { LinkBox } from './LinkBox';

const small = 'rounded-md border border-line px-3 py-1 text-xs font-semibold hover:text-ink disabled:opacity-40';

function Problem({ state }: { state: LinkState }) {
  const { t } = useT();
  if (!state?.error) return null;
  return <p role="alert" className="mt-2 text-xs text-pending">{state.error === 'email' ? t('Use a valid email address.') : t('That is not possible any more. Reload the page.')}</p>;
}

/** The button that invites the person who asked. */
export function InviteFromRequest({ requestId }: { requestId: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(inviteFromRequest, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" disabled={pending} className={small}>
        {pending ? t('Making the link…') : t('Invite')}
      </button>
      <Problem state={state} />
      {state?.link && <LinkBox link={state.link} note={t('Send it to them. It works once, for their email only, and is not shown again.')} />}
    </form>
  );
}

/** Makes an invite without a request, for one email or for anyone. */
export function NewInviteForm() {
  const { t } = useT();
  const [state, action, pending] = useActionState(createInviteLink, undefined);
  return (
    <form action={action}>
      <div className="flex flex-wrap gap-2">
        <input
          name="email"
          type="email"
          placeholder={t('Email (optional)')}
          aria-label={t('Email (optional)')}
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-1.5 text-sm"
        />
        <button type="submit" disabled={pending} className={small}>
          {pending ? t('Making the link…') : t('Make an invite link')}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">{t('With an email, only that address can use it. Without one, anyone who has the link can.')}</p>
      <Problem state={state} />
      {state?.link && <LinkBox link={state.link} note={t('It works once and is not shown again.')} />}
    </form>
  );
}

/** A link for someone to choose a new password. */
export function ResetLinkButton({ userId }: { userId: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(createResetLink, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className={small}>
        {pending ? t('Making the link…') : t('Password link')}
      </button>
      <Problem state={state} />
      {state?.link && <LinkBox link={state.link} note={t('It works once, for a day, and logs them out everywhere. It is not shown again.')} />}
    </form>
  );
}
