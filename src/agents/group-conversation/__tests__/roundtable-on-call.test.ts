/**
 * A team roundtable on a call: the person's turns go to the roundtable instead of the
 * persona's own reply, the personas it picks answer through the call's one session in
 * their own voices, and ending it hands the turns back.
 */
import { EventEmitter } from 'node:events';
import type { Room } from '@livekit/rtc-node';
import { voice } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import {
  attachRoundtableTurns,
  stopIfRoundtableTurn,
  takeRoundtableTurn,
} from '../roundtable-turns.js';
import { roundtableAgentsForCall, type SpeakingSession } from '../session-roundtable-agents.js';
import { createGroupVoiceIntegration } from '../voice-integration.js';

describe('roundtable turns', () => {
  it("routes this call's turns while attached, and only this call's", async () => {
    const handleUserInput = vi.fn(async () => undefined);
    const detach = attachRoundtableTurns('call-1', { handleUserInput }, () => undefined);

    expect(await takeRoundtableTurn('call-1', '  Maya, thoughts?  ')).toBe(true);
    expect(await takeRoundtableTurn('call-2', 'hello')).toBe(false);
    await expect(
      stopIfRoundtableTurn({ services: { sessionId: 'call-1' } }, 'again')
    ).rejects.toThrow(voice.StopResponse);
    expect(handleUserInput.mock.calls).toEqual([['Maya, thoughts?'], ['again']]);

    detach();
    expect(await takeRoundtableTurn('call-1', 'after')).toBe(false);
    await expect(stopIfRoundtableTurn({ sessionId: 'call-1' }, 'after')).resolves.toBeUndefined();
  });
});

describe('safety first', () => {
  it('a turn with a crisis signal is never taken: the roundtable ends and the persona answers', async () => {
    const handleUserInput = vi.fn(async () => undefined);
    const onCrisis = vi.fn();
    attachRoundtableTurns('call-crisis', { handleUserInput }, onCrisis);

    expect(await takeRoundtableTurn('call-crisis', 'honestly I want to kill myself')).toBe(false);
    // the persona's reply (with the crisis override) goes ahead
    await expect(
      stopIfRoundtableTurn({ sessionId: 'call-crisis' }, 'honestly I want to kill myself')
    ).resolves.toBeUndefined();
    expect(onCrisis).toHaveBeenCalledTimes(1);
    expect(handleUserInput).not.toHaveBeenCalled();
    expect(await takeRoundtableTurn('call-crisis', 'ok')).toBe(false); // detached
  });
});

describe('a crisis mid-line', () => {
  it('a line still being written when the roundtable ends for a crisis is never spoken', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const room = new EventEmitter() as EventEmitter & { localParticipant: unknown };
    room.localParticipant = {
      identity: 'agent',
      publishData: async (data: Uint8Array) => {
        sent.push(JSON.parse(new TextDecoder().decode(data)));
      },
    };
    const spoken: string[] = [];
    const session: SpeakingSession = {
      userData: {},
      say: (text) => {
        spoken.push(text);
        return { waitForPlayout: async () => undefined };
      },
      interrupt: vi.fn(),
    };
    const gate: { release?: () => void } = {};
    const write = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          gate.release = () => resolve('Here is my take on it.');
        })
    );
    const { createSessionRoundtableAgents } = await import('../session-roundtable-agents.js');
    const integration = createGroupVoiceIntegration({
      ctx: {} as never,
      room: room as unknown as Room,
      userParticipant: {} as never,
      sessionId: 'call-race',
      createRoundtableAgent: createSessionRoundtableAgents({ session, write }),
    });
    await integration.handleDataChannelMessage({
      type: 'group_roundtable_start',
      personas: ['ferni', 'peter-john'],
    });
    const opening = spoken.length;

    expect(await takeRoundtableTurn('call-race', 'Peter, what should I do?')).toBe(true);
    await vi.waitFor(() => expect(write).toHaveBeenCalled()); // Peter is writing his line
    expect(await takeRoundtableTurn('call-race', 'I want to kill myself')).toBe(false);
    gate.release?.();
    await new Promise((r) => {
      setTimeout(r, 50);
    });

    expect(spoken.slice(opening)).toEqual([]); // nothing after the crisis, not even a goodbye
    expect(sent.map((m) => m.type)).toContain('group_roundtable_ended');
    await integration.cleanup();
  });
});

