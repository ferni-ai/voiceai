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

    it('should detect negative emotion and high distress', async () => {
      const input: UnifiedAnalysisInput = {
        message: "I'm really scared and worried about everything. I feel hopeless and alone.",
      };

      const result = await analyze(input);

      expect(['fear', 'anxiety', 'sadness']).toContain(result.emotion.primary);
      expect(result.emotion.distressLevel).toBeGreaterThan(0.3);
    });

    it('should detect advice-seeking intent', async () => {
      const input: UnifiedAnalysisInput = {
        message: 'What should I do about my job situation?',
      };

      const result = await analyze(input);

      expect(result.intent.primary).toBe('seeking_advice');
      expect(result.signals.seekingAdvice).toBe(true);
    });

    it('should detect venting intent', async () => {
      const input: UnifiedAnalysisInput = {
        message: "I'm so angry and frustrated. I just need to vent about this situation!",
      };

      const result = await analyze(input);

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

    it('should detect rushed signals', async () => {
      const input: UnifiedAnalysisInput = {
        message: 'Gotta go, quick question about my account',
      };

      const result = await analyze(input);

      expect(result.signals.isRushed).toBe(true);
      expect(result.guidance.responseLength.max).toBeLessThanOrEqual(30);
    });

    it('should detect personal sharing', async () => {
      const input: UnifiedAnalysisInput = {
        message: 'My wife and I have been struggling with this for months. I feel so worried.',
      };

      const result = await analyze(input);

      expect(result.signals.isPersonalSharing).toBe(true);
    });

    it('should detect wrapping up signals', async () => {
      const input: UnifiedAnalysisInput = {
        message: "Thanks for the chat! I've got to go now, bye!",
      };

      const result = await analyze(input);

      expect(result.signals.isWrappingUp).toBe(true);
    });

    it('should provide response guidance', async () => {
      const input: UnifiedAnalysisInput = {
        message: 'I need some help understanding my options.',
      };

      const result = await analyze(input);

      expect(result.guidance.responseLength).toBeDefined();
      expect(result.guidance.approach).toBeDefined();
      expect(result.guidance.priorityFocus).toBeDefined();
    });

    it('should enable high emotion mode for distressed user', async () => {
      const input: UnifiedAnalysisInput = {
        message: "I'm devastated. I lost everything and I don't know what to do. I'm so scared.",
      };

      const result = await analyze(input);

      expect(result.useHighEmotionMode).toBe(true);
      expect(result.guidance.approach).toBe('empathy_first');
    });

    it('should generate context for prompt', async () => {
      const input: UnifiedAnalysisInput = {
        message: 'I need help with something important.',
      };

      const result = await analyze(input);

      expect(result.contextForPrompt).toBeDefined();
      expect(typeof result.contextForPrompt).toBe('string');
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

    it('should track conversation state', async () => {
      // Reset state before testing
      const { resetStateMachine } = await import('../conversation-state.js');
      resetStateMachine();
      
      const result1 = analyzeSync({ message: 'Hello!' });
      // State should be valid
      expect(result1.state).toBeDefined();
      expect(result1.state.phase).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message gracefully', async () => {
      const result = await analyze({ message: '' });
      expect(result).toBeDefined();
      expect(result.emotion.primary).toBe('neutral');
    });

    it('should handle very long message', async () => {
      const longMessage = 'This is a test message. '.repeat(50);
      const result = await analyze({ message: longMessage });
      expect(result).toBeDefined();
      expect(result.signals.isRelaxed).toBe(true);
    });

    it('should handle special characters', async () => {
      const result = await analyze({
        message: 'Hello! 😊 How are you? 👋',
      });
      expect(result).toBeDefined();
    });
  });
});

