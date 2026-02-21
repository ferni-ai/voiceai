/**
 * Owned-stack tool-calling integration tests.
 *
 * Verifies detection, parsing, and execution flow for JSON tool calls
 * when using the owned stack (Higgs/Ollama LLM path).
 *
 * Run: pnpm vitest run src/agents/shared/__tests__/owned-stack-tool-calling.test.ts
 */

import { describe, expect, it } from 'vitest';
import { looksLikeJsonFunctionCall } from '../sanitizer/detectors/leakage-detector.js';
import {
  parseJsonFunctionCall,
  executeJsonFunction,
  containsJsonFunctionCall,
} from '../json-function-executor.js';
import { buildOwnedStackContext, buildOwnedStackGreetingContext } from '../owned-stack-context.js';
import type { PersonaConfig } from '../../../personas/types.js';

describe('owned-stack-tool-calling', () => {
  describe('looksLikeJsonFunctionCall', () => {
    it('detects standalone JSON tool call', () => {
      const text = '{"fn":"getCurrentTime","args":{}}';
      expect(looksLikeJsonFunctionCall(text)).toBe(true);
    });

    it('detects tool call with args', () => {
      const text = '{"fn":"playMusic","args":{"query":"jazz"}}';
      expect(looksLikeJsonFunctionCall(text)).toBe(true);
    });

    it('returns false for plain conversational text', () => {
      const text = "I'm just hanging out here, ready to help. How about you?";
      expect(looksLikeJsonFunctionCall(text)).toBe(false);
    });

    it('returns false for text that mentions fn but is not JSON', () => {
      const text = 'The function getCurrentTime is available.';
      expect(looksLikeJsonFunctionCall(text)).toBe(false);
    });
  });

  describe('parseJsonFunctionCall', () => {
    it('extracts fn and args from standalone JSON', () => {
      const text = '{"fn":"getCurrentTime","args":{}}';
      const call = parseJsonFunctionCall(text);
      expect(call).not.toBeNull();
      expect(call!.fn).toBe('getCurrentTime');
      expect(call!.args).toEqual({});
    });

    it('extracts fn and args from text with surrounding content', () => {
      const text = 'Sure, one moment.\n{"fn":"getCurrentTime","args":{}}\n';
      const call = parseJsonFunctionCall(text);
      expect(call).not.toBeNull();
      expect(call!.fn).toBe('getCurrentTime');
      expect(call!.args).toEqual({});
    });

    it('extracts playMusic with query arg', () => {
      const text = '{"fn":"playMusic","args":{"query":"jazz"}}';
      const call = parseJsonFunctionCall(text);
      expect(call).not.toBeNull();
      expect(call!.fn).toBe('playMusic');
      expect(call!.args).toEqual({ query: 'jazz' });
    });

    it('returns null for text without valid JSON tool call', () => {
      const text = 'Just saying hello!';
      expect(parseJsonFunctionCall(text)).toBeNull();
    });
  });

  describe('executeJsonFunction (getCurrentTime)', () => {
    it('executes getCurrentTime and returns a result', async () => {
      const call = parseJsonFunctionCall('{"fn":"getCurrentTime","args":{}}');
      expect(call).not.toBeNull();
      const result = await executeJsonFunction(call!, {
        sessionId: 'test-owned-stack',
        personaId: 'ferni',
      });
      expect(result.success).toBe(true);
      expect(result.fn).toBe('getCurrentTime');
      expect(typeof result.result).toBe('string');
      expect((result.result as string).length).toBeGreaterThan(0);
    });
  });

  describe('buildOwnedStackContext', () => {
    it('includes tool-calling instructions', () => {
      const context = buildOwnedStackContext({
        sessionPersona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' } as PersonaConfig,
      });
      expect(context).toContain('You are Ferni');
      expect(context).toContain('Reply in 1-3 short sentences');
      expect(context).toContain('{"fn":"toolName","args"');
      expect(context).toContain('playMusic');
      expect(context).toContain('getCurrentTime');
    });

    it('buildOwnedStackGreetingContext returns greeting instruction', () => {
      const context = buildOwnedStackGreetingContext({
        sessionPersona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' } as PersonaConfig,
      });
      expect(context).toContain('Greet the user warmly');
      expect(context).toContain('Ferni');
      expect(context).toContain('One short sentence');
    });
  });

  describe('containsJsonFunctionCall', () => {
    it('returns true when text contains parseable tool call', () => {
      expect(containsJsonFunctionCall('{"fn":"getCurrentTime","args":{}}')).toBe(true);
      expect(containsJsonFunctionCall('Here you go: {"fn":"playMusic","args":{"query":"jazz"}}')).toBe(
        true
      );
    });

    it('returns false when text has no tool call', () => {
      expect(containsJsonFunctionCall('Hello! How can I help?')).toBe(false);
    });
  });
});
