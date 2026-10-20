import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { openAiModels } from '../models';
import { AiError, type AiProvider, type GenerateRequest, type ModelTier } from '../types';

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  // OpenAI model ids churn independently of this project, so both are env-configurable.
  private readonly models = openAiModels();
  private client: OpenAI;
  private readonly own: boolean;

  /** With a key, it is a player's own; without, the server's (OPENAI_API_KEY). */
  constructor(apiKey?: string) {
    this.own = apiKey !== undefined;
    this.client = apiKey ? new OpenAI({ apiKey }) : new OpenAI();
  }

  modelFor(tier: ModelTier) {
    return this.models[tier];
  }

  async generate<T>({ system, prompt, schema, schemaName, webSearch, tier }: GenerateRequest<T>): Promise<T> {
    try {
      const response = await this.client.responses.parse({
        model: this.models[tier],
        instructions: system,
        input: prompt,
        tools: webSearch ? [{ type: 'web_search' }] : [],
        text: { format: zodTextFormat(schema, schemaName) },
      });
      if (response.output_parsed == null) throw new AiError('OpenAI returned no usable answer. Try again.');
      return response.output_parsed as T;
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) {
        if (this.own) throw new AiError('Your OpenAI API key was rejected. Check it in Settings.');
        throw new AiError('OPENAI_API_KEY was rejected. Check .env.local.');
      }
      if (error instanceof OpenAI.RateLimitError) throw new AiError('OpenAI rate limit or quota reached. Try again later.');
      if (error instanceof OpenAI.APIError) throw new AiError('OpenAI error {status}: {detail}', { status: error.status ?? '', detail: error.message });
      throw error;
    }
  }
}
