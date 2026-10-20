import { afterEach, describe, expect, it, vi } from 'vitest';
import { COOKIE_MAX_AGE, RENEW_AFTER_MS, shouldRenew } from '@/lib/auth/cookie';
import { hashPassword, verifyAgainstNothing, verifyPassword } from '@/lib/auth/password';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth/rules';
import { clear, isLimited, record, take } from '@/lib/auth/rate-limit';
import { hashToken, newToken } from '@/lib/auth/tokens';

describe('passwords', () => {
  it('checks the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterz', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('never stores the password and salts every hash', async () => {
    const a = await hashPassword('the same password');
    const b = await hashPassword('the same password');
    expect(a).not.toContain('the same password');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
  });

  it('keeps its cost in the hash, so old hashes still check after it is raised', async () => {
    const stored = await hashPassword('keep the cost');
    expect(stored.split('$').slice(0, 4)).toEqual(['scrypt', String(2 ** 15), '8', '1']);
  });

  it('refuses a hash it cannot read instead of failing', async () => {
    expect(await verifyPassword('x', 'not a hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$abc$8$1$c2FsdA==$aGFzaA==')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$10$8$1$c2FsdA==$aGFzaA==')).toBe(false);
  });

  it('asks for 8 characters at least, and caps the length', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(MAX_PASSWORD_LENGTH).toBeGreaterThan(MIN_PASSWORD_LENGTH);
  });

  it('takes time to refuse an unknown email as well, and always refuses', async () => {
    expect(await verifyAgainstNothing('anything')).toBe(false);
  });
});

describe('tokens', () => {
  it('makes long, different, URL-safe secrets', () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
  });

  it('stores a hash that is not the secret and always the same for it', () => {
    const token = newToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toBe(hashToken(newToken()));
  });
});

describe('the login cookie', () => {
  const now = Date.UTC(2026, 9, 20);

  it('is kept for as long as a browser allows', () => {
    expect(COOKIE_MAX_AGE).toBe(400 * 24 * 60 * 60);
  });

  it('is issued again once a month has passed, and not before', () => {
    expect(shouldRenew(String(now - RENEW_AFTER_MS + 1000), now)).toBe(false);
    expect(shouldRenew(String(now - RENEW_AFTER_MS - 1000), now)).toBe(true);
    expect(shouldRenew(String(now - 1000), now)).toBe(false);
  });

  it('is issued again when it was never stamped, or the stamp is rubbish', () => {
    expect(shouldRenew(undefined, now)).toBe(true);
    expect(shouldRenew('', now)).toBe(true);
    expect(shouldRenew('yesterday', now)).toBe(true);
    expect(shouldRenew('0', now)).toBe(true);
  });
});

describe('rate limit', () => {
  afterEach(() => vi.useRealTimers());
  const WINDOW = 15 * 60 * 1000;

  it('blocks a key once it has used its attempts, and not before', () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) record('login:a', WINDOW, t);
    expect(isLimited('login:a', 5, t)).toBe(false);
    record('login:a', WINDOW, t);
    expect(isLimited('login:a', 5, t)).toBe(true);
    clear('login:a');
  });

  it('lets a key try again when the window is over', () => {
    const t = 2_000_000;
    for (let i = 0; i < 5; i++) record('login:b', WINDOW, t);
    expect(isLimited('login:b', 5, t + WINDOW - 1)).toBe(true);
    expect(isLimited('login:b', 5, t + WINDOW + 1)).toBe(false);
  });

  it('counts keys apart, and forgets one that is cleared (a good login)', () => {
    const t = 3_000_000;
    for (let i = 0; i < 5; i++) record('login:c', WINDOW, t);
    expect(isLimited('login:d', 5, t)).toBe(false);
    clear('login:c');
    expect(isLimited('login:c', 5, t)).toBe(false);
  });

  it('take() counts each use and refuses after the limit', () => {
    const t = 4_000_000;
    expect([1, 2, 3, 4].map(() => take('invite:ip', 3, WINDOW, t))).toEqual([true, true, true, false]);
    clear('invite:ip');
  });
});
