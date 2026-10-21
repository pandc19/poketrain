'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { appOrigin, linkTo } from '@/lib/app-url';
import { createInvite, createPasswordReset } from '@/lib/auth/accounts';
import { DEMO_USER_ID } from '@/lib/constants';
import { copyUserData, type CopyCounts } from '@/lib/demo-copy';
import { requireAdmin } from '@/lib/current-user';
import { prisma } from '@/lib/db';

/**
 * Everything the admin page does. Server actions are endpoints anyone can call, so each one starts by checking
 * that the caller is the admin (anyone else gets a 404, as if there were nothing here), and checks its own input.
 * A link is shown once, when it is made: only a hash of it is kept, so it cannot be shown again.
 */
export type LinkState = { link?: string; error?: 'invalid' | 'email' } | undefined;

const Id = z.uuid();

/** Invites the person who asked: a one-time link tied to their email. Marks the request as invited. */
export async function inviteFromRequest(_state: LinkState, formData: FormData): Promise<LinkState> {
  const admin = await requireAdmin();
  // The id travels in the form, not bound to the action: a bound action made the no-JavaScript submit hang.
  const requestId = String(formData.get('requestId') ?? '');
  if (!Id.safeParse(requestId).success) return { error: 'invalid' };
  const request = await prisma.inviteRequest.findUnique({ where: { id: requestId }, select: { id: true, email: true, status: true } });
  if (!request || request.status === 'DECLINED') return { error: 'invalid' };
  // A request is linked to one invite; asking again for someone already invited makes a plain one for their email.
  const code = await createInvite({
    email: request.email,
    requestId: request.status === 'PENDING' ? request.id : null,
    createdById: admin.id,
  });
  // No revalidatePath here, on purpose: refreshing the page would move this request from "waiting" to "answered",
  // which removes the form that is showing the link, and the link is shown only once. The lists catch up on the
  // next visit.
  return { link: linkTo(await appOrigin(), '/register', { invite: code }) };
}

export async function declineRequest(requestId: string): Promise<void> {
  await requireAdmin();
  if (!Id.safeParse(requestId).success) return;
  await prisma.inviteRequest.updateMany({ where: { id: requestId, status: 'PENDING' }, data: { status: 'DECLINED' } });
  revalidatePath('/admin');
}

/** A one-time invite without a request, for one email or for anyone. */
export async function createInviteLink(_state: LinkState, formData: FormData): Promise<LinkState> {
  const admin = await requireAdmin();
  const raw = String(formData.get('email') ?? '').trim();
  const email = raw ? z.email().max(200).safeParse(raw) : null;
  if (email && !email.success) return { error: 'email' };
  const code = await createInvite({ email: email?.data ?? null, createdById: admin.id });
  revalidatePath('/admin');
  return { link: linkTo(await appOrigin(), '/register', { invite: code }) };
}

/** Takes back an invite nobody has used yet. */
export async function revokeInvite(inviteId: string): Promise<void> {
  await requireAdmin();
  if (!Id.safeParse(inviteId).success) return;
  await prisma.invite.deleteMany({ where: { id: inviteId, usedAt: null } });
  revalidatePath('/admin');
}

/** A one-time link, good for a day, to choose a new password. Logs that person out everywhere once it is used. */
export async function createResetLink(_state: LinkState, formData: FormData): Promise<LinkState> {
  await requireAdmin();
  const userId = String(formData.get('userId') ?? '');
  if (!Id.safeParse(userId).success) return { error: 'invalid' };
  // The demo has no login to reset.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user?.email) return { error: 'invalid' };
  const token = await createPasswordReset(user.id);
  return { link: linkTo(await appOrigin(), '/reset-password', { token }) };
}

/** Removes an entry of the shared dictionary of where to catch Pokémon, e.g. a wrong answer. The next lookup makes a new one. */
export async function deleteLocation(locationId: string): Promise<void> {
  await requireAdmin();
  if (!Id.safeParse(locationId).success) return;
  await prisma.pokemonLocation.deleteMany({ where: { id: locationId } });
  revalidatePath('/admin');
}

export type CopyResult = { counts?: CopyCounts; error?: 'failed' };

/**
 * Replaces everything in the demo with a copy of the admin's data (see copyUserData). Visitors' edits to the demo
 * are lost, which is why the page asks first. All or nothing: if it fails, the demo stays as it was.
 */
export async function copyToDemo(): Promise<CopyResult> {
  const admin = await requireAdmin();
  if (admin.id === DEMO_USER_ID) return { error: 'failed' };
  try {
    const counts = await copyUserData(admin.id, DEMO_USER_ID);
    revalidatePath('/admin');
    return { counts };
  } catch (error) {
    console.error('Copying to the demo failed:', error);
    return { error: 'failed' };
  }
}
