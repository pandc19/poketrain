import { NextResponse, type NextRequest } from 'next/server';
import { SEEN_COOKIE, SESSION_COOKIE, sessionCookieOptions, shouldRenew } from '@/lib/auth/cookie';

/**
 * Keeps a login alive: a browser drops a cookie after 400 days at most, so one that has not been issued for
 * a month is issued again with the same value. It only handles cookies and never touches the database.
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !shouldRenew(request.cookies.get(SEEN_COOKIE)?.value, Date.now())) return NextResponse.next();
  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  response.cookies.set(SEEN_COOKIE, String(Date.now()), sessionCookieOptions());
  return response;
}

export const config = {
  // Pages only: not the API, the build's files or anything with a file extension.
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
};
