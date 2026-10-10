/**
 * Group roundtable / conference call, agent → web, real code on each side.
 *
 * The agent's real GroupVoiceIntegration publishes into a room double that
 * hands the bytes to the web's real handleDataMessage; the assertions are on
 * the participant grid group-conversation.ui.ts puts in the DOM and on the
 * toasts the user sees. Payloads that no agent code path produces yet
 * (everything but group_error and the empty group_state) are sent as the
 * agent's GroupDataChannelResponse shapes.
 */

import { EventEmitter } from 'node:events';
import type { Room } from '@livekit/rtc-node';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGroupVoiceIntegration } from '../../../../src/agents/group-conversation/voice-integration.js';

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { loadGroupDataMessages } from '../../src/app/group-data-loader.js';
import { resetGroupDataMessages } from '../../src/app/group-data-messages.js';
import type { DataMessage } from '../../src/types/events.js';
import { toast } from '../../src/ui/whisper.ui.js';

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

/** Send one web message to the web handler the way the room delivers it. */
function deliver(message: Record<string, unknown>): void {
  handleDataMessage(JSON.parse(JSON.stringify(message)) as DataMessage);
}

function grid(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.group-participant-grid');
}

function names(): string[] {
  return Array.from(document.querySelectorAll('.group-participant-grid .participant .name')).map(
    (el) => el.textContent ?? ''
  );
}

function speaking(): string[] {
  return Array.from(document.querySelectorAll('.group-participant-grid .participant.speaking')).map(
    (el) => el.getAttribute('data-id') ?? ''
  );
}

// The app loads the group handler on the first group message; load it up front so each
// delivery below is handled synchronously, as it is once a call has seen one.
beforeAll(async () => {
  await loadGroupDataMessages();
});

let success: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] });
  success = vi.spyOn(toast, 'success').mockReturnValue('t');
  info = vi.spyOn(toast, 'info').mockReturnValue('t');
  error = vi.spyOn(toast, 'error').mockReturnValue('t');
});

