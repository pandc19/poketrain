import { createHash, randomBytes } from 'node:crypto';

/** A random secret for a cookie or a link: 32 bytes, URL-safe. */
export const newToken = () => randomBytes(32).toString('base64url');

/** What is stored in the database instead of the secret: the secret cannot be read back from it. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
