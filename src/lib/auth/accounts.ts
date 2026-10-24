import { prisma } from '../db';
import { hashPassword, verifyAgainstNothing, verifyPassword } from './password';
import { hashToken, newToken } from './tokens';

/**
 * Accounts, in the database. Nothing here knows about cookies or pages (those are in session.ts and the auth
 * actions), so the admin script can use it too.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a password reset link works. */
export const RESET_VALID_MS = DAY_MS;

export type SessionUser = {
  id: string;
  name: string;
  lastName: string;
  email: string | null;
  role: 'ADMIN' | 'USER';
  /** "es" or "es-419" (see name-variants.ts). */
  gameLanguage: string;
};

const userSelect = { id: true, name: true, lastName: true, email: true, role: true, gameLanguage: true } as const;

/** Emails are compared in lower case. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// ---- sessions ---------------------------------------------------------------------------------------------

/** Starts a login and returns its token, which goes in the player's cookie. Only a hash of it is kept. */
export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token) } });
  return token;
}

/** The user a cookie token belongs to, or null if the login was ended. */
export async function userForToken(token: string): Promise<SessionUser | null> {
  const row = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, lastSeenAt: true, user: { select: userSelect } },
  });
  if (!row) return null;
  // Noted at most once a day, so a visit is not a write.
  if (Date.now() - row.lastSeenAt.getTime() > DAY_MS) {
    await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return row.user;
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

// ---- logging in -------------------------------------------------------------------------------------------

/** The user for this email and password, or null. Takes the same time whether or not the email has an account. */
export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { ...userSelect, passwordHash: true },
  });
  if (!user?.passwordHash) {
    await verifyAgainstNothing(password);
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  const { passwordHash: _hash, ...safe } = user;
  void _hash;
  return safe;
}

/**
 * Changes a password after checking the current one, and ends every other login of that user (the one in
 * `keepToken` stays). False if the current password is not right.
 */
export async function changePassword(userId: string, current: string, password: string, keepToken: string | undefined): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash))) return false;
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId, ...(keepToken ? { tokenHash: { not: hashToken(keepToken) } } : {}) } }),
  ]);
  return true;
}

/** Sets who can log in as this user. Used for the owner, whose account existed before there were logins. */
export async function setCredentials(userId: string, email: string, password: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { email: normalizeEmail(email), passwordHash: await hashPassword(password) },
  });
}

// ---- requests and invites ---------------------------------------------------------------------------------

/** Saves a request for an invite. A second request from an email that still has one waiting is ignored. */
export async function requestInvite(input: { name: string; email: string; message: string | null }): Promise<void> {
  const email = normalizeEmail(input.email);
  const waiting = await prisma.inviteRequest.findFirst({ where: { email, status: 'PENDING' }, select: { id: true } });
  if (waiting) return;
  await prisma.inviteRequest.create({ data: { name: input.name, email, message: input.message } });
}

/** Makes a single-use invite and returns its code, which is shown once: only a hash is kept. */
export async function createInvite(opts: { email?: string | null; requestId?: string | null; createdById?: string | null } = {}): Promise<string> {
  const code = newToken();
  await prisma.$transaction(async (tx) => {
    await tx.invite.create({
      data: {
        codeHash: hashToken(code),
        email: opts.email ? normalizeEmail(opts.email) : null,
        requestId: opts.requestId ?? null,
        createdById: opts.createdById ?? null,
      },
    });
    if (opts.requestId) await tx.inviteRequest.update({ where: { id: opts.requestId }, data: { status: 'INVITED' } });
  });
  return code;
}

export type InviteCheck = { ok: true; email: string | null } | { ok: false };

/** Whether this code is an invite that has not been used. */
export async function checkInvite(code: string): Promise<InviteCheck> {
  const invite = await prisma.invite.findUnique({ where: { codeHash: hashToken(code) }, select: { email: true, usedAt: true } });
  return invite && !invite.usedAt ? { ok: true, email: invite.email } : { ok: false };
}

export type RegisterResult = { ok: true; user: SessionUser } | { ok: false; error: 'invite' | 'email-mismatch' | 'email-taken' };

class InviteTaken extends Error {}

/**
 * Creates the account an invite is for, and uses the invite up, in one step. A new account starts with no games
 * and no data; it is a normal user, without AI.
 */
export async function registerWithInvite(input: { code: string; name: string; email: string; password: string }): Promise<RegisterResult> {
  const email = normalizeEmail(input.email);
  // Hashing takes a moment: done before the transaction, which should stay short.
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx): Promise<RegisterResult> => {
      const invite = await tx.invite.findUnique({ where: { codeHash: hashToken(input.code) } });
      if (!invite || invite.usedAt) return { ok: false, error: 'invite' };
      if (invite.email && invite.email !== email) return { ok: false, error: 'email-mismatch' };
      const user = await tx.user.create({
        data: {
          name: input.name,
          email,
          passwordHash,
          // No games yet: a new account chooses the ones it plays on its first visit (see my-games.ts).
        },
        select: userSelect,
      });
      // Two people using one invite at once: only one of them gets to claim it.
      const claimed = await tx.invite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date(), usedById: user.id } });
      if (claimed.count !== 1) throw new InviteTaken();
      return { ok: true, user };
    });
  } catch (error) {
    if (error instanceof InviteTaken) return { ok: false, error: 'invite' };
    if ((error as { code?: string })?.code === 'P2002') return { ok: false, error: 'email-taken' };
    throw error;
  }
}

// ---- password resets --------------------------------------------------------------------------------------

/** Makes a link to choose a new password and returns its token, shown once. */
export async function createPasswordReset(userId: string): Promise<string> {
  const token = newToken();
  await prisma.passwordReset.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_VALID_MS) },
  });
  return token;
}

export async function checkPasswordReset(token: string): Promise<boolean> {
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, select: { expiresAt: true, usedAt: true } });
  return Boolean(reset && !reset.usedAt && reset.expiresAt > new Date());
}

/** Sets the new password, uses the link up and ends every login of that user. False if the link is not good. */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const reset = await tx.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) return false;
    const claimed = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    return true;
  });
}
