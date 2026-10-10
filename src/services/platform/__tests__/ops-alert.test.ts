/**
 * Operator alerts reach a person: one error line carrying `opsAlert: <key>`, which the
 * Cloud Monitoring policy "Ferni ops alert" turns into an email. Before this, memory
 * health alerts went to a webhook no caller could set, critical security events and
 * error notices only logged, and nobody was told.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const errors = vi.hoisted(() => [] as Array<{ obj: Record<string, unknown>; msg: string }>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn((obj: Record<string, unknown>, msg: string) => errors.push({ obj, msg })),
    child: () => logger,
  };
  return { ...real, createLogger: () => logger, getLogger: () => logger };
});

const { opsAlert, resetOpsAlerts, OPS_ALERT_COOLDOWN_MS } = await import('../ops-alert.js');
const alerted = () => errors.filter((e) => 'opsAlert' in e.obj);

beforeEach(() => {
  errors.length = 0;
  resetOpsAlerts();
});

describe('opsAlert', () => {
  it('writes an error line the alert policy matches, carrying the details', () => {
    expect(opsAlert('memory-health', '🚨 2 alerts', { count: 2 }, 1000)).toBe(true);
    expect(alerted()).toEqual([{ obj: { count: 2, opsAlert: 'memory-health' }, msg: '🚨 2 alerts' }]);
  });

  it('alerts once per key per cooldown, but still logs every occurrence', () => {
    opsAlert('k', 'first', {}, 0);
    expect(opsAlert('k', 'again', {}, OPS_ALERT_COOLDOWN_MS - 1)).toBe(false);
    expect(opsAlert('other', 'different key', {}, 1)).toBe(true);
    expect(opsAlert('k', 'after cooldown', {}, OPS_ALERT_COOLDOWN_MS)).toBe(true);

    expect(errors.map((e) => e.msg)).toEqual(['first', 'again', 'different key', 'after cooldown']);
    expect(alerted().map((e) => e.msg)).toEqual(['first', 'different key', 'after cooldown']);
  });
});

describe('the alert sources reach opsAlert', () => {
  it('a critical security event (account lockout) alerts', async () => {
    const { recordSecurityEvent } = await import('../security-events.js');
    await recordSecurityEvent({ type: 'auth_lockout', action: 'Account locked after 5 failed attempts', outcome: 'blocked' });
    expect(alerted()).toEqual([
      expect.objectContaining({ msg: '🚨 CRITICAL: Account locked after 5 failed attempts' }),
    ]);
    expect(alerted()[0]?.obj.opsAlert).toBe('security:auth_lockout');
  });

  it('a non-critical security event does not', async () => {
    const { recordSecurityEvent } = await import('../security-events.js');
    await recordSecurityEvent({ type: 'auth_success', action: 'Signed in', outcome: 'success' });
    expect(alerted()).toEqual([]);
  });

  it('memory health critical findings alert (they used to need a webhook nobody could set)', async () => {
    const { MemoryHealthCheckJob } = await import('../../../tasks/scheduled/memory-jobs.js');
    const job = new MemoryHealthCheckJob() as unknown as {
      sendAlerts: (alerts: unknown[], config: unknown) => Promise<void>;
    };
    await job.sendAlerts(
      [{ metric: 'retrieval_ms', severity: 'critical', message: 'Retrieval slow', currentValue: 900, threshold: 500 }],
      { sendAlerts: true }
    );
    expect(alerted()).toEqual([
      expect.objectContaining({ msg: '🚨 1 critical memory health alert(s)' }),
    ]);
  });

  it('an error notification with no Slack webhook alerts; info does not', async () => {
    const { SlackNotificationService } = await import('../../integrations/slack-notifications.js');
    const slack = new SlackNotificationService();
    await slack.notify({ type: 'system_alert' as never, title: 'Agent crashed', message: 'exit 1', severity: 'error' });
    await slack.notify({ type: 'system_alert' as never, title: 'Deployed', message: 'ok', severity: 'info' });
    expect(alerted().map((e) => e.msg)).toEqual(['🚨 Agent crashed']);
  });
});
