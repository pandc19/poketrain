import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encrypts a secret that has to be read back later (a user's AI key, which the server needs to use it), unlike a
 * password, which is only ever checked. AES-256-GCM with a key from `AI_KEY_SECRET`: 32 random bytes in base64,
 * made with `openssl rand -base64 32`. Losing or changing the secret makes saved keys unreadable, so users add
 * theirs again; nothing else is affected.
 *
 * The user's id goes in as additional authenticated data, so a blob copied from one row to another (or to
 * another user) does not decrypt.
 */
const VERSION = 'v1';

function secretKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env.AI_KEY_SECRET?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

/** Whether this server can store keys: the secret is set and is a good one. */
export const canStoreSecrets = (env: Record<string, string | undefined> = process.env) => secretKey(env) !== null;

/** `v1.iv.tag.ciphertext`, each part in base64url. */
export function encryptSecret(plain: string, context: string, env: Record<string, string | undefined> = process.env): string {
  const key = secretKey(env);
  if (!key) throw new Error('AI_KEY_SECRET is not set (or is not 32 bytes in base64): keys cannot be stored.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), body].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
}

/** The secret, or null if it cannot be read: the wrong context, a changed secret, or damage. */
export function decryptSecret(blob: string, context: string, env: Record<string, string | undefined> = process.env): string | null {
  const key = secretKey(env);
  const [version, iv, tag, body] = blob.split('.');
  if (!key || version !== VERSION || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
