import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type AiProviderName = 'claude' | 'openai';
export type KeyCheck = 'ok' | 'rejected' | 'unreachable';

/**
 * Asks the provider something it answers for free (the list of models) to see whether a key is accepted, so a
 * typo is caught when it is saved and not at the first audit. Nothing is generated and nothing is charged.
 */
export async function verifyKey(provider: AiProviderName, key: string): Promise<KeyCheck> {
  try {
    if (provider === 'claude') await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 10_000 }).models.list({ limit: 1 });
    else await new OpenAI({ apiKey: key, maxRetries: 0, timeout: 10_000 }).models.list();
    return 'ok';
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return 'rejected';
    if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) return 'rejected';
    return 'unreachable';
  }
}

/** The last four characters, to show which key is saved without showing the key. */
export const keyHint = (key: string) => key.slice(-4);
