import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { WORKSPACE_MESSAGE } from '../messages';
import { claudeWebSearchTool, modelsFor } from '../models';
import { AiError, type AiProvider, type GenerateRequest, type ModelTier } from '../types';

// Web search runs in a server-side loop that can pause; bound how often we resume it.
const MAX_RESUMES = 4;

export class ClaudeProvider implements AiProvider {
  readonly name = 'claude' as const;
  private readonly models: ReturnType<typeof modelsFor>;
  private client: Anthropic;
  private readonly hasWorkspace: boolean;

  /**
   * Everything comes from the user's settings. A key that is not scoped to a workspace is rejected unless the
   * request names one, so the workspace id is sent only when they gave one.
   */
  constructor(options: { apiKey: string; workspaceId?: string | null; model?: string | null }) {
    this.models = modelsFor('claude', options.model);
    this.hasWorkspace = Boolean(options.workspaceId);
    this.client = new Anthropic({
      apiKey: options.apiKey,
      ...(options.workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': options.workspaceId } } : {}),
    });
  }

  modelFor(tier: ModelTier) {
    return this.models[tier];
  }

  async generate<T>({ system, prompt, schema, webSearch, tier }: GenerateRequest<T>): Promise<T> {
    const model = this.models[tier];
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
    try {
      for (let attempt = 0; ; attempt++) {
        const response = await this.client.messages.parse({
          model,
          max_tokens: 16000,
          system,
          messages,
          tools: webSearch ? [claudeWebSearchTool(model)] : [],
          output_config: { format: zodOutputFormat(schema) },
        });

        if (response.stop_reason === 'pause_turn' && attempt < MAX_RESUMES) {
          // Resume the server-side tool loop: send the paused turn back unchanged.
          messages.push({ role: 'assistant', content: response.content });
          continue;
        }
        if (response.stop_reason === 'refusal') throw new AiError('Claude declined this request.');
        if (response.stop_reason === 'max_tokens') throw new AiError('The answer was cut off. Try again.');
        if (response.parsed_output == null) throw new AiError('Claude returned no usable answer. Try again.');
        return response.parsed_output as T;
      }
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AiError('Your Anthropic API key was rejected. Check it in Settings.');
      if (error instanceof Anthropic.RateLimitError) throw new AiError('Claude rate limit reached. Try again later.');
      if (error instanceof Anthropic.APIError) {
        // The SDK's message is "400 {json}"; the readable part is nested inside.
        const detail = (error.error as { error?: { message?: string } } | undefined)?.error?.message ?? error.message;
        if (detail.includes('anthropic-workspace-id')) {
          if (this.hasWorkspace) throw new AiError('Anthropic did not accept the workspace id. Check it in Settings.');
          throw new AiError(WORKSPACE_MESSAGE);
        }
        throw new AiError('Claude error {status}: {detail}', { status: error.status ?? '', detail });
      }
      throw error;
    }
  }
}
