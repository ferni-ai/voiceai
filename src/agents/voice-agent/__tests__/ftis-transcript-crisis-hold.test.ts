/**
 * ROUTER_EXEC_AFTER_CRISIS_READ on the transcript handler's own FTIS call (transcript-handler.ts),
 * which runs outside processTurn: with the flag on, FTIS runs a tool only once a crisis read of
 * the turn started and the call's reads settled with nothing holding the call. The real handler
 * and the real runFTISRouting run on a final transcript; the FTIS classifier, the tool executor
 * (which counts runs), the reply gateway and the writers are stubs. The line is invented and one
 * the crisis patterns read as nothing, so only a classifier read can find the risk.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ toolRuns: 0 }));

vi.mock('../../integrations/better-than-human-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  processTranscriptForBetterThanHuman: vi.fn(async () => ({})),
}));
vi.mock('../../../config/tool-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isFtisEnabled: () => true,
}));
vi.mock('../../../intelligence/preference-extractor.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  hasPreferenceContent: () => false,
}));
vi.mock('../../../memory/dynamic/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fastCapture: vi.fn(async () => ({ mentionedEntities: [], asyncJobId: undefined })),
  recordTurn: vi.fn(),
}));
vi.mock('../../shared/generate-reply-gateway.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  generateReplyBySessionId: vi.fn(async () => undefined),
}));
vi.mock('../../../tools/semantic-router/advanced/intelligent/hierarchical-classifier.js', () => ({
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
vi.mock('../../../tools/intelligence/tool-executor.js', () => ({
  DIRECT_EXECUTION_THRESHOLD: 0.85,
  executeDirectFromClassification: async () => {
    h.toolRuns += 1;
    return { success: true, bypassLLM: true, toolId: 'message_send', naturalResponse: 'Sent.' };
  },
}));

import { createTranscriptHandler } from '../transcript-handler.js';
import { resetMinorCare } from '../../../utils/minor-care.js';
import { CRISIS_READ_WAIT, noteCrisisTurnRead } from '../../../utils/crisis-memory-hold.js';
import { resetCrisisCallRisk, trackCrisisRead } from '../../../services/safety/crisis-call-risk.js';

const LINE = 'text riley test that the spare key is under the blue pot';
const WAIT = { ...CRISIS_READ_WAIT };
let n = 0;

/** Anything the handler touches that isn't under test: every property is a no-op. */
function stub(): never {
  const fn = (): unknown => proxy;
  const proxy: unknown = new Proxy(fn, {
    get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : proxy),
    apply: () => proxy,
  });
  return proxy as never;
}

/** One final caller turn through the real handler; `before` runs as the turn starts. */
async function turn(before: (sessionId: string) => void): Promise<void> {
  const sessionId = `ftis-transcript-${++n}`;
  const userId = `user-${sessionId}`;
  const { handler } = createTranscriptHandler({
    room: stub(),
    session: stub(),
    services: stub(),
    sessionPersona: { id: 'ferni', name: 'Ferni' } as never,
    conversationManager: { isAgentSpeaking: () => false } as never,
    voiceHumanization: null,
    userData: { userId, turnCount: 3 } as never,
    userId,
    sessionId,
    silenceContext: { topicsDiscussed: [], memorableMoments: [] } as never,
    dynamicToolLoader: {
      processMessage: async () => [],
      getLoadedDomains: () => [],
      getToolsForDomains: () => ({}),
    },
    agent: stub(),
    autoOptimizer: { processUserMessage: vi.fn() },
  });
  before(sessionId);
  handler({ transcript: LINE, isFinal: true } as never);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 900); // past the shortened read wait
  });
}

/** A classifier read of the turn that starts now and finds risk shortly after. */
function classifierFindsRisk(sessionId: string): void {
  noteCrisisTurnRead(sessionId, LINE);
  const late = new Promise<{ risk: string }>((resolve) => {
    setTimeout(resolve, 150, { risk: 'crisis' });
  });
  void trackCrisisRead(sessionId, LINE, late);
}

beforeEach(() => {
  h.toolRuns = 0;
  Object.assign(CRISIS_READ_WAIT, { startMs: 300, settleMs: 300 });
});
afterEach(() => {
  vi.unstubAllEnvs();
  Object.assign(CRISIS_READ_WAIT, WAIT);
  resetCrisisCallRisk(); // also the memory hold
  resetMinorCare();
});

describe('transcript-handler FTIS with ROUTER_EXEC_AFTER_CRISIS_READ on', () => {
  beforeEach(() => {
    vi.stubEnv('ROUTER_EXEC_AFTER_CRISIS_READ', 'on');
  });

  it('flag on, FTIS on: a crisis only the classifier reads runs no tool through the transcript handler', async () => {
    await turn(classifierFindsRisk);
    expect(h.toolRuns).toBe(0);
  });

  it('flag on, FTIS on: no crisis read of the turn starts, so no tool runs (fail closed)', async () => {
    await turn(() => undefined);
    expect(h.toolRuns).toBe(0);
  });

  it('flag on, FTIS on: an ordinary turn whose read came back clean runs the tool', async () => {
    await turn((id) => noteCrisisTurnRead(id, LINE));
    expect(h.toolRuns).toBe(1);
  });
});

describe('transcript-handler FTIS with the flag off (main)', () => {
  it('a crisis only the classifier reads still runs the tool', async () => {
    await turn(classifierFindsRisk);
    expect(h.toolRuns).toBe(1);
  });
});
