import { describe, expect, it, vi } from 'vitest';
import { recordSent, recordText, type SentAttempt } from '../sent-history.js';

const TEXT: SentAttempt = {
  type: 'reminder',
  channel: 'sms',
  status: 'sent',
  source: 'guarded-text:reminder',
};

describe('recordSent', () => {
  it('writes only the fields the history panel shows', async () => {
    const record = vi.fn(async () => 'a1');
    await recordSent('uid-1', TEXT, record);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('uid-1', {
      type: 'reminder',
      channel: 'sms',
      status: 'sent',
      personaId: 'ferni',
      reason: 'reminder by sms',
      triggeredBy: 'guarded-text:reminder',
    });
  });

  it('skips ids with no account: a phone id is the number itself', async () => {
    const record = vi.fn(async () => 'a1');
    await recordSent('phone:+15555550100', TEXT, record);
    await recordSent('sponsored_abc', TEXT, record);
    await recordSent('', TEXT, record);
    expect(record).not.toHaveBeenCalled();
  });

  it('a failed write never throws (the send already went out)', async () => {
    const record = vi.fn(async () => {
      throw new Error('firestore down');
    });
    await expect(recordSent('uid-1', TEXT, record)).resolves.toBeUndefined();
  });

  it('a guarded text: its kind names it unless the sender says otherwise; failed when refused', async () => {
    const record = vi.fn(async (_u: string, _a: Record<string, unknown>) => 'a1');
    await recordText({ userId: 'uid-1', kind: 'proactive' }, true, record);
    await recordText(
      { userId: 'uid-1', kind: 'proactive', historyType: 'reminder' },
      false,
      record
    );
    expect(record.mock.calls.map(([, a]) => [a.type, a.status, a.triggeredBy])).toEqual([
      ['check_in', 'sent', 'guarded-text:proactive'],
      ['reminder', 'failed', 'guarded-text:proactive'],
    ]);
  });
});
