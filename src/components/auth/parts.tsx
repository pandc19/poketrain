'use client';

import Link from 'next/link';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/rules';
import { useT } from '@/lib/translate-client';
import type { AuthErrorCode } from '@/app/auth/actions';

/** The card every account page sits in, centred, with a way back to the app. */
export function AuthCard({ title, intro, children, footer }: { title: string; intro?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md py-6">
      <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {intro && <p className="mt-1.5 text-sm text-muted">{intro}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted">{footer}</div>}
    </div>
  );
}

/** A quiet link under the card. */
export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="underline-offset-4 hover:text-ink hover:underline">
      {children}
    </Link>
  );
}

export function Field({
  label,
  name,
  type = 'text',
  autoComplete,
  defaultValue,
  required = true,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-[var(--game-accent)]"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-done px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** What a form says when something went wrong, in the player's language. */
export function AuthError({ code }: { code?: AuthErrorCode }) {
  const { t } = useT();
  if (!code) return null;
  const text: Record<AuthErrorCode, string> = {
    missing: t('Enter your email and password.'),
    credentials: t('That email and password do not match.'),
    'rate-limit': t('Too many attempts. Try again in a few minutes.'),
    email: t('Use a valid email address.'),
    name: t('Enter your name.'),
    'password-short': t('The password needs at least {n} characters.', { n: MIN_PASSWORD_LENGTH }),
    'password-mismatch': t('The two passwords are not the same.'),
    invite: t('This invite link is not valid, or it has already been used.'),
    'email-mismatch': t('This invite is for a different email address.'),
    'email-taken': t('That email already has an account. Try logging in.'),
    link: t('This link is not valid, or it has expired.'),
    blocked: t('That did not go through. Reload the page and try again.'),
  };
  return (
    <p role="alert" className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
      {text[code]}
    </p>
  );
}
