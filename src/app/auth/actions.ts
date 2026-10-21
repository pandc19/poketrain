'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  authenticate,
  registerWithInvite,
  requestInvite as saveInviteRequest,
  resetPassword as saveNewPassword,
} from '@/lib/auth/accounts';
import { cleanName, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth/rules';
import { clear, isLimited, record, take } from '@/lib/auth/rate-limit';
import { endSession, startSession } from '@/lib/auth/session';
import { clientAddress } from '@/lib/client-address';
import { TRAP_FIELD } from '@/lib/trap';

/**
 * What a form shows after it was sent. Errors are short codes, not text: the form turns them into words in
 * the player's language (see AuthError in components/auth).
 */
export type AuthErrorCode =
  | 'missing'
  | 'credentials'
  | 'rate-limit'
  | 'email'
  | 'name'
  | 'password-short'
  | 'password-mismatch'
  | 'invite'
  | 'email-mismatch'
  | 'email-taken'
  | 'link'
  | 'blocked';

export type AuthState = {
  error?: AuthErrorCode;
  /** What was typed, so the form does not empty itself when it shows an error. */
  values?: { name?: string; email?: string; message?: string };
  /** The request was taken. */
  done?: boolean;
} | undefined;

const MINUTE = 60 * 1000;
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

const Email = z.email().max(200);
const Password = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

// ---- log in and out ---------------------------------------------------------------------------------------

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, 'email').trim().toLowerCase();
  const password = field(formData, 'password');
  if (!email || !password) return { error: 'missing', values: { email } };

  // Failures are counted per address and per email, so one person cannot try many passwords for one account.
  const ip = `login:ip:${await clientAddress()}`;
  const mail = `login:email:${email}`;
  if (isLimited(ip, 20) || isLimited(mail, 8)) return { error: 'rate-limit', values: { email } };

  const user = await authenticate(email, password);
  if (!user) {
    record(ip, 15 * MINUTE);
    record(mail, 15 * MINUTE);
    return { error: 'credentials', values: { email } };
  }
  clear(mail);
  await startSession(user.id);
  redirect('/');
}

export async function logout(): Promise<void> {
  await endSession();
  redirect('/');
}

// ---- asking for an invite ---------------------------------------------------------------------------------

export async function requestInvite(_state: AuthState, formData: FormData): Promise<AuthState> {
  // A field people cannot see: a bot fills it in. The sender is told it did not go through (not that it worked): if
  // a real person's browser ever fills it, they know to try again, and the log says what happened.
  if (field(formData, TRAP_FIELD)) {
    console.warn('Invite request form: the hidden field was filled in, so the request was not stored.');
    return { error: 'blocked' };
  }

  const name = cleanName(field(formData, 'name'));
  const email = field(formData, 'email').trim().toLowerCase();
  const message = field(formData, 'message').trim().slice(0, 1000);
  const values = { name, email, message };
  if (!name) return { error: 'name', values };
  if (!Email.safeParse(email).success) return { error: 'email', values };
  if (!take(`invite-request:${await clientAddress()}`, 3, 60 * MINUTE)) return { error: 'rate-limit', values };

  await saveInviteRequest({ name, email, message: message || null });
  return { done: true };
}

// ---- registering ------------------------------------------------------------------------------------------

export async function register(_state: AuthState, formData: FormData): Promise<AuthState> {
  const code = field(formData, 'invite');
  const name = cleanName(field(formData, 'name'));
  const email = field(formData, 'email').trim().toLowerCase();
  const password = field(formData, 'password');
  const values = { name, email };

  if (!name) return { error: 'name', values };
  if (!Email.safeParse(email).success) return { error: 'email', values };
  if (!Password.safeParse(password).success) return { error: 'password-short', values };
  if (password !== field(formData, 'confirm')) return { error: 'password-mismatch', values };
  // Guessing invite codes is hopeless (256 bits), but it costs nothing to limit it.
  if (!take(`register:${await clientAddress()}`, 10, 15 * MINUTE)) return { error: 'rate-limit', values };

  const result = await registerWithInvite({ code, name, email, password });
  if (!result.ok) return { error: result.error, values };
  await startSession(result.user.id);
  redirect('/');
}

// ---- choosing a new password ------------------------------------------------------------------------------

export async function resetPassword(_state: AuthState, formData: FormData): Promise<AuthState> {
  const token = field(formData, 'token');
  const password = field(formData, 'password');
  if (!Password.safeParse(password).success) return { error: 'password-short' };
  if (password !== field(formData, 'confirm')) return { error: 'password-mismatch' };
  if (!take(`reset:${await clientAddress()}`, 10, 15 * MINUTE)) return { error: 'rate-limit' };

  if (!(await saveNewPassword(token, password))) return { error: 'link' };
  redirect('/login?reset=1');
}
