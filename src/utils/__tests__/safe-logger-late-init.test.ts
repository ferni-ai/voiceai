/**
 * In a LiveKit job process only stderr reaches the agent log; LiveKit's logger
 * writes to the job's stdout, which is dropped. Module loggers (mostly created
 * at import time) therefore log to stderr, whether or not LiveKit's logger has
 * been initialized.
 */
import { initializeLogger } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, getLogger } from '../safe-logger.js';

// The global test setup mocks safe-logger; this test needs the real one.
vi.unmock('../safe-logger.js');

const written = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((call) => String(call[0])).join('');

describe('module loggers', () => {
  afterEach(() => vi.restoreAllMocks());

  it('write to stderr before and after LiveKit logger init', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write');
    const early = getLogger();
    const earlyChild = createLogger({ module: 'EarlyModule' });

    early.warn({ n: 1 }, 'before init');
    initializeLogger({ pretty: false, level: 'info' });
    early.info({ n: 2 }, 'after init');
    earlyChild.info({ n: 3 }, 'child after init');

    const out = written(stderr);
    expect(out).toContain('before init');
    expect(out).toContain('after init');
    expect(out).toContain('"module":"EarlyModule"');
    expect(written(stdout)).not.toContain('after init');
  });
});
