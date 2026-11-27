/**
 * #3215: a crash report never carries what the caller said. Not on the report, not in the
 * offline queue (localStorage), and not on a dropped call's log line or report.
 */
import { beforeEach, expect, it, vi } from 'vitest';

const SENT = { ok: true, status: 200, data: {} };
const mockApiPost = vi.fn(async (_path: string, _body: unknown) => SENT);
vi.mock('../../src/utils/api.js', () => ({ apiPost: mockApiPost }));
const logged = vi.hoisted(() => [] as unknown[]);
vi.mock('../../src/utils/logger.js', () => {
  const logger = Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [
      level,
      (...args: unknown[]) => logged.push([level, ...args]),
    ])
  );
  return { createLogger: () => logger, log: logger };
});

const { reportCrash, reportConnectionDrop, updateCrashContext, resetCrashContext } =
  await import('../../src/services/crash-reporter.service');

beforeEach(() => {
  mockApiPost.mockClear();
  localStorage.clear();
  logged.length = 0;
  resetCrashContext();
  updateCrashContext({ sessionId: 'session-1', connectionState: 'connected' });
});

const sentBodies = (): Record<string, unknown>[] =>
  mockApiPost.mock.calls.map(([, body]) => body as Record<string, unknown>);

it('sends a crash report with no field for the caller’s words', async () => {
  await reportCrash(new Error('boom'));
  expect(sentBodies()).toHaveLength(1);
  expect(sentBodies()[0]).toMatchObject({ errorMessage: 'boom', sessionId: 'session-1' });
  expect(sentBodies()[0]).not.toHaveProperty('lastUserMessage');
});

it('queues an unsent report with no field for the caller’s words', async () => {
  mockApiPost.mockResolvedValueOnce({ ok: false, status: 503, data: {} } as never);
  await reportCrash(new Error('offline'));
  const queued = localStorage.getItem('ferni_crash_queue') ?? '';
  expect(queued).toContain('offline'); // the crash was queued
  expect(queued).not.toContain('lastUserMessage');
});

it('logs and reports a dropped call with no field for the caller’s words', async () => {
  reportConnectionDrop('network', false);
  await vi.waitFor(() => expect(sentBodies()).toHaveLength(1));
  const [, info] = logged.find(([level]) => level === 'error') as [string, object];
  expect(info).toMatchObject({ reason: 'network', wasGraceful: false });
  expect(info).not.toHaveProperty('lastUserMessage');
  const report = sentBodies()[0];
  expect(report.customData).toMatchObject({ disconnectReason: 'network' });
  expect(report.customData).not.toHaveProperty('lastUserMessage');
});
