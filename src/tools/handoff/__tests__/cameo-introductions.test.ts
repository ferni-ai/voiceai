/**
 * Ferni introduces a teammate only once it's earned, only once, and the app is told.
 *
 * Before: a brand-new person who mentioned habits was offered Maya ("the tool will
 * trigger their unlock"), nothing unlocked her, and the handoff Ferni then offered
 * was refused. And the reveal event had no listener, so the app never showed it.
 */
import type { Firestore } from '@google-cloud/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findCameoUnlockCandidate } from '../../../intelligence/context-builders/team/cameo-unlock.js';
import { getTeamUnlockState } from '../../../services/social/team-unlocks.js';
import {
  clearTeamIntroductionsCache,
  getIntroducedTeammates,
  recordTeammateIntroduced,
} from '../../../services/social/team-introductions.js';
import { forwardCameoReveals } from '../../../agents/voice-agent/cameo-reveal.js';
import { introduceTeammate } from '../introduce-member.js';
import { cameoUnlockEvents } from '../state.js';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const MAYA = { memberId: 'maya-santos', displayName: 'Maya Santos', role: 'Habits & Routines' };
const habitsTalk = {
  userText: 'I really want to build better habits and a morning routine',
  analysis: { topics: { detected: ['habits', 'routine'] }, intent: { primary: 'habits' } },
  userProfile: { totalConversations: 0 },
} as never;

/** A Firestore stand-in that keeps one introductions document and its writes */
function fakeDb(members?: string[]) {
  const writes: Array<{ data: Record<string, unknown>; options: unknown }> = [];
  const doc = {
    get: async () => ({ exists: !!members, data: () => ({ members }) }),
    set: async (data: Record<string, unknown>, options: unknown) =>
      void writes.push({ data, options }),
  };
  const chain = { doc: () => ({ collection: () => ({ doc: () => doc }) }) };
  return { db: { collection: () => chain } as unknown as Firestore, writes };
}

beforeEach(() => clearTeamIntroductionsCache());
afterEach(() => {
  vi.useRealTimers();
  cameoUnlockEvents.removeAllListeners('memberUnlocked');
});

describe('who Ferni may introduce', () => {
  it("nobody yet, for a new person: they haven't earned a teammate", () => {
    const { candidate } = findCameoUnlockCandidate(
      habitsTalk,
      getTeamUnlockState(null, 'free'),
      new Set()
    );
    expect(candidate).toBeNull();
  });

  it('Maya, for a subscriber talking about habits', () => {
    const { candidate } = findCameoUnlockCandidate(
      habitsTalk,
      getTeamUnlockState(null, 'friend'),
      new Set()
    );
    expect(candidate?.memberId).toBe('maya-santos');
  });

  it('not Maya again once she has been introduced', () => {
    const state = getTeamUnlockState(null, 'friend');
    const { candidate } = findCameoUnlockCandidate(habitsTalk, state, new Set(['maya-santos']));
    expect(candidate?.memberId).not.toBe('maya-santos');
  });
});

describe('introductions are remembered per person', () => {
  it('reads what was stored, and records a new one', async () => {
    const { db, writes } = fakeDb(['peter-john']);
    expect([...(await getIntroducedTeammates('u1', db))]).toEqual(['peter-john']);
    await recordTeammateIntroduced('u1', 'maya-santos', db);
    expect([...(await getIntroducedTeammates('u1', db))].sort()).toEqual([
      'maya-santos',
      'peter-john',
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0].options).toEqual({ merge: true });
  });

  it('one person’s introductions are not another’s', async () => {
    await recordTeammateIntroduced('u1', 'maya-santos', fakeDb().db);
    expect(await getIntroducedTeammates('u2', fakeDb().db)).toEqual(new Set());
  });
});

describe('the introduceMember tool', () => {
  it('refuses a teammate still locked: nothing recorded, nothing revealed', async () => {
    vi.useFakeTimers();
    const revealed = vi.fn();
    cameoUnlockEvents.on('memberUnlocked', revealed);
    const ok = await introduceTeammate(MAYA, 'Meet Maya!', 100, {
      userProfile: { id: 'new-person' } as never,
      tier: 'free',
      sessionId: 's1',
    });
    vi.advanceTimersByTime(1000);
    expect(ok).toBe(false);
    expect(revealed).not.toHaveBeenCalled();
    expect(await getIntroducedTeammates('new-person', null)).toEqual(new Set());
  });

  it('introduces an earned teammate: recorded, and revealed for this call when the speech ends', async () => {
    vi.useFakeTimers();
    const revealed = vi.fn();
    cameoUnlockEvents.on('memberUnlocked', revealed);
    const ok = await introduceTeammate(MAYA, 'Meet Maya!', 100, {
      userProfile: { id: 'subscriber' } as never,
      tier: 'friend',
      sessionId: 's1',
    });
    expect(ok).toBe(true);
    expect((await getIntroducedTeammates('subscriber', null)).has('maya-santos')).toBe(true);
    expect(revealed).not.toHaveBeenCalled(); // not before Ferni has said it
    vi.advanceTimersByTime(100);
    expect(revealed).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'maya-santos', sessionId: 's1' })
    );
  });
});

describe('the reveal reaches the app', () => {
  it("this call's reveal is sent as cameo_unlock; another call's is not; cleanup stops it", () => {
    const sent: Array<Record<string, unknown>> = [];
    const room = {
      localParticipant: {
        publishData: async (data: Uint8Array) =>
          void sent.push(JSON.parse(new TextDecoder().decode(data))),
      },
    };
    const stop = forwardCameoReveals(room, 's1');
    const reveal = { ...MAYA, spokenIntro: 'Meet Maya!' };

    cameoUnlockEvents.emit('memberUnlocked', { ...reveal, sessionId: 's2' });
    cameoUnlockEvents.emit('memberUnlocked', { ...reveal, sessionId: 's1' });
    stop();
    cameoUnlockEvents.emit('memberUnlocked', { ...reveal, sessionId: 's1' });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'cameo_unlock',
      memberId: 'maya-santos',
      displayName: 'Maya Santos',
    });
  });
});
