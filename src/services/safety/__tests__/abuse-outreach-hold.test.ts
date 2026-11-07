/**
 * K1e: the one outreach hold (abuse-outreach-hold.ts), and the sinks that ask it. A call with an
 * abuse disclosure is held, per call, and so is any writer that knows only the user the call is
 * bound to. Every line and id here is invented.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pubsub = vi.hoisted(() => ({ publish: vi.fn(async () => ({ messageId: 'm1' })) }));
vi.mock('../../pubsub/pubsub-client.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getPubSubClient: () => pubsub,
}));

import {
  abuseHoldNow,
  abuseHoldsOutreach,
  noteAbuseRead,
  resetAbuseOutreachHold,
  trackAbuseRead,
} from '../abuse-outreach-hold.js';
import { detectCrisis } from '../crisis-guard.js';
import { bindSessionUser } from '../../../utils/minor-care.js';
import {
  publishCommitmentTrigger,
  publishOutreachTrigger,
} from '../../outreach/trigger-publisher.js';
import { getOutreachDecisionEngine } from '../../outreach/decision-engine.js';
import { initiateGroupOutreach } from '../../conversation-thread/group-outreach.js';

const ABUSE = detectCrisis('my husband hits me');
const SUICIDAL = detectCrisis('I want to end my life.');
/** A read that never settles. */
const unsettled = (): Promise<never> =>
  new Promise<never>(() => {
    // never settles
  });
let n = 0;
/** A fresh call bound to a fresh user, as session start binds every call. */
function freshCall(): { sessionId: string; userId: string } {
  const id = ++n;
  const call = { sessionId: `hold-session-${id}`, userId: `hold-user-${id}` };
  bindSessionUser(call.sessionId, call.userId);
  return call;
}

