/**
 * BTH (Better Than Human) Signal Dispatcher Tests
 *
 * Tests the 10 superhuman signal dispatchers and detection helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Dispatchers
  dispatchMicroExpression,
  dispatchEmotionalBondDeepen,
  dispatchProtectiveInstinct,
  dispatchSpontaneousDelight,
  dispatchInsideJokeCallback,
  dispatchSuperhumanObservation,
  dispatchVisibleVulnerability,
  dispatchTemporalInsight,
  dispatchMetaRelationshipMoment,
  dispatchSomaticPresence,
  dispatchAnticipatoryPresence,
  // Detection helpers
  detectUserDelight,
  detectVulnerabilityInResponse,
  detectMetaRelationship,
  detectTemporalInsight,
  getTimeContext,
  type MicroExpressionType,
  type SendDataMessageFn,
} from '../emotion-event-dispatcher.js';

describe('BTH Signal Dispatchers', () => {
  let mockSendDataMessage: SendDataMessageFn;

  beforeEach(() => {
    mockSendDataMessage = vi.fn().mockResolvedValue(undefined) as unknown as SendDataMessageFn;
  });

  describe('dispatchMicroExpression', () => {
    it('should dispatch micro-expression with correct type', async () => {
      await dispatchMicroExpression('delight_flash', mockSendDataMessage, 0.8);

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'micro_expression',
        expect.objectContaining({
          expressionType: 'delight_flash',
          intensity: 0.8,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should default intensity to 0.7', async () => {
      await dispatchMicroExpression('warmth_pulse', mockSendDataMessage);

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'micro_expression',
        expect.objectContaining({
          intensity: 0.7,
        })
      );
    });
  });

  describe('dispatchEmotionalBondDeepen', () => {
    it('should dispatch emotional bond signal with context', async () => {
      await dispatchEmotionalBondDeepen(mockSendDataMessage, {
        trigger: 'gratitude_expressed',
        intensity: 0.8,
        relationshipContext: 'gratitude',
      });

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'humanization_signal',
        expect.objectContaining({
          signalType: 'emotional_bond_deepen',
          intensity: 0.8,
          relationshipContext: 'gratitude',
        })
      );
    });
  });

  describe('dispatchProtectiveInstinct', () => {
    it('should dispatch protective instinct signal', async () => {
      await dispatchProtectiveInstinct(mockSendDataMessage, {
        mismatchType: 'masking_negative',
        voiceEmotion: 'sad',
        textEmotion: 'happy',
        intensity: 0.9,
      });

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'humanization_signal',
        expect.objectContaining({
          signalType: 'protective_instinct',
          mismatchType: 'masking_negative',
          intensity: 0.9,
        })
      );
    });
  });

  describe('dispatchSpontaneousDelight', () => {
    it('should dispatch delight signal and micro-expression', async () => {
      await dispatchSpontaneousDelight(mockSendDataMessage, {
        trigger: 'user_achievement',
        intensity: 0.85,
      });

      // Should dispatch both humanization signal and micro-expression
      expect(mockSendDataMessage).toHaveBeenCalledTimes(2);

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'humanization_signal',
        expect.objectContaining({
          signalType: 'spontaneous_delight',
          intensity: 0.85,
        })
      );

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'micro_expression',
        expect.objectContaining({
          expressionType: 'delight_flash',
        })
      );
    });
  });

  describe('dispatchSuperhumanObservation', () => {
    it('should dispatch observation with pattern type', async () => {
      await dispatchSuperhumanObservation(mockSendDataMessage, {
        observationType: 'correlation',
        observationContent: 'Sleep drops when work stress increases',
        intensity: 0.9,
      });

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'humanization_signal',
        expect.objectContaining({
          signalType: 'superhuman_observation',
          observationType: 'correlation',
          observationContent: 'Sleep drops when work stress increases',
        })
      );
    });
  });

  describe('dispatchVisibleVulnerability', () => {
    it('should dispatch vulnerability signal', async () => {
      await dispatchVisibleVulnerability(mockSendDataMessage, {
        vulnerabilityType: 'uncertainty',
        intensity: 0.6,
      });

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'humanization_signal',
        expect.objectContaining({
          signalType: 'visible_vulnerability',
          vulnerabilityType: 'uncertainty',
        })
      );
    });
  });

  describe('dispatchTemporalInsight', () => {
    it('should dispatch temporal insight with memory reference', async () => {
      await dispatchTemporalInsight(mockSendDataMessage, {
        memoryReference: 'Last month you mentioned feeling stuck at work',
        intensity: 0.8,
      });

      // Should dispatch both humanization signal and micro-expression
      expect(mockSendDataMessage).toHaveBeenCalledTimes(2);

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'humanization_signal',
        expect.objectContaining({
          signalType: 'temporal_insight',
          memoryReference: 'Last month you mentioned feeling stuck at work',
        })
      );
    });
  });

  describe('dispatchAnticipatoryPresence', () => {
    it('should dispatch time-of-day awareness', async () => {
      await dispatchAnticipatoryPresence(mockSendDataMessage, {
        timeContext: 'late_night',
        intensity: 0.9,
      });

      expect(mockSendDataMessage).toHaveBeenCalledWith(
        'humanization_signal',
        expect.objectContaining({
          signalType: 'anticipatory_presence',
          timeContext: 'late_night',
          intensity: 0.9,
        })
      );
    });
  });
});

describe('BTH Detection Helpers', () => {
  describe('detectUserDelight', () => {
    it('should detect job-related achievements', () => {
      expect(detectUserDelight('I got the job!')).toBe(true);
      expect(detectUserDelight('I got a promotion')).toBe(true);
      expect(detectUserDelight('I got a raise')).toBe(true);
    });

    it('should detect exam/test achievements', () => {
      expect(detectUserDelight('I passed the exam!')).toBe(true);
      expect(detectUserDelight('I aced my interview')).toBe(true);
      expect(detectUserDelight('I nailed the presentation')).toBe(true);
    });

    it('should detect life milestones', () => {
      expect(detectUserDelight("We're pregnant!")).toBe(true);
      expect(detectUserDelight('We are getting married')).toBe(true);
      expect(detectUserDelight("We're engaged!")).toBe(true);
    });

    it('should detect excitement expressions', () => {
      expect(detectUserDelight("I'm so happy!")).toBe(true);
      expect(detectUserDelight("I'm so excited")).toBe(true);
      expect(detectUserDelight('Guess what!')).toBe(true);
      expect(detectUserDelight('Great news!')).toBe(true);
    });

    it('should not detect ordinary statements', () => {
      expect(detectUserDelight("I'm doing okay")).toBe(false);
      expect(detectUserDelight('The weather is nice')).toBe(false);
      expect(detectUserDelight('I have a meeting tomorrow')).toBe(false);
    });
  });

  describe('detectVulnerabilityInResponse', () => {
    it('should detect uncertainty expressions', () => {
      const result = detectVulnerabilityInResponse("I'm not sure about that");
      expect(result.detected).toBe(true);
      expect(result.type).toBe('uncertainty');
    });

    it('should detect admission of not knowing', () => {
      const result = detectVulnerabilityInResponse("I don't have all the answers here");
      expect(result.detected).toBe(true);
      expect(result.type).toBe('admission');
    });

    it('should detect reflection/learning', () => {
      const result = detectVulnerabilityInResponse("I realize I might need to learn more");
      expect(result.detected).toBe(true);
      expect(result.type).toBe('reflection');
    });

    it('should not detect confident statements', () => {
      const result = detectVulnerabilityInResponse('You should definitely try that');
      expect(result.detected).toBe(false);
    });
  });

  describe('detectMetaRelationship', () => {
    it('should detect relationship appreciation', () => {
      expect(detectMetaRelationship('I really appreciate how open you are with me')).toBe(true);
      expect(detectMetaRelationship('I value our conversations')).toBe(true);
    });

    it('should detect relationship commentary', () => {
      expect(detectMetaRelationship("Our friendship has grown so much")).toBe(true);
      expect(detectMetaRelationship("I've noticed how you've changed")).toBe(true);
    });

    it('should not detect ordinary statements', () => {
      expect(detectMetaRelationship("Let's talk about your goals")).toBe(false);
    });
  });

  describe('detectTemporalInsight', () => {
    it('should detect temporal references', () => {
      expect(detectTemporalInsight('Remember when we talked about this?')).toBe(true);
      expect(detectTemporalInsight('Last month you mentioned...')).toBe(true);
      expect(detectTemporalInsight('A few weeks ago you said...')).toBe(true);
      expect(detectTemporalInsight('You told me before that...')).toBe(true);
    });

    it('should not detect non-temporal statements', () => {
      expect(detectTemporalInsight('How are you feeling today?')).toBe(false);
    });
  });

  describe('getTimeContext', () => {
    it('should return appropriate time context', () => {
      // This test is time-dependent, so we just verify it returns valid values
      const context = getTimeContext();
      if (context) {
        expect(['late_night', 'early_morning', 'weekend', 'monday', 'evening']).toContain(
          context
        );
      } else {
        // null is valid for normal weekday daytime
        expect(context).toBeNull();
      }
    });
  });
});
