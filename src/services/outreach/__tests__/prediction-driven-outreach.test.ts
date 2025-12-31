/**
 * Prediction-Driven Outreach Tests
 *
 * Tests the ML-driven outreach decision system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserProfile } from '../../../types/user-profile.js';
import type {
  FusedPrediction,
  PredictionTarget,
  SignalSource,
} from '../../../intelligence/predictive/index.js';

// Mock the predictive intelligence module
vi.mock('../../../intelligence/predictive/index.js', () => ({
  getAllPredictions: vi.fn(),
}));

import { getAllPredictions } from '../../../intelligence/predictive/index.js';
import { evaluatePredictionDrivenOutreach } from '../prediction-driven-outreach.js';

// Helper to create valid FusedPrediction objects
function makePrediction(
  target: PredictionTarget,
  probability: number,
  confidence: number,
  explanation: string,
  sources: string[] = []
): FusedPrediction {
  return {
    target,
    probability,
    confidence,
    explanation,
    signals: sources.map((name) => ({
      name,
      weight: 1,
      value: probability,
      confidence,
      timestamp: new Date(),
    })) as unknown as SignalSource[],
    correlations: new Map(),
  };
}

const mockGetAllPredictions = vi.mocked(getAllPredictions);

describe('Prediction-Driven Outreach', () => {
  const testUserId = 'test-user-123';
  const mockUserProfile: Partial<UserProfile> = {
    id: testUserId,
    name: 'Test User',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('evaluatePredictionDrivenOutreach', () => {
    it('should recommend voice call for high-confidence crisis prediction', async () => {
      mockGetAllPredictions.mockResolvedValue(
        new Map([
          [
            'needs_support_now',
            makePrediction('needs_support_now', 0.85, 0.9, 'Multiple stress signals detected', [
              'markov',
              'time_series',
            ]),
          ],
        ])
      );

      const decision = await evaluatePredictionDrivenOutreach(
        testUserId,
        mockUserProfile as UserProfile
      );

      expect(decision.shouldReach).toBe(true);
      expect(decision.channel).toBe('voice_call');
      expect(decision.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should recommend push notification for medium-confidence prediction', async () => {
      mockGetAllPredictions.mockResolvedValue(
        new Map([
          [
            'burnout_risk',
            makePrediction('burnout_risk', 0.7, 0.7, 'Work patterns suggest burnout risk', [
              'time_series',
            ]),
          ],
        ])
      );

      const decision = await evaluatePredictionDrivenOutreach(
        testUserId,
        mockUserProfile as UserProfile
      );

      expect(decision.shouldReach).toBe(true);
      expect(decision.channel).toBe('push');
    });

    it('should recommend app insights only for low-confidence predictions', async () => {
      // Use a prediction target that the system recognizes, with confidence
      // above insight threshold (0.40) but below notification threshold (0.60)
      // The analyzePredictionsForTrigger requires confidence > 0.5 for burnout_risk
      mockGetAllPredictions.mockResolvedValue(
        new Map([
          [
            'burnout_risk',
            makePrediction('burnout_risk', 0.6, 0.55, 'Some burnout signals detected', [
              'time_series',
            ]),
          ],
        ])
      );

      const decision = await evaluatePredictionDrivenOutreach(
        testUserId,
        mockUserProfile as UserProfile
      );

      expect(decision.shouldReach).toBe(false);
      expect(decision.updateAppInsights).toBe(true);
      expect(decision.channel).toBe('app_insight');
    });

    it('should not recommend outreach when no strong predictions', async () => {
      // Low confidence prediction should not trigger outreach
      mockGetAllPredictions.mockResolvedValue(
        new Map([
          [
            'high_engagement_period',
            makePrediction('high_engagement_period', 0.5, 0.3, 'No strong signal', []),
          ],
        ])
      );

      const decision = await evaluatePredictionDrivenOutreach(
        testUserId,
        mockUserProfile as UserProfile
      );

      expect(decision.shouldReach).toBe(false);
      expect(decision.updateAppInsights).toBe(false);
    });

    it('should handle empty predictions gracefully', async () => {
      mockGetAllPredictions.mockResolvedValue(new Map());

      const decision = await evaluatePredictionDrivenOutreach(
        testUserId,
        mockUserProfile as UserProfile
      );

      expect(decision.shouldReach).toBe(false);
    });

    it('should select highest confidence trigger when multiple predictions exist', async () => {
      mockGetAllPredictions.mockResolvedValue(
        new Map([
          [
            'will_struggle_soon',
            makePrediction('will_struggle_soon', 0.7, 0.65, 'Moderate struggle predicted', [
              'time_series',
            ]),
          ],
          [
            'burnout_risk',
            makePrediction('burnout_risk', 0.85, 0.85, 'Burnout signals detected', ['markov']),
          ],
        ])
      );

      const decision = await evaluatePredictionDrivenOutreach(
        testUserId,
        mockUserProfile as UserProfile
      );

      // Should pick the highest confidence one (burnout)
      expect(decision.shouldReach).toBe(true);
      expect(decision.trigger).toBe('burnout_approaching');
    });
  });
});
