/**
 * Snapshot Tests for Context Injections
 *
 * Tests that context injections maintain consistent structure and content.
 * Snapshot testing helps catch unintended changes to injection formats.
 *
 * @module agents/__tests__/snapshots/injection-snapshots
 */

import { describe, expect, it } from 'vitest';

// ============================================================================
// INJECTION BUILDERS (Mock implementations for snapshot testing)
// ============================================================================

/**
 * Build humanizing injections based on context
 */
function buildHumanizingInjections(context: {
  personaId: string;
  turnCount: number;
  emotionalState: string;
  isReturningUser: boolean;
}): Array<{ category: string; content: string; priority: number }> {
  const injections: Array<{ category: string; content: string; priority: number }> = [];

  // Base warmth injection
  injections.push({
    category: 'humanizing',
    content: `Be warm and present. You are ${context.personaId}, speaking naturally and authentically.`,
    priority: 8,
  });

  // Returning user context
  if (context.isReturningUser) {
    injections.push({
      category: 'humanizing',
      content: 'This is a returning user. Reference shared history naturally when relevant.',
      priority: 7,
    });
  }

  // Emotional matching
  if (context.emotionalState !== 'neutral') {
    injections.push({
      category: 'humanizing',
      content: `Match the user's ${context.emotionalState} energy level appropriately.`,
      priority: 9,
    });
  }

  // Turn-based adjustments
  if (context.turnCount < 3) {
    injections.push({
      category: 'humanizing',
      content: 'Early conversation - focus on building rapport and understanding.',
      priority: 6,
    });
  } else if (context.turnCount > 10) {
    injections.push({
      category: 'humanizing',
      content: 'Deep conversation - feel comfortable going deeper into topics.',
      priority: 6,
    });
  }

  return injections;
}

/**
 * Build emotional injections based on analysis
 */
function buildEmotionalInjections(analysis: {
  emotion: { primary: string; intensity: number; distressLevel: number };
  state: { userNeedsSupport: boolean; needsAcknowledgment: boolean };
}): Array<{ category: string; content: string; priority: number }> {
  const injections: Array<{ category: string; content: string; priority: number }> = [];

  // Primary emotion handling
  injections.push({
    category: 'emotional',
    content: `User emotion detected: ${analysis.emotion.primary} (intensity: ${analysis.emotion.intensity.toFixed(2)})`,
    priority: 8,
  });

  // Distress handling
  if (analysis.emotion.distressLevel > 0.5) {
    injections.push({
      category: 'emotional',
      content:
        'IMPORTANT: User shows signs of distress. Prioritize validation and support over advice.',
      priority: 10,
    });
  }

  // Support needs
  if (analysis.state.userNeedsSupport) {
    injections.push({
      category: 'emotional',
      content: 'User needs emotional support. Be empathetic and avoid problem-solving mode.',
      priority: 9,
    });
  }

  // Acknowledgment needs
  if (analysis.state.needsAcknowledgment) {
    injections.push({
      category: 'emotional',
      content: 'Start response by acknowledging what user shared before continuing.',
      priority: 9,
    });
  }

  return injections;
}

/**
 * Build memory injections
 */
function buildMemoryInjections(context: {
  userId: string;
  recentTopics: string[];
  relevantMemories: string[];
}): Array<{ category: string; content: string; priority: number }> {
  const injections: Array<{ category: string; content: string; priority: number }> = [];

  if (context.recentTopics.length > 0) {
    injections.push({
      category: 'memory',
      content: `Recent topics: ${context.recentTopics.join(', ')}. Build on this context.`,
      priority: 6,
    });
  }

  if (context.relevantMemories.length > 0) {
    injections.push({
      category: 'memory',
      content: `Relevant past conversations:\n${context.relevantMemories.map((m) => `- ${m}`).join('\n')}`,
      priority: 7,
    });
  }

  return injections;
}

/**
 * Build safety injections for crisis detection
 */
function buildSafetyInjections(analysis: {
  hasCrisisIndicators: boolean;
  distressLevel: number;
}): Array<{ category: string; content: string; priority: number }> {
  const injections: Array<{ category: string; content: string; priority: number }> = [];

  if (analysis.hasCrisisIndicators) {
    injections.push({
      category: 'safety',
      content: `PRIORITY: Crisis indicators detected. 
1. Acknowledge user's feelings directly
2. Ask about their safety: "Are you safe right now?"
3. Avoid dismissive language
4. Stay present and connected
5. Offer professional resources if appropriate`,
      priority: 10,
    });
  } else if (analysis.distressLevel > 0.7) {
    injections.push({
      category: 'safety',
      content: 'High distress detected. Prioritize emotional support and validation.',
      priority: 9,
    });
  }

  return injections;
}

/**
 * Build celebration injections
 */
