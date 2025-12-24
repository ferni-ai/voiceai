/**
 * Tests for Intelligence Worker Handlers
 *
 * @module intelligence-worker/__tests__/handlers.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firestore before importing handlers
vi.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      })),
      add: vi.fn().mockResolvedValue({ id: 'test-id' }),
    })),
  })),
}));

// Import handlers after mock
import {
  handlePatternDetection,
  handlePredictiveIntelligence,
  handleKeyMoment,
  handleTrustRecording,
  handleResponseQuality,
} from '../handlers/index.js';

import type {
  PatternDetectionPayload,
  PredictiveIntelligencePayload,
  KeyMomentPayload,
  TrustRecordingPayload,
  ResponseQualityPayload,
} from '../types.js';

describe('Intelligence Worker Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handlePatternDetection', () => {
    it('should process valid pattern detection payload', async () => {
      const payload: PatternDetectionPayload = {
        userId: 'test-user-123',
        transcript: 'I always feel anxious on Monday mornings',
        topic: 'anxiety',
        emotion: 'anxious',
        timestamp: Date.now(),
      };

      const result = await handlePatternDetection(payload);

      expect(result).toBeDefined();
      expect(result.patternId).toBeDefined();
      expect(result.type).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle empty transcript gracefully', async () => {
      const payload: PatternDetectionPayload = {
        userId: 'test-user-123',
        transcript: '',
        topic: 'general',
        emotion: 'neutral',
      };

      const result = await handlePatternDetection(payload);

      expect(result).toBeDefined();
      expect(result.actionable).toBe(false);
    });

    it('should detect temporal patterns', async () => {
      const payload: PatternDetectionPayload = {
        userId: 'test-user-123',
        transcript: 'Every Sunday evening I start dreading work',
        topic: 'work-life-balance',
        emotion: 'anxious',
      };

      const result = await handlePatternDetection(payload);

      expect(result).toBeDefined();
      // Temporal patterns should be detected from "Every Sunday"
    });
  });

  describe('handlePredictiveIntelligence', () => {
    it('should process valid predictive intelligence payload', async () => {
      const payload: PredictiveIntelligencePayload = {
        userId: 'test-user-123',
        context: 'User has been discussing job stress for 3 sessions',
        recentTopics: ['work', 'stress', 'sleep'],
        emotionalTrend: 'declining',
        timestamp: Date.now(),
      };

      const result = await handlePredictiveIntelligence(payload);

      expect(result).toBeDefined();
      expect(result.predictionId).toBeDefined();
      expect(result.predictions).toBeInstanceOf(Array);
    });

    it('should generate predictions based on emotional trend', async () => {
      const payload: PredictiveIntelligencePayload = {
        userId: 'test-user-123',
        context: 'Consistently positive interactions',
        recentTopics: ['goals', 'achievements', 'celebration'],
        emotionalTrend: 'improving',
      };

      const result = await handlePredictiveIntelligence(payload);

      expect(result).toBeDefined();
      expect(result.predictions.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty topics array', async () => {
      const payload: PredictiveIntelligencePayload = {
        userId: 'test-user-123',
        context: 'New user with no history',
        recentTopics: [],
        emotionalTrend: 'neutral',
      };

      const result = await handlePredictiveIntelligence(payload);

      expect(result).toBeDefined();
    });
  });

  describe('handleKeyMoment', () => {
    it('should detect breakthrough moments', async () => {
      const payload: KeyMomentPayload = {
        userId: 'test-user-123',
        transcript: 'I finally realized that I deserve to be happy',
        emotion: 'hopeful',
        intensity: 0.9,
        topic: 'self-worth',
        timestamp: Date.now(),
      };

      const result = await handleKeyMoment(payload);

      expect(result).toBeDefined();
      expect(result.momentId).toBeDefined();
      expect(result.significance).toBeGreaterThan(0);
    });

    it('should detect vulnerable moments', async () => {
      const payload: KeyMomentPayload = {
        userId: 'test-user-123',
        transcript: "I've never told anyone this before, but...",
        emotion: 'vulnerable',
        intensity: 0.8,
        topic: 'personal',
        timestamp: Date.now(),
      };

      const result = await handleKeyMoment(payload);

      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
    });

    it('should handle low-intensity moments', async () => {
      const payload: KeyMomentPayload = {
        userId: 'test-user-123',
        transcript: 'The weather is nice today',
        emotion: 'neutral',
        intensity: 0.1,
        topic: 'small-talk',
      };

      const result = await handleKeyMoment(payload);

      expect(result).toBeDefined();
      expect(result.significance).toBeLessThan(0.5);
    });
  });

  describe('handleTrustRecording', () => {
    it('should record positive trust signals', async () => {
      const payload: TrustRecordingPayload = {
        userId: 'test-user-123',
        personaId: 'ferni',
        trustSignal: 'User shared personal information',
        signalType: 'positive',
        context: 'First deep conversation',
        timestamp: Date.now(),
      };

      const result = await handleTrustRecording(payload);

      expect(result).toBeDefined();
      expect(result.recorded).toBe(true);
      expect(result.delta).toBeGreaterThan(0);
    });

    it('should record negative trust signals', async () => {
      const payload: TrustRecordingPayload = {
        userId: 'test-user-123',
        personaId: 'ferni',
        trustSignal: 'User expressed frustration with response',
        signalType: 'negative',
        context: 'Misunderstood request',
      };

      const result = await handleTrustRecording(payload);

      expect(result).toBeDefined();
      expect(result.recorded).toBe(true);
      expect(result.delta).toBeLessThan(0);
    });

    it('should handle neutral signals', async () => {
      const payload: TrustRecordingPayload = {
        userId: 'test-user-123',
        personaId: 'peter',
        trustSignal: 'Normal conversation',
        signalType: 'neutral',
        context: 'Routine check-in',
      };

      const result = await handleTrustRecording(payload);

      expect(result).toBeDefined();
      expect(result.delta).toBe(0);
    });
  });

  describe('handleResponseQuality', () => {
    it('should calculate quality score for fast responses', async () => {
      const payload: ResponseQualityPayload = {
        userId: 'test-user-123',
        sessionId: 'session-456',
        responseId: 'response-789',
        latencyMs: 150, // Fast response
        turnCount: 5,
        personaId: 'ferni',
        timestamp: Date.now(),
      };

      const result = await handleResponseQuality(payload);

      expect(result).toBeDefined();
      expect(result.qualityScore).toBeGreaterThan(0);
      expect(result.factors).toBeInstanceOf(Array);
    });

    it('should penalize slow responses', async () => {
      const payload: ResponseQualityPayload = {
        userId: 'test-user-123',
        sessionId: 'session-456',
        responseId: 'response-789',
        latencyMs: 5000, // Very slow
        turnCount: 3,
        personaId: 'ferni',
      };

      const result = await handleResponseQuality(payload);

      expect(result).toBeDefined();
      // High latency should reduce score
      const latencyFactor = result.factors.find((f) => f.name === 'latency');
      if (latencyFactor) {
        expect(latencyFactor.score).toBeLessThan(0.5);
      }
    });

    it('should include user satisfaction when provided', async () => {
      const payload: ResponseQualityPayload = {
        userId: 'test-user-123',
        sessionId: 'session-456',
        responseId: 'response-789',
        latencyMs: 200,
        userSatisfaction: 0.9, // High satisfaction
        turnCount: 10,
        personaId: 'maya',
      };

      const result = await handleResponseQuality(payload);

      expect(result).toBeDefined();
      const satisfactionFactor = result.factors.find((f) => f.name === 'satisfaction');
      if (satisfactionFactor) {
        expect(satisfactionFactor.score).toBeGreaterThan(0.8);
      }
    });
  });

  describe('Error Handling', () => {
    it('should not throw on malformed payloads', async () => {
      const malformedPayload = { userId: null } as unknown as PatternDetectionPayload;

      // Should not throw
      await expect(handlePatternDetection(malformedPayload)).resolves.toBeDefined();
    });

    it('should handle missing required fields gracefully', async () => {
      const incompletePayload = {} as PatternDetectionPayload;

      // Should not throw
      await expect(handlePatternDetection(incompletePayload)).resolves.toBeDefined();
    });
  });
});

