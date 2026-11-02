/**
 * A crash report carries the page's address, but never its fragment: on a
 * /connect link the fragment is a single-use invite. Not when it is sent, not
 * in the offline queue (localStorage), and not when the queue is sent later.
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

const { reportCrash, reportableUrl } = await import('../../src/services/crash-reporter.service');

const INVITE = 'Ab3_-'.repeat(8) + 'xyz';

beforeEach(() => {
  mockApiPost.mockClear();
  localStorage.clear();
  logged.length = 0;
  window.history.replaceState(null, '', `/connect?from=text#i=${INVITE}`);
});

it('reports and logs the address without its fragment', async () => {
  expect(reportableUrl()).toBe(`${window.location.origin}/connect?from=text`);
  await reportCrash(new Error('boom'));
  const [, report] = mockApiPost.mock.calls[0] as unknown as [string, { url: string }];
  expect(report.url).toBe(`${window.location.origin}/connect?from=text`);
  expect(JSON.stringify(mockApiPost.mock.calls)).not.toContain(INVITE);
  expect(logged.length).toBeGreaterThan(0); // the capture sees the crash line
  expect(JSON.stringify(logged)).not.toContain(INVITE);
});

it('keeps the fragment out of the offline queue and out of the queued resend', async () => {
  mockApiPost.mockResolvedValueOnce({ ok: false, status: 503, data: {} } as never);
  await reportCrash(new Error('offline'));
  const queued = localStorage.getItem('ferni_crash_queue') ?? '';
  expect(queued).toContain('/connect?from=text'); // the crash was queued, with its address
  expect(queued).not.toContain(INVITE);

  await reportCrash(new Error('back online')); // sent, then the queue is flushed
  const resent = mockApiPost.mock.calls.filter(
    ([, body]) => (body as { fromQueue?: boolean }).fromQueue === true
  );
  expect(resent).toHaveLength(1);
  expect((resent[0][1] as { url: string }).url).toBe(`${window.location.origin}/connect?from=text`);
  expect(JSON.stringify(mockApiPost.mock.calls)).not.toContain(INVITE);
});
