import { z } from 'zod';

export const MIN_SUGGESTION = 10;
export const MAX_SUGGESTION = 2000;

export type SuggestionError = 'short' | 'long' | 'email';
export type SuggestionInput = { message: string; name: string | null; email: string | null };

const Email = z.email().max(200);

/** What a visitor typed into the suggestion form, checked and tidied. Name and email are optional. */
export function parseSuggestion(raw: { message: unknown; name: unknown; email: unknown }): { ok: true; value: SuggestionInput } | { ok: false; error: SuggestionError } {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const message = text(raw.message);
  if (message.length < MIN_SUGGESTION) return { ok: false, error: 'short' };
  if (message.length > MAX_SUGGESTION) return { ok: false, error: 'long' };
  const email = text(raw.email).toLowerCase();
  if (email && !Email.safeParse(email).success) return { ok: false, error: 'email' };
  return { ok: true, value: { message, name: text(raw.name).slice(0, 100) || null, email: email || null } };
}
