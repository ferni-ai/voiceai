/**
 * Most modules create their logger at import time, which in the agent happens
 * before LiveKit's logger is initialized. Those loggers were bound to a console
 * fallback for life, and in the deployed job their output never reached the
 * agent log (TURN_METRICS, tool counts, turn intelligence were all invisible).
 * A logger must use LiveKit's logger once it exists, whenever it was created.
 */
import { initializeLogger, log } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import { createLogger, getLogger } from '../safe-logger.js';

// The global test setup mocks safe-logger; this test needs the real one.
vi.unmock('../safe-logger.js');

describe('loggers created before LiveKit logger init', () => {
  it('route to the LiveKit logger once it is initialized', () => {
    const early = getLogger();
    const earlyChild = createLogger({ module: 'EarlyModule' });

    initializeLogger({ pretty: false, level: 'info' });
    const base = log();
    const info = vi.spyOn(base, 'info');
    const child = base.child({ module: 'EarlyModule' });
    const childInfo = vi.spyOn(child, 'info');
    vi.spyOn(base, 'child').mockReturnValue(child as unknown as ReturnType<typeof base.child>);

    early.info({ n: 1 }, 'from early getLogger');
    earlyChild.info({ n: 2 }, 'from early createLogger');

    expect(info).toHaveBeenCalledWith({ n: 1 }, 'from early getLogger');
    expect(childInfo).toHaveBeenCalledWith({ n: 2 }, 'from early createLogger');
  });
});
