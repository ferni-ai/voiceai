/**
 * ROUTER_EXEC_AFTER_CRISIS_READ through the real processTurn and the real turn crisis reads
 * (startTurnCrisis, classifier live with a stubbed model call): a router runs a tool on its
 * own only when the turn's reads allow it, and the direct tool reply that skips the reply model
 * is refused on a crisis read or a failed one. Flag off equals main: there, a crisis only the
 * classifier reads still runs the tool and takes the direct reply. The router is a stub that
 * asks the real hold (auto-execute-hold.ts) the way the real routers do, and counts tool runs.
 * Nothing leaves the process. Fictional lines only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  verdict: '{"risk":"none","subject":"self"}' as string | Error,
  toolRuns: 0,
  handedGate: [] as boolean[],
  /** A router that runs the tool without asking: the reply path must still refuse the bypass. */
  ignoreHold: false,
}));

vi.mock('../../../../services/diagnostic-logger.js', () => {
  const diag = new Proxy({}, { get: () => () => undefined });
  return { diag, default: diag };
});
// Builders that need a live session; their output is not under test
vi.mock('../../response-guidance-builder.js', () => ({
  buildResponseGuidance: () => ({ length: { min: 1, max: 3, guidance: '' } }),
}));
vi.mock('../../../../config/tool-config.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isFtisEnabled: () => false,
}));
// A route to a tool that sends something: not in the short-circuit's list, so the turn reaches
// the routing result the reply path reads.
const ROUTE = {
  action: { type: 'execute' },
  matches: [{ toolId: 'sendMessage', confidence: 0.97, layerScores: { pattern: 1 } }],
};
vi.mock('../../../../tools/semantic-router/integration/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isRoutingEnabled: () => true,
  isIntelligentRouterInitialized: () => false,
  startSemanticRouting: async (
    _text: string,
    context: { autoExecuteCheck?: () => Promise<'allowed' | 'held' | 'failed'> }
  ) => {
    h.handedGate.push(typeof context.autoExecuteCheck === 'function');
    const { autoExecuteHeld } =
      await import('../../../../tools/semantic-router/integration/auto-execute-hold.js');
    if (!h.ignoreHold && (await autoExecuteHeld(context, 'semantic'))) {
      return { attempted: true, executed: false, routeResult: ROUTE, routingPath: 'json_fallback' };
    }
    h.toolRuns += 1;
    return {
      attempted: true,
      executed: true,
      output: 'Sent.',
      routeResult: ROUTE,
      routingPath: 'semantic_auto_execute',
    };
  },
}));
// The real turn crisis reads, with the classifier live and its model call stubbed.
vi.mock('../turn-crisis.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../turn-crisis.js')>();
  return {
    ...real,
    startTurnCrisis: (
      text: string,
      userData: Parameters<typeof real.startTurnCrisis>[1],
      options: Parameters<typeof real.startTurnCrisis>[2] = {}
    ) =>
      real.startTurnCrisis(text, userData, {
        ...options,
        env: { CRISIS_CLASSIFIER_MODE: 'live' },
        generate: async () => {
          if (h.verdict instanceof Error) throw h.verdict;
          return h.verdict;
        },
      }),
  };
});

const { processTurn } = await import('../process-turn.js');
const { hasCrisisSignal } = await import('../turn-crisis.js');
const { detectCrisis } = await import('../../../safety/crisis-guard.js');
const { resetCrisisClassifierCache } =
  await import('../../../../services/safety/crisis-classifier.js');
const { resetCrisisCallRisk } = await import('../../../../services/safety/crisis-call-risk.js');

const LINE = 'text riley test that the spare key is under the blue pot';
const CRISIS_READ = '{"risk":"crisis","subject":"self"}';
const NO_RISK = '{"risk":"none","subject":"self"}';

type Routing = { bypassLLM: boolean; routed: boolean } | undefined;

async function turn(sessionId = 's-auto-tools'): Promise<Routing> {
  const ctx = {
    userText: LINE,
    userData: {},
    services: {
      sessionId,
      handoffState: { currentAgent: 'ferni' },
      updateHumanizingState: () => undefined,
      analyze: () => ({
        topics: { detected: [], categories: [] },
        state: {},
        emotion: { primary: 'neutral', intensity: 0.5, distressLevel: 0 },
        intent: { primary: 'request' },
      }),
    },
    persona: { id: 'ferni' },
    turnCtx: { addMessage: () => undefined, items: [] },
    logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
  } as unknown as Parameters<typeof processTurn>[0];
  const result = await processTurn(ctx);
  return result.semanticRouting as Routing;
}

beforeEach(() => {
  h.ignoreHold = false;
  h.toolRuns = 0;
  h.handedGate.length = 0;
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ROUTER_EXEC_AFTER_CRISIS_READ', () => {
  it('the line is one the patterns read as nothing', () => {
    expect(hasCrisisSignal(detectCrisis(LINE))).toBe(false);
  });

  describe('flag on', () => {
    beforeEach(() => vi.stubEnv('ROUTER_EXEC_AFTER_CRISIS_READ', 'on'));

    // With no call id there is no call risk, so the turn's own reads alone must hold the tool.
    describe.each([
      ['on a call', 's-auto-tools'],
      ['with no call id', ''],
    ])('%s', (_where, sessionId) => {
      it('a crisis only the classifier reads: no tool runs and no direct reply', async () => {
        h.verdict = CRISIS_READ;
        const routing = await turn(sessionId);
        expect(h.handedGate).toEqual([true]);
        expect(h.toolRuns).toBe(0);
        expect(routing).toMatchObject({ bypassLLM: false, routed: false });
      });

      it('a classifier read that fails: no tool runs and no direct reply', async () => {
        h.verdict = new Error('model unavailable');
        const routing = await turn(sessionId);
        expect(h.toolRuns).toBe(0);
        expect(routing).toMatchObject({ bypassLLM: false, routed: false });
      });

      it('a router that ran the tool anyway: the direct reply is still refused', async () => {
        h.ignoreHold = true;
        h.verdict = CRISIS_READ;
        const routing = await turn(sessionId);
        expect(h.toolRuns).toBe(1);
        expect(routing).toMatchObject({ bypassLLM: false, routed: false });
      });

      it('an ordinary turn with the same route: the tool runs and replies as today', async () => {
        h.verdict = NO_RISK;
        const routing = await turn(sessionId);
        expect(h.toolRuns).toBe(1);
        expect(routing).toMatchObject({ bypassLLM: true, routed: true });
      });
    });

    it('risk an earlier turn noted on the call: no tool runs and no direct reply', async () => {
      h.verdict = CRISIS_READ;
      await turn('s-earlier-risk');
      h.toolRuns = 0;
      h.verdict = NO_RISK;
      resetCrisisClassifierCache();
      const routing = await turn('s-earlier-risk');
      expect(h.toolRuns).toBe(0);
      expect(routing).toMatchObject({ bypassLLM: false });
    });
  });

  describe('flag off (main)', () => {
    it('no gate is handed to the router', async () => {
      h.verdict = NO_RISK;
      await turn();
      expect(h.handedGate).toEqual([false]);
    });

    it('a crisis only the classifier reads still runs the tool and takes the direct reply', async () => {
      h.verdict = CRISIS_READ;
      const routing = await turn();
      expect(h.toolRuns).toBe(1);
      expect(routing).toMatchObject({ bypassLLM: true });
    });
  });
});
