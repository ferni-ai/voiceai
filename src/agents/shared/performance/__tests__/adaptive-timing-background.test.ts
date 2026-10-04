/**
 * A background turn (the context build behind a reply that has already
 * started) still feeds adaptive timing, but its duration is not the reply's
 * latency, so it must not warn "Slow turn detected".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createLogger: () => logger,
}));

const { completeTurnProfile, getSessionPerformanceSummary, startTurnProfile } =
  await import('../adaptive-timing.js');

/** A turn that took 1.6 s, past the 600 ms "acceptable" target. */
function slowTurn(sessionId: string, background?: boolean) {
  startTurnProfile(sessionId, 1);
  vi.advanceTimersByTime(1600);
  return completeTurnProfile(sessionId, 1, background);
}

const slowTurnWarnings = () =>
  logger.warn.mock.calls.filter(([, msg]) => msg === 'Slow turn detected');

describe('completeTurnProfile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('warns about a slow turn the reply waited on', () => {
    expect(slowTurn('session-reply')?.totalMs).toBe(1600);
    expect(slowTurnWarnings()).toHaveLength(1);
  });

  it('records a slow background turn without warning', () => {
    expect(slowTurn('session-background', true)?.totalMs).toBe(1600);

    expect(slowTurnWarnings()).toHaveLength(0);
    expect(getSessionPerformanceSummary('session-background')?.avgLatencyMs).toBe(1600);
  });
});
