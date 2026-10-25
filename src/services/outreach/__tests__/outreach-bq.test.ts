/**
 * outreach_events rows from guarded texts and the proactive check-in log: event type,
 * channel, kind and a short code only, never the words, the number or the id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const set = vi.fn(async () => undefined);
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ set }) }) }) }),
  }),
}));

import { flushBqEvents, setBqTransportForTests } from '../../analytics/bq-events.js';
import {
  sendGuardedText,
  sendOnBehalfText,
  type TextDeps,
  type TextStore,
} from '../guarded-text.js';
import { reportText } from '../outreach-bq.js';
import { writeOutreachLog } from '../proactive-channels/outreach-log.js';
import { atomicLocks } from './atomic-locks.js';

const NOW = new Date('2026-10-12T16:00:00Z');
const PHONE = '+15551234567';
const BODY = 'It’s noon. You wanted to call your mom.';

function deps(
  send: TextDeps['send'] = vi.fn(async () => ({ success: true, messageSid: 'SM1' }))
): TextDeps {
  const store = {
    forUser: vi.fn(async () => []),
    forPhoneHash: vi.fn(async () => []),
    add: vi.fn(async () => 'new'),
    ...atomicLocks(),
    sponsoredPhone: vi.fn(async () => undefined),
    isOptedOut: vi.fn(async () => false),
    consentDoc: async () => undefined,
    userDoc: vi.fn(async () => undefined),
    legacySmsChannels: vi.fn(async () => undefined),
  } as unknown as TextStore;
  return {
    env: { LOG_HASH_SECRET: 'test-secret' },
    store,
    authPhone: vi.fn(async () => PHONE),
    send,
    now: () => NOW,
  };
}

describe('outreach_events', () => {
  let rows: Array<Record<string, unknown>>;
  beforeEach(() => {
    rows = [];
    setBqTransportForTests(async (table, batch) => {
      if (table === 'outreach_events') rows.push(...batch);
    });
    vi.stubEnv('BQ_EVENTS', 'on');
    vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setBqTransportForTests(null);
  });

  const text = {
    userId: 'uid-7',
    body: BODY,
    kind: 'follow-up',
    refId: 'f1',
    minGapMs: 1,
  } as const;

  it('a guarded text that goes out is a send, with no words, number or id', async () => {
    expect(await sendGuardedText(text, deps())).toEqual({ sent: true });
    await flushBqEvents();
    expect(rows).toEqual([
      expect.objectContaining({
        event_type: 'send',
        channel: 'sms',
        kind: 'follow-up',
        third_party: false,
      }),
    ]);
    expect(rows[0]?.user_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(rows)).not.toMatch(/noon|5551234567|uid-7/);
  });

  it('a skipped and a failed text carry their reason code', async () => {
    await sendGuardedText(text, { ...deps(), env: {} });
    await sendGuardedText(text, deps(vi.fn(async () => ({ success: false, error: 'x' }))));
    await flushBqEvents();
    expect(rows.map((r) => [r.event_type, r.reason])).toEqual([
      ['skip', 'no-hash-secret'],
      ['fail', 'send-failed'],
    ]);
  });

  it('a text for someone else is third_party; quiet hours is a hold', async () => {
    const onBehalf = {
      senderUserId: 'uid-7',
      toPhone: '+15557654321',
      body: BODY,
      refId: 'o1',
      zone: 'America/New_York',
    };
    expect(await sendOnBehalfText(onBehalf, deps())).toEqual({ sent: true });
    reportText('uid-7', 'on-behalf', { sent: false, reason: 'quiet-hours' });
    await flushBqEvents();
    expect(rows.map((r) => [r.event_type, r.kind, r.third_party])).toEqual([
      ['send', 'on-behalf', true],
      ['hold', 'on-behalf', true],
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/7654321/);
  });

  it('a proactive check-in log entry sends enum fields only, never its reason sentence', async () => {
    await writeOutreachLog('uid-7', {
      sourceId: 'promise:1',
      kind: 'promise',
      channel: 'in_app',
      reason: 'I said I would check in about your mom',
      why: 'quiet hours over',
      at: NOW.toISOString(),
      outcome: 'failed',
      fallbackFrom: 'sms',
      text: BODY,
    });
    await flushBqEvents();
    expect(set).toHaveBeenCalled();
    expect(rows).toEqual([
      expect.objectContaining({
        event_type: 'fail',
        channel: 'in_app',
        kind: 'promise',
        outcome: 'failed',
        reason: 'fallback_from_sms',
        third_party: false,
      }),
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/mom|noon|uid-7|quiet hours/);
  });
});
