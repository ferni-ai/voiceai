/**
 * Cross-Persona Insights System - Unit Tests
 *
 * Tests for the new cross-persona insights system:
 * - alex-communication-insights.ts
 * - ferni-coordinator-intelligence.ts
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
      const { buildInsightBriefingForHandoff } = await import(
        '../services/cross-persona-insights.js'
      );

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
    const { buildAlexCommunicationInsightsContext } = await import(
      '../intelligence/context-builders/alex-communication-insights.js'
    );

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
    const { buildAlexCommunicationInsightsContext } = await import(
      '../intelligence/context-builders/alex-communication-insights.js'
    );

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
    const { buildFerniCoordinatorIntelligenceContext } = await import(
      '../intelligence/context-builders/ferni-coordinator-intelligence.js'
    );

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
    const { buildFerniCoordinatorIntelligenceContext } = await import(
      '../intelligence/context-builders/ferni-coordinator-intelligence.js'
    );

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
    expect(contentLower.includes('ferni') || contentLower.includes('coordinator') || sourceLower.includes('ferni') || sourceLower.includes('coordinator')).toBe(true);
  });
});

describe('Handoff Suggestion Analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return coordinator intelligence for Ferni with team context', async () => {
    const { buildFerniCoordinatorIntelligenceContext } = await import(
      '../intelligence/context-builders/ferni-coordinator-intelligence.js'
    );

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
    const { buildPeterResearchInsightsContext } = await import(
      '../intelligence/context-builders/peter-research-insights.js'
    );

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
    const { buildPeterResearchInsightsContext } = await import(
      '../intelligence/context-builders/peter-research-insights.js'
    );

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
    const { buildPeterResearchInsightsContext } = await import(
      '../intelligence/context-builders/peter-research-insights.js'
    );

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
    const { buildMayaCoachingInsightsContext } = await import(
      '../intelligence/context-builders/maya-coaching-insights.js'
    );

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
    const { buildMayaCoachingInsightsContext } = await import(
      '../intelligence/context-builders/maya-coaching-insights.js'
    );

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
    const { buildMayaCoachingInsightsContext } = await import(
      '../intelligence/context-builders/maya-coaching-insights.js'
    );

    const mayaInput = {
      services: { userId: 'test-user-coach', personaId: 'maya-santos', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'maya-santos' },
      userData: { turnCount: 0 },
    };

    const result = await buildMayaCoachingInsightsContext(mayaInput as never);

    // Should include mindset injection with coaching principles
    const allContent = result.map((r) => r.content || '').join(' ').toLowerCase();
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
    const { buildJordanMilestoneInsightsContext } = await import(
      '../intelligence/context-builders/jordan-milestone-insights.js'
    );

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
    const { buildJordanMilestoneInsightsContext } = await import(
      '../intelligence/context-builders/jordan-milestone-insights.js'
    );

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
    const { buildJordanMilestoneInsightsContext } = await import(
      '../intelligence/context-builders/jordan-milestone-insights.js'
    );

    const jordanInput = {
      services: { userId: 'test-user-metrics', personaId: 'jordan-taylor', sessionId: 'test' },
      conversationState: {},
      persona: { id: 'jordan-taylor' },
      userData: { turnCount: 0 },
    };

    const result = await buildJordanMilestoneInsightsContext(jordanInput as never);
    const content = result.map((r) => r.content || '').join(' ').toLowerCase();

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
    const { buildNayanWisdomInsightsContext } = await import(
      '../intelligence/context-builders/nayan-wisdom-insights.js'
    );

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
    const { buildNayanWisdomInsightsContext } = await import(
      '../intelligence/context-builders/nayan-wisdom-insights.js'
    );

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
    const { buildNayanWisdomInsightsContext } = await import(
      '../intelligence/context-builders/nayan-wisdom-insights.js'
    );

    const nayanInput = {
      services: { userId: 'test-user-synth', personaId: 'nayan-patel', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'nayan-patel' },
      userData: { turnCount: 0 },
    };

    const result = await buildNayanWisdomInsightsContext(nayanInput as never);
    const content = result.map((r) => r.content || '').join(' ').toLowerCase();

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
    const { buildNayanWisdomInsightsContext } = await import(
      '../intelligence/context-builders/nayan-wisdom-insights.js'
    );

    const nayanInput = {
      services: { userId: 'test-user-quest', personaId: 'nayan-patel', sessionId: 'test-session' },
      conversationState: {},
      persona: { id: 'nayan-patel' },
      userData: { turnCount: 0 },
    };

    const result = await buildNayanWisdomInsightsContext(nayanInput as never);
    const content = result.map((r) => r.content || '').join(' ').toLowerCase();

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
    const { BUILDER_MANIFEST } = await import(
      '../intelligence/context-builders/loader.js'
    );
    const { BuilderCategory } = await import(
      '../intelligence/context-builders/index.js'
    );

    const personaBuilders = BUILDER_MANIFEST[BuilderCategory.PERSONA] || [];

    // All persona-specific insight builders should be registered
    const requiredBuilders = [
      'peter-research-insights',
      'maya-coaching-insights',
      'jordan-milestone-insights',
      'nayan-wisdom-insights',
      'alex-communication-insights',
      'ferni-coordinator-intelligence',
    ];

    for (const required of requiredBuilders) {
      expect(personaBuilders).toContain(required);
    }
  });

  it('should have consistent injection structure across all builders', async () => {
    // Import all builders
    const { buildPeterResearchInsightsContext } = await import(
      '../intelligence/context-builders/peter-research-insights.js'
    );
    const { buildMayaCoachingInsightsContext } = await import(
      '../intelligence/context-builders/maya-coaching-insights.js'
    );
    const { buildJordanMilestoneInsightsContext } = await import(
      '../intelligence/context-builders/jordan-milestone-insights.js'
    );
    const { buildNayanWisdomInsightsContext } = await import(
      '../intelligence/context-builders/nayan-wisdom-insights.js'
    );

    const userId = `test-consistency-${Date.now()}`;

    const inputs = {
      peter: { services: { userId, personaId: 'peter-john', sessionId: 's1' }, userData: { turnCount: 0 }, persona: { id: 'peter-john' } },
      maya: { services: { userId, personaId: 'maya-santos', sessionId: 's2' }, userData: { turnCount: 0 }, persona: { id: 'maya-santos' } },
      jordan: { services: { userId, personaId: 'jordan-taylor', sessionId: 's3' }, userData: { turnCount: 0 }, persona: { id: 'jordan-taylor' } },
      nayan: { services: { userId, personaId: 'nayan-patel', sessionId: 's4' }, userData: { turnCount: 0 }, persona: { id: 'nayan-patel' } },
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

