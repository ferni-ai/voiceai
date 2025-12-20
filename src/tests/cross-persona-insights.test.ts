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

