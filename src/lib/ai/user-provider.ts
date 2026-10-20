import { prisma } from '../db';
import type { CurrentUser } from '../current-user';
import { decryptSecret } from '../secret-box';
import { getServerAiProvider, serverAiKeyConfigured } from '.';
import { ClaudeProvider } from './providers/claude';
import { OpenAiProvider } from './providers/openai';
import type { AiProvider } from './types';

/**
 * Who pays for an AI request: the player's own key, or the server's (only for accounts the admin gave AI to).
 * Nobody else gets AI, so the app works in full without it and nothing is ever charged to the server by chance.
 */
export type AiSource = 'own' | 'server';

/** Own key first, then the server's for an account with AI on, otherwise none. */
export function chooseAiSource(input: { hasOwnKey: boolean; aiEnabled: boolean; serverKey: boolean }): AiSource | null {
  if (input.hasOwnKey) return 'own';
  return input.aiEnabled && input.serverKey ? 'server' : null;
}

type Subject = Pick<CurrentUser, 'id' | 'aiEnabled' | 'isDemo'>;

async function resolve(user: Subject): Promise<{ source: AiSource; provider: AiProvider } | null> {
  // The demo is nobody's account: it never has AI, so visitors cannot spend anything.
  if (user.isDemo) return null;
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { aiProvider: true, aiKeyEncrypted: true } });
  // A key that cannot be read (the server's secret changed) counts as no key.
  const key = row?.aiKeyEncrypted ? decryptSecret(row.aiKeyEncrypted, user.id) : null;
  const source = chooseAiSource({ hasOwnKey: key !== null, aiEnabled: user.aiEnabled, serverKey: serverAiKeyConfigured() });
  if (source === 'own' && key) {
    return { source, provider: row?.aiProvider === 'openai' ? new OpenAiProvider(key) : new ClaudeProvider(key) };
  }
  const server = source === 'server' ? getServerAiProvider() : null;
  return server ? { source: 'server', provider: server } : null;
}

/** The provider to use for this user's AI requests, or null: they have no AI. */
export async function getAiProviderFor(user: Subject): Promise<AiProvider | null> {
  return (await resolve(user))?.provider ?? null;
}

/** Whether the AI buttons should be there at all for this user. */
export async function canUseAi(user: Subject): Promise<boolean> {
  return (await resolve(user)) !== null;
}
