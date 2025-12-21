/**
 * Dynamic Trigger Utils Tests
 *
 * Tests the proactive_triggers system that powers "Better than Human"
 * dynamic behavior detection across all personas.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  checkDynamicTriggers,
  buildTriggerContext,
  calculateProbabilityBoost,
  shouldSkipDueToNeverWhen,
  recordTriggerCheck,
  recordTriggerMatch,
  recordTriggerFired,
  getTriggerAnalytics,
  resetTriggerAnalytics,
  type ProactiveTrigger,
  type TriggerContext,
} from '../intelligence/context-builders/dynamic-trigger-utils.js';

describe('Dynamic Trigger Utils', () => {
  beforeEach(() => {
    resetTriggerAnalytics();
  });

  afterEach(() => {
    resetTriggerAnalytics();
  });

  // ============================================================================
  // checkDynamicTriggers
  // ============================================================================
  describe('checkDynamicTriggers', () => {
    it('should return null when no triggers provided', () => {
      const context: TriggerContext = {
        userText: 'Hello',
        turnCount: 1,
        relationshipStage: 'acquaintance',
      };

      const result = checkDynamicTriggers(undefined, context);
      expect(result).toBeNull();
    });

    it('should return null when triggers object is empty', () => {
      const context: TriggerContext = {
        userText: 'Hello',
        turnCount: 1,
        relationshipStage: 'acquaintance',
      };

      const result = checkDynamicTriggers({}, context);
      expect(result).toBeNull();
    });

    describe('emotional triggers', () => {
      it('should match distress trigger when emotion indicates distress', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          high_distress: {
            trigger: 'User shows signs of distress or crisis',
            behavior: 'Be present. Slow down. No solutions yet.',
          },
        };

        const context: TriggerContext = {
          userText: 'I feel so overwhelmed',
          emotion: 'anxious',
          emotionIntensity: 0.8,
          turnCount: 3,
          relationshipStage: 'friend',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('high_distress');
        expect(result?.confidence).toBeGreaterThan(0.5);
      });

      it('should match grief trigger when text indicates loss', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          grief_undertone: {
            trigger: 'User experiencing grief or loss',
            behavior: 'Grief is love with nowhere to go. Be present.',
          },
        };

        const context: TriggerContext = {
          userText: 'I miss my dad so much',
          emotion: 'sad',
          emotionIntensity: 0.7,
          turnCount: 5,
          relationshipStage: 'friend',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('grief_undertone');
      });

      it('should match worry trigger', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          anxiety_spiral: {
            trigger: 'User worrying or anxious about something',
            behavior: 'Acknowledge the worry first.',
          },
        };

        const context: TriggerContext = {
          userText: "I'm so worried about the meeting tomorrow",
          emotion: 'worried',
          emotionIntensity: 0.6,
          turnCount: 2,
          relationshipStage: 'acquaintance',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('anxiety_spiral');
      });
    });

    describe('text pattern triggers', () => {
      it('should match "false fine" contradiction pattern', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          false_fine: {
            trigger: 'User says fine but seems sad - contradiction detected',
            behavior: "Gently reflect what you're noticing.",
          },
        };

        const context: TriggerContext = {
          userText: "I'm fine, really",
          emotion: 'sad',
          emotionIntensity: 0.6,
          turnCount: 4,
          relationshipStage: 'friend',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('false_fine');
        // Confidence is emotionIntensity when grief/sadness is detected
        expect(result?.confidence).toBeGreaterThanOrEqual(0.5);
      });

      it('should match deflection pattern', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          deflection_detected: {
            trigger: 'User deflecting or pivoting from topic',
            behavior: 'Notice the pivot. Ask gently.',
          },
        };

        const context: TriggerContext = {
          userText: "Anyway, let's move on to something else",
          turnCount: 6,
          relationshipStage: 'friend',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('deflection_detected');
      });

      it('should match meaning/existential pattern', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          meaning_seeking: {
            trigger: 'User asking about meaning or purpose',
            behavior: 'Open doors, not answers.',
          },
        };

        const context: TriggerContext = {
          userText: "What's the point of all this anyway?",
          turnCount: 10,
          relationshipStage: 'friend',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('meaning_seeking');
      });

      it('should match self-criticism pattern', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          self_blame: {
            trigger: 'User harshly criticizing themselves with should language',
            behavior: 'Compassionate reframe.',
          },
        };

        const context: TriggerContext = {
          userText: "I should have known better. What's wrong with me?",
          turnCount: 7,
          relationshipStage: 'friend',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('self_blame');
      });
    });

    describe('contextual triggers', () => {
      it('should match late night trigger', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          late_night_thoughts: {
            trigger: 'User reaching out late night, 2am wisdom needed',
            behavior: 'Quieter voice. No big moves. Just presence.',
          },
        };

        const context: TriggerContext = {
          userText: 'I just needed to talk to someone',
          turnCount: 1,
          relationshipStage: 'friend',
          isLateNight: true,
          currentHour: 2,
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('late_night_thoughts');
      });

      it('should match sleep-related trigger', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          sleep_trouble: {
            trigger: 'User mentions insomnia or sleep problems',
            behavior: 'Gentle presence for racing mind.',
          },
        };

        const context: TriggerContext = {
          userText: "I couldn't sleep last night, was up at 3am",
          turnCount: 2,
          relationshipStage: 'acquaintance',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('sleep_trouble');
      });

      it('should match returning user after extended silence', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          returning_after_silence: {
            trigger: 'User returning after extended silence or absence',
            behavior: 'Welcome back warmly. Note absence gently.',
          },
        };

        const context: TriggerContext = {
          userText: 'Hey, been a while',
          turnCount: 1,
          relationshipStage: 'friend',
          daysSinceLastSession: 14,
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('returning_after_silence');
      });
    });

    describe('domain-specific triggers', () => {
      it('should match habit-related trigger', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          streak_broken: {
            trigger: 'User broke habit streak or missed routine',
            behavior: 'Compassion first. Progress not perfection.',
          },
        };

        const context: TriggerContext = {
          userText: 'I missed my habit for the third day in a row',
          turnCount: 3,
          relationshipStage: 'friend',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('streak_broken');
      });

      it('should match financial/market trigger', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          market_panic: {
            trigger: 'User anxious about market or portfolio',
            behavior: 'Pattern wisdom. Long-term view.',
          },
        };

        const context: TriggerContext = {
          userText: "My portfolio is down 20% and I'm freaking out",
          turnCount: 2,
          relationshipStage: 'acquaintance',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('market_panic');
      });

      it('should match planning/milestone trigger', () => {
        const triggers: Record<string, ProactiveTrigger> = {
          life_transition: {
            trigger: 'User facing milestone or life transition',
            behavior: 'Honor the chapter ending.',
          },
        };

        const context: TriggerContext = {
          userText: "I'm facing a big decision about my career",
          turnCount: 4,
          relationshipStage: 'friend',
        };

        const result = checkDynamicTriggers(triggers, context);
        expect(result).not.toBeNull();
        expect(result?.triggerName).toBe('life_transition');
      });
    });

    it('should return highest confidence match when multiple triggers match', () => {
      const triggers: Record<string, ProactiveTrigger> = {
        low_confidence: {
          trigger: 'User mentions work',
          behavior: 'Work response',
        },
        high_confidence: {
          trigger: 'User distressed about work',
          behavior: 'Distress response',
        },
      };

      const context: TriggerContext = {
        userText: "I'm so stressed about this work deadline",
        emotion: 'anxious',
        emotionIntensity: 0.9,
        turnCount: 3,
        relationshipStage: 'friend',
        isLateNight: true,
      };

      const result = checkDynamicTriggers(triggers, context);
      expect(result).not.toBeNull();
      // The distress trigger should have higher confidence
      expect(result?.confidence).toBeGreaterThan(0.5);
    });
  });

  // ============================================================================
  // buildTriggerContext
  // ============================================================================
  describe('buildTriggerContext', () => {
    it('should build context with all available data', () => {
      const userText = 'Hello, how are you?';
      const analysis = {
        emotion: { primary: 'happy', intensity: 0.7 },
        topics: { primary: 'greeting' },
      };
      const userData = {
        turnCount: 5,
        recentTopics: ['work', 'health'],
        relationshipStage: 'friend',
        lastSessionDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const context = buildTriggerContext(userText, analysis, userData);

      expect(context.userText).toBe(userText);
      expect(context.emotion).toBe('happy');
      expect(context.emotionIntensity).toBe(0.7);
      expect(context.turnCount).toBe(5);
      expect(context.relationshipStage).toBe('friend');
      expect(context.recentTopics).toEqual(['work', 'health']);
      expect(context.daysSinceLastSession).toBe(3);
      expect(context.currentHour).toBeDefined();
      expect(typeof context.isLateNight).toBe('boolean');
    });

    it('should handle missing analysis data', () => {
      const context = buildTriggerContext('Hello', undefined, undefined);

      expect(context.userText).toBe('Hello');
      expect(context.emotion).toBeUndefined();
      expect(context.emotionIntensity).toBeUndefined();
      expect(context.turnCount).toBe(0);
      expect(context.relationshipStage).toBe('stranger');
    });

    it('should merge additional context', () => {
      const context = buildTriggerContext('Hello', undefined, undefined, {
        isLateNight: true,
        currentHour: 3,
        userData: { custom: 'data' },
      });

      expect(context.isLateNight).toBe(true);
      expect(context.currentHour).toBe(3);
      expect(context.userData).toEqual({ custom: 'data' });
    });
  });

  // ============================================================================
  // calculateProbabilityBoost
  // ============================================================================
  describe('calculateProbabilityBoost', () => {
    it('should return 1.0 when no more_likely_when conditions', () => {
      const context: TriggerContext = {
        userText: 'Hello',
        turnCount: 1,
        relationshipStage: 'acquaintance',
      };

      const boost = calculateProbabilityBoost(undefined, context, null);
      expect(boost).toBe(1.0);
    });

    it('should boost for late night condition', () => {
      const moreLikelyWhen = ['late_night'];
      const context: TriggerContext = {
        userText: 'Hello',
        turnCount: 1,
        relationshipStage: 'friend',
        isLateNight: true,
      };

      const boost = calculateProbabilityBoost(moreLikelyWhen, context, null);
      expect(boost).toBeGreaterThan(1.0);
    });

    it('should boost for extended silence condition', () => {
      const moreLikelyWhen = ['extended_silence'];
      const context: TriggerContext = {
        userText: 'Hello',
        turnCount: 1,
        relationshipStage: 'friend',
        daysSinceLastSession: 10,
      };

      const boost = calculateProbabilityBoost(moreLikelyWhen, context, null);
      expect(boost).toBeGreaterThan(1.0);
    });

    it('should boost for distress condition', () => {
      const moreLikelyWhen = ['distress'];
      const context: TriggerContext = {
        userText: 'I feel terrible',
        emotion: 'anxious',
        emotionIntensity: 0.8,
        turnCount: 3,
        relationshipStage: 'friend',
      };

      const boost = calculateProbabilityBoost(moreLikelyWhen, context, null);
      expect(boost).toBeGreaterThan(1.0);
    });

    it('should cap boost at 2.5x maximum', () => {
      const moreLikelyWhen = [
        'late_night',
        'extended_silence',
        'distress',
        'heavy_topic',
        'returning',
      ];
      const context: TriggerContext = {
        userText: 'I feel terrible',
        emotion: 'anxious',
        emotionIntensity: 0.9,
        turnCount: 1,
        relationshipStage: 'friend',
        isLateNight: true,
        daysSinceLastSession: 14,
      };

      const boost = calculateProbabilityBoost(moreLikelyWhen, context, null);
      expect(boost).toBeLessThanOrEqual(2.5);
    });
  });

  // ============================================================================
  // shouldSkipDueToNeverWhen
  // ============================================================================
  describe('shouldSkipDueToNeverWhen', () => {
    it('should return false when no never_when conditions', () => {
      const context: TriggerContext = {
        userText: 'Hello',
        turnCount: 1,
        relationshipStage: 'acquaintance',
      };

      const shouldSkip = shouldSkipDueToNeverWhen(undefined, context);
      expect(shouldSkip).toBe(false);
    });

    it('should skip for first turns when condition specifies', () => {
      const neverWhen = ['first turns'];
      const context: TriggerContext = {
        userText: 'Hello',
        turnCount: 1,
        relationshipStage: 'stranger',
      };

      const shouldSkip = shouldSkipDueToNeverWhen(neverWhen, context);
      expect(shouldSkip).toBe(true);
    });

    it('should not skip after first few turns', () => {
      const neverWhen = ['first turns'];
      const context: TriggerContext = {
        userText: 'Hello',
        turnCount: 5,
        relationshipStage: 'friend',
      };

      const shouldSkip = shouldSkipDueToNeverWhen(neverWhen, context);
      expect(shouldSkip).toBe(false);
    });

    it('should skip when user is distressed and condition specifies', () => {
      const neverWhen = ['user distressed'];
      const context: TriggerContext = {
        userText: 'I feel terrible',
        emotion: 'anxious',
        emotionIntensity: 0.9,
        turnCount: 5,
        relationshipStage: 'friend',
      };

      const shouldSkip = shouldSkipDueToNeverWhen(neverWhen, context);
      expect(shouldSkip).toBe(true);
    });
  });

  // ============================================================================
  // Analytics
  // ============================================================================
  describe('Trigger Analytics', () => {
    it('should record trigger checks', () => {
      recordTriggerCheck('emotional');
      recordTriggerCheck('emotional');
      recordTriggerCheck('trust');

      const analytics = getTriggerAnalytics();
      expect(analytics.summary.totalChecked).toBe(3);
      expect(analytics.byBuilder.find((b) => b.name === 'emotional')?.checked).toBe(2);
      expect(analytics.byBuilder.find((b) => b.name === 'trust')?.checked).toBe(1);
    });

    it('should record trigger matches', () => {
      recordTriggerMatch('grief_undertone', 'emotional', 0.8, 'user-123');
      recordTriggerMatch('false_fine', 'trust', 0.85, 'user-123');

      const analytics = getTriggerAnalytics();
      expect(analytics.summary.totalMatched).toBe(2);
      expect(analytics.byTrigger.find((t) => t.name === 'grief_undertone')?.matched).toBe(1);
      expect(analytics.recentActivations.length).toBe(2);
      expect(analytics.recentActivations[0].triggerName).toBe('false_fine');
    });

    it('should record trigger fires', () => {
      recordTriggerMatch('test_trigger', 'emotional', 0.7, 'user-123');
      recordTriggerFired('test_trigger', 'emotional');

      const analytics = getTriggerAnalytics();
      expect(analytics.summary.totalFired).toBe(1);
      expect(analytics.byTrigger.find((t) => t.name === 'test_trigger')?.fired).toBe(1);
    });

    it('should calculate rates correctly', () => {
      // Check 10, match 5, fire 2
      for (let i = 0; i < 10; i++) {
        recordTriggerCheck('test');
      }
      for (let i = 0; i < 5; i++) {
        recordTriggerMatch(`trigger_${i}`, 'test', 0.7);
      }
      recordTriggerFired('trigger_0', 'test');
      recordTriggerFired('trigger_1', 'test');

      const analytics = getTriggerAnalytics();
      expect(analytics.summary.matchRate).toBe(0.5); // 5/10
      expect(analytics.summary.fireRate).toBe(0.4); // 2/5
    });

    it('should reset analytics', () => {
      recordTriggerCheck('test');
      recordTriggerMatch('test', 'test', 0.7);
      recordTriggerFired('test', 'test');

      resetTriggerAnalytics();

      const analytics = getTriggerAnalytics();
      expect(analytics.summary.totalChecked).toBe(0);
      expect(analytics.summary.totalMatched).toBe(0);
      expect(analytics.summary.totalFired).toBe(0);
      expect(analytics.byTrigger).toHaveLength(0);
      expect(analytics.byBuilder).toHaveLength(0);
      expect(analytics.recentActivations).toHaveLength(0);
    });

    it('should limit recent activations to max size', () => {
      // Record more than the max (100)
      for (let i = 0; i < 120; i++) {
        recordTriggerMatch(`trigger_${i}`, 'test', 0.7);
      }

      const analytics = getTriggerAnalytics();
      // Should only return last 20 in the summary
      expect(analytics.recentActivations.length).toBeLessThanOrEqual(20);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================
  describe('Integration: Full Trigger Flow', () => {
    it('should complete full flow: check → match → fire with analytics', () => {
      const triggers: Record<string, ProactiveTrigger> = {
        grief_undertone: {
          trigger: 'User experiencing grief or loss',
          behavior: 'Grief is love with nowhere to go.',
        },
      };

      const context: TriggerContext = {
        userText: 'I miss my grandmother so much',
        emotion: 'sad',
        emotionIntensity: 0.8,
        turnCount: 4,
        relationshipStage: 'friend',
      };

      // Record the check
      recordTriggerCheck('emotional');

      // Match
      const match = checkDynamicTriggers(triggers, context);
      expect(match).not.toBeNull();

      // Record match
      recordTriggerMatch(match!.triggerName, 'emotional', match!.confidence, 'user-456');

      // Calculate boost
      const boost = calculateProbabilityBoost(['heavy_topic'], context, match);
      expect(boost).toBeGreaterThan(1.0);

      // Check never_when
      const shouldSkip = shouldSkipDueToNeverWhen(['first turns'], context);
      expect(shouldSkip).toBe(false);

      // Fire
      recordTriggerFired(match!.triggerName, 'emotional');

      // Verify analytics
      const analytics = getTriggerAnalytics();
      expect(analytics.summary.totalChecked).toBe(1);
      expect(analytics.summary.totalMatched).toBe(1);
      expect(analytics.summary.totalFired).toBe(1);
      expect(analytics.byTrigger.find((t) => t.name === 'grief_undertone')?.fired).toBe(1);
    });
  });
});
