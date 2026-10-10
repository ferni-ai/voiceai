/**
 * "Is someone new?" contract, both directions, real code on each side.
 *
 * Agent → web: the agent's real speaker-change prompter publishes into a room
 * double that hands the bytes to the web's real handleDataMessage.
 * Web → agent: a real click on the web prompt publishes through the web's
 * LiveKit room (the only double: connectionService.getRoom) into the agent's
 * real speaker_check_reply listener, and the agent's speaker state changes.
 */

import { EventEmitter } from 'node:events';
import type { Room } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSpeakerChangePrompter,
  GUEST_SPEAKER_ID,
  listenForSpeakerCheckReplies,
} from '../../../../src/agents/voice-agent/speaker-check.js';
import {
  endHouseholdSession,
  getActiveSession,
} from '../../../../src/services/voice/voice-household.js';
import {
  getSpeakerChangeDetector,
  removeSpeakerChangeDetector,
  type SpeakerChangeEvent,
} from '../../../../src/services/voice/voice-speaker-change.js';

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { connectionService } from '../../src/services/connection.service.js';
import type { DataMessage } from '../../src/types/events.js';
import {
  cleanupSpeakerChangeIndicator,
  getSpeakerIndicatorState,
  initSpeakerChangeIndicator,
} from '../../src/ui/speaker-change-indicator.ui.js';

const SESSION = 'session-speaker-check-contract';
const USER = 'user-primary-123';

/** Agent room double: what the agent publishes is delivered to the web. */
function agentRoomWiredToWeb(): Room {
  const room = new EventEmitter() as EventEmitter & { localParticipant: unknown };
  room.localParticipant = {
    identity: 'agent',
    publishData: async (data: Uint8Array) => {
      handleDataMessage(JSON.parse(new TextDecoder().decode(data)) as DataMessage);
    },
  };
  return room as unknown as Room;
}

/** Wire the web's LiveKit room so its publishData reaches the agent room's listeners. */
function webRoomPublishingTo(agentRoom: Room): Uint8Array[] {
  const sent: Uint8Array[] = [];
  const webRoom = {
    localParticipant: {
      identity: 'user',
      publishData: async (data: Uint8Array) => {
        sent.push(data);
        (agentRoom as unknown as EventEmitter).emit('dataReceived', data, { identity: 'user' });
      },
    },
  };
  vi.spyOn(connectionService, 'getRoom').mockReturnValue(
    webRoom as unknown as ReturnType<typeof connectionService.getRoom>
  );
  return sent;
}

function changeEvent(confidence: number): SpeakerChangeEvent {
  return {
    type: 'speaker_changed',
    previousSpeakerId: USER,
    currentSpeakerId: null,
    confidence,
    timestamp: new Date(),
    isNewSpeaker: true,
  };
}

function prompt(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.speaker-change-indicator');
}

function button(action: 'yes' | 'new'): HTMLButtonElement {
  const el = prompt()?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!el) throw new Error(`no ${action} button`);
  return el;
}

beforeEach(() => {
  initSpeakerChangeIndicator();
});

afterEach(() => {
  cleanupSpeakerChangeIndicator();
  removeSpeakerChangeDetector(SESSION);
  endHouseholdSession(SESSION);
  vi.restoreAllMocks();
});

describe('speaker_changed (agent → web)', () => {
  it("the agent's prompt, past its quiet start and threshold, shows 'Someone new?' with both answers", () => {
    const promptIfDue = createSpeakerChangePrompter(agentRoomWiredToWeb(), 0, 0.6);

    expect(promptIfDue(changeEvent(0.8), 60_000)).toBe(true);

    expect(getSpeakerIndicatorState()).toBe('speaker_changed');
    expect(prompt()?.textContent).toContain('Someone new?');
    expect(button('yes').textContent).toContain("Yes, it's me");
    expect(button('new').textContent).toContain('Someone new');
  });

  it('nothing reaches the web below the threshold or in the first 30 s', () => {
    const promptIfDue = createSpeakerChangePrompter(agentRoomWiredToWeb(), 0, 0.6);

    expect(promptIfDue(changeEvent(0.5), 60_000)).toBe(false);
    expect(promptIfDue(changeEvent(0.9), 10_000)).toBe(false);
    expect(getSpeakerIndicatorState()).toBe('hidden');
  });
});

describe('speaker_check_reply (web → agent)', () => {
  function setUp(): { sent: Uint8Array[] } {
    const agentRoom = agentRoomWiredToWeb();
    getSpeakerChangeDetector(SESSION).setCurrentSpeaker(USER);
    listenForSpeakerCheckReplies(agentRoom, SESSION, USER);
    const sent = webRoomPublishingTo(agentRoom);
    createSpeakerChangePrompter(agentRoom, 0, 0.6)(changeEvent(0.8), 60_000);
    // The detector has moved on to the new, unidentified voice (handleSpeakerChange)
    getSpeakerChangeDetector(SESSION).setCurrentSpeaker('unidentified');
    return { sent };
  }

  it('"Someone new" makes the agent tag the current speaker as a guest', async () => {
    const { sent } = setUp();

    button('new').click();

    await vi.waitFor(() =>
      expect(getSpeakerChangeDetector(SESSION).getState().currentSpeakerId).toBe(GUEST_SPEAKER_ID)
    );
    expect(getActiveSession(SESSION)?.currentUserId).toBe(GUEST_SPEAKER_ID);
    expect(JSON.parse(new TextDecoder().decode(sent[0]))).toMatchObject({
      type: 'speaker_check_reply',
      answer: 'someone_new',
    });
    await vi.waitFor(() => expect(getSpeakerIndicatorState()).toBe('verifying'));
  });

  it('"Yes, it\'s me" keeps the primary user as the current speaker', async () => {
    setUp();

    button('yes').click();

    await vi.waitFor(() =>
      expect(getSpeakerChangeDetector(SESSION).getState().currentSpeakerId).toBe(USER)
    );
    expect(getActiveSession(SESSION)?.currentUserId).toBe(USER);
  });

  it('a failed send keeps the question up instead of saying "Got it!"', async () => {
    const agentRoom = agentRoomWiredToWeb();
    createSpeakerChangePrompter(agentRoom, 0, 0.6)(changeEvent(0.8), 60_000);
    vi.spyOn(connectionService, 'getRoom').mockReturnValue({
      localParticipant: {
        publishData: async () => {
          throw new Error('data channel closed');
        },
      },
    } as unknown as ReturnType<typeof connectionService.getRoom>);

    button('new').click();

    await vi.waitFor(() => expect(prompt()?.textContent).toContain("Couldn't send that"));
    expect(getSpeakerIndicatorState()).toBe('speaker_changed');
  });
});