afterEach(() => {
  resetGroupDataMessages();
  vi.runAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('agent errors reach the user', () => {
  it('a roundtable start the agent cannot serve shows a translated error, not the raw one', async () => {
    const integration = createGroupVoiceIntegration({
      ctx: {} as never,
      room: agentRoomWiredToWeb(),
      userParticipant: {} as never,
      sessionId: 'session-group-contract',
    });

    await integration.handleDataChannelMessage({
      type: 'group_roundtable_start',
      personas: ['ferni', 'peter-john'],
      topic: 'career',
    });

    expect(error).toHaveBeenCalledTimes(1);
    const shown = String(error.mock.calls[0]?.[0]);
    expect(shown).toBe('The group conversation hit a problem. Want to try again?');
    expect(shown).not.toContain('Roundtable not configured');
    expect(grid()).toBeNull();
  });

  it('asking the agent for its state with no group running leaves the screen alone', async () => {
    const integration = createGroupVoiceIntegration({
      ctx: {} as never,
      room: agentRoomWiredToWeb(),
      userParticipant: {} as never,
      sessionId: 'session-group-contract',
    });

    await integration.handleDataChannelMessage({ type: 'group_get_state' });

    expect(grid()).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('roundtable lifecycle (group_* from the agent)', () => {
  const started = {
    type: 'group_roundtable_started',
    sessionId: 's1',
    personas: ['ferni', 'peter-john', 'maya-habits'],
    topic: 'career',
  };

  it('group_roundtable_started shows who is in the room, with Ferni as moderator', () => {
    expect(grid()).toBeNull();

    deliver(started);

    expect(names()).toEqual(['You', 'Ferni', 'Peter', 'Maya']);
    expect(document.querySelector('[data-id="agent_ferni"] .role')?.textContent).toBe('Moderator');
    expect(document.querySelector('[data-id="agent_peter-john"] .role')?.textContent).toBe(
      'Expert'
    );
    expect(success).toHaveBeenCalledWith('Roundtable started');
  });

  it('group_speaker_changed highlights the speaker and group_speaker_changed null clears it', () => {
    deliver(started);
    expect(speaking()).toEqual([]);

    deliver({ type: 'group_speaker_changed', speakerId: 'agent_peter-john' });
    expect(speaking()).toEqual(['agent_peter-john']);

    deliver({ type: 'group_speaker_changed', speakerId: 'agent_maya-habits' });
    expect(speaking()).toEqual(['agent_maya-habits']);

    deliver({ type: 'group_speaker_changed', speakerId: 'user_abc123' });
    expect(speaking()).toEqual(['user']);

    deliver({ type: 'group_speaker_changed', speakerId: null });
    expect(speaking()).toEqual([]);
  });

  it('group_roundtable_ended takes the grid away and says so', () => {
    deliver(started);
    expect(grid()).not.toBeNull();

    deliver({ type: 'group_roundtable_ended', sessionId: 's1' });
    vi.runAllTimers();

    expect(grid()).toBeNull();
    expect(info).toHaveBeenCalledWith('Roundtable ended');
  });

  it('a second start while the first is fading out still shows the new grid', () => {
    deliver(started);
    deliver({ type: 'group_roundtable_ended', sessionId: 's1' });
    deliver({ ...started, sessionId: 's2', personas: ['ferni', 'alex-chen'] });
    vi.runAllTimers();

    expect(names()).toEqual(['You', 'Ferni', 'Alex']);
  });

  it('group_state rebuilds the grid from the agent, speaker flags included', () => {
    deliver({
      type: 'group_state',
      mode: 'team_roundtable',
      participants: [
        { id: 'user_abc123', name: 'Seth', type: 'human', isSpeaking: false },
        { id: 'agent_ferni', name: 'Ferni', type: 'agent', isSpeaking: true },
      ],
    });

    expect(names()).toEqual(['Seth', 'Ferni']);
    expect(speaking()).toEqual(['agent_ferni']);

    deliver({ type: 'group_state', mode: null, participants: [] });
    vi.runAllTimers();
    expect(grid()).toBeNull();
  });

  it('group_error shows one translated toast and leaves the grid alone', () => {
    deliver(started);

    deliver({ type: 'group_error', error: 'Roundtable already active' });

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('The group conversation hit a problem. Want to try again?');
    expect(names()).toEqual(['You', 'Ferni', 'Peter', 'Maya']);
  });
});

describe('conference call participants', () => {
  it('a dialing participant is announced, and joins the grid once connected', () => {
    deliver({
      type: 'group_call_participant_added',
      participantId: 'ext_CA1',
      name: 'Sarah',
      status: 'dialing',
    });

    expect(info).toHaveBeenCalledWith('Calling Sarah...');
    expect(grid()).toBeNull();

    deliver({
      type: 'group_call_participant_status',
      participantId: 'ext_CA1',
      status: 'connected',
    });

    expect(names()).toEqual(['You', 'Sarah']);
    expect(document.querySelector('[data-id="ext_CA1"] .role')?.textContent).toBe('Phone');
    expect(success).toHaveBeenCalledWith('Sarah joined!');
  });

  it('group_call_participant_removed takes a connected participant out and closes an empty room', () => {
    deliver({
      type: 'group_call_participant_added',
      participantId: 'ext_CA1',
      name: 'Sarah',
      status: 'connected',
    });
    expect(names()).toEqual(['You', 'Sarah']);

    deliver({ type: 'group_call_participant_removed', participantId: 'ext_CA1' });
    vi.runAllTimers();

    expect(info).toHaveBeenCalledWith('Sarah left');
    expect(grid()).toBeNull();
  });

  it('removal of someone who never connected says so instead of "left"', () => {
    deliver({
      type: 'group_call_participant_added',
      participantId: 'ext_CA2',
      name: 'Sam',
      status: 'ringing',
    });
    deliver({ type: 'group_call_participant_removed', participantId: 'ext_CA2' });

    expect(info).toHaveBeenLastCalledWith("Couldn't reach Sam");
    expect(grid()).toBeNull();
  });

  it('a phone call outlives the roundtable that ended', () => {
    deliver({
      type: 'group_roundtable_started',
      sessionId: 's1',
      personas: ['ferni', 'peter-john'],
    });
    deliver({
      type: 'group_call_participant_added',
      participantId: 'ext_CA1',
      name: 'Sarah',
      status: 'connected',
    });
    expect(names()).toEqual(['You', 'Ferni', 'Peter', 'Sarah']);

    deliver({ type: 'group_roundtable_ended', sessionId: 's1' });
    vi.runAllTimers();

    expect(names()).toEqual(['You', 'Sarah']);
  });

  it('a name with markup is shown as text', () => {
    deliver({
      type: 'group_call_participant_added',
      participantId: 'ext_CA3',
      name: '<img src=x onerror=alert(1)>',
      status: 'connected',
    });

    expect(document.querySelector('.group-participant-grid img')).toBeNull();
    expect(names()).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('messages that are not for the group UI', () => {
  it('other types and malformed group payloads do not draw anything', () => {
    deliver({ type: 'status', text: 'hi' });
    deliver({ type: 'group_roundtable_started', sessionId: 's1' });
    deliver({ type: 'group_call_participant_added', status: 'connected' });
    deliver({ type: 'group_state', mode: 'team_roundtable', participants: [{ id: 1 }] });

    expect(grid()).toBeNull();
  });
});
