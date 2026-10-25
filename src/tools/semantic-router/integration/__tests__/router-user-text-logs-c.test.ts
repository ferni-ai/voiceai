/**
 * The router's integration layer handles the caller's live utterance. Its log
 * lines say how long the text was, never the text; an error it logs carries its
 * class and status, never its message (a provider or Firestore error can quote
 * what it was handed); and the routing-metric buffer, which the admin routing
 * dashboard serves, holds a length instead of the words.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
const SENTINEL = 'my sister Dolores has stage-three lupus';
const echoingError = () => new Error(`quota exceeded for input: ${SENTINEL}`);

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const capture = (...args: unknown[]) => void logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return {
    ...(await importOriginal<typeof import('../../../../utils/safe-logger.js')>()),
    createLogger: () => logger,
    getLogger: () => logger,
  };
});

const learning = vi.hoisted(() => ({
  recordOutcome: vi.fn(async () => undefined),
  handleExplicitCorrection: vi.fn(async () => undefined),
  recordCorrection: vi.fn(async () => undefined),
}));

vi.mock('../../advanced/learning-loop.js', () => ({
  enhanceWithLearning: vi.fn(),
  recordOutcome: learning.recordOutcome,
  handleExplicitCorrection: learning.handleExplicitCorrection,
  recordToolCoOccurrence: vi.fn(),
  predictToolChain: vi.fn(async () => ({ currentTool: '', nextTools: [] })),
}));

vi.mock('../../learning/index.js', () => ({
  recordCorrection: learning.recordCorrection,
  recordImplicitCorrection: vi.fn(),
  recordToolUsage: vi.fn(),
  getUserPreferences: vi.fn(() => ({ toolBoosts: new Map() })),
  initializeCorrectionStore: vi.fn(async () => undefined),
}));

const route = vi.hoisted(() => vi.fn());
vi.mock('../../advanced/intelligent/index.js', () => ({
  initializeIntelligentOrchestrator: () => ({ initialize: async () => undefined, route }),
  getIntelligentOrchestrator: vi.fn(),
  createGeminiProvider: vi.fn(),
  createOpenAIProvider: vi.fn(),
}));
vi.mock('../../registry.js', () => ({
  getToolRegistry: () => ({ getAll: () => [], get: () => undefined }),
}));
vi.mock('../turn-processor-integration.js', () => ({
  startSemanticRouting: vi.fn(async () => ({ attempted: false, executed: false })),
}));

import {
  getGeminiConfidenceBoost,
  logConfidenceCalibration,
  resetCalibrationLog,
  type ConfidenceCalibrationEntry,
} from '../config.js';
import {
  initializeIntelligentRouter,
  startIntelligentRouting,
} from '../intelligent-router-integration.js';
import {
  completeTurnTracking,
  handleUserCorrection,
  recordSemanticRoutingResult,
  startTurnTracking,
} from '../active-learning-integration.js';
import {
  clearMetrics,
  getDashboardData,
  getRecentMetrics,
  recordConversation,
  recordHintAdded,
  recordLLMBypass,
  recordRoutingError,
} from '../metrics.js';

const routingContext = {
  userId: 'u1',
  sessionId: 's1',
  personaId: 'ferni',
  conversationHistory: [],
  recentTools: [],
};

function expectNoSentinel(value: unknown) {
  expect(JSON.stringify(value)).not.toContain(SENTINEL);
}

afterEach(() => {
  logged.length = 0;
  vi.clearAllMocks();
});

describe('config logs', () => {
  it('a Gemini problem phrase is logged by length', () => {
    const input = `will you play ${SENTINEL}`;
    expect(getGeminiConfidenceBoost(input)).toBe(1.15);
    expectNoSentinel(logged);
    expect(logged).toContainEqual([
      { inputLength: input.length },
      '🎯 Gemini problem phrase detected - boosting confidence',
    ]);
  });

  it('calibration lines (auto-execute and near-miss) carry the length, not the input', () => {
    const entry = (over: Partial<ConfidenceCalibrationEntry>): ConfidenceCalibrationEntry => ({
      timestamp: Date.now(),
      input: SENTINEL,
      toolId: 'spotify_play',
      rawConfidence: 0.8,
      geminiBoost: 1,
      performanceAdjustment: 1,
      finalConfidence: 0.95,
      action: 'execute',
      thresholds: { autoExecute: 0.9, confirm: 0.7, hint: 0.5 },
      ...over,
    });
    logConfidenceCalibration(entry({}));
    logConfidenceCalibration(entry({ action: 'confirm', finalConfidence: 0.85 }));
    resetCalibrationLog();

    expectNoSentinel(logged);
    expect(logged).toContainEqual([
      expect.objectContaining({ inputLength: SENTINEL.length }),
      '🚀 CALIBRATION: Auto-execute (above threshold)',
    ]);
    expect(logged).toContainEqual([
      expect.objectContaining({ inputLength: SENTINEL.length }),
      '⚠️ CALIBRATION: Near-miss for auto-execute (consider threshold adjustment)',
    ]);
  });
});

describe('intelligent router logs', () => {
  it('a routed turn is logged by length', async () => {
    await initializeIntelligentRouter();
    route.mockResolvedValueOnce({
      action: 'conversation',
      decidedBy: 'semantic',
      toolId: null,
      confidence: 0.2,
      args: {},
      rawResults: {},
      timing: { total: 1 },
    });
    await startIntelligentRouting(SENTINEL, routingContext);
    expectNoSentinel(logged);
    expect(logged).toContainEqual([
      expect.objectContaining({ textLength: SENTINEL.length, decidedBy: 'semantic' }),
      '🧠 Intelligent routing complete',
    ]);
  });

  it('a failed route logs the error class and the length, not the message or the text', async () => {
    await initializeIntelligentRouter();
    route.mockRejectedValueOnce(echoingError());
    await startIntelligentRouting(SENTINEL, routingContext);
    expectNoSentinel(logged);
    expect(logged).toContainEqual([
      { error: 'Error', status: undefined, textLength: SENTINEL.length },
      'Intelligent routing failed',
    ]);
  });
});

describe('active learning logs', () => {
  function trackImplicitCorrection() {
    const ctx = { ...routingContext, sessionId: `s-${Math.random()}` };
    const turnId = startTurnTracking(ctx, SENTINEL);
    recordSemanticRoutingResult(turnId, ctx.sessionId, {
      attempted: true,
      executed: false,
      routeResult: { matches: [{ toolId: 'spotify_play', confidence: 0.8 }] },
    } as never);
    return completeTurnTracking(turnId, ctx.sessionId, {
      wasSuccessful: true,
      actualToolUsed: 'apple_music_play',
    });
  }

  it('an implicit correction is logged by length', async () => {
    await trackImplicitCorrection();
    expectNoSentinel(logged);
    expect(logged).toContainEqual([
      expect.objectContaining({ inputLength: SENTINEL.length, actual: 'apple_music_play' }),
      '📚 Learned from implicit correction',
    ]);
  });

  it('a failed outcome write logs the error class, not its message', async () => {
    learning.recordOutcome.mockRejectedValueOnce(echoingError());
    await trackImplicitCorrection();
    expectNoSentinel(logged);
    expect(logged).toContainEqual([
      { error: 'Error', status: undefined },
      'Failed to record learning outcome',
    ]);
  });

  it('an explicit correction is logged by length', async () => {
    await handleUserCorrection('u1', 's1', SENTINEL, 'spotify_play', 'apple_music_play');
    expectNoSentinel(logged);
    expect(logged).toContainEqual([
      expect.objectContaining({ phraseLength: SENTINEL.length, to: 'apple_music_play' }),
      '📚 Recorded explicit user correction',
    ]);
  });

  it('a failed explicit correction logs the error class, not its message', async () => {
    learning.recordCorrection.mockRejectedValueOnce(echoingError());
    await handleUserCorrection('u1', 's1', SENTINEL, 'spotify_play', 'apple_music_play');
    expectNoSentinel(logged);
    expect(logged).toContainEqual([
      { error: 'Error', status: undefined },
      'Failed to handle user correction',
    ]);
  });
});

describe('routing metrics', () => {
  it('every recorder stores the input length, never the words', () => {
    clearMetrics();
    recordLLMBypass('u1', 's1', SENTINEL, 'spotify_play', 0.9, 'embedding', 12, false);
    recordHintAdded('u1', 's1', SENTINEL, 'spotify_play', 0.6, 'keyword', 12);
    recordConversation('u1', 's1', SENTINEL, 12);
    recordRoutingError('u1', 's1', SENTINEL, 'Tool not found', 12);

    const recent = getRecentMetrics();
    expect(recent.map((m) => m.action)).toEqual(['execute', 'hint', 'conversation', 'error']);
    for (const m of recent) expect(m.inputLength).toBe(SENTINEL.length);
    expectNoSentinel(recent);
    expectNoSentinel(getDashboardData());
    expectNoSentinel(logged);
    clearMetrics();
  });
});
