/**
 * The login cookie. A login never expires, but a browser keeps a cookie for 400 days at most, so the cookie is
 * issued again (same value, a fresh 400 days) whenever it has not been renewed for a month: anyone who opens
 * the app at least once a year stays logged in. `proxy.ts` does the renewing, with no database.
 */
export const SESSION_COOKIE = 'poketrain_session';
/** When the cookie was last issued, in milliseconds, so the proxy knows when to renew it. */
export const SEEN_COOKIE = 'poketrain_seen';

const DAY = 24 * 60 * 60;
/** The longest a browser keeps a cookie. */
export const COOKIE_MAX_AGE = 400 * DAY;
export const RENEW_AFTER_MS = 30 * DAY * 1000;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}

/** True when the cookie was never stamped or was last issued more than a month ago. */
export function shouldRenew(seen: string | undefined, now: number): boolean {
  const at = Number(seen);
  return !Number.isFinite(at) || at <= 0 || now - at > RENEW_AFTER_MS;
}
