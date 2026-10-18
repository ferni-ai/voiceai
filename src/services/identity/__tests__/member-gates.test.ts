/**
 * Gates that write a member's stored data refuse every non-member id, not just
 * the 'anonymous' placeholder. Before isMemberIdentity, a per-session stranger
 * (anon:) or the third party on a call Ferni places (onbehalf:) passed
 * `userId !== 'anonymous'` and their words reached the member stores. Each case
 * also runs a member id through the same gate, so a gate that refused everyone
 * would fail here too.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  anniversaryFor,
  type AnniversaryStore,
} from '../../../agents/multi-agent/friendship-anniversary.js';
import { disputeForCaller, type DisputeStore } from '../../../memory/recall/dispute.js';
import { forgetForCaller, type ForgetStore } from '../../../memory/recall/forget.js';
import { isMemberCall } from '../../outreach/after-call-checkin.js';

const NON_MEMBERS = ['anonymous', 'anon:3b0e7c1e-0000-4000-8000-000000000000', 'onbehalf:call-1'];
const MEMBER = 'uid-member-1';
const DENIED = 'What contracts?';
const REPLY = 'How did those contracts end up looking by the time you wrapped up last night?';

function forgetStore(): ForgetStore & { facts: ReturnType<typeof vi.fn> } {
  return {
    facts: vi.fn(async () => []),
    markForgotten: vi.fn(async () => undefined),
    addTopic: vi.fn(async () => undefined),
    topics: vi.fn(async () => []),
  };
}

function disputeStore(): DisputeStore & { facts: ReturnType<typeof vi.fn> } {
  return {
    facts: vi.fn(async () => []),
    summaries: vi.fn(async () => []),
    markFacts: vi.fn(async () => undefined),
    markSummaryItems: vi.fn(async () => undefined),
  };
}

describe('member gates on stored data', () => {
  it.each(NON_MEMBERS)('forgetting never touches the store for %s', async (userId) => {
    const store = forgetStore();
    expect(await forgetForCaller(userId, 'my dog', store)).toEqual({ kind: 'not-saved' });
    expect(store.facts).not.toHaveBeenCalled();
    expect(store.addTopic).not.toHaveBeenCalled();
  });

  it('forgetting reaches the store for a member', async () => {
    const store = forgetStore();
    await forgetForCaller(MEMBER, 'my dog', store);
    expect(store.facts).toHaveBeenCalledWith(MEMBER);
  });

  it.each(NON_MEMBERS)('a denial never reads or marks memories for %s', async (userId) => {
    const store = disputeStore();
    const result = await disputeForCaller(userId, DENIED, REPLY, store);
    expect(result).toEqual({ kind: 'nothing' });
    expect(store.facts).not.toHaveBeenCalled();
  });

  it('a denial reads memories for a member', async () => {
    const store = disputeStore();
    await disputeForCaller(MEMBER, DENIED, REPLY, store);
    expect(store.facts).toHaveBeenCalledWith(MEMBER);
  });

  const history = { calls: 9, firstContact: '2026-07-16T12:00:00Z' };
  const deps = (store: AnniversaryStore) => ({
    store,
    now: new Date('2026-10-17T12:00:00Z'),
    env: { FRIEND_CELEBRATIONS: 'on' },
  });

  it.each(NON_MEMBERS)('no anniversary is read or marked for %s', async (userId) => {
    const store = {
      said: vi.fn(async () => new Set<string>()),
      mark: vi.fn(async () => undefined),
    };
    expect(await anniversaryFor(userId, history, 'UTC', deps(store))).toBeUndefined();
    expect(store.said).not.toHaveBeenCalled();
  });

  it('an anniversary is read for a member', async () => {
    const store = {
      said: vi.fn(async () => new Set<string>()),
      mark: vi.fn(async () => undefined),
    };
    expect(await anniversaryFor(MEMBER, history, 'UTC', deps(store))).toBeDefined();
    expect(store.said).toHaveBeenCalledWith(MEMBER);
  });

  it('the after-call check-in texts members only, through the shared predicate', () => {
    for (const id of NON_MEMBERS) expect(isMemberCall(id), id).toBe(false);
    expect(isMemberCall('phone:+15555550100')).toBe(true);
    expect(isMemberCall(MEMBER)).toBe(true);
  });
});
