'use server';

import { take } from '@/lib/auth/rate-limit';
import { clientAddress } from '@/lib/client-address';
import { getUser } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { parseSuggestion, type SuggestionError } from '@/lib/suggestion';

/** Short codes, not text: the form turns them into words in the visitor's language. */
export type SuggestState = { error?: SuggestionError | 'rate-limit'; done?: boolean; values?: { message: string; name: string; email: string } } | undefined;

const HOUR = 60 * 60 * 1000;
const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

/**
 * Saves an idea for the app. Open to everyone: a visitor may leave a name and an email to be answered at, and
 * someone logged in is known by their account. A hidden field catches bots, and each person (or address) can
 * send a few an hour.
 */
export async function suggestFeature(_state: SuggestState, formData: FormData): Promise<SuggestState> {
  // A field people cannot see: a bot fills it in. It is told the idea was taken, so it does not try again.
  if (field(formData, 'website')) return { done: true };

  const values = { message: field(formData, 'message'), name: field(formData, 'name'), email: field(formData, 'email') };
  const user = await getUser();
  // Someone logged in is known already; what they might have typed in the optional boxes is not used.
  const parsed = parseSuggestion(user.isDemo ? values : { ...values, name: '', email: '' });
  if (!parsed.ok) return { error: parsed.error, values };

  const who = user.isDemo ? await clientAddress() : user.id;
  if (!take(`suggest:${who}`, 5, HOUR)) return { error: 'rate-limit', values };

  await prisma.featureSuggestion.create({ data: { ...parsed.value, userId: user.isDemo ? null : user.id } });
  return { done: true };
}