describe('roundtableAgentsForCall', () => {
  it('is off unless ROUNDTABLE_VOICE=on', () => {
    expect(roundtableAgentsForCall(() => undefined, {})).toBeUndefined();
  });

  it('speaks through whichever session is on the call when the line plays', async () => {
    const said: string[] = [];
    let live: SpeakingSession | undefined;
    const sessionNamed = (name: string): SpeakingSession => ({
      userData: {},
      say: (text) => {
        said.push(`${name}:${text}`);
        return { waitForPlayout: async () => undefined };
      },
    });
    const factory = roundtableAgentsForCall(() => live, { ROUNDTABLE_VOICE: 'on' })!;
    const peter = await factory('peter-john', {} as never);

    live = sessionNamed('first');
    await peter.say('one');
    live = sessionNamed('after-handoff');
    await peter.say('two');
    expect(said).toEqual(['first:one', 'after-handoff:two']);
  });
});

describe('a roundtable through the real integration', () => {
  it('tells the web, opens, answers the person in the named persona’s voice, and hands turns back', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const room = new EventEmitter() as EventEmitter & { localParticipant: unknown };
    room.localParticipant = {
      identity: 'agent',
      publishData: async (data: Uint8Array) => {
        sent.push(JSON.parse(new TextDecoder().decode(data)));
      },
    };
    const spoken: Array<{ text: string; voice: unknown }> = [];
    const session: SpeakingSession = {
      userData: { personaId: 'ferni' },
      say: (text) => {
        spoken.push({ text, voice: session.userData.speakingAs });
        return { waitForPlayout: async () => undefined };
      },
    };
    const write = vi.fn(async (system: string) => `${system.split(' ')[2]} here.`);
    const { createSessionRoundtableAgents } = await import('../session-roundtable-agents.js');
    const integration = createGroupVoiceIntegration({
      ctx: {} as never,
      room: room as unknown as Room,
      userParticipant: {} as never,
      sessionId: 'call-rt',
      createRoundtableAgent: createSessionRoundtableAgents({ session, write }),
    });

    await integration.handleDataChannelMessage({
      type: 'group_roundtable_start',
      personas: ['ferni', 'peter-john', 'maya-habits'],
      topic: 'money',
    });
    expect(sent.map((m) => m.type)).toContain('group_roundtable_started');
    expect(spoken[0]?.voice).toBe('ferni'); // the moderator opens

    // The person speaks: the roundtable takes the turn, and Maya (named) answers as Maya
    expect(await takeRoundtableTurn('call-rt', 'Maya, should I pay the card first?')).toBe(true);
    // Within a second: the roundtable chose Maya, so no 5 s wait for the turn engine's own pick
    await vi.waitFor(() => expect(spoken.some((s) => s.voice === 'maya-santos')).toBe(true));
    expect(session.userData.speakingAs).toBeUndefined(); // cleared after the line
    expect(session.userData.personaId).toBe('ferni');

    // A crisis signal mid-roundtable: it ends, the web is told, the persona takes the turn
    expect(await takeRoundtableTurn('call-rt', "I don't want to be alive anymore")).toBe(false);
    await vi.waitFor(() => expect(sent.map((m) => m.type)).toContain('group_roundtable_ended'));
    await integration.handleDataChannelMessage({ type: 'group_roundtable_end' }); // no-op now
    // No pleasantry before the crisis response
    await vi.waitFor(() =>
      expect(spoken.some((s) => /bringing us all together/.test(s.text))).toBe(false)
    );
    expect(await takeRoundtableTurn('call-rt', 'thanks')).toBe(false); // Ferni answers again
    expect(sent.map((m) => m.type)).toContain('group_roundtable_ended');
    await integration.cleanup();
  });
});
