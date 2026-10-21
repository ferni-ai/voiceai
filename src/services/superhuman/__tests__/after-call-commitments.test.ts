/**
 * After-call commitment capture: the caller's own "I'll ..." from the call's
 * extraction becomes an open commitment the follow-up readers understand.
 * Only the store and the forgotten-topics read are fakes.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  callerCommitmentDocs,
  isCommitmentCaptureOn,
  localTimeMs,
  recordCallerCommitments,
  sameCommitment,
  type CommitmentObservation,
  type CommitmentSink,
} from '../after-call-commitments.js';
import { toOpenCommitment } from '../commitment-follow-up.js';

const TZ = 'America/New_York';
// Monday 2026-10-12, 12:00 in New York.
const NOW = Date.parse('2026-10-12T16:00:00Z');
const ctx = { userId: 'voice-eval-u1', sessionId: 's1', now: NOW, timezone: TZ };

function obs(over: Partial<CommitmentObservation> = {}): CommitmentObservation {
  return {
    subjectKind: 'self',
    attribute: 'commitment',
    value: 'call sister',
    eventDate: '2026-10-18',
    confidence: 0.9,
    source: { quote: "I'll call my sister Sunday" },
    ...over,
  };
}

function memorySink(open: string[] = []) {
  const added: Array<Record<string, unknown>> = [];
  const sink: CommitmentSink = {
    openTexts: async () => open,
    add: async (_uid, doc) => void added.push(doc),
  };
  return { sink, added };
}

describe('the flag', () => {
  it('is on by default; only an explicit off stops capture', () => {
    expect(isCommitmentCaptureOn({})).toBe(true);
    expect(isCommitmentCaptureOn({ COACH_COMMITMENT_CAPTURE: 'off' })).toBe(false);
  });
});

describe('which observations become commitments', () => {
  it("keeps the caller's own dated promise, due the evening of that day their time", () => {
    const [doc] = callerCommitmentDocs([obs()], ctx);
    expect(doc).toMatchObject({
      statement: "I'll call my sister Sunday",
      summary: 'call sister',
      status: 'active',
      source: 'after_call',
      sessionId: 's1',
      followUpCount: 0,
    });
    // Sunday 2026-10-18 17:00 EDT is 21:00 UTC.
    expect(doc.followUpAfter).toBe(Date.parse('2026-10-18T21:00:00Z'));
    expect(doc.targetDate).toBe(doc.followUpAfter);
    // The follow-up readers accept it as an open commitment.
    expect(toOpenCommitment('c1', doc)).not.toBeNull();
  });

  it('an undated promise is followed up after three days', () => {
    const [doc] = callerCommitmentDocs(
      [obs({ eventDate: undefined, source: { quote: "I'm going to apply for that job" } })],
      ctx
    );
    expect(doc.followUpAfter).toBe(NOW + 3 * 86_400_000);
    expect(doc.targetDate).toBeUndefined();
  });

  it('today, after the evening has passed, it asks the next day', () => {
    const late = Date.parse('2026-10-12T23:30:00Z'); // 19:30 New York
    const [doc] = callerCommitmentDocs([obs({ eventDate: '2026-10-12' })], { ...ctx, now: late });
    expect(doc.followUpAfter).toBe(late + 86_400_000);
  });

  it('drops what is not a commitment the caller made', () => {
    const dropped = [
      obs({ subjectKind: 'person', source: { quote: "My sister said she'll call me" } }),
      obs({ attribute: 'event' }),
      obs({ by: 'ferni' }),
      obs({ confidence: 0.4 }),
      obs({ source: {} }), // no quote of their words
      obs({ source: { quote: 'My manager moved a big deadline up to Friday.' } }),
      obs({ source: { quote: "I'm thinking of going for a hike." } }),
      obs({ eventDate: '2026-10-10' }), // a day already past
    ];
    for (const o of dropped) expect(callerCommitmentDocs([o], ctx), JSON.stringify(o)).toEqual([]);
  });

  it('takes a curly apostrophe, dedupes within the call and keeps at most three', () => {
    const many = [
      obs({ source: { quote: 'I’ll call my sister Sunday' } }),
      obs({ source: { quote: "I'll call my sister on Sunday" } }),
      obs({ value: 'a', source: { quote: "I'm going to book the dentist" } }),
      obs({ value: 'b', source: { quote: "I'm going to apply for the design job" } }),
      obs({ value: 'c', source: { quote: "I'm going to clean out the garage" } }),
    ];
    const docs = callerCommitmentDocs(many, ctx);
    expect(docs.map((d) => d.statement)).toEqual([
      'I’ll call my sister Sunday',
      "I'm going to book the dentist",
      "I'm going to apply for the design job",
    ]);
  });
});

describe('recording', () => {
  it('writes a new commitment under the session user', async () => {
    const { sink, added } = memorySink();
    const n = await recordCallerCommitments([obs()], ctx, { sink, forgotten: async () => [] });
    expect(n).toBe(1);
    expect(added).toEqual([expect.objectContaining({ userId: 'voice-eval-u1' })]);
  });

  it('skips one already open (said on the call and caught on the turn path)', async () => {
    const { sink, added } = memorySink(['I will call my sister on Sunday']);
    expect(await recordCallerCommitments([obs()], ctx, { sink, forgotten: async () => [] })).toBe(
      0
    );
    expect(added).toEqual([]);
  });

  it('skips a forgotten topic, and writes nothing when forgotten topics cannot be read', async () => {
    const a = memorySink();
    await recordCallerCommitments([obs()], ctx, {
      sink: a.sink,
      forgotten: async () => ['sister'],
    });
    expect(a.added).toEqual([]);
    const b = memorySink();
    await recordCallerCommitments([obs()], ctx, { sink: b.sink, forgotten: async () => null });
    expect(b.added).toEqual([]);
  });

  it('with the flag off or no user, touches nothing', async () => {
    const forgotten = vi.fn(async () => []);
    const { sink, added } = memorySink();
    await recordCallerCommitments([obs()], ctx, {
      sink,
      forgotten,
      env: { COACH_COMMITMENT_CAPTURE: 'off' },
    });
    await recordCallerCommitments([obs()], { ...ctx, userId: '' }, { sink, forgotten });
    expect(added).toEqual([]);
    expect(forgotten).not.toHaveBeenCalled();
  });

  it('never throws when the store fails', async () => {
    const sink: CommitmentSink = {
      openTexts: async () => {
        throw new Error('down');
      },
      add: async () => undefined,
    };
    await expect(
      recordCallerCommitments([obs()], ctx, { sink, forgotten: async () => [] })
    ).resolves.toBe(0);
  });
});

describe('only commitments someone can act on', () => {
  it('stores real plans, "call her tomorrow" and the run-on Tom line too, but not a goodbye', async () => {
    const { sink, added } = memorySink();
    const written = await recordCallerCommitments(
      [
        obs({ value: 'call her', source: { quote: "I'll call her tomorrow" } }),
        obs({ value: 'goodbye', source: { quote: "I'll catch you later" } }),
        obs({ value: 'send photos', source: { quote: "I'll send Mindy the photos" } }),
        obs({ value: 'dentist', source: { quote: "I'll be at the dentist at 2" } }),
        obs({
          value: 'pay Tom',
          source: { quote: "I owe Tom fifty bucks, I'll pay him back Friday" },
        }),
      ],
      ctx,
      { sink, forgotten: async () => [] }
    );
    // At most three per call (MAX_PER_CALL): the goodbye is out, the first three plans are in.
    expect(written).toBe(3);
    expect(added.map((d) => d.statement)).toEqual([
      "I'll call her tomorrow",
      "I'll send Mindy the photos",
      "I'll be at the dentist at 2",
    ]);
    const { sink: tomSink, added: tom } = memorySink();
    await recordCallerCommitments(
      [
        obs({
          value: 'pay Tom',
          source: { quote: "I owe Tom fifty bucks, I'll pay him back Friday" },
        }),
      ],
      ctx,
      { sink: tomSink, forgotten: async () => [] }
    );
    expect(tom.map((d) => d.statement)).toEqual([
      "I owe Tom fifty bucks, I'll pay him back Friday",
    ]);
  });
});

describe('helpers', () => {
  it('sameCommitment matches rewordings, not different plans', () => {
    expect(sameCommitment("I'll call my sister Sunday", 'call sister on Sunday')).toBe(true);
    expect(sameCommitment("I'll call my sister Sunday", "I'm going to book the dentist")).toBe(
      false
    );
  });

  it('localTimeMs handles daylight time and an unknown zone', () => {
    expect(localTimeMs('2026-12-01', 17, TZ)).toBe(Date.parse('2026-12-01T22:00:00Z'));
    expect(localTimeMs('2026-12-01', 17, 'Not/AZone')).toBe(Date.parse('2026-12-01T17:00:00Z'));
  });
});
