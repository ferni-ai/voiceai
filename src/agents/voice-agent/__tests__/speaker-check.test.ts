/**
 * Speaker check: when the agent asks "Someone new?" and what an answer changes.
 * The web half of the contract is apps/web/tests/contracts/speaker-check.contract.test.ts.
 */

import { EventEmitter } from 'node:events';
import type { Room } from '@livekit/rtc-node';
import { afterEach, describe, expect, it } from 'vitest';
import { endHouseholdSession, getActiveSession } from '../../../services/voice/voice-household.js';
import {
  getSpeakerChangeDetector,
  removeSpeakerChangeDetector,
} from '../../../services/voice/voice-speaker-change.js';
import {
  createSpeakerCheckGate,
  GUEST_SPEAKER_ID,
  listenForSpeakerCheckReplies,
  parseSpeakerCheckReply,
  PRIMARY_SPEAKER_ID,
  SPEAKER_CHECK_MIN_INTERVAL_MS,
  SPEAKER_CHECK_QUIET_START_MS,
} from '../speaker-check.js';

const SESSION = 'session-speaker-check-unit';

afterEach(() => {
  removeSpeakerChangeDetector(SESSION);
  endHouseholdSession(SESSION);
});

describe('createSpeakerCheckGate', () => {
  const START = 1_000_000;

  it('never asks in the first 30 s of a call', () => {
    const gate = createSpeakerCheckGate(START, 0.6);
    expect(gate.shouldAsk(0.9, START + SPEAKER_CHECK_QUIET_START_MS - 1)).toBe(false);
    expect(gate.shouldAsk(0.9, START + SPEAKER_CHECK_QUIET_START_MS)).toBe(true);
  });

  it('asks only when confidence is above the threshold', () => {
    const gate = createSpeakerCheckGate(START, 0.6);
    const later = START + SPEAKER_CHECK_QUIET_START_MS;
    expect(gate.shouldAsk(0.6, later)).toBe(false);
    expect(gate.shouldAsk(0.61, later)).toBe(true);
  });

  it('asks at most once per 10 minutes', () => {
    const gate = createSpeakerCheckGate(START, 0.6);
    const first = START + SPEAKER_CHECK_QUIET_START_MS;
    expect(gate.shouldAsk(0.9, first)).toBe(true);
    expect(gate.shouldAsk(0.9, first + SPEAKER_CHECK_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(gate.shouldAsk(0.9, first + SPEAKER_CHECK_MIN_INTERVAL_MS)).toBe(true);
  });

  it('a change it declined does not start the 10-minute wait', () => {
    const gate = createSpeakerCheckGate(START, 0.6);
    const later = START + SPEAKER_CHECK_QUIET_START_MS;
    expect(gate.shouldAsk(0.3, later)).toBe(false);
    expect(gate.shouldAsk(0.9, later + 1)).toBe(true);
  });
});

describe('parseSpeakerCheckReply', () => {
  it('reads the two answers and nothing else', () => {
    expect(parseSpeakerCheckReply({ type: 'speaker_check_reply', answer: 'still_me' })).toBe(
      'still_me'
    );
    expect(parseSpeakerCheckReply({ type: 'speaker_check_reply', answer: 'someone_new' })).toBe(
      'someone_new'
    );
    expect(parseSpeakerCheckReply({ type: 'speaker_check_reply', answer: 'admin' })).toBeNull();
    expect(parseSpeakerCheckReply({ type: 'user_feedback', answer: 'still_me' })).toBeNull();
    expect(parseSpeakerCheckReply(null)).toBeNull();
  });
});

describe('listenForSpeakerCheckReplies', () => {
  function roomDouble(): EventEmitter & Room {
    const room = new EventEmitter() as EventEmitter & { localParticipant: { identity: string } };
    room.localParticipant = { identity: 'agent' };
    return room as unknown as EventEmitter & Room;
  }
  const bytes = (message: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(message));

  it('tags an anonymous caller who says "still me" as the primary speaker', async () => {
    const room = roomDouble();
    listenForSpeakerCheckReplies(room, SESSION, undefined);

    room.emit('dataReceived', bytes({ type: 'speaker_check_reply', answer: 'still_me' }), {
      identity: 'user',
    });

    await expect
      .poll(() => getSpeakerChangeDetector(SESSION).getState().currentSpeakerId)
      .toBe(PRIMARY_SPEAKER_ID);
    expect(getActiveSession(SESSION)?.currentUserId).toBe(PRIMARY_SPEAKER_ID);
  });

  it("ignores the agent's own messages, non-JSON payloads, and after unsubscribe", async () => {
    const room = roomDouble();
    getSpeakerChangeDetector(SESSION).setCurrentSpeaker('user-1');
    const stop = listenForSpeakerCheckReplies(room, SESSION, 'user-1');
    const reply = bytes({ type: 'speaker_check_reply', answer: 'someone_new' });

    room.emit('dataReceived', reply, { identity: 'agent' });
    room.emit('dataReceived', new TextEncoder().encode('not json'), { identity: 'user' });
    room.emit('dataReceived', reply); // no participant
    stop();
    room.emit('dataReceived', reply, { identity: 'user' });
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(getSpeakerChangeDetector(SESSION).getState().currentSpeakerId).toBe('user-1');
    expect(getActiveSession(SESSION)).toBeNull();
  });

  it('a guest reply after the ignored ones still lands (the listener is live)', async () => {
    const room = roomDouble();
    listenForSpeakerCheckReplies(room, SESSION, 'user-1');

    room.emit('dataReceived', bytes({ type: 'speaker_check_reply', answer: 'someone_new' }), {
      identity: 'user',
    });

    await expect.poll(() => getActiveSession(SESSION)?.currentUserId).toBe(GUEST_SPEAKER_ID);
  });
});
