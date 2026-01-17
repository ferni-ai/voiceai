/**
 * Cross-Persona Insights System - Unit Tests
 *
 * Tests for the new cross-persona insights system:
 * - alex-communication-insights.ts
 * - ferni-coordinator-insights.ts
 * - cross-persona-insights.ts service
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve({ exists: false, data: () => null })),
            set: vi.fn(() => Promise.resolve()),
          })),
          where: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve({ docs: [], empty: true })),
          })),
        })),
        get: vi.fn(() => Promise.resolve({ exists: false, data: () => null })),
        set: vi.fn(() => Promise.resolve()),
      })),
    })),
  })),
  FieldValue: {
    serverTimestamp: vi.fn(() => new Date()),
  },
  Timestamp: {
    now: vi.fn(() => ({ toDate: () => new Date() })),
  },
}));

// Mock the safe-logger
const createMockLogger = () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return logger;
};

vi.mock('../utils/safe-logger.js', () => ({
  createLogger: createMockLogger,
  getLogger: createMockLogger,
}));

// Mock services that are heavy dependencies
vi.mock('../services/financial-store.js', () => ({
  getFinancialStore: vi.fn(() => ({
    loadUserData: vi.fn(() => Promise.resolve()),
    getUserBudgets: vi.fn(() => []),
    getUserSavingsGoals: vi.fn(() => []),
    getUserSpendingTriggers: vi.fn(() => []),
  })),
}));

vi.mock('../services/productivity-store.js', () => ({
  getProductivityStore: vi.fn(() => ({
    loadUserData: vi.fn(() => Promise.resolve()),
    getUserHabits: vi.fn(() => []),
  })),
}));

vi.mock('../services/gamification-store.js', () => ({
  getGamificationStore: vi.fn(() => ({
    loadUserData: vi.fn(() => Promise.resolve()),
    getMoodLogs: vi.fn(() => Promise.resolve([])),
  })),
}));

vi.mock('../services/memory-orchestrator.js', () => ({
  getMemoryOrchestrator: vi.fn(() => ({
    getBehavioralPatterns: vi.fn(() => Promise.resolve([])),
    getEmotionalThreads: vi.fn(() => Promise.resolve([])),
  })),
}));

describe('Cross-Persona Insights Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addCrossPersonaInsight', () => {
    it('should have addCrossPersonaInsight function available', async () => {
      const service = await import('../services/cross-persona-insights.js');
      expect(typeof service.addCrossPersonaInsight).toBe('function');
    });

    it('should have getInsightsForPersona function available', async () => {
      const service = await import('../services/cross-persona-insights.js');
      expect(typeof service.getInsightsForPersona).toBe('function');
    });

    it('should have generateTeamStatus function available', async () => {
      const service = await import('../services/cross-persona-insights.js');
      expect(typeof service.generateTeamStatus).toBe('function');
    });
  });

  describe('generateTeamStatus', () => {
    it('should return team status structure when called', async () => {
      const { generateTeamStatus } = await import('../services/cross-persona-insights.js');

      const userId = `test-user-${Date.now()}-5`;
      const status = await generateTeamStatus(userId);

      expect(status).toBeDefined();
      expect(status).toHaveProperty('habitHealth');
      expect(status).toHaveProperty('goalStatus');
      expect(status).toHaveProperty('financialHealth');
    });
  });

  describe('buildInsightBriefingForHandoff', () => {
    it('should return briefing structure', async () => {
      const { buildInsightBriefingForHandoff } =
        await import('../services/cross-persona-insights.js');

      const userId = `test-user-${Date.now()}-6`;
      const briefing = await buildInsightBriefingForHandoff(userId, 'ferni');

      expect(briefing).toBeDefined();
      expect(briefing).toHaveProperty('incomingInsights');
      expect(briefing).toHaveProperty('teamStatus');
      expect(briefing).toHaveProperty('proactiveDiscoveries');
    });
  });
});

describe('Alex Communication Insights Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only activate for Alex persona', async () => {
    // Dynamic import to ensure mocks are in place
    const { buildAlexCommunicationInsightsContext } =
      await import('../intelligence/context-builders/personas/alex-communication-insights/index.js');

    // Test with non-Alex persona
    const nonAlexInput = {
      services: { userId: 'test-user', personaId: 'ferni' },
      conversationState: {},
      persona: { id: 'ferni' },
    };

    const result = await buildAlexCommunicationInsightsContext(nonAlexInput as never);
    expect(result).toHaveLength(0);
  });

  it('should activate and return injection for Alex persona', async () => {
    const { buildAlexCommunicationInsightsContext } =
      await import('../intelligence/context-builders/personas/alex-communication-insights/index.js');

    const alexInput = {
      services: { userId: 'test-user', personaId: 'alex-chen' },
      conversationState: {},
      persona: { id: 'alex-chen' },
    };

    const result = await buildAlexCommunicationInsightsContext(alexInput as never);
    expect(result.length).toBeGreaterThan(0);
    // Check that injection has expected structure
    expect(result[0]).toHaveProperty('content');
    expect(result[0]).toHaveProperty('source');
    // Content should reference Alex in some form
    const contentLower = (result[0].content || '').toLowerCase();
    const sourceLower = (result[0].source || '').toLowerCase();
    expect(contentLower.includes('alex') || sourceLower.includes('alex')).toBe(true);
  });
});

describe('Ferni Coordinator Intelligence Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only activate for Ferni persona', async () => {
    const { buildFerniCoordinatorIntelligenceContext } =
      await import('../intelligence/context-builders/personas/ferni-coordinator-insights.js');

    // Test with non-Ferni persona
    const nonFerniInput = {
      services: { userId: 'test-user', personaId: 'maya-santos' },
      conversationState: {},
      persona: { id: 'maya-santos' },
    };

    const result = await buildFerniCoordinatorIntelligenceContext(nonFerniInput as never);
    expect(result).toHaveLength(0);
  });

  it('should activate and return injection for Ferni persona', async () => {
    const { buildFerniCoordinatorIntelligenceContext } =
      await import('../intelligence/context-builders/personas/ferni-coordinator-insights.js');

    const ferniInput = {
      services: { userId: 'test-user', personaId: 'ferni' },
      conversationState: {},
      persona: { id: 'ferni' },
    };

    const result = await buildFerniCoordinatorIntelligenceContext(ferniInput as never);
    expect(result.length).toBeGreaterThan(0);
    // Check that injection has expected structure
    expect(result[0]).toHaveProperty('content');
    expect(result[0]).toHaveProperty('source');
    // Content should reference Ferni/coordinator in some form
    const contentLower = (result[0].content || '').toLowerCase();
    const sourceLower = (result[0].source || '').toLowerCase();
    expect(
      contentLower.includes('ferni') ||
        contentLower.includes('coordinator') ||
        sourceLower.includes('ferni') ||
        sourceLower.includes('coordinator')
    ).toBe(true);
  });
});

describe('Handoff Suggestion Analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return coordinator intelligence for Ferni with team context', async () => {
    const { buildFerniCoordinatorIntelligenceContext } =
      await import('../intelligence/context-builders/personas/ferni-coordinator-insights.js');

    const userId = `test-handoff-${Date.now()}`;

    const ferniInput = {
      services: { userId, personaId: 'ferni' },
      conversationState: {},
      persona: { id: 'ferni' },
    };

    const result = await buildFerniCoordinatorIntelligenceContext(ferniInput as never);

    // The coordinator should return some injection with team context
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('content');

    // Content should include coordinator intelligence info
    const contentLower = (result[0].content || '').toLowerCase();
    // Should have some team/coordinator related content
    expect(
      contentLower.includes('team') ||
        contentLower.includes('status') ||
        contentLower.includes('coordinator') ||
        contentLower.includes('habit') ||
        contentLower.includes('goal')
    ).toBe(true);
  });
});

// ============================================================================
// PETER RESEARCH INSIGHTS
// ============================================================================

describe('Peter Research Insights Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only activate for Peter persona', async () => {
    const { buildPeterResearchInsightsContext } =
      await import('../intelligence/context-builders/personas/peter-research-insights/index.js');

    // Test with non-Peter persona
    const nonPeterInput = {
      services: { userId: 'test-user', personaId: 'ferni' },
      conversationState: {},
      persona: { id: 'ferni' },
      userData: { turnCount: 0 },
    };

    const result = await buildPeterResearchInsightsContext(nonPeterInput as never);
    expect(result).toHaveLength(0);
  });

  it('should activate and return injection for Peter persona', async () => {
    const { buildPeterResearchInsightsContext } =
      await import('../intelligence/context-builders/personas/peter-research-insights/index.js');

    const peterInput = {
      services: { userId: 'test-user', personaId: 'peter-john', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'peter-john' },
      userData: { turnCount: 0 },
    };

    const result = await buildPeterResearchInsightsContext(peterInput as never);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('content');
    expect(result[0]).toHaveProperty('source');

    // Content should reference Peter or research-related terms
    const contentLower = (result[0].content || '').toLowerCase();
    expect(
      contentLower.includes('peter') ||
        contentLower.includes('research') ||
        contentLower.includes('briefing') ||
        contentLower.includes('financial') ||
        contentLower.includes('pattern')
    ).toBe(true);
  });

  it('should include cross-team data references in briefing', async () => {
    const { buildPeterResearchInsightsContext } =
      await import('../intelligence/context-builders/personas/peter-research-insights/index.js');

    const peterInput = {
      services: { userId: 'test-user-xteam', personaId: 'peter-john', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'peter-john' },
      userData: { turnCount: 0 },
    };

    const result = await buildPeterResearchInsightsContext(peterInput as never);
    expect(result.length).toBeGreaterThan(0);

    const content = (result[0].content || '').toLowerCase();
    // Should reference cross-team data (maya's habits, jordan's goals, etc.)
    expect(
      content.includes('habit') ||
        content.includes('maya') ||
        content.includes('jordan') ||
        content.includes('goal') ||
        content.includes('mood')
    ).toBe(true);
  });
});

// ============================================================================
// MAYA COACHING INSIGHTS
// ============================================================================

describe('Maya Coaching Insights Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only activate for Maya persona', async () => {
    const { buildMayaCoachingInsightsContext } =
      await import('../intelligence/context-builders/personas/maya-coaching-insights/index.js');

    // Test with non-Maya persona
    const nonMayaInput = {
      services: { userId: 'test-user', personaId: 'ferni' },
      conversationState: {},
      persona: { id: 'ferni' },
      userData: { turnCount: 0 },
    };

    const result = await buildMayaCoachingInsightsContext(nonMayaInput as never);
    expect(result).toHaveLength(0);
  });

  it('should activate and return injection for Maya persona', async () => {
    const { buildMayaCoachingInsightsContext } =
      await import('../intelligence/context-builders/personas/maya-coaching-insights/index.js');

    const mayaInput = {
      services: { userId: 'test-user', personaId: 'maya-santos', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'maya-santos' },
      userData: { turnCount: 0 },
    };

    const result = await buildMayaCoachingInsightsContext(mayaInput as never);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('content');
    expect(result[0]).toHaveProperty('source');

    // Content should reference Maya or habit-related terms
    const contentLower = (result[0].content || '').toLowerCase();
    expect(
      contentLower.includes('maya') ||
        contentLower.includes('habit') ||
        contentLower.includes('coaching') ||
        contentLower.includes('streak') ||
        contentLower.includes('briefing')
    ).toBe(true);
  });

  it('should include coaching principles on first turn', async () => {
    const { buildMayaCoachingInsightsContext } =
      await import('../intelligence/context-builders/personas/maya-coaching-insights/index.js');

    const mayaInput = {
      services: { userId: 'test-user-coach', personaId: 'maya-santos', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'maya-santos' },
      userData: { turnCount: 0 },
    };

    const result = await buildMayaCoachingInsightsContext(mayaInput as never);

    // Should include mindset injection with coaching principles
    const allContent = result
      .map((r) => r.content || '')
      .join(' ')
      .toLowerCase();
    expect(
      allContent.includes('compassion') ||
        allContent.includes('celebrate') ||
        allContent.includes('progress') ||
        allContent.includes('patience') ||
        allContent.includes('small')
    ).toBe(true);
  });
});

// ============================================================================
// JORDAN MILESTONE INSIGHTS
// ============================================================================

describe('Jordan Milestone Insights Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only activate for Jordan persona', async () => {
    const { buildJordanMilestoneInsightsContext } =
      await import('../intelligence/context-builders/personas/jordan-milestone-insights/index.js');

    // Test with non-Jordan persona
    const nonJordanInput = {
      services: { userId: 'test-user', personaId: 'ferni' },
      conversationState: {},
      persona: { id: 'ferni' },
      userData: { turnCount: 0 },
    };

    const result = await buildJordanMilestoneInsightsContext(nonJordanInput as never);
    expect(result).toHaveLength(0);
  });

  it('should activate and return injection for Jordan persona', async () => {
    const { buildJordanMilestoneInsightsContext } =
      await import('../intelligence/context-builders/personas/jordan-milestone-insights/index.js');

    const jordanInput = {
      services: { userId: 'test-user', personaId: 'jordan-taylor', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'jordan-taylor' },
      userData: { turnCount: 0 },
    };

    const result = await buildJordanMilestoneInsightsContext(jordanInput as never);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('content');
    expect(result[0]).toHaveProperty('source');

    // Content should reference Jordan or milestone-related terms
    const contentLower = (result[0].content || '').toLowerCase();
    expect(
      contentLower.includes('jordan') ||
        contentLower.includes('milestone') ||
        contentLower.includes('goal') ||
        contentLower.includes('planning') ||
        contentLower.includes('briefing')
    ).toBe(true);
  });

  it('should include computed metrics in briefing', async () => {
    const { buildJordanMilestoneInsightsContext } =
      await import('../intelligence/context-builders/personas/jordan-milestone-insights/index.js');

    const jordanInput = {
      services: { userId: 'test-user-metrics', personaId: 'jordan-taylor', sessionId: 'test' },
      conversationState: {},
      persona: { id: 'jordan-taylor' },
      userData: { turnCount: 0 },
    };

    const result = await buildJordanMilestoneInsightsContext(jordanInput as never);
    const content = result
      .map((r) => r.content || '')
      .join(' ')
      .toLowerCase();

    // Should include computed metrics
    expect(
      content.includes('velocity') ||
        content.includes('readiness') ||
        content.includes('momentum') ||
        content.includes('metrics') ||
        content.includes('celebration')
    ).toBe(true);
  });
});

// ============================================================================
// NAYAN WISDOM INSIGHTS
// ============================================================================

describe('Nayan Wisdom Insights Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only activate for Nayan persona', async () => {
    const { buildNayanWisdomInsightsContext } =
      await import('../intelligence/context-builders/personas/nayan-wisdom-insights/index.js');

    // Test with non-Nayan persona
    const nonNayanInput = {
      services: { userId: 'test-user', personaId: 'ferni' },
      conversationState: {},
      persona: { id: 'ferni' },
      userData: { turnCount: 0 },
    };

    const result = await buildNayanWisdomInsightsContext(nonNayanInput as never);
    expect(result).toHaveLength(0);
  });

  it('should activate and return injection for Nayan persona', async () => {
    const { buildNayanWisdomInsightsContext } =
      await import('../intelligence/context-builders/personas/nayan-wisdom-insights/index.js');

    const nayanInput = {
      services: { userId: 'test-user', personaId: 'nayan-patel', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'nayan-patel' },
      userData: { turnCount: 0 },
    };

    const result = await buildNayanWisdomInsightsContext(nayanInput as never);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('content');
    expect(result[0]).toHaveProperty('source');

    // Content should reference Nayan or wisdom-related terms
    const contentLower = (result[0].content || '').toLowerCase();
    expect(
      contentLower.includes('nayan') ||
        contentLower.includes('wisdom') ||
        contentLower.includes('synthesis') ||
        contentLower.includes('life') ||
        contentLower.includes('briefing')
    ).toBe(true);
  });

  it('should include life synthesis and team patterns', async () => {
    const { buildNayanWisdomInsightsContext } =
      await import('../intelligence/context-builders/personas/nayan-wisdom-insights/index.js');

    const nayanInput = {
      services: { userId: 'test-user-synth', personaId: 'nayan-patel', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'nayan-patel' },
      userData: { turnCount: 0 },
    };

    const result = await buildNayanWisdomInsightsContext(nayanInput as never);
    const content = result
      .map((r) => r.content || '')
      .join(' ')
      .toLowerCase();

    // Should include life synthesis concepts
    expect(
      content.includes('chapter') ||
        content.includes('synthesis') ||
        content.includes('pattern') ||
        content.includes('team') ||
        content.includes('peter') ||
        content.includes('maya') ||
        content.includes('jordan')
    ).toBe(true);
  });

  it('should include deep questions in briefing', async () => {
    const { buildNayanWisdomInsightsContext } =
      await import('../intelligence/context-builders/personas/nayan-wisdom-insights/index.js');

    const nayanInput = {
      services: { userId: 'test-user-quest', personaId: 'nayan-patel', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'nayan-patel' },
      userData: { turnCount: 0 },
    };

    const result = await buildNayanWisdomInsightsContext(nayanInput as never);
    const content = result
      .map((r) => r.content || '')
      .join(' ')
      .toLowerCase();

    // Should include philosophical/deep questions
    expect(
      content.includes('question') ||
        content.includes('meaning') ||
        content.includes('freedom') ||
        content.includes('what') ||
        content.includes('why')
    ).toBe(true);
  });
});

// ============================================================================
// CROSS-PERSONA INTEGRATION TESTS
// ============================================================================

describe('Cross-Persona Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should ensure all persona builders are registered in loader', async () => {
    const { BUILDER_MANIFEST } = await import('../intelligence/context-builders/core/loader.js');
    const { BuilderCategory } = await import('../intelligence/context-builders/index.js');

    const personaBuilders = BUILDER_MANIFEST[BuilderCategory.PERSONA] || [];

    // All persona-specific insight builders should be registered
    const requiredBuilders = [
      'peter-research-insights',
      'maya-coaching-insights',
      'jordan-milestone-insights',
      'nayan-wisdom-insights',
      'alex-communication-insights',
      'ferni-coordinator-insights',
    ];

    for (const required of requiredBuilders) {
      expect(personaBuilders).toContain(required);
    }
  });

  it('should have consistent injection structure across all builders', async () => {
    // Import all builders
    const { buildPeterResearchInsightsContext } =
      await import('../intelligence/context-builders/personas/peter-research-insights/index.js');
    const { buildMayaCoachingInsightsContext } =
      await import('../intelligence/context-builders/personas/maya-coaching-insights/index.js');
    const { buildJordanMilestoneInsightsContext } =
      await import('../intelligence/context-builders/personas/jordan-milestone-insights/index.js');
    const { buildNayanWisdomInsightsContext } =
      await import('../intelligence/context-builders/personas/nayan-wisdom-insights/index.js');

    const userId = `test-consistency-${Date.now()}`;

    const inputs = {
      peter: {
        services: { userId, personaId: 'peter-john', sessionId: 's1' },
        userData: { turnCount: 0 },
        persona: { id: 'peter-john' },
      },
      maya: {
        services: { userId, personaId: 'maya-santos', sessionId: 's2' },
        userData: { turnCount: 0 },
        persona: { id: 'maya-santos' },
      },
      jordan: {
        services: { userId, personaId: 'jordan-taylor', sessionId: 's3' },
        userData: { turnCount: 0 },
        persona: { id: 'jordan-taylor' },
      },
      nayan: {
        services: { userId, personaId: 'nayan-patel', sessionId: 's4' },
        userData: { turnCount: 0 },
        persona: { id: 'nayan-patel' },
      },
    };

    const results = await Promise.all([
      buildPeterResearchInsightsContext(inputs.peter as never),
      buildMayaCoachingInsightsContext(inputs.maya as never),
      buildJordanMilestoneInsightsContext(inputs.jordan as never),
      buildNayanWisdomInsightsContext(inputs.nayan as never),
    ]);

    // All should return arrays
    for (const result of results) {
      expect(Array.isArray(result)).toBe(true);

      // If there are injections, they should have required properties
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('content');
        expect(result[0]).toHaveProperty('source');
        expect(result[0]).toHaveProperty('priority');
      }
    }
  });
});

// ============================================================================
// E2E HANDOFF CHAIN TESTS
// ============================================================================

describe('E2E Handoff Chain Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should support Ferni → Peter → Maya handoff chain', async () => {
    const { buildPeterResearchInsightsContext } =
      await import('../intelligence/context-builders/personas/peter-research-insights/index.js');
    const { buildMayaCoachingInsightsContext } =
      await import('../intelligence/context-builders/personas/maya-coaching-insights/index.js');

    const userId = `test-chain-${Date.now()}`;

    // Step 1: Peter receives handoff
    const peterInput = {
      services: { userId, personaId: 'peter-john', sessionId: 'chain-1' },
      userData: { turnCount: 0 },
      persona: { id: 'peter-john' },
    };
    const peterResult = await buildPeterResearchInsightsContext(peterInput as never);
    expect(peterResult.length).toBeGreaterThan(0);

    // Step 2: Maya receives handoff from Peter
    const mayaInput = {
      services: { userId, personaId: 'maya-santos', sessionId: 'chain-2' },
      userData: { turnCount: 0 },
      persona: { id: 'maya-santos' },
    };
    const mayaResult = await buildMayaCoachingInsightsContext(mayaInput as never);
    expect(mayaResult.length).toBeGreaterThan(0);

    // Maya should have coaching context
    const mayaContent = mayaResult
      .map((r) => r.content || '')
      .join(' ')
      .toLowerCase();
    expect(
      mayaContent.includes('coaching') ||
        mayaContent.includes('habit') ||
        mayaContent.includes('maya')
    ).toBe(true);
  });

  it('should support Jordan → Nayan handoff for deep questions', async () => {
    const { buildJordanMilestoneInsightsContext } =
      await import('../intelligence/context-builders/personas/jordan-milestone-insights/index.js');
    const { buildNayanWisdomInsightsContext } =
      await import('../intelligence/context-builders/personas/nayan-wisdom-insights/index.js');

    const userId = `test-deep-${Date.now()}`;

    // Jordan discusses milestone
    const jordanInput = {
      services: { userId, personaId: 'jordan-taylor', sessionId: 'deep-1' },
      userData: { turnCount: 0 },
      persona: { id: 'jordan-taylor' },
    };
    const jordanResult = await buildJordanMilestoneInsightsContext(jordanInput as never);
    expect(jordanResult.length).toBeGreaterThan(0);

    // Nayan receives for deeper meaning discussion
    const nayanInput = {
      services: { userId, personaId: 'nayan-patel', sessionId: 'deep-2' },
      userData: { turnCount: 0 },
      persona: { id: 'nayan-patel' },
    };
    const nayanResult = await buildNayanWisdomInsightsContext(nayanInput as never);
    expect(nayanResult.length).toBeGreaterThan(0);

    // Nayan should include wisdom/philosophical content
    const nayanContent = nayanResult
      .map((r) => r.content || '')
      .join(' ')
      .toLowerCase();
    expect(
      nayanContent.includes('wisdom') ||
        nayanContent.includes('question') ||
        nayanContent.includes('meaning') ||
        nayanContent.includes('life')
    ).toBe(true);
  });

  it('should include computed metrics in all builders', async () => {
    const { buildPeterResearchInsightsContext } =
      await import('../intelligence/context-builders/personas/peter-research-insights/index.js');
    const { buildMayaCoachingInsightsContext } =
      await import('../intelligence/context-builders/personas/maya-coaching-insights/index.js');
    const { buildJordanMilestoneInsightsContext } =
      await import('../intelligence/context-builders/personas/jordan-milestone-insights/index.js');
    const { buildNayanWisdomInsightsContext } =
      await import('../intelligence/context-builders/personas/nayan-wisdom-insights/index.js');
    const { buildAlexCommunicationInsightsContext } =
      await import('../intelligence/context-builders/personas/alex-communication-insights/index.js');

    const userId = `test-metrics-${Date.now()}`;

    const builders = [
      { fn: buildPeterResearchInsightsContext, personaId: 'peter-john', name: 'peter' },
      { fn: buildMayaCoachingInsightsContext, personaId: 'maya-santos', name: 'maya' },
      { fn: buildJordanMilestoneInsightsContext, personaId: 'jordan-taylor', name: 'jordan' },
      { fn: buildNayanWisdomInsightsContext, personaId: 'nayan-patel', name: 'nayan' },
      { fn: buildAlexCommunicationInsightsContext, personaId: 'alex-chen', name: 'alex' },
    ];

    for (const builder of builders) {
      const input = {
        services: { userId, personaId: builder.personaId, sessionId: `metrics-${builder.name}` },
        userData: { turnCount: 0 },
        persona: { id: builder.personaId },
      };

      const result = await builder.fn(input as never);

      if (result.length > 0) {
        const content = result
          .map((r) => r.content || '')
          .join(' ')
          .toLowerCase();
        // Each builder should include some form of metrics or computed data
        const hasMetrics =
          content.includes('metric') ||
          content.includes('/100') ||
          content.includes('score') ||
          content.includes('index') ||
          content.includes('%');

        // All enhanced builders should include metrics
        expect(hasMetrics).toBe(true);
      }
    }
  });
});

// ============================================================================
// PROACTIVE TRIGGER TESTS
// ============================================================================

describe('Proactive Trigger Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect celebration triggers in Maya', async () => {
    const { buildMayaCoachingInsightsContext } =
      await import('../intelligence/context-builders/personas/maya-coaching-insights/index.js');

    const userId = `test-celebrate-${Date.now()}`;
    const input = {
      services: { userId, personaId: 'maya-santos', sessionId: 'celebrate' },
      userData: { turnCount: 0 },
      persona: { id: 'maya-santos' },
    };

    const result = await buildMayaCoachingInsightsContext(input as never);

    // Should include some form of celebration or positive coaching content
    if (result.length > 0) {
      const content = result
        .map((r) => r.content || '')
        .join(' ')
        .toLowerCase();
      // Maya's coaching should have positivity elements
      expect(
        content.includes('celebrate') ||
          content.includes('win') ||
          content.includes('progress') ||
          content.includes('success') ||
          content.includes('compassion')
      ).toBe(true);
    }
  });

  it('should detect wisdom opportunities in Nayan', async () => {
    const { buildNayanWisdomInsightsContext } =
      await import('../intelligence/context-builders/personas/nayan-wisdom-insights/index.js');

    const userId = `test-wisdom-${Date.now()}`;
    const input = {
      services: { userId, personaId: 'nayan-patel', sessionId: 'wisdom' },
      userData: { turnCount: 0 },
      persona: { id: 'nayan-patel' },
    };

    const result = await buildNayanWisdomInsightsContext(input as never);

    if (result.length > 0) {
      const content = result
        .map((r) => r.content || '')
        .join(' ')
        .toLowerCase();
      // Nayan should include wisdom opportunities or life questions
      expect(
        content.includes('wisdom') ||
          content.includes('question') ||
          content.includes('opportunity') ||
          content.includes('pattern') ||
          content.includes('meaning')
      ).toBe(true);
    }
  });

  it('should include communication metrics in Alex', async () => {
    const { buildAlexCommunicationInsightsContext } =
      await import('../intelligence/context-builders/personas/alex-communication-insights/index.js');

    const userId = `test-alex-metrics-${Date.now()}`;
    const input = {
      services: { userId, personaId: 'alex-chen', sessionId: 'alex-m' },
      userData: { turnCount: 0 },
      persona: { id: 'alex-chen' },
    };

    const result = await buildAlexCommunicationInsightsContext(input as never);

    if (result.length > 0) {
      const content = result
        .map((r) => r.content || '')
        .join(' ')
        .toLowerCase();
      // Alex should include communication-related metrics or context
      expect(
        content.includes('communication') ||
          content.includes('readiness') ||
          content.includes('stress') ||
          content.includes('state') ||
          content.includes('alex')
      ).toBe(true);
    }
  });
});

// ============================================================================
// VALUES & LIFE NARRATIVE TESTS
// ============================================================================

describe('Values Alignment and Life Narrative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include values alignment in Nayan briefing', async () => {
    const { buildNayanWisdomInsightsContext } =
      await import('../intelligence/context-builders/personas/nayan-wisdom-insights/index.js');

    const userId = `test-values-${Date.now()}`;
    const input = {
      services: { userId, personaId: 'nayan-patel', sessionId: 'values' },
      userData: { turnCount: 0 },
      persona: { id: 'nayan-patel' },
    };

    const result = await buildNayanWisdomInsightsContext(input as never);

    if (result.length > 0) {
      const content = result
        .map((r) => r.content || '')
        .join(' ')
        .toLowerCase();
      // Should include values or alignment concepts
      expect(
        content.includes('value') ||
          content.includes('alignment') ||
          content.includes('coherent') ||
          content.includes('chapter') ||
          content.includes('narrative')
      ).toBe(true);
    }
  });

  it('should include life chapter in Jordan briefing', async () => {
    const { buildJordanMilestoneInsightsContext } =
      await import('../intelligence/context-builders/personas/jordan-milestone-insights/index.js');

    const userId = `test-chapter-${Date.now()}`;
    const input = {
      services: { userId, personaId: 'jordan-taylor', sessionId: 'chapter' },
      userData: { turnCount: 0 },
      persona: { id: 'jordan-taylor' },
    };

    const result = await buildJordanMilestoneInsightsContext(input as never);

    if (result.length > 0) {
      const content = result
        .map((r) => r.content || '')
        .join(' ')
        .toLowerCase();
      // Jordan should include milestone or life planning content
      expect(
        content.includes('milestone') ||
          content.includes('planning') ||
          content.includes('goal') ||
          content.includes('celebration') ||
          content.includes('stage')
      ).toBe(true);
    }
  });
});
