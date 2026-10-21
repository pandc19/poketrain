import { headers } from 'next/headers';

/** The address the app is reached at, with no trailing slash. `APP_URL` wins when it is set. */
export function originFrom(input: { appUrl?: string | null; host?: string | null; proto?: string | null }): string {
  const configured = input.appUrl?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const host = input.host?.trim();
  if (!host) return 'http://localhost:3000';
  // Behind the proxy the app itself sees plain http; the proxy says what the visitor used.
  const proto = input.proto?.split(',')[0]?.trim() || (/^(localhost|127\.|\[::1\]|192\.168\.|10\.)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** The link to a page on this app, for a link the admin sends to someone. */
export function linkTo(origin: string, path: string, params: Record<string, string>): string {
  return `${origin}${path}?${new URLSearchParams(params).toString()}`;
}

/** The origin of the request being served, for links made while the admin is using the app. */
export async function appOrigin(): Promise<string> {
  const h = await headers();
  return originFrom({
    appUrl: process.env.APP_URL,
    host: h.get('x-forwarded-host') ?? h.get('host'),
    proto: h.get('x-forwarded-proto'),
  });
}
