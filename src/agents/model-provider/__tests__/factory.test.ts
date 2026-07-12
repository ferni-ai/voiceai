/**
 * Model Provider Factory Tests
 *
 * Tests for the ModelProvider factory and provider implementations.
 *
 * @module agents/model-provider/__tests__/factory.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearModelProvider,
  createProvider,
  getModelProvider,
  isTestInjectedProvider,
  isUsingGemini,
  isUsingOpenAI,
  setModelProvider,
} from '../factory.js';
import { GeminiLiveProvider } from '../gemini-live.js';
import { OpenAIRealtimeProvider } from '../openai-realtime.js';
import type { ModelProvider } from '../types.js';

describe('ModelProviderFactory', () => {
  // Reset provider state before each test
  beforeEach(() => {
    clearModelProvider();
    // Clear env vars
    delete process.env.USE_OPENAI_REALTIME;
  });

  afterEach(() => {
    clearModelProvider();
    delete process.env.USE_OPENAI_REALTIME;
  });

  describe('getModelProvider', () => {
    it('should return GeminiLiveProvider by default', () => {
      const provider = getModelProvider();
      expect(provider.id).toBe('gemini-live');
      expect(provider).toBeInstanceOf(GeminiLiveProvider);
    });

    it('should return OpenAIRealtimeProvider when USE_OPENAI_REALTIME=true', () => {
      process.env.USE_OPENAI_REALTIME = 'true';
      const provider = getModelProvider();
      expect(provider.id).toBe('openai-realtime');
      expect(provider).toBeInstanceOf(OpenAIRealtimeProvider);
    });

    it('should return cached provider on subsequent calls', () => {
      const provider1 = getModelProvider();
      const provider2 = getModelProvider();
      expect(provider1).toBe(provider2);
    });

    it('should respect USE_OPENAI_REALTIME only on first call (singleton)', () => {
      // First call with default
      const provider1 = getModelProvider();
      expect(provider1.id).toBe('gemini-live');

      // Change env var
      process.env.USE_OPENAI_REALTIME = 'true';

      // Should still return cached provider
      const provider2 = getModelProvider();
      expect(provider2.id).toBe('gemini-live');
      expect(provider1).toBe(provider2);
    });
  });

  describe('isUsingOpenAI / isUsingGemini', () => {
    it('should return correct values for Gemini', () => {
      expect(isUsingGemini()).toBe(true);
      expect(isUsingOpenAI()).toBe(false);
    });

    it('should return correct values for OpenAI', () => {
      process.env.USE_OPENAI_REALTIME = 'true';
      expect(isUsingOpenAI()).toBe(true);
      expect(isUsingGemini()).toBe(false);
    });
  });

  describe('setModelProvider / clearModelProvider', () => {
    it('should allow test injection', () => {
      const mockProvider: ModelProvider = {
        id: 'openai-realtime',
        displayName: 'Mock Provider',
        hasNativeFunctionCalling: () => true,
        needsJsonWorkaround: () => false,
        hasBuiltInTurnDetection: () => true,
        getPromptModules: () => ({
          includeFunctionCallingBase: false,
          includeFunctionCallingSpecialty: false,
          includeToolUsageGuidance: true,
          includeModelBaseInstructions: false,
          useMinimalInstructions: true,
        }),
        getTokenLimit: () => 14000,
        getMinimalInstructions: () => 'test instructions',
        createLLMModel: vi.fn().mockResolvedValue({}),
        getSessionTurnDetection: () => undefined,
        needsPrewarm: () => false,
        getLogPrefix: () => '🧪',
      };

      setModelProvider(mockProvider);

      const provider = getModelProvider();
      expect(provider.displayName).toBe('Mock Provider');
      expect(isTestInjectedProvider()).toBe(true);
    });

    it('should clear provider correctly', () => {
      // Create initial provider
      getModelProvider();

      // Clear it
      clearModelProvider();

      // Next call should create new provider
      process.env.USE_OPENAI_REALTIME = 'true';
      const provider = getModelProvider();
      expect(provider.id).toBe('openai-realtime');
      expect(isTestInjectedProvider()).toBe(false);
    });
  });

  describe('createProvider', () => {
    it('should create OpenAI provider', () => {
      const provider = createProvider('openai-realtime');
      expect(provider.id).toBe('openai-realtime');
      expect(provider).toBeInstanceOf(OpenAIRealtimeProvider);
    });

    it('should create Gemini provider', () => {
      const provider = createProvider('gemini-live');
      expect(provider.id).toBe('gemini-live');
      expect(provider).toBeInstanceOf(GeminiLiveProvider);
    });

    it('should throw for unknown provider', () => {
      // @ts-expect-error - testing invalid input
      expect(() => createProvider('unknown')).toThrow('Unknown provider ID');
    });
  });
});

describe('OpenAIRealtimeProvider', () => {
  let provider: OpenAIRealtimeProvider;

  beforeEach(() => {
    provider = new OpenAIRealtimeProvider();
  });

  it('should have correct identity', () => {
    expect(provider.id).toBe('openai-realtime');
    expect(provider.displayName).toBe('OpenAI Realtime API');
  });

  it('should have native function calling', () => {
    expect(provider.hasNativeFunctionCalling()).toBe(true);
    expect(provider.needsJsonWorkaround()).toBe(false);
  });

  it('should have correct prompt modules', () => {
    const modules = provider.getPromptModules();
    expect(modules.includeFunctionCallingBase).toBe(false);
    expect(modules.includeFunctionCallingSpecialty).toBe(false);
    expect(modules.includeModelBaseInstructions).toBe(false);
    expect(modules.useMinimalInstructions).toBe(true);
  });

  it('should return correct token limit', () => {
    expect(provider.getTokenLimit()).toBe(14000);
  });

  it('should return undefined turn detection (uses internal)', () => {
    expect(provider.getSessionTurnDetection()).toBeUndefined();
  });

  it('should not need prewarm', () => {
    expect(provider.needsPrewarm()).toBe(false);
  });

  it('should return correct log prefix', () => {
    expect(provider.getLogPrefix()).toBe('🔮');
  });

  it('should return minimal instructions', () => {
    const instructions = provider.getMinimalInstructions();
    expect(instructions).toContain('Ferni');
    expect(instructions).toContain('native function calling');
    expect(instructions).not.toContain('{"fn"');
  });
});

describe('GeminiLiveProvider', () => {
  let provider: GeminiLiveProvider;

  beforeEach(() => {
    provider = new GeminiLiveProvider();
  });

  afterEach(() => {
    // Reset FTIS mode env var
    delete process.env.FTIS_ENABLED;
  });

  it('should have correct identity', () => {
    expect(provider.id).toBe('gemini-live');
    expect(provider.displayName).toBe('Gemini Live API');
  });

  // FTIS is opt-in since 915b2c25b (Mar 2026): disabled by default, enabled via FTIS_ENABLED=true.
  // When FTIS is on, Gemini has no tool knowledge — FTIS handles all routing.
  describe('FTIS mode (opt-in via FTIS_ENABLED=true)', () => {
    beforeEach(() => {
      process.env.FTIS_ENABLED = 'true';
      // Recreate provider with new env
      provider = new GeminiLiveProvider();
    });

    it('should not have native function calling in FTIS mode', () => {
      // FTIS handles all tool routing - Gemini is pure conversation
      expect(provider.hasNativeFunctionCalling()).toBe(false);
      expect(provider.needsJsonWorkaround()).toBe(false);
    });

    it('should not include function calling prompts in FTIS mode', () => {
      const modules = provider.getPromptModules();
      // FTIS handles all tools - no JSON prompts needed
      expect(modules.includeFunctionCallingBase).toBe(false);
      expect(modules.includeFunctionCallingSpecialty).toBe(false);
      expect(modules.includeModelBaseInstructions).toBe(true);
      expect(modules.useMinimalInstructions).toBe(false);
    });
  });

  describe('non-FTIS mode (current default)', () => {
    beforeEach(() => {
      delete process.env.FTIS_ENABLED;
      // Recreate provider with new env
      provider = new GeminiLiveProvider();
    });

    it('should use the JSON workaround by default (native FC off unless GEMINI_USE_NATIVE_FC=true)', () => {
      expect(provider.hasNativeFunctionCalling()).toBe(false);
      expect(provider.needsJsonWorkaround()).toBe(true);
    });

    it('should include function calling prompts in non-FTIS mode', () => {
      const modules = provider.getPromptModules();
      expect(modules.includeFunctionCallingBase).toBe(true);
      expect(modules.includeFunctionCallingSpecialty).toBe(true);
      expect(modules.includeModelBaseInstructions).toBe(true);
      expect(modules.useMinimalInstructions).toBe(false);
    });
  });

  it('should return correct token limit', () => {
    expect(provider.getTokenLimit()).toBe(30000);
  });

  it('should return undefined turn detection (Gemini uses built-in VAD)', () => {
    // Gemini Live has built-in VAD-based turn detection, so we return undefined
    // to let Gemini's server-side VAD handle it automatically
    expect(provider.getSessionTurnDetection()).toBeUndefined();
  });

  it('should need prewarm', () => {
    expect(provider.needsPrewarm()).toBe(true);
  });

  it('should return correct log prefix', () => {
    expect(provider.getLogPrefix()).toBe('🤖');
  });
});
