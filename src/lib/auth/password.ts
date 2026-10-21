import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Passwords are hashed with scrypt (built into Node, so no dependency). The cost is kept in the hash
 * itself, so it can be raised later and old hashes still check. 32 MB of memory per hash, about 80 ms.
 */
const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost: typeof COST): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { ...cost, maxmem: MAX_MEMORY }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** `scrypt$N$r$p$salt$hash`, with the salt and hash in base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (![cost.N, cost.r, cost.p].every((v) => Number.isInteger(v) && v > 0)) return false;
  try {
    const expected = Buffer.from(hash, 'base64');
    const actual = await derive(password, Buffer.from(salt, 'base64'), cost);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;
/**
 * Checks a password against nothing, taking as long as a real check. Used when the email is unknown, so
 * the time a login takes does not tell whether the account exists.
 */
export async function verifyAgainstNothing(password: string): Promise<false> {
  dummy ??= hashPassword('no-account-has-this-password');
  await verifyPassword(password, await dummy);
  return false;
}
