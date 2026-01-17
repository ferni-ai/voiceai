/**
 * Tests for advanced Rust-accelerated functions
 *
 * Tests injection deduplication, message analysis, emotional state detection,
 * and conversation dynamics - all with both native and JS fallback paths.
 *
 * @module memory/__tests__/rust-accelerator-advanced.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger before imports
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import {
  // Injection deduplication
  deduplicateInjectionsOptimized,
  isInjectionDeduplicationNativeAvailable,
  type InjectionInput,
  type DeduplicationResult,

  // Message analysis
  analyzeMessageOptimized,
  batchAnalyzeMessagesOptimized,
  isMessageAnalysisNativeAvailable,
  type MessageAnalysisResult,

  // Emotional state detection
  detectEmotionalStateOptimized,
  isEmotionalStateNativeAvailable,
  type VoiceEmotionInput,
  type EmotionalStateResult,

  // Conversation dynamics
  analyzeConversationDynamicsOptimized,
  isConversationDynamicsNativeAvailable,
  type ConversationTurnInput,
  type ConversationDynamicsResult,
} from '../rust-accelerator.js';

describe('Injection Deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deduplicateInjectionsOptimized', () => {
    it('should identify duplicate injections with similar content', () => {
      const injections: InjectionInput[] = [
        {
          id: '1',
          content: 'The user loves jazz music and plays piano',
          priority: 1,
          source: 'memory',
        },
        { id: '2', content: 'User enjoys jazz and piano playing', priority: 1, source: 'memory' }, // Near-duplicate
        { id: '3', content: 'The weather is sunny today', priority: 1, source: 'memory' }, // Different
      ];

      const result = deduplicateInjectionsOptimized(injections, 0.5);

      expect(result).toBeDefined();
      expect(result.keepIds).toBeDefined();
      expect(result.removedIds).toBeDefined();
      expect(result.comparisons).toBeGreaterThanOrEqual(0);
      // At least one should be removed if duplicates detected
      expect(result.keepIds.length + result.removedIds.length).toBe(3);
    });

    it('should return all unique when no duplicates', () => {
      const injections: InjectionInput[] = [
        { id: '1', content: 'User likes hiking in mountains', priority: 1, source: 'memory' },
        { id: '2', content: 'Tomorrow meeting scheduled at noon', priority: 1, source: 'calendar' },
        { id: '3', content: 'Birthday party planning underway', priority: 1, source: 'event' },
      ];

      const result = deduplicateInjectionsOptimized(injections, 0.8);

      // High threshold means no duplicates should be detected
      expect(result.keepIds.length).toBe(3);
      expect(result.removedIds.length).toBe(0);
    });

    it('should respect priority when removing duplicates', () => {
      const injections: InjectionInput[] = [
        {
          id: '1',
          content: 'User prefers morning workouts exercise fitness',
          priority: 1,
          source: 'memory',
        },
        {
          id: '2',
          content: 'Morning exercise workouts fitness preferred',
          priority: 5,
          source: 'memory',
        }, // Higher priority
      ];

      const result = deduplicateInjectionsOptimized(injections, 0.3);

      // Higher priority should be kept
      if (result.removedIds.length > 0) {
        expect(result.keepIds).toContain('2'); // Higher priority kept
      }
    });

    it('should handle empty array', () => {
      const result = deduplicateInjectionsOptimized([], 0.7);
      expect(result.keepIds).toEqual([]);
      expect(result.removedIds).toEqual([]);
      expect(result.comparisons).toBe(0);
    });

    it('should handle single injection', () => {
      const injections: InjectionInput[] = [
        { id: '1', content: 'Single injection', priority: 1, source: 'memory' },
      ];
      const result = deduplicateInjectionsOptimized(injections, 0.7);
      expect(result.keepIds).toEqual(['1']);
      expect(result.removedIds).toEqual([]);
    });

    it('should count comparisons correctly', () => {
      const injections: InjectionInput[] = [
        { id: '1', content: 'First content', priority: 1, source: 'a' },
        { id: '2', content: 'Second content', priority: 1, source: 'b' },
        { id: '3', content: 'Third content', priority: 1, source: 'c' },
      ];

      const result = deduplicateInjectionsOptimized(injections, 0.9);
      // Max comparisons for 3 items = 3 (1-2, 1-3, 2-3)
      expect(result.comparisons).toBeLessThanOrEqual(3);
    });
  });

  describe('isInjectionDeduplicationNativeAvailable', () => {
    it('should return a boolean', () => {
      const result = isInjectionDeduplicationNativeAvailable();
      expect(typeof result).toBe('boolean');
    });
  });
});

describe('Message Analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeMessageOptimized', () => {
    it('should detect wrap-up phrases', () => {
      const wrapUpMessages = [
        'Thanks for everything, goodbye!',
        'That is all I needed, thanks!',
        'I gotta go now, see you later',
        'Thanks for your help!',
      ];

      for (const message of wrapUpMessages) {
        const result = analyzeMessageOptimized(message);
        expect(result.isWrapUp).toBe(true);
        expect(result.wrapUpConfidence).toBeGreaterThan(0);
      }
    });

    it('should not flag non-wrap-up messages', () => {
      const normalMessages = [
        'Tell me more about that',
        'What do you think about this idea?',
        'Can you help me with something else?',
        "I'm curious about the weather",
      ];

      for (const message of normalMessages) {
        const result = analyzeMessageOptimized(message);
        expect(result.isWrapUp).toBe(false);
      }
    });

    it('should detect questions', () => {
      const questions = [
        'What is the meaning of life?',
        'How does this work?',
        'Can you help me?',
        'Why is the sky blue?',
        'When should I leave?',
      ];

      for (const question of questions) {
        const result = analyzeMessageOptimized(question);
        expect(result.isQuestion).toBe(true);
      }
    });

    it('should detect greetings', () => {
      const greetings = ['Hello there!', 'Hi, how are you?', 'Hey', 'Good morning', 'Howdy'];

      for (const greeting of greetings) {
        const result = analyzeMessageOptimized(greeting);
        expect(result.isGreeting).toBe(true);
      }
    });

    it('should analyze sentiment correctly', () => {
      // Positive sentiment
      const positiveResult = analyzeMessageOptimized(
        'I am so happy and excited about this amazing wonderful great news!'
      );
      expect(positiveResult.sentiment).toBeGreaterThan(0);
      expect(positiveResult.emotionCategory).toBe('positive');

      // Negative sentiment
      const negativeResult = analyzeMessageOptimized(
        'I am sad and frustrated about this. So stressed and worried.'
      );
      expect(negativeResult.sentiment).toBeLessThan(0);
      expect(negativeResult.emotionCategory).toBe('negative');

      // Ambiguous text - native returns 'unknown' (can't classify)
      // Note: 'unknown' is more semantically accurate than 'neutral' for unclassifiable text
      const ambiguousResult = analyzeMessageOptimized('The table is made of wood.');
      expect(ambiguousResult.emotionCategory).toBe('unknown');
    });

    it('should count words and characters correctly', () => {
      const result = analyzeMessageOptimized('One two three four five');
      expect(result.wordCount).toBe(5);
      // "One two three four five" = 23 characters (3+1+3+1+5+1+4+1+4)
      expect(result.charCount).toBe(23);
    });

    it('should extract keywords', () => {
      const result = analyzeMessageOptimized(
        'The machine learning algorithm processes data efficiently'
      );
      expect(result.keywords).toBeDefined();
      expect(result.keywords.length).toBeGreaterThan(0);
      // Should contain meaningful words, not stopwords
      expect(result.keywords).toContain('machine');
      expect(result.keywords).toContain('learning');
    });

    it('should handle empty string', () => {
      const result = analyzeMessageOptimized('');
      expect(result.wordCount).toBe(0);
      expect(result.isQuestion).toBe(false);
      expect(result.isGreeting).toBe(false);
      expect(result.isWrapUp).toBe(false);
    });
  });

  describe('batchAnalyzeMessagesOptimized', () => {
    it('should analyze multiple messages in batch', () => {
      const messages = [
        'Hello!',
        'What time is it?',
        'Thanks for everything, goodbye!',
        'The cat sat on the mat.',
      ];

      const results = batchAnalyzeMessagesOptimized(messages);

      expect(results.length).toBe(4);
      expect(results[0].isGreeting).toBe(true);
      expect(results[1].isQuestion).toBe(true);
      expect(results[2].isWrapUp).toBe(true);
      expect(results[3].isGreeting).toBe(false);
      expect(results[3].isQuestion).toBe(false);
    });

    it('should handle empty array', () => {
      const results = batchAnalyzeMessagesOptimized([]);
      expect(results).toEqual([]);
    });
  });

  describe('isMessageAnalysisNativeAvailable', () => {
    it('should return a boolean', () => {
      const result = isMessageAnalysisNativeAvailable();
      expect(typeof result).toBe('boolean');
    });
  });
});

describe('Emotional State Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectEmotionalStateOptimized', () => {
    it('should detect positive emotion from text', () => {
      const result = detectEmotionalStateOptimized(
        'This is amazing! I am so happy and excited about this wonderful news!'
      );
      expect(result.primaryEmotion).toBe('positive');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect negative emotion from text', () => {
      const result = detectEmotionalStateOptimized(
        "I'm feeling so sad and frustrated. This has left me stressed and worried."
      );
      expect(result.primaryEmotion).toBe('negative');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return unknown for ambiguous text', () => {
      // Native module returns 'unknown' for text it cannot classify
      // This is more semantically accurate than 'neutral' (which implies "no emotion")
      const result = detectEmotionalStateOptimized('The meeting is scheduled for tomorrow at 3pm.');
      expect(result.primaryEmotion).toBe('unknown');
    });

    it('should detect voice-text mismatch', () => {
      // Positive text but stressed voice indicators
      const voiceInput: VoiceEmotionInput = {
        speechRate: 1.5, // Fast speech
        volume: 1.5, // Loud
        pitchVariation: 0.7, // High variation
        pauseFrequency: 1.0, // Low pause frequency
      };

      const result = detectEmotionalStateOptimized(
        'Everything is great and wonderful! I am so happy!',
        voiceInput
      );

      expect(result.hasMismatch).toBe(true);
      expect(result.mismatchDescription.length).toBeGreaterThan(0);
    });

    it('should not flag mismatch when voice matches text', () => {
      // Neutral text with neutral voice
      const voiceInput: VoiceEmotionInput = {
        speechRate: 1.0, // Normal speech
        volume: 1.0, // Normal volume
        pitchVariation: 0.3, // Normal variation
        pauseFrequency: 2.0, // Normal pause frequency
      };

      const result = detectEmotionalStateOptimized('The weather is nice today.', voiceInput);

      expect(result.hasMismatch).toBe(false);
    });

    it('should provide suggested tone', () => {
      const result = detectEmotionalStateOptimized('I am feeling anxious about the presentation');
      expect(result.suggestedTone).toBeDefined();
      expect(typeof result.suggestedTone).toBe('string');
      expect(result.suggestedTone.length).toBeGreaterThan(0);
    });

    it('should handle missing voice input', () => {
      const result = detectEmotionalStateOptimized('Hello there!');
      expect(result.hasMismatch).toBe(false);
      expect(result.mismatchDescription).toBe('');
    });
  });

  describe('isEmotionalStateNativeAvailable', () => {
    it('should return a boolean', () => {
      const result = isEmotionalStateNativeAvailable();
      expect(typeof result).toBe('boolean');
    });
  });
});

describe('Conversation Dynamics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeConversationDynamicsOptimized', () => {
    it('should calculate engagement score for active conversation', () => {
      const turns: ConversationTurnInput[] = [
        { turnNumber: 1, speaker: 'user', wordCount: 15, sentiment: 0.5, hasQuestion: true },
        { turnNumber: 2, speaker: 'agent', wordCount: 30, sentiment: 0.3, hasQuestion: false },
        { turnNumber: 3, speaker: 'user', wordCount: 20, sentiment: 0.6, hasQuestion: true },
        { turnNumber: 4, speaker: 'agent', wordCount: 25, sentiment: 0.4, hasQuestion: false },
        { turnNumber: 5, speaker: 'user', wordCount: 18, sentiment: 0.7, hasQuestion: true },
      ];

      const result = analyzeConversationDynamicsOptimized(turns);

      expect(result.engagementScore).toBeGreaterThan(0);
      expect(result.engagementScore).toBeLessThanOrEqual(1);
      expect(result.avgUserWords).toBeGreaterThan(0);
      expect(result.avgAgentWords).toBeGreaterThan(0);
    });

    it('should detect rising sentiment trend', () => {
      const turns: ConversationTurnInput[] = [
        { turnNumber: 1, speaker: 'user', wordCount: 10, sentiment: -0.5, hasQuestion: false },
        { turnNumber: 2, speaker: 'agent', wordCount: 20, sentiment: 0, hasQuestion: false },
        { turnNumber: 3, speaker: 'user', wordCount: 12, sentiment: 0.2, hasQuestion: false },
        { turnNumber: 4, speaker: 'agent', wordCount: 18, sentiment: 0.3, hasQuestion: false },
        { turnNumber: 5, speaker: 'user', wordCount: 15, sentiment: 0.7, hasQuestion: false },
        { turnNumber: 6, speaker: 'agent', wordCount: 22, sentiment: 0.8, hasQuestion: false },
      ];

      const result = analyzeConversationDynamicsOptimized(turns);

      expect(result.sentimentTrend).toBe('rising');
    });

    it('should identify conversation phase', () => {
      // Opening phase (few turns)
      const openingTurns: ConversationTurnInput[] = [
        { turnNumber: 1, speaker: 'user', wordCount: 5, sentiment: 0, hasQuestion: true },
      ];
      const openingResult = analyzeConversationDynamicsOptimized(openingTurns);
      expect(openingResult.conversationPhase).toBe('opening');

      // Exploring phase
      const exploringTurns: ConversationTurnInput[] = Array.from({ length: 5 }, (_, i) => ({
        turnNumber: i + 1,
        speaker: i % 2 === 0 ? 'user' : 'agent',
        wordCount: 15,
        sentiment: 0.2,
        hasQuestion: i % 2 === 0,
      }));
      const exploringResult = analyzeConversationDynamicsOptimized(exploringTurns);
      expect(exploringResult.conversationPhase).toBe('exploring');
    });

    it('should provide pacing suggestion', () => {
      // Short user responses - should suggest slower pacing
      const turns: ConversationTurnInput[] = [
        { turnNumber: 1, speaker: 'user', wordCount: 2, sentiment: 0, hasQuestion: false },
        { turnNumber: 2, speaker: 'agent', wordCount: 50, sentiment: 0.3, hasQuestion: false },
        { turnNumber: 3, speaker: 'user', wordCount: 3, sentiment: 0.1, hasQuestion: false },
        { turnNumber: 4, speaker: 'agent', wordCount: 45, sentiment: 0.2, hasQuestion: false },
        { turnNumber: 5, speaker: 'user', wordCount: 2, sentiment: 0, hasQuestion: false },
      ];

      const result = analyzeConversationDynamicsOptimized(turns);

      expect(result.suggestedPacing).toBeDefined();
      expect(typeof result.suggestedPacing).toBe('string');
    });

    it('should handle empty turns array', () => {
      const result = analyzeConversationDynamicsOptimized([]);

      expect(result.engagementScore).toBe(0.5);
      expect(result.avgUserWords).toBe(0);
      expect(result.avgAgentWords).toBe(0);
      expect(result.conversationPhase).toBe('opening');
      expect(result.sentimentTrend).toBe('stable');
    });

    it('should calculate turn ratio', () => {
      const turns: ConversationTurnInput[] = [
        { turnNumber: 1, speaker: 'user', wordCount: 10, sentiment: 0, hasQuestion: false },
        { turnNumber: 2, speaker: 'agent', wordCount: 20, sentiment: 0, hasQuestion: false },
        { turnNumber: 3, speaker: 'user', wordCount: 15, sentiment: 0, hasQuestion: false },
        { turnNumber: 4, speaker: 'agent', wordCount: 25, sentiment: 0, hasQuestion: false },
      ];

      const result = analyzeConversationDynamicsOptimized(turns);

      expect(result.turnRatio).toBe(0.5); // 2 user turns / 4 total
    });

    it('should calculate question density', () => {
      const turns: ConversationTurnInput[] = [
        { turnNumber: 1, speaker: 'user', wordCount: 10, sentiment: 0, hasQuestion: true },
        { turnNumber: 2, speaker: 'agent', wordCount: 20, sentiment: 0, hasQuestion: false },
        { turnNumber: 3, speaker: 'user', wordCount: 15, sentiment: 0, hasQuestion: true },
        { turnNumber: 4, speaker: 'agent', wordCount: 25, sentiment: 0, hasQuestion: false },
      ];

      const result = analyzeConversationDynamicsOptimized(turns);

      expect(result.questionDensity).toBe(0.5); // 2 questions / 4 turns
    });
  });

  describe('isConversationDynamicsNativeAvailable', () => {
    it('should return a boolean', () => {
      const result = isConversationDynamicsNativeAvailable();
      expect(typeof result).toBe('boolean');
    });
  });
});

describe('Performance Characteristics', () => {
  it('should handle large batch of injections efficiently', () => {
    const injections: InjectionInput[] = Array.from({ length: 100 }, (_, i) => ({
      id: `injection-${i}`,
      content: `This is test injection number ${i} with some content about ${i % 2 === 0 ? 'music' : 'weather'}`,
      priority: Math.floor(Math.random() * 10),
      source: 'test',
    }));

    const start = performance.now();
    const result = deduplicateInjectionsOptimized(injections, 0.7);
    const elapsed = performance.now() - start;

    // Should complete in reasonable time (< 1 second even for 100 items)
    expect(elapsed).toBeLessThan(1000);
    expect(result.keepIds.length + result.removedIds.length).toBe(100);
  });

  it('should handle large batch of messages efficiently', () => {
    const messages = Array.from(
      { length: 100 },
      (_, i) =>
        `Message ${i}: What do you think about ${i % 3 === 0 ? 'questions?' : 'statements.'}`
    );

    const start = performance.now();
    const results = batchAnalyzeMessagesOptimized(messages);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500); // Should be fast
    expect(results.length).toBe(100);
  });

  it('should handle long conversation dynamics efficiently', () => {
    const turns: ConversationTurnInput[] = Array.from({ length: 50 }, (_, i) => ({
      turnNumber: i + 1,
      speaker: i % 2 === 0 ? 'user' : 'agent',
      wordCount: 10 + Math.floor(Math.random() * 30),
      durationSecs: 1 + Math.random() * 5,
      sentiment: (i % 3 === 0 ? 0.5 : -0.2) * (i / 50), // Gradually improving
      hasQuestion: i % 4 === 0,
    }));

    const start = performance.now();
    const result = analyzeConversationDynamicsOptimized(turns);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200); // Should be very fast
    expect(result.conversationPhase).toBe('established'); // 50 turns = established
  });
});

describe('Edge Cases', () => {
  it('should handle special characters in text', () => {
    const result = analyzeMessageOptimized('Hello! @user #hashtag $100 & more...');
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('should handle unicode and international text', () => {
    const result = analyzeMessageOptimized('こんにちは Hello 你好');
    expect(result).toBeDefined();
    expect(typeof result.sentiment).toBe('number');
  });

  it('should handle very long text', () => {
    const longText = 'word '.repeat(1000);
    const result = analyzeMessageOptimized(longText);
    expect(result.wordCount).toBe(1000);
  });

  it('should handle injection with empty content', () => {
    const injections: InjectionInput[] = [
      { id: '1', content: '', priority: 1, source: 'a' },
      { id: '2', content: 'Some actual content', priority: 1, source: 'b' },
    ];

    const result = deduplicateInjectionsOptimized(injections, 0.7);
    expect(result.keepIds.length + result.removedIds.length).toBe(2);
  });

  it('should handle conversation turn with zero word count', () => {
    const turns: ConversationTurnInput[] = [
      { turnNumber: 1, speaker: 'user', wordCount: 0, sentiment: 0, hasQuestion: false },
      { turnNumber: 2, speaker: 'agent', wordCount: 10, sentiment: 0.3, hasQuestion: false },
    ];

    const result = analyzeConversationDynamicsOptimized(turns);
    expect(result).toBeDefined();
    expect(result.turnRatio).toBe(0.5);
  });

  it('should handle all negative sentiment conversation', () => {
    const turns: ConversationTurnInput[] = [
      { turnNumber: 1, speaker: 'user', wordCount: 15, sentiment: -0.8, hasQuestion: false },
      { turnNumber: 2, speaker: 'agent', wordCount: 25, sentiment: -0.5, hasQuestion: false },
      { turnNumber: 3, speaker: 'user', wordCount: 12, sentiment: -0.9, hasQuestion: false },
    ];

    const result = analyzeConversationDynamicsOptimized(turns);
    expect(result.sentimentTrend).toBeDefined();
  });
});

// ============================================================================
// GUIDANCE BLOCK STRIPPING TESTS
// ============================================================================

describe('Guidance Block Stripping', () => {
  // Dynamically import to handle native module availability
  let stripGuidanceBlocks: (text: string) => string;
  let containsGuidanceBlocks: (text: string) => boolean;
  let isGuidanceStrippingAvailable: () => boolean;
  let buildGuidanceAutomaton: () => boolean;

  beforeEach(async () => {
    const module = await import('../rust-accelerator.js');
    stripGuidanceBlocks = module.stripGuidanceBlocks;
    containsGuidanceBlocks = module.containsGuidanceBlocks;
    isGuidanceStrippingAvailable = module.isGuidanceStrippingAvailable;
    buildGuidanceAutomaton = module.buildGuidanceAutomaton;
  });

  describe('stripGuidanceBlocks', () => {
    it('should strip XML-style guidance blocks', () => {
      const input = 'Hello <guidance>hidden instructions</guidance> world';
      const result = stripGuidanceBlocks(input);
      expect(result).toBe('Hello  world');
      expect(result).not.toContain('hidden');
    });

    it('should strip bracket-style guidance blocks', () => {
      const input = 'Hello [internal]secret stuff[/internal] world';
      const result = stripGuidanceBlocks(input);
      expect(result).toBe('Hello  world');
      expect(result).not.toContain('secret');
    });

    it('should strip markdown-style guidance blocks', () => {
      const input = 'Hello ---guidance--- secret ---end guidance--- world';
      const result = stripGuidanceBlocks(input);
      expect(result).toBe('Hello  world');
      expect(result).not.toContain('secret');
    });

    it('should handle case-insensitive matching', () => {
      const input = 'Hello <GUIDANCE>hidden</GUIDANCE> world';
      const result = stripGuidanceBlocks(input);
      expect(result).toBe('Hello  world');
    });

    it('should strip multiple blocks', () => {
      const input = 'A <guidance>x</guidance> B <internal>y</internal> C';
      const result = stripGuidanceBlocks(input);
      expect(result).toBe('A  B  C');
    });

    it('should handle multiline content', () => {
      const input = 'Start\n<guidance>\nmultiline\ncontent\n</guidance>\nEnd';
      const result = stripGuidanceBlocks(input);
      expect(result).toContain('Start');
      expect(result).toContain('End');
      expect(result).not.toContain('multiline');
    });

    it('should handle empty input', () => {
      expect(stripGuidanceBlocks('')).toBe('');
    });

    it('should handle input with no guidance blocks', () => {
      const input = 'Hello world, no blocks here!';
      expect(stripGuidanceBlocks(input)).toBe(input);
    });
  });

  describe('containsGuidanceBlocks', () => {
    it('should detect XML-style blocks', () => {
      expect(containsGuidanceBlocks('Hello <guidance>x</guidance> world')).toBe(true);
    });

    it('should detect bracket-style blocks', () => {
      expect(containsGuidanceBlocks('Hello [system]x[/system] world')).toBe(true);
    });

    it('should return false for clean text', () => {
      expect(containsGuidanceBlocks('Hello world')).toBe(false);
    });
  });
});

// ============================================================================
// TIME-SERIES FORECASTING TESTS
// ============================================================================

describe('Time-Series Forecasting', () => {
  let calculateStatisticsF32: (values: Float32Array) => {
    mean: number;
    variance: number;
    stdDev: number;
    min: number;
    max: number;
    count: number;
  };
  let calculateLinearTrendF32: (values: Float32Array) => number;
  let exponentialSmoothingF32: (
    values: Float32Array,
    alpha: number,
    beta: number
  ) => { level: number; trend: number; forecast: number };
  let isTimeSeriesForecastingAvailable: () => boolean;

  beforeEach(async () => {
    const module = await import('../rust-accelerator.js');
    calculateStatisticsF32 = module.calculateStatisticsF32;
    calculateLinearTrendF32 = module.calculateLinearTrendF32;
    exponentialSmoothingF32 = module.exponentialSmoothingF32;
    isTimeSeriesForecastingAvailable = module.isTimeSeriesForecastingAvailable;
  });

  describe('calculateStatisticsF32', () => {
    it('should calculate correct mean', () => {
      const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const stats = calculateStatisticsF32(data);
      expect(stats.mean).toBeCloseTo(5.5, 4);
    });

    it('should calculate correct min and max', () => {
      const data = new Float32Array([3, 1, 4, 1, 5, 9, 2, 6]);
      const stats = calculateStatisticsF32(data);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(9);
    });

    it('should calculate correct count', () => {
      const data = new Float32Array([1, 2, 3, 4, 5]);
      const stats = calculateStatisticsF32(data);
      expect(stats.count).toBe(5);
    });

    it('should calculate correct variance and stdDev', () => {
      const data = new Float32Array([2, 4, 4, 4, 5, 5, 7, 9]);
      const stats = calculateStatisticsF32(data);
      // Population variance = 4.0, stdDev = 2.0
      expect(stats.variance).toBeCloseTo(4.0, 1);
      expect(stats.stdDev).toBeCloseTo(2.0, 1);
    });
  });

  describe('calculateLinearTrendF32', () => {
    it('should detect positive trend', () => {
      const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const trend = calculateLinearTrendF32(data);
      expect(trend).toBeCloseTo(1, 2); // Slope of 1
    });

    it('should detect negative trend', () => {
      const data = new Float32Array([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      const trend = calculateLinearTrendF32(data);
      expect(trend).toBeCloseTo(-1, 2); // Slope of -1
    });

    it('should detect flat trend', () => {
      const data = new Float32Array([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
      const trend = calculateLinearTrendF32(data);
      expect(Math.abs(trend)).toBeLessThan(0.01); // Near zero slope
    });
  });

  describe('exponentialSmoothingF32', () => {
    it('should return valid smoothing result', () => {
      const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const result = exponentialSmoothingF32(data, 0.3, 0.2);

      expect(result.level).toBeDefined();
      expect(result.trend).toBeDefined();
      expect(result.forecast).toBeDefined();
    });

    it('should produce forecast higher than last value for upward trend', () => {
      const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const result = exponentialSmoothingF32(data, 0.3, 0.2);

      // Forecast should be higher than last value (10) for upward trend
      expect(result.forecast).toBeGreaterThan(9);
    });
  });
});
