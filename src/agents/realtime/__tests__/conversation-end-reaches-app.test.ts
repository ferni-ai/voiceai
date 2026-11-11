/**
 * A goodbye's `conversation_end` must reach the app on every entry path.
 *
 * The multi-agent path (multi-agent-entry.ts, agent-setup.ts) created the call's
 * frontend publisher but never registered the call's frontend signal; only the
 * single-agent path did. So every idle-after-goodbye end sent `conversation_end`
 * to no one (dev logged `sent: false` on every one) and the app never hung up.
 * The signal is now bound by initializeFrontendPublisher itself, so these tests
 * call only that, never initFrontendSignal.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  initializeFrontendPublisher,
  releaseFrontendPublisher,
  resetFrontendPublisher,
  type RoomRef,
} from '../frontend-publisher.js';
import {
  resetFrontendSignal,
  sendFrontendSignal,
} from '../../../services/communication/frontend-signal.js';
import { wrapUpCall } from '../../shared/call-wrap-up.js';
import { clearFarewell } from '../../shared/call-farewell.js';
import { clearSessionClosing } from '../../shared/session-closing-tracker.js';

interface FakeRoom extends RoomRef {
  received: Array<{ type: string } & Record<string, unknown>>;
}

function fakeRoom(): FakeRoom {
  const received: FakeRoom['received'] = [];
  return {
    received,
    localParticipant: {
      publishData: async (data: Uint8Array): Promise<void> => {
        received.push(JSON.parse(new TextDecoder().decode(data)));
      },
    },
  };
}

const used: string[] = [];
afterEach(() => {
  used.splice(0).forEach((id) => {
    clearSessionClosing(id);
    clearFarewell(id);
  });
  resetFrontendPublisher();
  resetFrontendSignal();
});

let n = 0;
function sessionId(): string {
  const id = `end-reaches-app-${++n}`;
  used.push(id);
  return id;
}

describe('the call publisher carries its frontend signals', () => {
  it('has no signal before the publisher exists, and one after', async () => {
    const id = sessionId();
    const room = fakeRoom();

    expect(await sendFrontendSignal('conversation_end', { reason: 'r' }, id)).toBe(false);

    initializeFrontendPublisher(id, room);
    expect(await sendFrontendSignal('conversation_end', { reason: 'goodbye_complete' }, id)).toBe(
      true
    );
    expect(room.received.map((m) => m.type)).toEqual(['conversation_end']);
  });

  it('stops signalling the room once the publisher is released', async () => {
    const id = sessionId();
    const room = fakeRoom();
    initializeFrontendPublisher(id, room);
    releaseFrontendPublisher(id);

    expect(await sendFrontendSignal('conversation_end', { reason: 'r' }, id)).toBe(false);
    expect(room.received).toEqual([]);
  });

  it('sends once through the newest publisher when a handoff sets the call up again', async () => {
    const id = sessionId();
    const room = fakeRoom();
    initializeFrontendPublisher(id, room); // multi-agent-entry.ts
    initializeFrontendPublisher(id, room); // agent-setup.ts, per persona

    await sendFrontendSignal('wrap_up', { sentiment: 'warm' }, id);
    expect(room.received.map((m) => m.type)).toEqual(['wrap_up']);
  });

  it('keeps each call to its own room', async () => {
    const [a, b] = [sessionId(), sessionId()];
    const [roomA, roomB] = [fakeRoom(), fakeRoom()];
    initializeFrontendPublisher(a, roomA);
    initializeFrontendPublisher(b, roomB);

    await sendFrontendSignal('conversation_end', { reason: 'idle_after_goodbye' }, a);
    expect(roomA.received.map((m) => m.type)).toEqual(['conversation_end']);
    expect(roomB.received).toEqual([]);
  });
});

describe('an idle-after-goodbye end tells the app', () => {
  it('delivers conversation_end with no signal injected, as in production', async () => {
    const id = sessionId();
    const room = fakeRoom();
    initializeFrontendPublisher(id, room);

    const began = await wrapUpCall(
      { sessionId: id, roomName: 'r', callerInRoom: () => false, setTimer: () => undefined },
      'idle_after_goodbye'
    );

    expect(began).toBe(true);
    const end = room.received.find((m) => m.type === 'conversation_end');
    expect(end).toBeDefined();
    expect(JSON.stringify(end)).toContain('idle_after_goodbye');
  });
});
