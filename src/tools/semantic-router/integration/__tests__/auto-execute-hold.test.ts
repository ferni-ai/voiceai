/**
 * CRISIS_BLOCKS_AUTO_TOOLS at the routers: the real startSemanticRouting, startIntelligentRouting
 * (execute and plan decisions) and runFTISRouting
 * run a matched tool only when the turn's answer allows it. A turn that hands no answer (flag
 * off) runs the tool as before; a "no" or an answer that throws holds it, and the tool never
 * runs. The route, the classifier and the tools are stubs that count runs; nothing leaves the
 * process.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  semanticRuns: 0,
  ftisRuns: 0,
  decision: {} as Record<string, unknown>,
}));

const ROUTE = {
  action: { type: 'execute' },
  matches: [
    { toolId: 'sendMessage', confidence: 0.97, layerScores: { pattern: 1 }, extractedArgs: {} },
  ],
};

vi.mock('../init.js', () => ({ initializeSemanticRouter: async () => undefined }));
vi.mock('../../config.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isSemanticRoutingEnabled: () => true,
}));
vi.mock('../../router.js', () => ({
  createSemanticRouter: () => ({}),
  routeUserInput: async () => ROUTE,
}));
vi.mock('../sota-integration.js', () => ({
  applySOTAPreRouting: async () => {
    throw new Error('not under test');
  },
  applySOTAConfidenceAdjustments: (matches: unknown) => matches,
  recordSOTAOutcome: () => undefined,
}));
vi.mock('../routed-turn.js', () => {
  const metrics = new Proxy({}, { get: () => () => undefined });
  return { startRoutedTurn: () => metrics, recordRoutedTurn: () => 'event-1' };
});
vi.mock('../routing-analytics.js', () => ({ recordRoutingOutcome: () => undefined }));
vi.mock('../../domain-bridge/index.js', () => ({
  hasDomainMapping: () => true,
  executeDomainTool: async () => {
    h.semanticRuns += 1;
    return { success: true, naturalResponse: 'Sent.' };
  },
}));
vi.mock('../../../../agents/shared/sanitizer/index.js', () => ({
  markToolExecutedBySemanticRouter: () => undefined,
}));
vi.mock('../../registry.js', () => ({
  getToolRegistry: () => ({ getAll: () => [], get: () => undefined }),
}));
vi.mock('../../../../config/gemini-config.js', () => ({ isGeminiConfigured: () => false }));
vi.mock('../../advanced/intelligent/index.js', () => ({
  initializeIntelligentOrchestrator: () => ({
    initialize: async () => undefined,
    route: async () => h.decision,
  }),
  getIntelligentOrchestrator: () => undefined,
  createGeminiProvider: () => undefined,
  createOpenAIProvider: () => undefined,
}));
vi.mock('../../../../config/tool-config.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isFtisEnabled: () => true,
}));
vi.mock('../../advanced/intelligent/hierarchical-classifier.js', () => ({
  isHierarchicalClassifierAvailable: () => true,
  initializeHierarchicalClassifier: async () => undefined,
  classifyHierarchicalSafe: () => ({
    latencyMs: 1,
    predictions: [
      {
        domain: 'messaging',
        metaTool: 'message.send',
        domainConfidence: 0.99,
        metaToolConfidence: 0.99,
        combinedConfidence: 0.98,
      },
    ],
  }),
}));
vi.mock('../../../intelligence/tool-executor.js', () => ({
  DIRECT_EXECUTION_THRESHOLD: 0.85,
  executeDirectFromClassification: async () => {
    h.ftisRuns += 1;
    return { success: true, bypassLLM: true, toolId: 'message_send', naturalResponse: 'Sent.' };
  },
}));

const { startSemanticRouting } = await import('../turn-processor-integration.js');
const { runFTISRouting } =
  await import('../../../../agents/processors/tool-routing-integration.js');
const { initializeIntelligentRouter, startIntelligentRouting } =
  await import('../intelligent-router-integration.js');
await initializeIntelligentRouter();

const LINE = 'text riley test that the spare key is under the blue pot';
type Answer = (() => Promise<boolean>) | undefined;
const ANSWERS: Array<[string, Answer, boolean]> = [
  ['no answer handed (flag off)', undefined, true],
  ['the turn allows it', async () => true, true],
  ['the turn holds it', async () => false, false],
  ['the answer throws', async () => Promise.reject(new Error('read failed')), false],
];

const CONTEXT = {
  userId: 'riley-test',
  sessionId: 's-hold',
  personaId: 'ferni',
  conversationHistory: [],
  recentTools: [],
};

function semantic(answer: Answer) {
  return startSemanticRouting(LINE, {
    ...CONTEXT,
    ...(answer ? { autoExecuteAllowed: answer } : {}),
  });
}

function intelligent(answer: Answer) {
  return startIntelligentRouting(LINE, {
    ...CONTEXT,
    ...(answer ? { autoExecuteAllowed: answer } : {}),
  });
}

function ftis(answer: Answer) {
  return runFTISRouting(LINE, {
    userId: 'riley-test',
    sessionId: 's-hold',
    personaId: 'ferni',
    ...(answer ? { autoExecuteAllowed: answer } : {}),
  });
}

beforeEach(() => {
  h.semanticRuns = 0;
  h.ftisRuns = 0;
});

describe('semantic router auto-execute', () => {
  it.each(ANSWERS)('%s', async (_name, answer, runs) => {
    const result = await semantic(answer);
    expect(h.semanticRuns).toBe(runs ? 1 : 0);
    expect(result.executed).toBe(runs);
    expect(result.routingPath).toBe(runs ? 'semantic_auto_execute' : 'json_fallback');
  });
});

describe('intelligent router decisions', () => {
  const DECISIONS: Array<[string, Record<string, unknown>]> = [
    ['execute', { action: 'execute', toolId: 'sendMessage', args: {}, confidence: 0.97 }],
    ['plan', { action: 'plan', plan: { steps: [{ toolId: 'sendMessage', args: {} }] } }],
  ];
  describe.each(DECISIONS)('%s', (_kind, decision) => {
    it.each(ANSWERS)('%s', async (_name, answer, runs) => {
      h.decision = { rawResults: {}, timing: {}, decidedBy: 'classifier', ...decision };
      const result = await intelligent(answer);
      expect(h.semanticRuns).toBe(runs ? 1 : 0);
      expect(result.executed).toBe(runs);
    });
  });
});

describe('FTIS direct execution', () => {
  it.each(ANSWERS)('%s', async (_name, answer, runs) => {
    const result = await ftis(answer);
    expect(h.ftisRuns).toBe(runs ? 1 : 0);
    expect(result.bypassLLM).toBe(runs);
  });
});
