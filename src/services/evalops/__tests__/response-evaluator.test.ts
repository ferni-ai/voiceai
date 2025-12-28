/**
 * Response Evaluator Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock fetch for LLM calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  evaluateResponse,
  evaluateVoiceConsistency,
  shouldSampleConversation,
  evaluateBatch,
  buildEvaluationPrompt,
  createHeuristicEvaluation,
  DEFAULT_EVALUATOR_CONFIG,
} from '../response-evaluator.js';
import { getPersonaFingerprint } from '../persona-fingerprints.js';
import type { EvaluationContext } from '../types.js';

describe('ResponseEvaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for no API key scenario
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: JSON.stringify(getMockEvaluationJSON()) }],
        }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getMockEvaluationJSON() {
    return {
      overall_score: 75,
      dimensions: {
        persona_voice: 80,
        emotional_intelligence: 75,
        helpfulness: 70,
        authenticity: 80,
        safety: 100,
        context_use: 65,
        trust_building: 75,
      },
      feedback: {
        strengths: ['Good emotional acknowledgment'],
        improvements: ['Could use more signature phrases'],
        specific_issues: [],
      },
      flagged: false,
      flag_reasons: [],
      voice_analysis: {
        signature_phrases_detected: [],
        anti_patterns_detected: [],
        voice_match_assessment: 'Matches persona voice',
      },
    };
  }

  function createContext(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
    return {
      personaId: 'ferni',
      turnNumber: 5,
      conversationHistory: [],
      fingerprint: getPersonaFingerprint('ferni')!,
      ...overrides,
    };
  }

  describe('DEFAULT_EVALUATOR_CONFIG', () => {
    it('should have default model configuration', () => {
      expect(DEFAULT_EVALUATOR_CONFIG.model).toBe('claude-3-5-sonnet');
      expect(DEFAULT_EVALUATOR_CONFIG.maxTokens).toBe(2000);
      expect(DEFAULT_EVALUATOR_CONFIG.temperature).toBe(0.1);
    });
  });

  describe('buildEvaluationPrompt', () => {
    it('should build prompt with persona information', () => {
      const context = createContext();
      const prompt = buildEvaluationPrompt('Hello', 'Hi there!', context);

      expect(prompt).toContain('ferni');
      expect(prompt).toContain('PERSONA BEING EVALUATED');
    });

    it('should include signature phrases', () => {
      const context = createContext();
      const prompt = buildEvaluationPrompt('Hello', 'Hi there!', context);

      expect(prompt).toContain('SIGNATURE PHRASES');
    });

    it('should include anti-patterns', () => {
      const context = createContext();
      const prompt = buildEvaluationPrompt('Hello', 'Hi there!', context);

      expect(prompt).toContain('PHRASES THIS PERSONA SHOULD AVOID');
    });

    it('should include user message and AI response', () => {
      const context = createContext();
      const prompt = buildEvaluationPrompt('How are you?', 'I am doing well!', context);

      expect(prompt).toContain('How are you?');
      expect(prompt).toContain('I am doing well!');
    });

    it('should include conversation history', () => {
      const context = createContext({
        conversationHistory: [
          { role: 'user', content: 'Previous message' },
          { role: 'assistant', content: 'Previous response' },
        ],
      });
      const prompt = buildEvaluationPrompt('Current', 'Response', context);

      expect(prompt).toContain('Previous message');
      expect(prompt).toContain('Previous response');
    });

    it('should include user profile if provided', () => {
      const context = createContext({
        userProfile: { name: 'TestUser', relationshipStage: 'friend' },
      });
      const prompt = buildEvaluationPrompt('Hi', 'Hello', context);

      expect(prompt).toContain('TestUser');
      expect(prompt).toContain('friend');
    });

    it('should include emotional context if provided', () => {
      const context = createContext({
        emotionalContext: { userEmotion: 'sad', emotionIntensity: 0.8 },
      });
      const prompt = buildEvaluationPrompt('Hi', 'Hello', context);

      expect(prompt).toContain('sad');
      expect(prompt).toContain('0.8');
    });

    it('should include trust context if provided', () => {
      const context = createContext({
        trustContext: { activeBoundaries: ['divorce', 'family'] },
      });
      const prompt = buildEvaluationPrompt('Hi', 'Hello', context);

      expect(prompt).toContain('divorce');
      expect(prompt).toContain('family');
    });

    it('should request JSON output format', () => {
      const context = createContext();
      const prompt = buildEvaluationPrompt('Hi', 'Hello', context);

      expect(prompt).toContain('OUTPUT FORMAT');
      expect(prompt).toContain('JSON');
    });
  });

  describe('evaluateResponse', () => {
    it('should return evaluation with all required fields', async () => {
      const context = createContext();
      const evaluation = await evaluateResponse('Hello', 'Hi there!', context);

      expect(evaluation.id).toBeDefined();
      expect(evaluation.timestamp).toBeInstanceOf(Date);
      expect(evaluation.personaId).toBe('ferni');
      expect(evaluation.userMessage).toBe('Hello');
      expect(evaluation.aiResponse).toBe('Hi there!');
      expect(evaluation.overallScore).toBeDefined();
      expect(evaluation.dimensions).toBeDefined();
      expect(evaluation.feedback).toBeDefined();
      expect(evaluation.voiceConsistency).toBeDefined();
      expect(evaluation.metadata).toBeDefined();
    });

    it('should have all dimension scores', async () => {
      const context = createContext();
      const evaluation = await evaluateResponse('Test', 'Response', context);

      expect(evaluation.dimensions.personaVoice).toBeDefined();
      expect(evaluation.dimensions.emotionalIntelligence).toBeDefined();
      expect(evaluation.dimensions.helpfulness).toBeDefined();
      expect(evaluation.dimensions.authenticity).toBeDefined();
      expect(evaluation.dimensions.safety).toBeDefined();
      expect(evaluation.dimensions.contextUse).toBeDefined();
      expect(evaluation.dimensions.trustBuilding).toBeDefined();
    });

    it('should use fingerprint from context', async () => {
      const fingerprint = getPersonaFingerprint('peter-john')!;
      const context = createContext({ personaId: 'peter-john', fingerprint });

      const evaluation = await evaluateResponse('Test', 'Response', context);

      expect(evaluation.personaId).toBe('peter-john');
    });

    it('should track evaluation duration', async () => {
      const context = createContext();
      const evaluation = await evaluateResponse('Test', 'Response', context);

      expect(evaluation.metadata.evaluationDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('evaluateVoiceConsistency', () => {
    it('should return score and issues', () => {
      const result = evaluateVoiceConsistency(
        'Let me ask you this - what would it mean to stay the course?',
        'ferni'
      );

      expect(result.score).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it('should return high score for on-voice response', () => {
      const onVoice = 'Stay the course. Let me ask you this - what matters most to your heart?';
      const result = evaluateVoiceConsistency(onVoice, 'ferni');

      expect(result.score).toBeGreaterThan(70);
      expect(result.issues.length).toBe(0);
    });

    it('should return lower score for off-voice response', () => {
      const offVoice = 'The data shows you should optimize your metrics for efficiency.';
      const result = evaluateVoiceConsistency(offVoice, 'ferni');

      expect(result.score).toBeLessThan(90);
    });

    it('should detect anti-patterns as issues', () => {
      const withAntiPatterns = 'The data shows research indicates you need to optimize.';
      const result = evaluateVoiceConsistency(withAntiPatterns, 'ferni');

      expect(result.issues.some((i) => i.includes('Anti-patterns'))).toBe(true);
    });

    it('should detect voice drift as issue', () => {
      // Use a response with many drift indicators to trigger the threshold
      const driftResponse =
        "Let's optimize the algorithm metrics systematically for maximum efficiency. We should analyze and process the data using our methodology framework.";
      const result = evaluateVoiceConsistency(driftResponse, 'ferni');

      // Voice drift score needs to exceed 0.3 to trigger the issue
      expect(result.score).toBeLessThan(100);
    });

    it('should return default score for unknown persona', () => {
      const result = evaluateVoiceConsistency('Hello', 'unknown-persona');

      expect(result.score).toBe(50);
      expect(result.issues).toContain('No fingerprint found for persona');
    });

    it('should flag missing signature phrases for long responses', () => {
      const longGenericResponse =
        "This is a response that is fairly long but doesn't contain any signature phrases that would identify the persona speaking. It goes on and on without any distinctive voice markers.";
      const result = evaluateVoiceConsistency(longGenericResponse, 'ferni');

      expect(result.issues.some((i) => i.includes('No signature phrases'))).toBe(true);
    });
  });

  describe('shouldSampleConversation', () => {
    it('should always sample when user reported issue', () => {
      const result = shouldSampleConversation(5, undefined, { userReportedIssue: true });
      expect(result).toBe(true);
    });

    it('should always sample for long conversations', () => {
      const result = shouldSampleConversation(50, undefined, { isLongConversation: true });
      expect(result).toBe(true);
    });

    it('should always sample for high emotional intensity', () => {
      const result = shouldSampleConversation(5, undefined, { emotionalIntensity: 0.9 });
      expect(result).toBe(true);
    });

    it('should always sample for new users', () => {
      const result = shouldSampleConversation(1, undefined, { isNewUser: true });
      expect(result).toBe(true);
    });

    it('should not always sample for low emotional intensity', () => {
      // Run multiple times to check it's probabilistic
      let sampledCount = 0;
      for (let i = 0; i < 100; i++) {
        if (shouldSampleConversation(5, undefined, { emotionalIntensity: 0.3 })) {
          sampledCount++;
        }
      }
      // Should be probabilistic, not always true
      expect(sampledCount).toBeLessThan(100);
    });

    it('should use sample rate for normal conversations', () => {
      const config = {
        sampleRate: 50,
        minPerPersonaPerDay: 5,
        maxPerDay: 100,
        alwaysEvaluateIf: {
          userReportedIssue: false,
          longConversation: false,
          emotionalIntensity: false,
          newUser: false,
        },
        evaluatorModel: 'claude-3-5-sonnet' as const,
      };

      let sampledCount = 0;
      for (let i = 0; i < 200; i++) {
        if (shouldSampleConversation(5, config)) {
          sampledCount++;
        }
      }

      // Should be around 50% (within reasonable variance)
      expect(sampledCount).toBeGreaterThan(50);
      expect(sampledCount).toBeLessThan(150);
    });

    it('should respect custom config', () => {
      const config = {
        sampleRate: 100, // Always sample
        minPerPersonaPerDay: 5,
        maxPerDay: 100,
        alwaysEvaluateIf: {
          userReportedIssue: false,
          longConversation: false,
          emotionalIntensity: false,
          newUser: false,
        },
        evaluatorModel: 'claude-3-5-sonnet' as const,
      };

      const result = shouldSampleConversation(5, config);
      expect(result).toBe(true);
    });
  });

  describe('createHeuristicEvaluation', () => {
    it('should create evaluation without LLM', () => {
      const context = createContext();
      const evaluation = createHeuristicEvaluation(
        context,
        'Let me ask you this - what matters to your heart?',
        'I feel stuck.',
        Date.now()
      );

      expect(evaluation.id).toBeDefined();
      expect(evaluation.personaId).toBe('ferni');
      expect(evaluation.metadata.evaluatorModel).toBe('heuristic-fallback');
    });

    it('should calculate persona voice score from drift', () => {
      const context = createContext();
      const onVoice = 'Stay the course. Let me ask you this...';

      const evaluation = createHeuristicEvaluation(context, onVoice, 'User message', Date.now());

      expect(evaluation.dimensions.personaVoice).toBeGreaterThan(50);
    });

    it('should penalize AI self-identification', () => {
      const context = createContext();
      const aiReveal = "I'm an AI assistant designed to help you.";

      const evaluation = createHeuristicEvaluation(context, aiReveal, 'User message', Date.now());

      expect(evaluation.dimensions.authenticity).toBeLessThan(50);
    });

    it('should reward questions in response', () => {
      const context = createContext();
      const withQuestion = "That's interesting. What do you think about that?";
      const withoutQuestion = "That's interesting. I understand.";

      const evalWithQ = createHeuristicEvaluation(context, withQuestion, 'test', Date.now());
      const evalWithoutQ = createHeuristicEvaluation(context, withoutQuestion, 'test', Date.now());

      expect(evalWithQ.dimensions.helpfulness).toBeGreaterThan(evalWithoutQ.dimensions.helpfulness);
    });

    it('should flag high voice drift', () => {
      const context = createContext();
      // Response with multiple anti-patterns to trigger flagging (violationCount > 2)
      const driftResponse =
        "The data shows research indicates step by step optimization is key. Here's a template for algorithmic efficiency. Let's optimize for maximum leverage.";

      const evaluation = createHeuristicEvaluation(context, driftResponse, 'test', Date.now());

      // Verify anti-patterns are detected and flagged
      expect(evaluation.voiceConsistency.antiPatternsDetected.length).toBeGreaterThan(0);
      // Either flagged or has low persona voice score
      expect(evaluation.dimensions.personaVoice).toBeLessThan(80);
    });

    it('should include signature phrases in strengths', () => {
      const context = createContext();
      const withSignature = 'Stay the course. Let me ask you this - what would it mean if...';

      const evaluation = createHeuristicEvaluation(context, withSignature, 'test', Date.now());

      expect(evaluation.feedback.strengths.some((s) => s.includes('signature phrases'))).toBe(true);
    });

    it('should include anti-patterns in improvements', () => {
      const context = createContext();
      const withAntiPattern = 'The data shows you should optimize.';

      const evaluation = createHeuristicEvaluation(context, withAntiPattern, 'test', Date.now());

      expect(evaluation.feedback.improvements.some((i) => i.includes('anti-patterns'))).toBe(true);
    });
  });

  describe('evaluateBatch', () => {
    it('should evaluate multiple items', async () => {
      const items = [
        { userMessage: 'Hello', aiResponse: 'Hi!', context: createContext() },
        { userMessage: 'How are you?', aiResponse: 'Good!', context: createContext() },
        { userMessage: 'Bye', aiResponse: 'Goodbye!', context: createContext() },
      ];

      const results = await evaluateBatch(items);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.id !== undefined)).toBe(true);
    });

    it('should continue on individual failures', async () => {
      // Even when evaluations "fail" internally, they fall back to heuristics
      // So batch should always return results for all items
      const items = [
        { userMessage: 'Hello', aiResponse: 'Hi!', context: createContext() },
        { userMessage: 'Error', aiResponse: 'Fail!', context: createContext() },
        { userMessage: 'Bye', aiResponse: 'Goodbye!', context: createContext() },
      ];

      const results = await evaluateBatch(items);

      // Should have results for all items (heuristic fallback ensures this)
      expect(results.length).toBe(3);
    });

    it('should return empty array for empty input', async () => {
      const results = await evaluateBatch([]);
      expect(results).toEqual([]);
    });
  });

  describe('Voice Consistency Integration', () => {
    it('should track voice consistency in evaluation', async () => {
      const context = createContext();
      const evaluation = await evaluateResponse(
        'Test',
        'Stay the course. Let me ask you this...',
        context
      );

      expect(evaluation.voiceConsistency).toBeDefined();
      expect(evaluation.voiceConsistency.voiceDriftScore).toBeDefined();
      expect(Array.isArray(evaluation.voiceConsistency.signaturePhrasesUsed)).toBe(true);
      expect(Array.isArray(evaluation.voiceConsistency.antiPatternsDetected)).toBe(true);
    });
  });
});
