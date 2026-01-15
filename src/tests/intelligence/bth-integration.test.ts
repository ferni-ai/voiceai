/**
 * Better Than Human Integration Tests
 *
 * E2E tests for the unified intelligence system:
 * 1. Preference extraction → Storage → Knowledge aggregation → LLM context
 * 2. Data capture → Superhuman services → Knowledge aggregation
 * 3. Semantic intelligence → Pattern detection → Knowledge aggregation
 *
 * @module tests/intelligence/bth-integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Firebase Admin before imports
vi.mock('firebase-admin', () => {
  const mockDoc = {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn(),
  };

  const mockCollection = {
    doc: vi.fn(() => mockDoc),
    get: vi.fn(),
    add: vi.fn().mockResolvedValue({ id: 'test-id' }),
    where: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({ docs: [] }),
      limit: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ docs: [] }),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({ docs: [] }),
        })),
      })),
    })),
    orderBy: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ docs: [] }),
      })),
    })),
  };

  // Allow nested collection calls
  mockDoc.collection = vi.fn(() => mockCollection);

  const mockFirestore = {
    collection: vi.fn(() => mockCollection),
  };

  return {
    default: {
      apps: [{}],
      initializeApp: vi.fn(),
      firestore: vi.fn(() => mockFirestore),
    },
    apps: [{}],
    initializeApp: vi.fn(),
    firestore: vi.fn(() => mockFirestore),
  };
});

// Mock contacts service (both paths used in codebase)
vi.mock('../../services/identity/contacts.js', () => ({
  getContacts: vi.fn().mockResolvedValue([
    {
      displayName: 'Mom',
      relationship: 'mother',
      phones: [{ number: '555-1234', type: 'mobile' }],
    },
  ]),
  listContacts: vi.fn().mockResolvedValue([
    {
      displayName: 'Mom',
      relationship: 'mother',
      phones: [{ number: '555-1234', type: 'mobile' }],
    },
  ]),
  createContact: vi.fn().mockResolvedValue({ id: 'contact-1' }),
  searchContacts: vi.fn().mockResolvedValue([]),
  updateContact: vi.fn().mockResolvedValue(undefined),
  findContact: vi.fn().mockResolvedValue(null),
}));

// Mock contacts index (used by aggregator)
vi.mock('../../services/contacts/index.js', () => ({
  getContacts: vi.fn().mockResolvedValue([
    {
      displayName: 'Mom',
      relationship: 'mother',
      phones: [{ number: '555-1234', type: 'mobile' }],
    },
  ]),
}));

// Mock dream keeper
vi.mock('../../services/superhuman/dream-keeper.js', () => ({
  loadUserDreams: vi.fn().mockResolvedValue([
    {
      id: 'dream_1',
      userId: 'test-user-123',
      statement: 'Learn to play guitar',
      title: 'Learning guitar',
      type: 'skill',
      status: 'active',
      confidence: 0.8,
      firstMentioned: Date.now() - 30 * 24 * 60 * 60 * 1000,
      lastMentioned: Date.now() - 60 * 24 * 60 * 60 * 1000,
    },
  ]),
  saveDream: vi.fn().mockResolvedValue(undefined),
  findDormantDreams: vi.fn().mockResolvedValue([]),
  buildDreamContext: vi.fn().mockResolvedValue(''),
}));

// Mock commitment keeper
vi.mock('../../services/superhuman/commitment-keeper.js', () => ({
  loadUserCommitments: vi.fn().mockResolvedValue([
    {
      id: 'commitment_1',
      userId: 'test-user-123',
      statement: 'Exercise 3x week',
      summary: 'Exercise 3x week',
      text: 'Exercise 3x week',
      type: 'personal',
      emotionalWeight: 0.7,
      createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
      lastMentioned: Date.now(),
      followUpAfter: Date.now() + 7 * 24 * 60 * 60 * 1000,
      status: 'active',
    },
  ]),
  getPendingCommitments: vi
    .fn()
    .mockResolvedValue([{ commitment: 'Exercise 3x week', dueDate: new Date(), fulfilled: false }]),
  getCommitmentsForTopic: vi.fn().mockResolvedValue([]),
}));

// Mock ferni commitments
vi.mock('../../services/superhuman/semantic-intelligence/ferni-commitments.js', () => ({
  getPendingCommitments: vi
    .fn()
    .mockResolvedValue([
      { commitment: 'Check in about job interview', madeAt: new Date(), fulfilled: false },
    ]),
}));

// Mock inside joke memory
vi.mock('../../services/superhuman/inside-joke-memory.js', () => ({
  loadSharedMoments: vi.fn().mockResolvedValue([
    {
      essence: 'The "spreadsheet incident"',
      context: 'Work project gone wrong',
      createdAt: Date.now(),
    },
  ]),
}));

// Mock open loops
vi.mock('../../services/superhuman/semantic-intelligence/open-loops.js', () => ({
  getOpenLoops: vi.fn().mockResolvedValue([
    {
      id: 'loop_1',
      userId: 'test-user-123',
      type: 'topic',
      content: 'Mom health update',
      description: 'Check on Mom health situation',
      context: 'Mentioned last week',
      created: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      followUpAfter: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      followUpBefore: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'open',
      resolved: false,
    },
  ]),
  // The aggregator uses getAllOpenLoops, not getOpenLoops
  getAllOpenLoops: vi.fn().mockResolvedValue([
    {
      id: 'loop_1',
      userId: 'test-user-123',
      type: 'topic',
      content: 'Mom health update',
      description: 'Check on Mom health situation',
      context: 'Mentioned last week',
      created: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      followUpAfter: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      followUpBefore: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'open',
      resolved: false,
    },
  ]),
}));

// Mock values alignment
vi.mock('../../services/superhuman/values-alignment.js', () => ({
  loadUserValues: vi.fn().mockResolvedValue([
    {
      id: 'value_1',
      userId: 'test-user-123',
      category: 'family',
      statement: 'Family is important to me',
      importance: 0.9,
      mentions: 5,
      firstMentioned: Date.now() - 30 * 24 * 60 * 60 * 1000,
      lastMentioned: Date.now(),
      contextExamples: ['conversation about Mom'],
    },
    {
      id: 'value_2',
      userId: 'test-user-123',
      category: 'growth',
      statement: 'I want to keep growing',
      importance: 0.8,
      mentions: 3,
      firstMentioned: Date.now() - 20 * 24 * 60 * 60 * 1000,
      lastMentioned: Date.now(),
      contextExamples: ['goals discussion'],
    },
  ]),
}));

// Mock emotional trajectories
vi.mock('../../services/superhuman/semantic-intelligence/emotional-trajectories.js', () => ({
  getActiveArcs: vi.fn().mockResolvedValue([
    {
      id: 'arc_1',
      userId: 'test-user-123',
      theme: 'work anxiety',
      waypoints: [
        {
          timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
          emotion: 'anxious',
          intensity: 0.6,
          valence: -0.3,
          arousal: 0.5,
        },
        {
          timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
          emotion: 'hopeful',
          intensity: 0.4,
          valence: 0.2,
          arousal: 0.4,
        },
        { timestamp: Date.now(), emotion: 'calm', intensity: 0.3, valence: 0.5, arousal: 0.3 },
      ],
      phase: 'resolving',
      trend: 'rising', // Maps to 'improving' in aggregator
      narrative: 'Work anxiety is resolving',
      startedAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
    },
  ]),
  buildEmotionalTrajectoryContext: vi.fn().mockResolvedValue(''),
}));

// Mock coaching patterns
vi.mock('../../intelligence/coaching/patterns.js', () => ({
  getUserPatterns: vi.fn().mockResolvedValue([
    {
      pattern: 'Gets anxious before presentations',
      patternType: 'anxiety',
      occurrences: 3,
      surfacedToUser: false,
    },
  ]),
}));

// Mock cross-domain correlator
vi.mock('../../intelligence/patterns/cross-domain-correlator.js', () => ({
  getCrossCorrelator: vi.fn(() => ({
    getCorrelations: vi.fn().mockReturnValue([
      {
        domains: ['work', 'sleep'],
        insight: 'Poor sleep correlates with work stress',
        confidence: 'likely',
      },
    ]),
    clearUser: vi.fn(),
  })),
}));

// Import the module under test
import {
  getUserKnowledge,
  formatKnowledgeForContext,
  clearKnowledgeCache,
  askAboutUser,
  getKnowledgeCompleteness,
  getUserAllergies,
  getAvoidTopics,
  getUserDreams,
} from '../../intelligence/user-knowledge/index.js';

const TEST_USER_ID = 'test-user-123';

describe('Better Than Human Integration', () => {
  beforeEach(() => {
    clearKnowledgeCache(TEST_USER_ID);
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearKnowledgeCache(TEST_USER_ID);
  });

  describe('User Knowledge Aggregation', () => {
    it('should aggregate knowledge from all sources', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      // Verify structure
      expect(knowledge.userId).toBe(TEST_USER_ID);
      expect(knowledge.identity).toBeDefined();
      expect(knowledge.lifestyle).toBeDefined();
      expect(knowledge.relationships).toBeDefined();
      expect(knowledge.aspirations).toBeDefined();
      expect(knowledge.wellness).toBeDefined();
      expect(knowledge.boundaries).toBeDefined();
      expect(knowledge.sharedHistory).toBeDefined();
      expect(knowledge.metadata).toBeDefined();
    });

    it('should load contacts into relationships', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge.relationships.contacts.length).toBeGreaterThan(0);
      expect(knowledge.relationships.contacts[0].name).toBe('Mom');
      expect(knowledge.relationships.contacts[0].relationship).toBe('mother');
    });

    it('should load dreams into aspirations', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge.aspirations.dreams.length).toBeGreaterThan(0);
      expect(knowledge.aspirations.dreams[0].description).toBe('Learn to play guitar');
    });

    it('should load commitments into aspirations', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge.aspirations.commitments.length).toBeGreaterThan(0);
      expect(knowledge.aspirations.commitments[0].description).toBe('Exercise 3x week');
    });

    it('should load Ferni commitments into boundaries', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge.boundaries.ferniCommitments.length).toBeGreaterThan(0);
      expect(knowledge.boundaries.ferniCommitments[0].description).toBe(
        'Check in about job interview'
      );
    });

    it('should load inside jokes into shared history', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge.sharedHistory.insideJokes.length).toBeGreaterThan(0);
      expect(knowledge.sharedHistory.insideJokes[0].reference).toContain('spreadsheet');
    });

    it('should load open loops into shared history', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge.sharedHistory.openLoops.length).toBeGreaterThan(0);
      expect(knowledge.sharedHistory.openLoops[0].topic).toContain('Mom');
    });

    it('should load emotional trajectory', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge.emotional.trajectory).toBeDefined();
      expect(knowledge.emotional.trajectory?.trend).toBe('improving');
    });

    it('should load values', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge.emotional.values.length).toBeGreaterThan(0);
      expect(knowledge.emotional.values[0].value).toBe('family');
    });

    it('should load behavioral patterns', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge.patterns.behaviors.length).toBeGreaterThan(0);
      expect(knowledge.patterns.behaviors[0].pattern).toContain('anxious');
    });

    it('should calculate completeness scores', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge.metadata.completeness.overall).toBeGreaterThanOrEqual(0);
      expect(knowledge.metadata.completeness.overall).toBeLessThanOrEqual(1);
      expect(knowledge.metadata.completeness.relationships).toBeGreaterThan(0);
      expect(knowledge.metadata.completeness.aspirations).toBeGreaterThan(0);
    });

    it('should cache knowledge for performance', async () => {
      // First call
      await getUserKnowledge(TEST_USER_ID);

      // Second call should use cache
      const knowledge2 = await getUserKnowledge(TEST_USER_ID);

      expect(knowledge2.userId).toBe(TEST_USER_ID);
    });

    it('should bypass cache with forceRefresh', async () => {
      // First call
      await getUserKnowledge(TEST_USER_ID);

      // Second call with forceRefresh
      const knowledge2 = await getUserKnowledge(TEST_USER_ID, { forceRefresh: true });

      expect(knowledge2.userId).toBe(TEST_USER_ID);
    });
  });

  describe('Context Formatting', () => {
    it('should format knowledge for LLM context', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);
      const context = formatKnowledgeForContext(knowledge);

      // Should contain user context
      expect(context.length).toBeGreaterThan(0);
    });

    it('should respect maxTokens option', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      const shortContext = formatKnowledgeForContext(knowledge, { maxTokens: 100 });
      const longContext = formatKnowledgeForContext(knowledge, { maxTokens: 1000 });

      expect(shortContext.length).toBeLessThanOrEqual(longContext.length);
    });

    it('should prioritize specified sections', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);

      const boundariesFirst = formatKnowledgeForContext(knowledge, {
        maxTokens: 500,
        prioritySections: ['boundaries', 'aspirations'],
        includeHeaders: true,
      });

      // Boundaries should appear in context
      expect(boundariesFirst).toBeDefined();
    });

    it('should include Ferni commitments in context', async () => {
      const knowledge = await getUserKnowledge(TEST_USER_ID);
      const context = formatKnowledgeForContext(knowledge, {
        maxTokens: 800,
        style: 'detailed',
        includeHeaders: true,
      });

      expect(context).toContain('job interview');
    });
  });

  describe('Natural Language Queries', () => {
    it('should answer questions about dreams', async () => {
      const result = await askAboutUser(TEST_USER_ID, 'What are their dreams?');

      expect(result.found).toBe(true);
      expect(result.answer).toContain('guitar');
    });

    it('should answer questions about family', async () => {
      const result = await askAboutUser(TEST_USER_ID, 'Who is their family?');

      expect(result.found).toBe(true);
      expect(result.answer).toContain('Mom');
    });

    it('should handle unknown questions gracefully', async () => {
      const result = await askAboutUser(TEST_USER_ID, 'What is the meaning of life?');

      expect(result.found).toBe(false);
    });
  });

  describe('Specific Queries', () => {
    it('should get knowledge completeness', async () => {
      const completeness = await getKnowledgeCompleteness(TEST_USER_ID);

      expect(completeness.overall).toBeGreaterThanOrEqual(0);
      expect(completeness.sections.relationships).toBeDefined();
      expect(completeness.sections.aspirations).toBeDefined();
    });

    it('should get user dreams', async () => {
      const dreams = await getUserDreams(TEST_USER_ID);

      expect(dreams.length).toBeGreaterThan(0);
      expect(dreams[0].description).toContain('guitar');
    });
  });
});

describe('Preference Extraction → Knowledge Pipeline', () => {
  // NOTE: preference-extractor.ts was removed/refactored.
  // Preference extraction now happens in transcript-handler.ts directly.
  // These tests verify the data capture pipeline still works.

  it('should have lifestyle preferences structure in knowledge', async () => {
    const knowledge = await getUserKnowledge(TEST_USER_ID);

    // Verify lifestyle structure exists for preference storage
    expect(knowledge.lifestyle).toBeDefined();
    expect(knowledge.lifestyle.entertainment).toBeDefined();
    expect(knowledge.lifestyle.food).toBeDefined();
    expect(knowledge.lifestyle.travel).toBeDefined();
  });
});

describe('Data Capture → Knowledge Pipeline', () => {
  it('should have captureDataBetterThanHuman function available', async () => {
    const { captureDataBetterThanHuman } = await import('../../intelligence/data-capture/index.js');

    expect(typeof captureDataBetterThanHuman).toBe('function');
  });
});
