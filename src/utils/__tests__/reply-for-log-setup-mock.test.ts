/**
 * The test setup (src/tests/setup.ts) mocks safe-logger for every suite, and its
 * replyForLog used to hand the text back whole: every test saw dev behaviour, so a test
 * asserting "no words in the log" proved nothing about prod. The mock now carries the real
 * reply-for-log functions. This pins it: through the setup's mock, no database set (prod)
 * gives a length, and a dev database gives the words. Each is a vi.fn whose default is the
 * real function: a test may re-point it (crash-analytics-admin did), and a vitest reset
 * puts the real one back rather than leaving a mock that returns undefined.
 *
 * The env is set, and safe-logger imported, inside each test: vitest resets env between
 * files and a module can read env when it loads.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

const loadSetupMock = async () => {
  const safeLogger = await import('../safe-logger.js');
  // The setup's mock, not the real module: the real getLogger is not a vi.fn.
  expect(vi.isMockFunction(safeLogger.getLogger)).toBe(true);
  return safeLogger;
};

describe('the setup mock of safe-logger', () => {
  it('logs a length, never the words, when no database is set (prod)', async () => {
    vi.stubEnv('FIRESTORE_DATABASE', undefined);
    vi.stubEnv('LOG_FULL_RESPONSES', 'true');
    const { isFullLoggingEnabled, repliesForLog, replyForLog } = await loadSetupMock();

    expect(replyForLog('some words')).toBe('[10 chars]');
    expect(repliesForLog(['some words', 'hi'])).toEqual(['[10 chars]', '[2 chars]']);
    expect(isFullLoggingEnabled()).toBe(false);
  });

  it('logs the words on a dev database (positive control)', async () => {
    vi.stubEnv('FIRESTORE_DATABASE', 'ferni-dev');
    vi.stubEnv('LOG_FULL_RESPONSES', 'true');
    const { isFullLoggingEnabled, repliesForLog, replyForLog } = await loadSetupMock();

    expect(replyForLog('some words')).toBe('some words');
    expect(repliesForLog(['some words', 'hi'])).toEqual(['some words', 'hi']);
    expect(isFullLoggingEnabled()).toBe(true);
  });

  it('is a mock function a test can re-point at the real one', async () => {
    vi.stubEnv('FIRESTORE_DATABASE', undefined);
    const { replyForLog } = await loadSetupMock();
    const { replyForLog: real } = await import('../reply-for-log.js');

    vi.mocked(replyForLog).mockImplementation(real);
    expect(replyForLog('some words')).toBe('[10 chars]');
    expect(replyForLog).toHaveBeenCalledWith('some words');
  });

  it('falls back to the real function after vitest resets and restores mocks', async () => {
    vi.stubEnv('FIRESTORE_DATABASE', undefined);
    const { isFullLoggingEnabled, repliesForLog, replyForLog } = await loadSetupMock();
    vi.mocked(replyForLog).mockImplementation(() => 'a stub');
    vi.mocked(repliesForLog).mockReturnValue(['a stub']);
    vi.mocked(isFullLoggingEnabled).mockReturnValue(true);

    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.restoreAllMocks();

    expect(replyForLog('some words')).toBe('[10 chars]');
    expect(repliesForLog(['hi'])).toEqual(['[2 chars]']);
    expect(isFullLoggingEnabled()).toBe(false);
  });
});
