/**
 * notifyWithResult says whether anyone was told: Slack accepted it, opsAlert
 * raised it (critical, no webhook), it failed and can be retried, or there was
 * nowhere to send it. notify() keeps its old boolean (true only from Slack).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationContext } from '../slack-notifications.js';

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

type Ctx = NotificationContext;
const critical: Ctx = { type: 'incident_opened', title: 'Q', message: 'm', severity: 'error' };
const warning: Ctx = { type: 'health_degraded', title: 'Q', message: 'm', severity: 'warning' };

/** A fresh module load: the webhooks are read from the environment at load. */
async function service(webhook: string) {
  vi.resetModules();
  vi.stubEnv('SLACK_WEBHOOK_URL', webhook);
  vi.stubEnv('SLACK_ALERTS_WEBHOOK', '');
  const { SlackNotificationService } = await import('../slack-notifications.js');
  const { resetOpsAlerts } = await import('../../platform/ops-alert.js');
  resetOpsAlerts();
  return new SlackNotificationService();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('with a webhook', () => {
  it.each([
    ['429', () => new Response('rate_limited', { status: 429 }), 'http 429'],
    ['503', () => new Response('down', { status: 503 }), 'http 503'],
  ])('a %s is a retryable failure, and notify() is false', async (_l, res, reason) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => res())
    );
    const slack = await service('https://hooks.example.test/a');
    expect(await slack.notifyWithResult(critical)).toEqual({ status: 'failed', reason });
    expect(await slack.notify(critical)).toBe(false);
  });

  it('a fetch error or timeout is a retryable failure', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(timeout).mockRejectedValueOnce(new TypeError('x'))
    );
    const slack = await service('https://hooks.example.test/a');
    expect(await slack.notifyWithResult(critical)).toEqual({
      status: 'failed',
      reason: 'TimeoutError',
    });
    expect(await slack.notifyWithResult(critical)).toEqual({
      status: 'failed',
      reason: 'TypeError',
    });
  });

  it('a 200 is delivered via slack, and notify() is true', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const slack = await service('https://hooks.example.test/a');
    expect(await slack.notifyWithResult(critical)).toEqual({ status: 'delivered', via: 'slack' });
    expect(await slack.notify(critical)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://hooks.example.test/a', expect.any(Object));
  });
});

describe('with no webhook', () => {
  it('a critical alert raised by opsAlert is delivered via ops; notify() stays false', async () => {
    const slack = await service('');
    expect(await slack.notifyWithResult(critical)).toEqual({ status: 'delivered', via: 'ops' });
    const again = await service('');
    expect(await again.notify(critical)).toBe(false); // unchanged for existing callers
  });

  it('a critical alert inside the opsAlert cooldown reached nobody: not_configured', async () => {
    const slack = await service('');
    await slack.notifyWithResult(critical); // ops raised it
    expect(await slack.notifyWithResult(critical)).toEqual({ status: 'not_configured' });
  });

  it('a warning is not_configured', async () => {
    const slack = await service('');
    expect(await slack.notifyWithResult(warning)).toEqual({ status: 'not_configured' });
    expect(await slack.notify(warning)).toBe(false);
  });

  it('opsAlert is keyed per alert: a second alert type is not held by the first', async () => {
    const slack = await service('');
    const a = { ...critical, alertKey: 'critical:A' };
    const b = { ...critical, alertKey: 'critical:B' };
    expect(await slack.notifyWithResult(a)).toEqual({ status: 'delivered', via: 'ops' });
    expect(await slack.notifyWithResult(b)).toEqual({ status: 'delivered', via: 'ops' });
    expect(await slack.notifyWithResult(a)).toEqual({ status: 'not_configured' }); // A's cooldown
  });
});
