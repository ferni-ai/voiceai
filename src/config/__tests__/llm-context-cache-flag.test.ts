import { describe, expect, it } from 'vitest';
import { stablePrefixEnabled } from '../../agents/multi-agent/agent-instructions.js';
import { cacheWarmEnabled } from '../../agents/model-provider/cache-warm.js';
import { llmContextCacheEnabled } from '../llm-context-cache-flag.js';
import { appendOnlyToolsEnabled, staticCoreToolsEnabled } from '../tool-config.js';

describe('LLM_CONTEXT_CACHE', () => {
  it('is off unless set to on', () => {
    expect(llmContextCacheEnabled({})).toBe(false);
    expect(llmContextCacheEnabled({ LLM_CONTEXT_CACHE: 'off' })).toBe(false);
    expect(llmContextCacheEnabled({ LLM_CONTEXT_CACHE: ' ON ' })).toBe(true);
  });

  it('turns on the three prompt-cache settings together', () => {
    const env = { LLM_CONTEXT_CACHE: 'on' };
    expect(stablePrefixEnabled(env)).toBe(true);
    expect(cacheWarmEnabled(env)).toBe(true);
    expect(appendOnlyToolsEnabled(env)).toBe(true);
  });

  it('leaves each flag on its own when off', () => {
    expect(stablePrefixEnabled({})).toBe(false);
    expect(cacheWarmEnabled({})).toBe(false);
    expect(appendOnlyToolsEnabled({})).toBe(false);
    expect(stablePrefixEnabled({ PROMPT_STABLE_PREFIX: 'on' })).toBe(true);
    expect(cacheWarmEnabled({ CASCADE_CACHE_WARM: 'on' })).toBe(true);
    expect(appendOnlyToolsEnabled({ CASCADE_APPEND_ONLY_TOOLS: 'on' })).toBe(true);
  });

  it('does not change which tools are sent', () => {
    const env = { LLM_CONTEXT_CACHE: 'on' };
    expect(staticCoreToolsEnabled(env)).toBe(false);
  });
});
