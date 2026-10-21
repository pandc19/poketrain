/**
 * Which model answers which kind of request: a cheaper "bulk" model for everyday requests and a stronger "deep"
 * one for the harder ones. Nothing is read from the environment: a user can choose one model in Settings, which
 * then answers everything; without a choice each provider uses its own pair below.
 */
export type ModelTier = 'bulk' | 'deep';
export type ProviderName = 'claude' | 'openai';

export const DEFAULT_MODELS: Record<ProviderName, Record<ModelTier, string>> = {
  claude: { bulk: 'claude-sonnet-5-5', deep: 'claude-opus-5-5' },
  openai: { bulk: 'gpt-4o-mini', deep: 'gpt-4o' },
};

/** Models Settings suggests while typing; any model the provider offers can be typed instead. */
export const SUGGESTED_MODELS: Record<ProviderName, string[]> = {
  claude: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
};

/** The model for each kind of request: the one the user chose for all of them, or else the provider's pair. */
export function modelsFor(provider: ProviderName, chosen?: string | null): Record<ModelTier, string> {
  const model = chosen?.trim();
  return model ? { bulk: model, deep: model } : DEFAULT_MODELS[provider];
}

/** Models that support Claude's newer web search tool (with dynamic filtering). */
const DYNAMIC_SEARCH = /^claude-(opus-(5|4-6|4-7|4-8)|sonnet-(5|4-6)|fable|mythos)/;

/**
 * The web search tool a Claude model can use. Haiku and older models only
 * support the basic version, so picking by model keeps a cheap bulk model working.
 */
export function claudeWebSearchTool(model: string) {
  return DYNAMIC_SEARCH.test(model)
    ? ({ type: 'web_search_20260209', name: 'web_search', max_uses: 5 } as const)
    : ({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 } as const);
}
