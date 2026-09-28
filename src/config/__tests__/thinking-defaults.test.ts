import { describe, expect, it } from 'vitest';
import { applyThinkingDefaults, minimalThinkingFor, withDefaultThinking } from '../thinking-defaults.js';

describe('minimalThinkingFor', () => {
  it('turns thinking off for 2.5 Flash and Flash-Lite', () => {
    expect(minimalThinkingFor('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 });
    expect(minimalThinkingFor('gemini-2.5-flash-lite')).toEqual({ thinkingBudget: 0 });
    expect(minimalThinkingFor('publishers/google/models/gemini-2.5-flash')).toEqual({
      thinkingBudget: 0,
    });
  });

  it('uses MINIMAL for Gemini 3 and LOW for 3.8, which rejects MINIMAL', () => {
    expect(minimalThinkingFor('gemini-3.5-flash')).toEqual({ thinkingLevel: 'MINIMAL' });
    expect(minimalThinkingFor('gemini-3.8-flash')).toEqual({ thinkingLevel: 'LOW' });
  });

  it('leaves models that cannot turn thinking off, or never think, alone', () => {
    expect(minimalThinkingFor('gemini-2.5-pro')).toBeUndefined();
    expect(minimalThinkingFor('gemini-2.0-flash')).toBeUndefined();
  });
});

describe('withDefaultThinking', () => {
  it('adds the minimal thinking config and keeps the rest', () => {
    expect(withDefaultThinking('gemini-2.5-flash', { maxOutputTokens: 500 })).toEqual({
      maxOutputTokens: 500,
      thinkingConfig: { thinkingBudget: 0 },
    });
  });

  it('keeps a thinking config the caller chose', () => {
    const config = { thinkingConfig: { thinkingBudget: 1024 } };
    expect(withDefaultThinking('gemini-2.5-flash', config)).toBe(config);
  });
});

describe('applyThinkingDefaults', () => {
  it('rewrites generateContent and generateContentStream requests on the client', async () => {
    const seen: unknown[] = [];
    const client = {
      models: {
        generateContent: async (req: unknown) => (seen.push(req), 'ok'),
        generateContentStream: async (req: unknown) => (seen.push(req), 'stream'),
      },
    };
    applyThinkingDefaults(client);

    await client.models.generateContent({ model: 'gemini-2.5-flash', config: { temperature: 1 } });
    await client.models.generateContentStream({ model: 'gemini-3.5-flash' });

    expect(seen).toEqual([
      { model: 'gemini-2.5-flash', config: { temperature: 1, thinkingConfig: { thinkingBudget: 0 } } },
      { model: 'gemini-3.5-flash', config: { thinkingConfig: { thinkingLevel: 'MINIMAL' } } },
    ]);
  });
});
