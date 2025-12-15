/**
 * Predictive Intelligence Unit Tests
 *
 * Tests for the predictive intelligence system that anticipates user needs
 * based on patterns (temporal, emotional, behavioral).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// TEST SETUP - Mock bundle loader
// ============================================================================

vi.mock('../bundles/loader.js', () => ({
  loadBundleById: vi.fn(async (personaId: string) => {
    // Return mock bundle with predictive intelligence behavior
    return {
      id: personaId,
      name: personaId === 'ferni' ? 'Ferni' : personaId,
      getBehaviors: () => ({
        'predictive-intelligence': {
          pattern_recognition: {
            temporal_patterns: {
              sunday_anxiety: {
                triggers: ['sunday', 'week ahead', 'monday'],
                detection: 'Sunday evening dread about upcoming week',
                proactive_response: [
                  "Sunday evenings can feel heavy. What's weighing on you about the week ahead?",
                ],
              },
              late_night: {
                triggers: ['late', "can't sleep", 'insomnia'],
                detection: 'Late night processing mode',
                proactive_response: [
                  "These late hours often bring things to the surface. What's on your mind?",
                ],
              },
              friday_reflection: {
                triggers: ['friday', 'end of week'],
                detection: 'End of week reflection mode',
                proactive_response: [
                  "End of the week. How are you feeling about how things went?",
                ],
              },
            },
            emotional_patterns: {
              deflection_with_humor: {
                detection: 'User deflects serious topics with jokes',
                response: [
                  "I notice you joke when things get real. What's underneath that?",
                ],
              },
              minimizing_success: {
                detection: 'User downplays their achievements',
                response: [
                  "You're being pretty hard on yourself. That sounds like a real accomplishment.",
                ],
              },
              comparison_spiral: {
                detection: 'User comparing self negatively to others',
                response: [
                  "Comparison is a tricky one. What would you say if a friend said this about themselves?",
                ],
              },
            },
            behavioral_patterns: {
              avoidance_loop: {
                detection: 'User keeps circling around a topic without engaging',
                response: [
                  "I notice we keep coming back to this. What makes it hard to dig in?",
                ],
              },
              decision_delay: {
                detection: 'User repeatedly postpones decision-making',
                response: [
                  "You've been sitting with this for a while. What would help you move forward?",
                ],
              },
            },
          },
          proactive_follow_ups: {
            after_vulnerability: {
              timing: 'next session',
              phrases: [
                "I've been thinking about what you shared last time.",
              ],
            },
            after_goal_setting: {
              timing: '3-5 days',
              phrases: [
                "How did that goal you set go?",
              ],
            },
          },
          anticipatory_insights: {
            seasonal: {
              new_year: {
                period: 'Dec 20 - Jan 15',
                proactive: ["New year energy. What's one thing you want different?"],
              },
              end_of_year: {
                period: 'Nov 15 - Dec 20',
                proactive: ["End of year. Good time to reflect on how far you've come."],
              },
            },
          },
          concern_detection: {
            warningSigns: {
              hopelessness_language: {
                detection: "Phrases like 'what's the point', 'nothing matters' indicate despair",
                response: ["I heard that. That's important. Tell me more."],
              },
              isolation_mentions: {
                detection: 'User mentions having no one to talk to',
                response: ["You're not alone - we're talking right now."],
              },
            },
          },
          usage_rules: {
            pattern_recognition_min_sessions: 3,
            proactive_followup_min_sessions: 2,
            concern_detection_immediate: true,
            max_proactive_mentions_per_session: 2,
            min_sessions_between_same_pattern: 3,
          },
        },
      }),
    };
  }),
}));

// ============================================================================
// TESTS
// ============================================================================

describe('Predictive Intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadPredictiveIntelligence', () => {
    it('should load predictive intelligence from bundle', async () => {
      const { loadPredictiveIntelligence } = await import('../predictive-intelligence.js');

      const intelligence = await loadPredictiveIntelligence('ferni');

      expect(intelligence).toBeDefined();
      expect(intelligence?.personaId).toBe('ferni');
      expect(intelligence?.patterns.temporal).toBeDefined();
      expect(intelligence?.patterns.emotional).toBeDefined();
      expect(intelligence?.patterns.behavioral).toBeDefined();
    });

    it('should cache loaded intelligence', async () => {
      const { loadPredictiveIntelligence } = await import('../predictive-intelligence.js');

      const first = await loadPredictiveIntelligence('ferni');
      const second = await loadPredictiveIntelligence('ferni');

      // Should return same cached instance
      expect(first).toBe(second);
    });
  });

  describe('detectPatterns', () => {
    it('should not detect patterns before minimum sessions', async () => {
      const { detectPatterns } = await import('../predictive-intelligence.js');

      const patterns = await detectPatterns('ferni', {
        currentMessage: "It's Sunday evening and I'm dreading Monday",
        timestamp: new Date(),
        dayOfWeek: 0, // Sunday
        hour: 19,
        sessionNumber: 1, // Too early
      });

      expect(patterns).toEqual([]);
    });

    it('should detect Sunday anxiety pattern', async () => {
      const { detectPatterns } = await import('../predictive-intelligence.js');

      const patterns = await detectPatterns('ferni', {
        currentMessage: "I hate Sundays, always thinking about the week ahead",
        timestamp: new Date(),
        dayOfWeek: 0, // Sunday
        hour: 19, // Evening
        sessionNumber: 5,
      });

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.patternId === 'sunday_anxiety')).toBe(true);
    });

    it('should detect late night pattern', async () => {
      const { detectPatterns } = await import('../predictive-intelligence.js');

      const patterns = await detectPatterns('ferni', {
        currentMessage: "I can't stop thinking about things",
        timestamp: new Date(),
        dayOfWeek: 3, // Wednesday
        hour: 23, // 11 PM
        sessionNumber: 5,
      });

      expect(patterns.some(p => p.patternId === 'late_night')).toBe(true);
    });

    it('should detect deflection with humor pattern', async () => {
      const { detectPatterns } = await import('../predictive-intelligence.js');

      const patterns = await detectPatterns('ferni', {
        currentMessage: "Haha yeah it's nothing, just kidding around, anyway what were we saying",
        timestamp: new Date(),
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 5,
      });

      expect(patterns.some(p => p.patternType === 'emotional')).toBe(true);
    });

    it('should detect minimizing success pattern', async () => {
      const { detectPatterns } = await import('../predictive-intelligence.js');

      const patterns = await detectPatterns('ferni', {
        currentMessage: "I got the promotion but it's not a big deal really, just lucky timing",
        timestamp: new Date(),
        dayOfWeek: 2,
        hour: 10,
        sessionNumber: 5,
      });

      expect(patterns.some(p => p.patternType === 'emotional')).toBe(true);
    });

    it('should detect comparison spiral pattern', async () => {
      const { detectPatterns } = await import('../predictive-intelligence.js');

      const patterns = await detectPatterns('ferni', {
        currentMessage: "Everyone else has it figured out. I'm not as good as other people at this",
        timestamp: new Date(),
        dayOfWeek: 4,
        hour: 15,
        sessionNumber: 5,
      });

      expect(patterns.some(p => p.patternType === 'emotional')).toBe(true);
    });

    it('should detect avoidance loop pattern', async () => {
      const { detectPatterns } = await import('../predictive-intelligence.js');

      const patterns = await detectPatterns('ferni', {
        currentMessage: "Anyway, let's talk about something else, moving on from that",
        timestamp: new Date(),
        dayOfWeek: 1,
        hour: 11,
        sessionNumber: 5,
      });

      expect(patterns.some(p => p.patternType === 'behavioral')).toBe(true);
    });

    it('should detect decision delay pattern', async () => {
      const { detectPatterns } = await import('../predictive-intelligence.js');

      const patterns = await detectPatterns('ferni', {
        currentMessage: "I'm still thinking about it, still considering my options, not sure yet",
        timestamp: new Date(),
        dayOfWeek: 5,
        hour: 16,
        sessionNumber: 5,
      });

      expect(patterns.some(p => p.patternType === 'behavioral')).toBe(true);
    });

    it('should limit patterns to max per session', async () => {
      const { detectPatterns } = await import('../predictive-intelligence.js');

      // Message that could trigger multiple patterns
      const patterns = await detectPatterns('ferni', {
        currentMessage: "It's Sunday, I'm not as good as everyone else, let's talk about something else haha just kidding anyway",
        timestamp: new Date(),
        dayOfWeek: 0,
        hour: 19,
        sessionNumber: 5,
      });

      // Should be limited by max_proactive_mentions_per_session (2)
      expect(patterns.length).toBeLessThanOrEqual(2);
    });
  });

  describe('detectConcerns', () => {
    it('should detect hopelessness language immediately', async () => {
      const { detectConcerns } = await import('../predictive-intelligence.js');

      const concerns = await detectConcerns('ferni', {
        currentMessage: "What's the point of trying anymore? Nothing matters.",
        timestamp: new Date(),
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 1, // Even on first session
      });

      expect(concerns.length).toBeGreaterThan(0);
      expect(concerns.some(c => c.concernId === 'hopelessness_language')).toBe(true);
      expect(concerns.some(c => c.severity === 'high')).toBe(true);
    });

    it('should detect isolation mentions', async () => {
      const { detectConcerns } = await import('../predictive-intelligence.js');

      const concerns = await detectConcerns('ferni', {
        currentMessage: "I have no one to talk to. I'm all alone in this.",
        timestamp: new Date(),
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 1,
      });

      expect(concerns.some(c => c.concernId === 'isolation_mentions')).toBe(true);
    });

    it('should not false positive on neutral messages', async () => {
      const { detectConcerns } = await import('../predictive-intelligence.js');

      const concerns = await detectConcerns('ferni', {
        currentMessage: "I had a pretty good day today. Got some work done.",
        timestamp: new Date(),
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 5,
      });

      expect(concerns.length).toBe(0);
    });
  });

  describe('getProactiveFollowUps', () => {
    it('should not return follow-ups before minimum sessions', async () => {
      const { getProactiveFollowUps } = await import('../predictive-intelligence.js');

      const followUps = await getProactiveFollowUps('ferni', {
        currentMessage: "Hello",
        timestamp: new Date(),
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 1,
      });

      expect(followUps).toEqual([]);
    });

    it('should return follow-ups after minimum sessions', async () => {
      const { getProactiveFollowUps } = await import('../predictive-intelligence.js');

      const followUps = await getProactiveFollowUps('ferni', {
        currentMessage: "Hello",
        timestamp: new Date(),
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 5,
      });

      expect(followUps.length).toBeGreaterThan(0);
      expect(followUps[0].type).toBeDefined();
      expect(followUps[0].timing).toBeDefined();
      expect(followUps[0].phrases.length).toBeGreaterThan(0);
    });
  });

  describe('getAnticipatoryInsights', () => {
    it('should return new year insights in late December', async () => {
      const { getAnticipatoryInsights } = await import('../predictive-intelligence.js');

      const insights = await getAnticipatoryInsights('ferni', {
        currentMessage: "Hello",
        timestamp: new Date('2024-12-25'), // Christmas
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 5,
      });

      expect(insights.some(i => i.id === 'new_year')).toBe(true);
    });

    it('should return new year insights in early January', async () => {
      const { getAnticipatoryInsights } = await import('../predictive-intelligence.js');

      const insights = await getAnticipatoryInsights('ferni', {
        currentMessage: "Hello",
        timestamp: new Date('2024-01-05'),
        dayOfWeek: 5,
        hour: 10,
        sessionNumber: 5,
      });

      expect(insights.some(i => i.id === 'new_year')).toBe(true);
    });

    it('should return end of year insights in November', async () => {
      const { getAnticipatoryInsights } = await import('../predictive-intelligence.js');

      const insights = await getAnticipatoryInsights('ferni', {
        currentMessage: "Hello",
        timestamp: new Date('2024-11-20'),
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 5,
      });

      expect(insights.some(i => i.id === 'end_of_year')).toBe(true);
    });

    it('should return empty for mid-year dates', async () => {
      const { getAnticipatoryInsights } = await import('../predictive-intelligence.js');

      const insights = await getAnticipatoryInsights('ferni', {
        currentMessage: "Hello",
        timestamp: new Date('2024-06-15'), // Mid-June
        dayOfWeek: 6,
        hour: 14,
        sessionNumber: 5,
      });

      // Should not have new_year or end_of_year
      expect(insights.some(i => i.id === 'new_year')).toBe(false);
      expect(insights.some(i => i.id === 'end_of_year')).toBe(false);
    });
  });

  describe('analyzePredictively', () => {
    it('should return complete predictive analysis', async () => {
      const { analyzePredictively } = await import('../predictive-intelligence.js');

      const analysis = await analyzePredictively('ferni', {
        currentMessage: "What's the point anymore? It's Sunday and I'm dreading Monday.",
        timestamp: new Date(),
        dayOfWeek: 0, // Sunday
        hour: 20,
        sessionNumber: 5,
      });

      expect(analysis).toBeDefined();
      expect(analysis.patterns).toBeDefined();
      expect(analysis.followUps).toBeDefined();
      expect(analysis.concerns).toBeDefined();
      expect(analysis.insights).toBeDefined();
      expect(analysis.promptInjection).toBeDefined();

      // Should have detected both concern and pattern
      expect(analysis.concerns.length).toBeGreaterThan(0);
      expect(analysis.patterns.length).toBeGreaterThan(0);
    });

    it('should generate proper prompt injection', async () => {
      const { analyzePredictively } = await import('../predictive-intelligence.js');

      const analysis = await analyzePredictively('ferni', {
        currentMessage: "What's the point of trying?",
        timestamp: new Date(),
        dayOfWeek: 3,
        hour: 14,
        sessionNumber: 5,
      });

      // Prompt injection should include concern detection
      expect(analysis.promptInjection).toContain('CONCERN');
    });
  });
});


