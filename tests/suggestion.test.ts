import { describe, expect, it } from 'vitest';
import { MAX_SUGGESTION, parseSuggestion } from '@/lib/suggestion';

const ok = (raw: Parameters<typeof parseSuggestion>[0]) => {
  const r = parseSuggestion(raw);
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.value;
};

describe('a suggestion', () => {
  it('needs a message, and not a one-word one', () => {
    expect(parseSuggestion({ message: '', name: '', email: '' })).toEqual({ ok: false, error: 'short' });
    expect(parseSuggestion({ message: '   hi   ', name: '', email: '' })).toEqual({ ok: false, error: 'short' });
    expect(parseSuggestion({ message: undefined, name: null, email: null })).toEqual({ ok: false, error: 'short' });
  });

  it('is cut off at a length, instead of storing a wall of text', () => {
    expect(parseSuggestion({ message: 'x'.repeat(MAX_SUGGESTION + 1), name: '', email: '' })).toEqual({ ok: false, error: 'long' });
    expect(parseSuggestion({ message: 'x'.repeat(MAX_SUGGESTION), name: '', email: '' }).ok).toBe(true);
  });

  it('keeps its line breaks and trims the ends', () => {
    expect(ok({ message: '  Add Sword and Shield.\n\nAlso Z-A.  ', name: '', email: '' }).message).toBe('Add Sword and Shield.\n\nAlso Z-A.');
  });

  it('leaves name and email out when they are empty or missing', () => {
    expect(ok({ message: 'A real idea for the app.', name: '  ', email: '' })).toMatchObject({ name: null, email: null });
    expect(ok({ message: 'A real idea for the app.', name: undefined, email: undefined })).toMatchObject({ name: null, email: null });
  });

  it('stores an email in lower case, and refuses one that is not an email', () => {
    expect(ok({ message: 'A real idea for the app.', name: 'Ash', email: ' Ash@Example.COM ' })).toMatchObject({ name: 'Ash', email: 'ash@example.com' });
    expect(parseSuggestion({ message: 'A real idea for the app.', name: '', email: 'not-an-email' })).toEqual({ ok: false, error: 'email' });
  });

  it('limits the name', () => {
    expect(ok({ message: 'A real idea for the app.', name: 'n'.repeat(500), email: '' }).name).toHaveLength(100);
  });
});
