/**
 * EvalOps Persistence Tests
 *
 * Proves EvalOps evaluations can be persisted and retrieved (end-to-end-ish):
 * automation.afterTurn() → persistEvaluation() → getRecentEvaluations()
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Enable persistence for this suite
process.env.EVALOPS_FIRESTORE_ENABLED = 'true';

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn(() => ({ set: mockSet }));

const mockDocs = [
  {
    data: () => ({
      id: 'eval-1',
      timestampMs: Date.now(),
      timestamp: new Date(),
      sessionId: 'session-1',
      personaId: 'ferni',
      userMessage: 'hi',
      aiResponse: 'hello',
      overallScore: 90,
      dimensions: {
        personaVoice: 90,
        emotionalIntelligence: 90,
        helpfulness: 90,
        authenticity: 90,
        safety: 100,
        contextUse: 80,
        trustBuilding: 90,
      },
      feedback: { strengths: [], improvements: [], specificIssues: [] },
      flagged: false,
      flagReasons: [],
      voiceConsistency: { signaturePhrasesUsed: [], antiPatternsDetected: [], voiceDriftScore: 0 },
      metadata: { evaluatorModel: 'mock', evaluationDurationMs: 1, contextProvided: [] },
    }),
  },
];

const mockGet = vi.fn().mockResolvedValue({ docs: mockDocs });
const mockLimit = vi.fn(() => ({ get: mockGet }));
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
const mockWhere = vi.fn(() => ({ where: mockWhere, orderBy: mockOrderBy, doc: mockDoc }));
const mockCollection = vi.fn(() => ({ doc: mockDoc, where: mockWhere, orderBy: mockOrderBy }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: mockCollection,
  })),
  FieldValue: {
    serverTimestamp: vi.fn(() => new Date()),
  },
}));

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock evalops index evaluateResponse so afterTurn doesn't call external APIs
vi.mock('../services/evalops/index.js', async () => {
  const actual = await vi.importActual<typeof import('../services/evalops/index.js')>(
    '../services/evalops/index.js'
  );
  return {
    ...actual,
    evaluateResponse: vi.fn(async () => ({
      id: 'eval-created',
      timestamp: new Date(),
      sessionId: 'session-1',
      personaId: 'ferni',
      userMessage: 'hello',
      aiResponse: 'hi there',
      overallScore: 88,
      dimensions: {
        personaVoice: 80,
        emotionalIntelligence: 90,
        helpfulness: 85,
        authenticity: 90,
        safety: 100,
        contextUse: 80,
        trustBuilding: 90,
      },
      feedback: { strengths: [], improvements: [], specificIssues: [] },
      flagged: false,
      flagReasons: [],
      voiceConsistency: { signaturePhrasesUsed: [], antiPatternsDetected: [], voiceDriftScore: 0 },
      metadata: { evaluatorModel: 'mock', evaluationDurationMs: 1, contextProvided: [] },
    })),
  };
});

import { afterTurn, getRecentEvaluations } from '../services/evalops/automation.js';

describe('EvalOps persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should persist evaluations from afterTurn()', async () => {
    await afterTurn('session-1', 'ferni', 'hello', 'hi there', {
      conversationHistory: [{ role: 'user', content: 'hello' }],
      turnNumber: 100, // force sampling
      isNewUser: false,
    });

    // Persistence path should attempt firestore set()
    expect(mockCollection).toHaveBeenCalledWith('evalops_evaluations');
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('should fetch recent evaluations from Firestore when enabled', async () => {
    const results = await getRecentEvaluations(5);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBeDefined();
  });
});
