import { headers } from 'next/headers';

/** Where the request comes from, for the limits on the public forms. Traefik puts the real address first in X-Forwarded-For. */
export async function clientAddress(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}
