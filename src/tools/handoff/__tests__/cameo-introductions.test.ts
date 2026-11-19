/**
 * Ferni introduces a teammate only once it's earned, only once, and the app is told.
 *
 * Before: the handoff Ferni offered for a locked teammate was refused, and the reveal
 * event had no listener, so the app never showed it.
 */
import type { Firestore } from '@google-cloud/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTeamIntroductionsCache,
  recordTeammateIntroduced,
} from '../../../services/social/team-introductions.js';
import { forwardCameoReveals } from '../../../agents/voice-agent/cameo-reveal.js';
import { introduceTeammate } from '../introduce-member.js';
import { cameoUnlockEvents } from '../state.js';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const MAYA = { memberId: 'maya-santos', displayName: 'Maya Santos', role: 'Habits & Routines' };
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
