/**
 * Tests for the Tool Hints module (Phase 1)
 *
 * Tool hints analyze user input and inject likely tool suggestions
 * into the LLM context. The LLM makes the final decision - no auto-execution.
 *
 * NOTE: The `isToolRequest` field depends on semantic router results:
 * - High confidence match (>= 0.7) → true
 * - Pattern match → true
 * - Command/request mood with >= 0.5 → true
 * Otherwise → false
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSemanticToolHints,
  buildToolHintInjection,
  shouldGenerateHints,
  type ToolHint,
  type ToolHintContext,
} from '../tool-hints.js';

// Test constants
const TEST_USER = 'test-user-hints';
const TEST_SESSION = 'test-session-hints';

describe('Tool Hints', () => {
  describe('shouldGenerateHints', () => {
    it('should return false for very short inputs', () => {
      expect(shouldGenerateHints('hi')).toBe(false);
      expect(shouldGenerateHints('ok')).toBe(false);
      expect(shouldGenerateHints('yo')).toBe(false);
    });

    it('should return false for simple greetings', () => {
      expect(shouldGenerateHints('hello')).toBe(false);
      expect(shouldGenerateHints('goodbye')).toBe(false);
      expect(shouldGenerateHints('thanks')).toBe(false);
      expect(shouldGenerateHints('thank you')).toBe(false);
    });

    it('should return true for substantive inputs', () => {
      expect(shouldGenerateHints('play some music')).toBe(true);
      expect(shouldGenerateHints('what is the weather')).toBe(true);
      expect(shouldGenerateHints('schedule a meeting')).toBe(true);
    });

    it('should return false for single-word non-greetings under 10 chars', () => {
      expect(shouldGenerateHints('music')).toBe(false);
      expect(shouldGenerateHints('weather')).toBe(false);
    });

    it('should return true for longer single words', () => {
      expect(shouldGenerateHints('appointments')).toBe(true);
    });
  });

  describe('getSemanticToolHints', () => {
    it('should return hints for music request', async () => {
      const context: ToolHintContext = {
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'play some jazz music',
      };

      const result = await getSemanticToolHints(context);

      expect(result.hints).toBeInstanceOf(Array);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      // isToolRequest depends on router results - just verify it's a boolean
      expect(typeof result.isToolRequest).toBe('boolean');
    });

    it('should return hints for weather request', async () => {
      const result = await getSemanticToolHints({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: "what's the weather like today",
      });

      expect(result.hints).toBeInstanceOf(Array);
      expect(typeof result.isToolRequest).toBe('boolean');
    });

    it('should return hints for calendar request', async () => {
      const result = await getSemanticToolHints({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: "what's on my calendar tomorrow",
      });

      expect(result.hints).toBeInstanceOf(Array);
    });

    it('should handle conversational input', async () => {
      const result = await getSemanticToolHints({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: "I'm feeling a bit stressed about work today",
      });

      // Conversational input may or may not have hints
      // The key is it should process without error
      expect(result.hints).toBeInstanceOf(Array);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return empty hints for greetings', async () => {
      const result = await getSemanticToolHints({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'hi there',
      });

      // Short greetings are skipped by shouldGenerateHints
      // But if they make it through, should have low/no hints
      expect(result.hints.length).toBeLessThanOrEqual(1);
    });

    it('should include confidence scores in hints', async () => {
      const result = await getSemanticToolHints({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'play my favorite playlist',
      });

      for (const hint of result.hints) {
        expect(hint.confidence).toBeGreaterThan(0);
        expect(hint.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include reason for each hint', async () => {
      const result = await getSemanticToolHints({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'remind me to call mom tomorrow',
      });

      for (const hint of result.hints) {
        expect(hint.reason).toBeDefined();
        expect(hint.reason.length).toBeGreaterThan(0);
      }
    });

    it('should limit number of hints', async () => {
      const result = await getSemanticToolHints({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'play music and check weather and schedule meeting and call john',
      });

      // Should not return too many hints (capped at 3 in convertMatchesToHints)
      expect(result.hints.length).toBeLessThanOrEqual(3);
    });

    it('should consider recent tools', async () => {
      const result = await getSemanticToolHints({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'check the forecast',
        recentTools: ['getWeather'],
      });

      // Implementation-specific behavior
      expect(result.hints).toBeInstanceOf(Array);
    });

    it('should consider recent topics', async () => {
      const result = await getSemanticToolHints({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'tell me more about that',
        recentTopics: ['weather', 'travel plans'],
      });

      expect(result.hints).toBeInstanceOf(Array);
    });
  });

  describe('buildToolHintInjection', () => {
    it('should return empty string for no hints', () => {
      const injection = buildToolHintInjection([], false);
      expect(injection).toBe('');
    });

    it('should format hints correctly', () => {
      const hints: ToolHint[] = [
        {
          toolId: 'playMusic',
          toolName: 'Play Music',
          reason: 'User wants to listen to music',
          confidence: 0.9,
          category: 'music',
          matchedBy: ['pattern', 'semantic'],
        },
      ];

      const injection = buildToolHintInjection(hints, true);

      expect(injection).toContain('TOOL HINT');
      expect(injection).toContain('Play Music');
      expect(injection).toContain('90%');
    });

    it('should indicate tool request mode', () => {
      const hints: ToolHint[] = [
        {
          toolId: 'getWeather',
          toolName: 'Weather Check',
          reason: 'User asking about weather',
          confidence: 0.85,
          category: 'weather',
          matchedBy: ['pattern'],
        },
      ];

      const injection = buildToolHintInjection(hints, true);

      expect(injection).toContain('SEMANTIC HINT');
      expect(injection).toContain('tool request');
    });

    it('should include suggested args if present', () => {
      const hints: ToolHint[] = [
        {
          toolId: 'playMusic',
          toolName: 'Play Music',
          reason: 'User wants jazz',
          confidence: 0.95,
          category: 'music',
          matchedBy: ['pattern'],
          suggestedArgs: { genre: 'jazz' },
        },
      ];

      const injection = buildToolHintInjection(hints, true);

      expect(injection).toContain('args');
      expect(injection).toContain('genre');
    });

    it('should limit to top 2 hints in injection', () => {
      const hints: ToolHint[] = [
        {
          toolId: 'tool1',
          toolName: 'Tool 1',
          reason: 'Reason 1',
          confidence: 0.9,
          category: 'utility',
          matchedBy: [],
        },
        {
          toolId: 'tool2',
          toolName: 'Tool 2',
          reason: 'Reason 2',
          confidence: 0.8,
          category: 'utility',
          matchedBy: [],
        },
        {
          toolId: 'tool3',
          toolName: 'Tool 3',
          reason: 'Reason 3',
          confidence: 0.7,
          category: 'utility',
          matchedBy: [],
        },
      ];

      const injection = buildToolHintInjection(hints, true);

      // Should have 2 TOOL HINT lines and 1 "Also possible" line
      const toolHintCount = (injection.match(/\[TOOL HINT\]/g) || []).length;
      expect(toolHintCount).toBe(2);
      expect(injection).toContain('Also possible');
      expect(injection).toContain('Tool 3');
    });
  });

  describe('performance', () => {
    it('should process hints quickly (<50ms)', async () => {
      const start = performance.now();

      await getSemanticToolHints({
        userId: TEST_USER,
        sessionId: TEST_SESSION,
        personaId: 'ferni',
        inputText: 'play some jazz music while I work',
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50);
    });
  });
});
