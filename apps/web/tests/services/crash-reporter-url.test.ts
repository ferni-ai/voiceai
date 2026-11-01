/**
 * A crash report carries the page's address, but never its fragment: on a
 * /connect link the fragment is a single-use invite.
 */
import { beforeEach, expect, it, vi } from 'vitest';

const mockApiPost = vi.fn(async () => ({ ok: true, status: 200, data: {} }));
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
