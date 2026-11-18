/**
 * ROUTER_EXEC_AFTER_CRISIS_READ at the routers: the real startSemanticRouting,
 * startIntelligentRouting (execute and plan decisions) and runFTISRouting run a matched tool only
 * when the turn's check says 'allowed'. A turn that hands no check (flag off) runs the tool as
 * before; 'held', 'failed' or a check that throws keeps it, and the tool never runs. Each check
 * logs its outcome and wait. The route, the classifier and the tools are stubs that count runs;
 * nothing leaves the process.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutoExecuteOutcome } from '../auto-execute-hold.js';

const h = vi.hoisted(() => ({
  semanticRuns: 0,
  ftisRuns: 0,
  decision: {} as Record<string, unknown>,
  checks: [] as Array<Record<string, unknown>>,
}));

// Records each AUTO_TOOL_CHECK line from the hold's own logger; every other logger is real.
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: { module?: string }) => {
      const logger = real.createLogger(bindings);
      if (bindings?.module !== 'auto-execute-hold') return logger;
      return {
        ...logger,
        info: (fields: Record<string, unknown>, message?: string) => {
          if (message === 'AUTO_TOOL_CHECK') h.checks.push(fields);
        },
      };
    },
  };
});

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
type Answer = (() => Promise<AutoExecuteOutcome>) | undefined;
/** Answers a router runs the tool on. */
const RUNS: Array<[string, Answer]> = [
  ['no check handed (flag off)', undefined],
  ['the turn allows it', async () => 'allowed'],
];
/** Answers a router holds the tool on, with the outcome the log must carry. */
const HOLDS: Array<[string, Answer, AutoExecuteOutcome]> = [
  ['the turn holds it', async () => 'held', 'held'],
  ['a read failed', async () => 'failed', 'failed'],
  ['the check throws', async () => Promise.reject(new Error('read failed')), 'failed'],
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
    ...(answer ? { autoExecuteCheck: answer } : {}),
  });
}

function intelligent(answer: Answer) {
  return startIntelligentRouting(LINE, {
    ...CONTEXT,
    ...(answer ? { autoExecuteCheck: answer } : {}),
  });
}

function ftis(answer: Answer) {
  return runFTISRouting(LINE, {
    userId: 'riley-test',
    sessionId: 's-hold',
    personaId: 'ferni',
    ...(answer ? { autoExecuteCheck: answer } : {}),
  });
}

const DECISIONS: Array<[string, Record<string, unknown>]> = [
  ['execute', { action: 'execute', toolId: 'sendMessage', args: {}, confidence: 0.97 }],
  ['plan', { action: 'plan', plan: { steps: [{ toolId: 'sendMessage', args: {} }] } }],
];

/** Each router path, run under one answer: whether a tool ran and whether the result says so. */
const ROUTERS: Array<[string, (answer: Answer) => Promise<{ ran: boolean; says: boolean }>]> = [
  [
    'semantic',
    async (answer) => {
      const result = await semantic(answer);
      const says = result.executed && result.routingPath === 'semantic_auto_execute';
      return { ran: h.semanticRuns === 1, says };
    },
  ],
  ...DECISIONS.map(([kind, decision]): (typeof ROUTERS)[number] => [
    `intelligent ${kind}`,
    async (answer) => {
      h.decision = { rawResults: {}, timing: {}, decidedBy: 'classifier', ...decision };
      const result = await intelligent(answer);
      return { ran: h.semanticRuns === 1, says: result.executed };
    },
  ]),
  [
    'FTIS',
    async (answer) => {
      const result = await ftis(answer);
      return { ran: h.ftisRuns === 1, says: result.bypassLLM };
    },
  ],
];

beforeEach(() => {
  h.semanticRuns = 0;
  h.ftisRuns = 0;
  h.checks.length = 0;
});

describe.each(ROUTERS)('%s router', (_router, run) => {
  it.each(RUNS)('runs the tool: %s', async (_name, answer) => {
    expect(await run(answer)).toEqual({ ran: true, says: true });
  });
});

it('each router holds the tool on a hold, a failed read and a check that throws', async () => {
  const ran: string[] = [];
  for (const [router, run] of ROUTERS) {
    for (const [name, answer] of HOLDS) {
      h.semanticRuns = 0;
      h.ftisRuns = 0;
      const seen = await run(answer);
      if (seen.ran || seen.says) ran.push(`${router}: ${name}`);
    }
  }
  expect(ran).toEqual([]);
});

it('each check logs the router, the outcome and the wait, ids and numbers only', async () => {
  const [, run] = ROUTERS[0];
  for (const [, answer] of [...RUNS, ...HOLDS]) await run(answer);
  // Flag off hands no check, so nothing is logged for it.
  expect(h.checks.map((c) => c.outcome)).toEqual(['allowed', 'held', 'failed', 'failed']);
  for (const check of h.checks) {
    expect(Object.keys(check).sort()).toEqual(['outcome', 'router', 'sessionId', 'waitMs']);
    expect(check).toMatchObject({ router: 'semantic', sessionId: 's-hold' });
    expect(Number.isInteger(check.waitMs) && (check.waitMs as number) >= 0).toBe(true);
  }
});
