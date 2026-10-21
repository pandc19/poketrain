import { prisma } from '../db';
import type { CurrentUser } from '../current-user';
import { decryptSecret } from '../secret-box';
import { ClaudeProvider } from './providers/claude';
import { OpenAiProvider } from './providers/openai';
import type { AiProvider } from './types';

/**
 * The AI a user has: the provider, key, workspace and model they set up in Settings, and nothing else. The
 * server holds no AI key and reads no AI setting from the environment, so there is no AI for anyone who has
 * not set it up (the demo included), and what is asked is always paid by whoever asked.
 */
type Subject = Pick<CurrentUser, 'id' | 'isDemo'>;

export async function getAiProviderFor(user: Subject): Promise<AiProvider | null> {
  // The demo is nobody's account: it never has AI, so visitors cannot spend anything.
  if (user.isDemo) return null;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { aiProvider: true, aiKeyEncrypted: true, aiWorkspaceId: true, aiModel: true },
  });
  // A key that cannot be read (the server's secret changed) counts as no key.
  const apiKey = row?.aiKeyEncrypted ? decryptSecret(row.aiKeyEncrypted, user.id) : null;
  if (!row || !apiKey) return null;
  return row.aiProvider === 'openai'
    ? new OpenAiProvider({ apiKey, model: row.aiModel })
    : new ClaudeProvider({ apiKey, workspaceId: row.aiWorkspaceId, model: row.aiModel });
}

/** Whether the AI buttons should be there at all for this user. */
export async function canUseAi(user: Subject): Promise<boolean> {
  return (await getAiProviderFor(user)) !== null;
}
