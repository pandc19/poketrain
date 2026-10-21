import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { modelsFor } from '../models';
import { AiError, type AiProvider, type GenerateRequest, type ModelTier } from '../types';

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  // OpenAI model ids churn independently of this project, so the user can choose theirs in Settings.
  private readonly models: ReturnType<typeof modelsFor>;
  private client: OpenAI;

  constructor(options: { apiKey: string; model?: string | null }) {
    this.models = modelsFor('openai', options.model);
    this.client = new OpenAI({ apiKey: options.apiKey });
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
      if (error instanceof OpenAI.AuthenticationError) throw new AiError('Your OpenAI API key was rejected. Check it in Settings.');
      if (error instanceof OpenAI.RateLimitError) throw new AiError('OpenAI rate limit or quota reached. Try again later.');
      if (error instanceof OpenAI.APIError) throw new AiError('OpenAI error {status}: {detail}', { status: error.status ?? '', detail: error.message });
      throw error;
    }
  }
}