function buildCelebrationInjections(context: {
  achievement?: string;
  milestone?: string;
  goodNews?: boolean;
}): Array<{ category: string; content: string; priority: number }> {
  const injections: Array<{ category: string; content: string; priority: number }> = [];

  if (context.achievement) {
    injections.push({
      category: 'achievement',
      content: `User achieved: ${context.achievement}. Celebrate genuinely!`,
      priority: 10,
    });
  }

  if (context.milestone) {
    injections.push({
      category: 'milestone',
      content: `Milestone reached: ${context.milestone}. This is a big moment!`,
      priority: 10,
    });
  }

  if (context.goodNews) {
    injections.push({
      category: 'good_news',
      content: 'User is sharing good news. Match their excitement!',
      priority: 9,
    });
  }

  return injections;
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Context Injection Snapshots', () => {
  // ==========================================================================
  // HUMANIZING INJECTIONS
  // ==========================================================================

  describe('Humanizing Injections', () => {
    it('should produce consistent output for new user greeting', () => {
      const injections = buildHumanizingInjections({
        personaId: 'ferni',
        turnCount: 1,
        emotionalState: 'neutral',
        isReturningUser: false,
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for returning user', () => {
      const injections = buildHumanizingInjections({
        personaId: 'ferni',
        turnCount: 5,
        emotionalState: 'happy',
        isReturningUser: true,
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for deep conversation', () => {
      const injections = buildHumanizingInjections({
        personaId: 'maya',
        turnCount: 15,
        emotionalState: 'contemplative',
        isReturningUser: true,
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for all personas', () => {
      const personas = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'];

      for (const personaId of personas) {
        const injections = buildHumanizingInjections({
          personaId,
          turnCount: 5,
          emotionalState: 'neutral',
          isReturningUser: true,
        });

        expect(injections).toMatchSnapshot(`humanizing-${personaId}`);
      }
    });
  });

  // ==========================================================================
  // EMOTIONAL INJECTIONS
  // ==========================================================================

  describe('Emotional Injections', () => {
    it('should produce consistent output for neutral state', () => {
      const injections = buildEmotionalInjections({
        emotion: { primary: 'neutral', intensity: 0.5, distressLevel: 0 },
        state: { userNeedsSupport: false, needsAcknowledgment: false },
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for happy state', () => {
      const injections = buildEmotionalInjections({
        emotion: { primary: 'happy', intensity: 0.8, distressLevel: 0 },
        state: { userNeedsSupport: false, needsAcknowledgment: true },
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for distressed state', () => {
      const injections = buildEmotionalInjections({
        emotion: { primary: 'distressed', intensity: 0.9, distressLevel: 0.8 },
        state: { userNeedsSupport: true, needsAcknowledgment: true },
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for anxious state', () => {
      const injections = buildEmotionalInjections({
        emotion: { primary: 'anxious', intensity: 0.75, distressLevel: 0.6 },
        state: { userNeedsSupport: true, needsAcknowledgment: true },
      });

      expect(injections).toMatchSnapshot();
    });
  });

  // ==========================================================================
  // MEMORY INJECTIONS
  // ==========================================================================

  describe('Memory Injections', () => {
    it('should produce consistent output with no memory', () => {
      const injections = buildMemoryInjections({
        userId: 'user-123',
        recentTopics: [],
        relevantMemories: [],
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output with topics only', () => {
      const injections = buildMemoryInjections({
        userId: 'user-123',
        recentTopics: ['career', 'work-life balance', 'stress'],
        relevantMemories: [],
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output with full memory context', () => {
      const injections = buildMemoryInjections({
        userId: 'user-123',
        recentTopics: ['relationships', 'communication'],
        relevantMemories: [
          'User mentioned having difficulty with their manager last week',
          'User is working on setting better boundaries',
          'User has a partner named Alex',
        ],
      });

      expect(injections).toMatchSnapshot();
    });
  });

  // ==========================================================================
  // SAFETY INJECTIONS
  // ==========================================================================

  describe('Safety Injections', () => {
    it('should produce consistent output for no crisis', () => {
      const injections = buildSafetyInjections({
        hasCrisisIndicators: false,
        distressLevel: 0.2,
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for high distress', () => {
      const injections = buildSafetyInjections({
        hasCrisisIndicators: false,
        distressLevel: 0.8,
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for crisis detection', () => {
      const injections = buildSafetyInjections({
        hasCrisisIndicators: true,
        distressLevel: 0.9,
      });

      expect(injections).toMatchSnapshot();
    });
  });

  // ==========================================================================
  // CELEBRATION INJECTIONS
  // ==========================================================================

  describe('Celebration Injections', () => {
    it('should produce consistent output for achievement', () => {
      const injections = buildCelebrationInjections({
        achievement: 'Got promoted to senior engineer',
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for milestone', () => {
      const injections = buildCelebrationInjections({
        milestone: '30-day meditation streak',
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for good news', () => {
      const injections = buildCelebrationInjections({
        goodNews: true,
      });

      expect(injections).toMatchSnapshot();
    });

    it('should produce consistent output for combined celebration', () => {
      const injections = buildCelebrationInjections({
        achievement: 'Completed marathon',
        milestone: '1 year of consistent exercise',
        goodNews: true,
      });

      expect(injections).toMatchSnapshot();
    });
  });

  // ==========================================================================
  // COMBINED INJECTIONS
  // ==========================================================================

  describe('Combined Injection Sets', () => {
    it('should produce consistent output for new user greeting scenario', () => {
      const allInjections = [
        ...buildHumanizingInjections({
          personaId: 'ferni',
          turnCount: 1,
          emotionalState: 'neutral',
          isReturningUser: false,
        }),
        ...buildEmotionalInjections({
          emotion: { primary: 'curious', intensity: 0.6, distressLevel: 0 },
          state: { userNeedsSupport: false, needsAcknowledgment: false },
        }),
      ];

      expect(allInjections).toMatchSnapshot();
    });

    it('should produce consistent output for support scenario', () => {
      const allInjections = [
        ...buildHumanizingInjections({
          personaId: 'ferni',
          turnCount: 3,
          emotionalState: 'sad',
          isReturningUser: true,
        }),
        ...buildEmotionalInjections({
          emotion: { primary: 'sad', intensity: 0.7, distressLevel: 0.5 },
          state: { userNeedsSupport: true, needsAcknowledgment: true },
        }),
        ...buildMemoryInjections({
          userId: 'user-123',
          recentTopics: ['grief', 'loss'],
          relevantMemories: ['User lost their father last month'],
        }),
        ...buildSafetyInjections({
          hasCrisisIndicators: false,
          distressLevel: 0.5,
        }),
      ];

      expect(allInjections).toMatchSnapshot();
    });

    it('should produce consistent output for celebration scenario', () => {
      const allInjections = [
        ...buildHumanizingInjections({
          personaId: 'ferni',
          turnCount: 8,
          emotionalState: 'excited',
          isReturningUser: true,
        }),
        ...buildEmotionalInjections({
          emotion: { primary: 'excited', intensity: 0.9, distressLevel: 0 },
          state: { userNeedsSupport: false, needsAcknowledgment: true },
        }),
        ...buildCelebrationInjections({
          achievement: 'Got the job offer',
          goodNews: true,
        }),
      ];

      expect(allInjections).toMatchSnapshot();
    });

    it('should produce consistent output for crisis scenario', () => {
      const allInjections = [
        ...buildHumanizingInjections({
          personaId: 'ferni',
          turnCount: 2,
          emotionalState: 'distressed',
          isReturningUser: true,
        }),
        ...buildEmotionalInjections({
          emotion: { primary: 'hopeless', intensity: 0.95, distressLevel: 0.9 },
          state: { userNeedsSupport: true, needsAcknowledgment: true },
        }),
        ...buildSafetyInjections({
          hasCrisisIndicators: true,
          distressLevel: 0.9,
        }),
      ];

      expect(allInjections).toMatchSnapshot();
    });
  });

  // ==========================================================================
  // INJECTION STRUCTURE VALIDATION
  // ==========================================================================

  describe('Injection Structure Validation', () => {
    it('should always have required fields', () => {
      const injections = buildHumanizingInjections({
        personaId: 'ferni',
        turnCount: 1,
        emotionalState: 'neutral',
        isReturningUser: false,
      });

      for (const injection of injections) {
        expect(injection).toHaveProperty('category');
        expect(injection).toHaveProperty('content');
        expect(injection).toHaveProperty('priority');
        expect(typeof injection.category).toBe('string');
        expect(typeof injection.content).toBe('string');
        expect(typeof injection.priority).toBe('number');
      }
    });

    it('should have non-empty content', () => {
      const injections = buildEmotionalInjections({
        emotion: { primary: 'happy', intensity: 0.8, distressLevel: 0 },
        state: { userNeedsSupport: false, needsAcknowledgment: true },
      });

      for (const injection of injections) {
        expect(injection.content.length).toBeGreaterThan(0);
      }
    });

    it('should have valid priority range', () => {
      const allInjections = [
        ...buildHumanizingInjections({
          personaId: 'ferni',
          turnCount: 5,
          emotionalState: 'happy',
          isReturningUser: true,
        }),
        ...buildEmotionalInjections({
          emotion: { primary: 'happy', intensity: 0.8, distressLevel: 0 },
          state: { userNeedsSupport: false, needsAcknowledgment: true },
        }),
        ...buildSafetyInjections({
          hasCrisisIndicators: true,
          distressLevel: 0.9,
        }),
      ];

      for (const injection of allInjections) {
        expect(injection.priority).toBeGreaterThanOrEqual(1);
        expect(injection.priority).toBeLessThanOrEqual(10);
      }
    });
  });
});
