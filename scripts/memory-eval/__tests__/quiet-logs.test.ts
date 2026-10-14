import { afterEach, describe, expect, it, vi } from 'vitest';
import { quietLogsOnRealCalls } from '../quiet-logs.js';

describe('quietLogsOnRealCalls', () => {
  it('logs only warnings and errors on real calls, and leaves seeded runs alone', () => {
    const real: NodeJS.ProcessEnv = { LOG_LEVEL: 'debug' };
    quietLogsOnRealCalls(['--cases', 'cases.json'], real);
    expect(real.LOG_LEVEL).toBe('warn');
    const seeded: NodeJS.ProcessEnv = {};
    quietLogsOnRealCalls(['--only', 'maya'], seeded);
    expect(seeded.LOG_LEVEL).toBeUndefined();
  });
});

describe('what fastCapture logs of a turn', () => {
  const level = process.env.LOG_LEVEL;
  afterEach(() => {
    if (level === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = level;
    vi.restoreAllMocks();
  });

  /** Everything written to stdout and stderr while one turn is captured, with a fresh logger. */
  async function consoleOfOneTurn(argv: string[]): Promise<string> {
    delete process.env.LOG_LEVEL;
    quietLogsOnRealCalls(argv, process.env);
    // The test setup mocks the logger; the real one is what a run would use.
    vi.doUnmock('../../../src/utils/safe-logger.js');
    vi.resetModules();
    const { fastCapture } = await import('../../../src/memory/dynamic/fast-capture.js');
    const out: string[] = [];
    const keep = (chunk: unknown) => {
      out.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(keep);
    vi.spyOn(process.stderr, 'write').mockImplementation(keep);
    await fastCapture({
      userId: 'memeval-quiet',
      sessionId: 'memeval-quiet-s1',
      turnNumber: 0,
      transcript: 'My sister Zebulonia moved to Kalamazoo last week and I miss her.',
      timestamp: new Date('2026-01-01T18:00:00Z'),
    });
    return out.join('');
  }

  it('names what the caller said at the default level (the leak this guards)', async () => {
    expect(await consoleOfOneTurn([])).toContain('Zebulonia');
  });

  it('keeps it off the console with --cases', async () => {
    const out = await consoleOfOneTurn(['--cases', 'cases.json']);
    expect(out).not.toContain('Zebulonia');
    expect(out).not.toContain('Kalamazoo');
  });
});
