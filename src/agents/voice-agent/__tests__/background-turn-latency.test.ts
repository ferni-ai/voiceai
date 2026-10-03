/**
 * The live agent runs the turn handler in the background, context-only, while
 * the reply is already being generated (multi-agent/turn-intelligence.ts). Its
 * latency profile then times the context build, not the reply, so it must not
 * report as the reply's latency ("Turn latency above threshold", bottleneck
 * "analysis" on every turn of the 2026-10-03 call).
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const turnProfiler = vi.hoisted(() => ({
  startTurnProfiling: vi.fn(),
  completeTurnProfiling: vi.fn(() => null),
}));
const adaptiveTiming = vi.hoisted(() => ({ completeTurnProfile: vi.fn(() => null) }));

vi.mock('../../../services/performance/turn-profiler.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...turnProfiler,
}));
vi.mock('../../shared/performance/adaptive-timing.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...adaptiveTiming,
}));
// Stop the turn at the processor: the profiling calls under test happen before
// it (start) and in its finally (adaptive timing).
vi.mock('../../processors/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  processTurn: vi.fn(() => Promise.reject(new Error('processor stopped by test'))),
}));

const { handleUserTurn } = await import('../turn-handler.js');
type Ctx = Parameters<typeof handleUserTurn>[0];

function runTurn(contextOnly: boolean): Promise<void> {
  return handleUserTurn({
    turnCtx: llm.ChatContext.empty(),
    userText: 'How are you doing?',
    contextOnly,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId: `session-latency-${contextOnly}` },
    userData: { turnCount: 3 },
  } as unknown as Ctx);
}

describe('turn handler latency profiling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BACKGROUND_TURN_LATENCY_WARNINGS;
  });
  afterEach(() => {
    delete process.env.BACKGROUND_TURN_LATENCY_WARNINGS;
  });

  it('does not profile a background context-only run as the reply', async () => {
    await runTurn(true);

    expect(turnProfiler.startTurnProfiling).not.toHaveBeenCalled();
    // Adaptive timing still learns the run's duration, quietly.
    expect(adaptiveTiming.completeTurnProfile).toHaveBeenCalledWith(
      'session-latency-true',
      3,
      true
    );
  });

  it('profiles a turn the reply waits on', async () => {
    await runTurn(false);

    expect(turnProfiler.startTurnProfiling).toHaveBeenCalledWith('session-latency-false', 3);
    expect(adaptiveTiming.completeTurnProfile).toHaveBeenCalledWith(
      'session-latency-false',
      3,
      false
    );
  });

  it('BACKGROUND_TURN_LATENCY_WARNINGS=on restores profiling of background runs', async () => {
    process.env.BACKGROUND_TURN_LATENCY_WARNINGS = 'on';

    await runTurn(true);

    expect(turnProfiler.startTurnProfiling).toHaveBeenCalledWith('session-latency-true', 3);
  });
});