beforeEach(() => {
  resetAbuseOutreachHold();
  pubsub.publish.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('the hold', () => {
  it('reads the kernel abuse indicators, and not a suicidal-only read', () => {
    expect(ABUSE.indicators.some((i) => i.startsWith('abuse_disclosure'))).toBe(true);
    const a = freshCall();
    const b = freshCall();
    noteAbuseRead(a.sessionId, ABUSE);
    noteAbuseRead(b.sessionId, SUICIDAL);
    expect(abuseHoldNow(a)).toBe(true);
    expect(abuseHoldNow(b)).toBe(false);
  });

  it('is per call, and reaches a writer that knows only the bound user', () => {
    const held = freshCall();
    const other = freshCall();
    noteAbuseRead(held.sessionId, ABUSE);
    expect(abuseHoldNow({ userId: held.userId })).toBe(true);
    expect(abuseHoldNow(other)).toBe(false);
    expect(abuseHoldNow({ userId: other.userId })).toBe(false);
  });

  it('holds on the caller lines at session end', () => {
    expect(abuseHoldNow({ callerLines: ['fine day', "i'm not safe at home"] })).toBe(true);
    expect(abuseHoldNow({ callerLines: ['my brother hits me at video games'] })).toBe(false);
  });

  it('lapses six hours after the last disclosure', () => {
    const call = freshCall();
    const at = Date.now();
    noteAbuseRead(call.sessionId, ABUSE, at);
    expect(abuseHoldNow(call, at + 6 * 60 * 60 * 1000)).toBe(true);
    expect(abuseHoldNow(call, at + 6 * 60 * 60 * 1000 + 1)).toBe(false);
  });

  it('a read in flight holds a writer that cannot wait', () => {
    const call = freshCall();
    void trackAbuseRead(call.sessionId, unsettled(), 1_000);
    expect(abuseHoldNow(call)).toBe(true);
    expect(abuseHoldNow({ userId: call.userId })).toBe(true);
  });

  it('a writer that waits is answered when the read settles, and its timer is cleared', async () => {
    vi.useFakeTimers();
    const call = freshCall();
    let settle: (read: { crisis: { indicators: string[] } }) => void = () => undefined;
    const read = new Promise<{ crisis: { indicators: string[] } }>((resolve) => {
      settle = resolve;
    });
    void trackAbuseRead(call.sessionId, read, 2_000);
    const answer = abuseHoldsOutreach(call);
    settle({ crisis: { indicators: [] } });
    expect(await answer).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a read that has not settled by its wait holds', async () => {
    vi.useFakeTimers();
    const call = freshCall();
    void trackAbuseRead(call.sessionId, unsettled(), 2_000);
    const answer = abuseHoldsOutreach({ userId: call.userId });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await answer).toBe(true);
  });

  it('a read that fails holds', async () => {
    const call = freshCall();
    const read = trackAbuseRead(call.sessionId, Promise.reject(new Error('read failed')), 1_000);
    await read.catch(() => undefined);
    expect(await abuseHoldsOutreach(call)).toBe(true);
  });
});

describe('the outreach sinks ask the hold', () => {
  const trigger = (userId: string) => ({
    userId,
    type: 'commitment_check' as const,
    priority: 'medium' as const,
    reason: 'Follow up on the lease call',
  });

  it('the trigger publisher publishes for an everyday user and not for a held one', async () => {
    const everyday = freshCall();
    const held = freshCall();
    noteAbuseRead(held.sessionId, ABUSE);
    expect((await publishOutreachTrigger(trigger(everyday.userId))).success).toBe(true);
    expect(pubsub.publish).toHaveBeenCalledTimes(1);
    expect(await publishOutreachTrigger(trigger(held.userId))).toMatchObject({ error: 'held' });
    await publishCommitmentTrigger(held.userId, 'call the landlord about the lease', new Date());
    expect(pubsub.publish).toHaveBeenCalledTimes(1);
  });

  it('the decision engine keeps a trigger for an everyday user and not for a held one', () => {
    const engine = getOutreachDecisionEngine();
    const everyday = freshCall();
    const held = freshCall();
    noteAbuseRead(held.sessionId, ABUSE);
    engine.addTrigger({ ...trigger(everyday.userId), type: 'commitment' } as never);
    engine.addTrigger({ ...trigger(held.userId), type: 'commitment' } as never);
    expect(engine.getPendingTriggers(everyday.userId)).toHaveLength(1);
    expect(engine.getPendingTriggers(held.userId)).toHaveLength(0);
  });

  it('group outreach is refused for a held user', async () => {
    const options = (userId: string) => ({
      userId,
      personas: ['ferni', 'peter'],
      leadPersona: 'ferni',
      preferredChannel: 'sms',
      triggerType: 'check_in',
    });
    const everyday = freshCall();
    const held = freshCall();
    noteAbuseRead(held.sessionId, ABUSE);
    const ok = await initiateGroupOutreach(options(everyday.userId) as never);
    expect(ok.error).not.toBe('Caller held');
    expect((await initiateGroupOutreach(options(held.userId) as never)).error).toBe('Caller held');
  });
});

// The raw outreach sinks behind the hold: a new caller of either would skip it.
describe('nothing reaches a raw outreach sink around the hold', () => {
  const SRC = fileURLToPath(new URL('../../../', import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
      return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
    });
  const using = (pattern: RegExp) =>
    files(SRC)
      .filter((f) => pattern.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f))
      .sort();

  it('only the trigger publisher publishes to the outreach topic', () => {
    expect(using(/\.publish(?:<[^>]*>)?\(\s*['"]outreach-triggers/)).toEqual([
      'services/outreach/trigger-publisher.ts',
    ]);
  });

  it('only the publisher and the decision engine save an outreach trigger', () => {
    expect(using(/(?<!function )\bsaveTrigger\(/)).toEqual([
      'services/outreach/decision-engine.ts',
      'services/outreach/trigger-publisher.ts',
      // Its own saveTrigger: a behavioral trigger on the user's profile, never outreach.
      'services/superhuman/semantic-intelligence/behavioral-intelligence.ts',
    ]);
  });
});
