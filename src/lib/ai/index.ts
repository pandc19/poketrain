import { ClaudeProvider } from './providers/claude';
import { OpenAiProvider } from './providers/openai';
import type { AiProvider } from './types';

export { AiError } from './types';
export type { AiProvider } from './types';

export { NO_AI_MESSAGE } from './messages';

export function configuredProviderName(): 'openai' | 'claude' {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  if (provider !== 'openai' && provider !== 'claude') {
    throw new Error(`Unknown AI_PROVIDER "${provider}" -- expected "openai" or "claude"`);
  }
  return provider;
}

/** Whether the server has a key of its own, for the provider picked by `AI_PROVIDER`. */
export function serverAiKeyConfigured(): boolean {
  return Boolean(configuredProviderName() === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY);
}

/**
 * The server's own provider (the one picked by `AI_PROVIDER`), or `null` when it has no API key. Only for
 * accounts the admin gave AI to: who may use it, and which key, is decided in user-provider.ts.
 */
export function getServerAiProvider(): AiProvider | null {
  if (!serverAiKeyConfigured()) return null;
  return configuredProviderName() === 'openai' ? new OpenAiProvider() : new ClaudeProvider();
}
