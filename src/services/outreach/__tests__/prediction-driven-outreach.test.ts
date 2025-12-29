/**
 * Prediction-Driven Outreach Tests
 *
 * Tests the ML-driven outreach decision system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserProfile } from '../../../types/user-profile.js';

// Mock the predictive intelligence module
vi.mock('../../../intelligence/predictive/index.js', () => ({
  getAllPredictions: vi.fn(),
}));

import { getAllPredictions } from '../../../intelligence/predictive/index.js';
import { evaluatePredictionDrivenOutreach } from '../prediction-driven-outreach.js';

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
            {
              probability: 0.85,
              confidence: 0.9,
              explanation: 'Multiple stress signals detected',
              sources: ['markov', 'time_series'],
            },
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
            {
              probability: 0.7,
              confidence: 0.7,
              explanation: 'Work patterns suggest burnout risk',
              sources: ['time_series'],
            },
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
            {
              probability: 0.6,
              confidence: 0.55, // Above burnout threshold (0.5), above insight (0.40), below notification (0.60)
              explanation: 'Some burnout signals detected',
              sources: ['time_series'],
            },
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
      // Use unrecognized prediction key - should result in no actionable trigger
      mockGetAllPredictions.mockResolvedValue(
        new Map([
          [
            'general_mood',
            {
              probability: 0.5,
              confidence: 0.3, // Below insight threshold (0.40)
              explanation: 'No strong signal',
              sources: [],
            },
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
            {
              probability: 0.7,
              confidence: 0.65,
              explanation: 'Moderate struggle predicted',
              sources: ['time_series'],
            },
          ],
          [
            'burnout_risk',
            {
              probability: 0.85,
              confidence: 0.85, // Higher confidence
              explanation: 'Burnout signals detected',
              sources: ['markov'],
            },
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
