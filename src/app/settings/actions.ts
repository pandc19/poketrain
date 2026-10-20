'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { verifyKey, keyHint } from '@/lib/ai/verify-key';
import { take } from '@/lib/auth/rate-limit';
import { getUser } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { canStoreSecrets, encryptSecret } from '@/lib/secret-box';

/** Short codes, not text: the form turns them into words in the player's language. */
export type KeyFormError = 'unavailable' | 'provider' | 'key' | 'rejected' | 'unreachable' | 'rate-limit';
export type KeyFormState = { error?: KeyFormError; saved?: boolean } | undefined;

const HOUR = 60 * 60 * 1000;

/**
 * Saves the player's own AI key, so the AI is paid by them. The key is checked with the provider first (a
 * request that costs nothing), then stored encrypted. It is never returned and never logged.
 */
export async function saveAiKey(_state: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const user = await getUser();
  if (user.isDemo) redirect('/login');
  if (!canStoreSecrets()) return { error: 'unavailable' };

  const provider = String(formData.get('provider') ?? '');
  const key = String(formData.get('key') ?? '').trim();
  if (provider !== 'claude' && provider !== 'openai') return { error: 'provider' };
  if (key.length < 20 || key.length > 300 || /\s/.test(key)) return { error: 'key' };
  if (!take(`ai-key:${user.id}`, 10, HOUR)) return { error: 'rate-limit' };

  const check = await verifyKey(provider, key);
  if (check === 'rejected') return { error: 'rejected' };
  if (check === 'unreachable') return { error: 'unreachable' };

  await prisma.user.update({
    where: { id: user.id },
    data: { aiProvider: provider, aiKeyEncrypted: encryptSecret(key, user.id), aiKeyHint: keyHint(key) },
  });
  revalidatePath('/', 'layout');
  return { saved: true };
}

export async function removeAiKey(): Promise<void> {
  const user = await getUser();
  if (user.isDemo) redirect('/login');
  await prisma.user.update({ where: { id: user.id }, data: { aiProvider: null, aiKeyEncrypted: null, aiKeyHint: null } });
  revalidatePath('/', 'layout');
}
