import { describe, expect, it } from 'vitest';
import { DEFAULT_MODELS, SUGGESTED_MODELS, claudeWebSearchTool, modelsFor } from '@/lib/ai/models';

describe('model settings', () => {
  it('uses each provider’s own pair when the user chose nothing', () => {
    expect(modelsFor('claude')).toEqual({ bulk: 'claude-sonnet-5-5', deep: 'claude-opus-5-5' });
    expect(modelsFor('openai', null)).toEqual({ bulk: 'gpt-4o-mini', deep: 'gpt-4o' });
    expect(modelsFor('claude', '   ')).toEqual(DEFAULT_MODELS.claude);
  });

  it('uses the model the user chose for every kind of request', () => {
    expect(modelsFor('claude', 'claude-haiku-5-5')).toEqual({ bulk: 'claude-haiku-5-5', deep: 'claude-haiku-5-5' });
    expect(modelsFor('openai', ' gpt-4o ')).toEqual({ bulk: 'gpt-4o', deep: 'gpt-4o' });
  });

  it('suggests only models of the right provider', () => {
    expect(SUGGESTED_MODELS.claude.every((m) => m.startsWith('claude-'))).toBe(true);
    expect(SUGGESTED_MODELS.openai.every((m) => m.startsWith('gpt-'))).toBe(true);
  });
});

describe('web search tool by model', () => {
  it('uses the basic tool for Haiku and older models', () => {
    expect(claudeWebSearchTool('claude-haiku-4-5').type).toBe('web_search_20250305');
    expect(claudeWebSearchTool('claude-haiku-4-5-20251001').type).toBe('web_search_20250305');
    expect(claudeWebSearchTool('claude-sonnet-4-5').type).toBe('web_search_20250305');
  });

  it('uses the newer tool where it is supported', () => {
    for (const model of ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-5-5', 'claude-sonnet-4-6', 'claude-fable-5-1']) {
      expect(claudeWebSearchTool(model).type).toBe('web_search_20260209');
    }
  });
});
