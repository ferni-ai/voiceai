/**
 * processTurn hands semantic routing the turn's crisis read: crisisTurn is true when the
 * pattern read flags the line and false otherwise (routed-turn.ts then keeps only a count
 * of a crisis turn). The pattern read is the real one (detectCrisis); the classifier and
 * the router are stubbed, so nothing leaves the process. Fictional lines only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ contexts: [] as Array<{ crisisTurn?: boolean }> }));

vi.mock('../../../../services/diagnostic-logger.js', () => {
  const diag = new Proxy({}, { get: () => () => undefined });
  return { diag, default: diag };
});
vi.mock('../../../../config/tool-config.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isFtisEnabled: () => false,
}));
vi.mock('../../../../tools/semantic-router/integration/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isRoutingEnabled: () => true,
  isIntelligentRouterInitialized: () => false,
  startSemanticRouting: async (_text: string, context: { crisisTurn?: boolean }) => {
    h.contexts.push(context);
    return { attempted: false, executed: false, routingPath: 'disabled' };
  },
}));
// The pattern read is real; the classifier's later verdict is not under test
vi.mock('../turn-crisis.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../turn-crisis.js')>();
  const { detectCrisis, guardFromDetection } = await import('../../../safety/crisis-guard.js');
  return {
    ...real,
    startTurnCrisis: (text: string) => {
      const patterns = detectCrisis(text);
      return {
        patterns,
        shouldBlock: guardFromDetection(patterns).shouldBlock,
        resolve: async () => patterns,
        softCheck: async () => false,
        summary: async () => real.crisisSummary(patterns),
        bypassAllowed: async () => !real.hasCrisisSignal(patterns),
      };
    },
  };
});

const { processTurn } = await import('../process-turn.js');
const { hasCrisisSignal } = await import('../turn-crisis.js');
const { detectCrisis } = await import('../../../safety/crisis-guard.js');

const ORDINARY = 'remind me to water the ferns on thursday morning';
const CRISIS = "i can't do this anymore and i want it all to stop tonight";

async function routeTurn(userText: string): Promise<{ crisisTurn?: boolean } | undefined> {
  const ctx = {
    userText,
    userData: {},
    services: { sessionId: 's-test' },
    persona: { id: 'ferni' },
    turnCtx: { addMessage: () => undefined, items: [] },
    logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
  } as unknown as Parameters<typeof processTurn>[0];
  // The turn's later steps need a live session; only what routing is handed is under test
  await processTurn(ctx).catch(() => undefined);
  return h.contexts[0];
}

beforeEach(() => {
  h.contexts.length = 0;
});

describe('processTurn hands routing the crisis read', () => {
  it('the fixtures read as intended', () => {
    expect(hasCrisisSignal(detectCrisis(CRISIS))).toBe(true);
    expect(hasCrisisSignal(detectCrisis(ORDINARY))).toBe(false);
  });

  it('a pattern-flagged line is routed as a crisis turn', async () => {
    expect(await routeTurn(CRISIS)).toMatchObject({ crisisTurn: true, sessionId: 's-test' });
  });

  it('an ordinary line is routed as an ordinary turn', async () => {
    expect(await routeTurn(ORDINARY)).toMatchObject({ crisisTurn: false, sessionId: 's-test' });
  });
});
