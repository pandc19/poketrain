'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { verifyAiSettings, keyHint } from '@/lib/ai/verify-key';
import { take } from '@/lib/auth/rate-limit';
import { cleanName } from '@/lib/auth/rules';
import { getUser } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { canStoreSecrets, decryptSecret, encryptSecret } from '@/lib/secret-box';

/** Short codes, not text: the form turns them into words in the player's language. */
export type KeyFormError =
  | 'unavailable'
  | 'provider'
  | 'key'
  | 'workspace-format'
  | 'model-format'
  | 'rejected'
  | 'workspace'
  | 'workspace-invalid'
  | 'model'
  | 'unreachable'
  | 'rate-limit';
export type KeyFormState = { error?: KeyFormError; saved?: boolean } | undefined;

const HOUR = 60 * 60 * 1000;
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

/**
 * Saves the player's AI settings: provider, key, an Anthropic workspace id and a model. They are checked with the
 * provider first (requests that cost nothing), then stored; the key encrypted. The key is never returned and
 * never logged. With the key left empty the saved one is kept and only the other settings change.
 */
export async function saveAiSettings(_state: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const user = await getUser();
  if (user.isDemo) redirect('/login');
  if (!canStoreSecrets()) return { error: 'unavailable' };

  const provider = field(formData, 'provider');
  if (provider !== 'claude' && provider !== 'openai') return { error: 'provider' };
  // A workspace only exists at Anthropic.
  const workspaceId = provider === 'claude' ? field(formData, 'workspace') : '';
  const model = field(formData, 'model');
  if (workspaceId && !/^[\w-]{3,100}$/.test(workspaceId)) return { error: 'workspace-format' };
  if (model && !/^[\w.:/-]{2,100}$/.test(model)) return { error: 'model-format' };

  let key = field(formData, 'key');
  const typedKey = key !== '';
  if (typedKey) {
    if (key.length < 20 || key.length > 300 || /\s/.test(key)) return { error: 'key' };
  } else {
    // No new key: keep the saved one, which belongs to one provider and cannot move to another.
    const saved = await prisma.user.findUnique({ where: { id: user.id }, select: { aiProvider: true, aiKeyEncrypted: true } });
    const current = saved?.aiKeyEncrypted && saved.aiProvider === provider ? decryptSecret(saved.aiKeyEncrypted, user.id) : null;
    if (!current) return { error: 'key' };
    key = current;
  }
  if (!take(`ai-settings:${user.id}`, 10, HOUR)) return { error: 'rate-limit' };

  const check = await verifyAiSettings({ provider, key, workspaceId: workspaceId || null, model: model || null });
  if (check !== 'ok') return { error: check };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      aiProvider: provider,
      ...(typedKey ? { aiKeyEncrypted: encryptSecret(key, user.id), aiKeyHint: keyHint(key) } : {}),
      aiWorkspaceId: workspaceId || null,
      aiModel: model || null,
    },
  });
  revalidatePath('/', 'layout');
  return { saved: true };
}

export async function removeAiSettings(): Promise<void> {
  const user = await getUser();
  if (user.isDemo) redirect('/login');
  await prisma.user.update({
    where: { id: user.id },
    data: { aiProvider: null, aiKeyEncrypted: null, aiKeyHint: null, aiWorkspaceId: null, aiModel: null },
  });
  revalidatePath('/', 'layout');
}

export type NameFormState = { error?: 'name' | 'rate-limit'; saved?: boolean; value?: string } | undefined;

/** Changes the name on the account. It is only a label (people log in with their email), so nothing else depends on it. */
export async function renameAccount(_state: NameFormState, formData: FormData): Promise<NameFormState> {
  const user = await getUser();
  if (user.isDemo) redirect('/login');

  const name = cleanName(String(formData.get('name') ?? ''));
  if (!name) return { error: 'name', value: name };
  if (!take(`rename:${user.id}`, 10, HOUR)) return { error: 'rate-limit', value: name };

  await prisma.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath('/', 'layout');
  return { saved: true, value: name };
}
