/**
 * initializeTeamHandlers starts the proactive scheduler and nothing else. It
 * used to warn "Legacy team handlers have been removed. Enable
 * USE_NEW_TEAM_HANDLERS=true" on every boot (30 times in a day on prod) for a
 * switch that was never set.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const start = vi.fn();
const warn = vi.fn();
const info = vi.fn();

vi.mock('../../services/scheduling/proactive-scheduler.js', () => ({
  getProactiveScheduler: () => ({ start }),
}));
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({ info, warn, debug: vi.fn(), error: vi.fn() }),
  createLogger: () => ({ info, warn, debug: vi.fn(), error: vi.fn() }),
}));

const { initializeTeamHandlers } = await import('../lifecycle.js');

describe('initializeTeamHandlers', () => {
  beforeEach(() => {
    start.mockClear();
    warn.mockClear();
  });

  it('starts the proactive scheduler without a warning', async () => {
    await initializeTeamHandlers();
    expect(start).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
