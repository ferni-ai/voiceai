/**
 * Unified Analyzer Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyze, analyzeSync, type UnifiedAnalysisInput } from '../unified-analyzer.js';

describe('Unified Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyze (async)', () => {
    it('should analyze a simple neutral message', async () => {
      const input: UnifiedAnalysisInput = {
        message: 'Hello, how are you?',
      };

      const result = await analyze(input);

      expect(result).toBeDefined();
      expect(result.emotion).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.topics).toBeDefined();
      expect(result.state).toBeDefined();
      expect(result.signals).toBeDefined();
      expect(result.guidance).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should detect positive emotion', async () => {
      const input: UnifiedAnalysisInput = {
        message: "I'm so happy and excited about this wonderful news!",
      };

      const result = await analyze(input);

      expect(result.emotion.primary).toBe('joy');
      expect(result.emotion.valence).toBeGreaterThan(0);
    });

    it('should detect advice-seeking intent', async () => {
      const input: UnifiedAnalysisInput = {
        message: 'What should I do about my job situation?',
      };

      const result = await analyze(input);

      expect(result.intent.primary).toBe('seeking_advice');
      expect(result.signals.seekingAdvice).toBe(true);
    });

    it('should detect venting signals', async () => {
      const input: UnifiedAnalysisInput = {
        message: "I'm so angry and frustrated. I just need to vent. I can't stand how this keeps happening!",
      };

      const result = await analyze(input);

      // Venting requires negative valence AND the venting pattern
      // The message contains strong negative emotions AND venting language
      expect(result.intent.primary).toBe('venting');
      expect(result.intent.requiresEmpathy).toBe(true);
    });

    it('should detect decision-making', async () => {
      const input: UnifiedAnalysisInput = {
        message: "I've decided to quit my job and start my own business.",
      };

      const result = await analyze(input);

      expect(result.signals.madeDecision).toBe(true);
    });
  });

  describe('analyzeSync', () => {
    it('should provide quick synchronous analysis', () => {
      const result = analyzeSync({
        message: 'Hello there!',
      });

      expect(result.emotion).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.topics).toBeDefined();
      expect(result.state).toBeDefined();
      expect(result.signals).toBeDefined();
    });

    it('should detect emotion in sync mode', () => {
      const result = analyzeSync({
        message: "I'm really excited about this!",
      });

      expect(result.emotion.primary).toBe('joy');
    });
  });
});
