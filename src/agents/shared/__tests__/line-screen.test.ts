/**
 * Telling a person from a voicemail greeting. A person
 * says "Hello?" and waits; a machine talks on and uses voicemail phrases. Ferni's message on a machine carries the opener's light disclosure.
 */
import { EventEmitter } from 'events';
import { llm, voice } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import { classifyLine, isScreeningCall, screenLine, voicemailMessage } from '../line-screen.js';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';

const evidence = (o: Partial<Parameters<typeof classifyLine>[0]>) => ({
  sinceAnswerMs: 1500,
  text: '',
  talkingMs: 0,
  silentMs: 0,
  ...o,
});

describe('classifyLine', () => {
  it('a person: a short hello, then waiting', () => {
    expect(classifyLine(evidence({ text: 'Hello?', silentMs: 900 }))).toBe('human');
    expect(
      classifyLine(evidence({ text: 'Hi, this is Doug, who’s calling?', silentMs: 1000 }))
    ).toBe('human');
    expect(classifyLine(evidence({ text: 'Yeah?', silentMs: 950 }))).toBe('human');
  });

  it('a person who picks up and says nothing for 4 s still gets the opener', () => {
    expect(classifyLine(evidence({ sinceAnswerMs: 4000, silentMs: 4000 }))).toBe('human');
  });

  it('waits while a short hello may still be going', () => {
    expect(classifyLine(evidence({ text: 'Hello', silentMs: 300 }))).toBeUndefined();
    expect(classifyLine(evidence({ sinceAnswerMs: 2000, silentMs: 2000 }))).toBeUndefined();
  });

  it('a machine: voicemail phrases', () => {
    for (const text of [
      "Hi, you've reached Doug",
      'Please leave a message after the tone',
      'The person you are calling is not available',
      'I can’t come to the phone right now',
      "Doug isn't available",
      'Your call has been forwarded to an automatic voice message system',
      'The mailbox is full',
    ]) {
      expect(classifyLine(evidence({ text, silentMs: 0 })), text).toBe('voicemail');
    }
  });

  it('a machine: a long uninterrupted greeting, or a wordy one', () => {
    expect(classifyLine(evidence({ text: 'Hey it is Doug', talkingMs: 3500 }))).toBe('voicemail');
    const wordy = 'Hey there this is Doug and Linda we are out on the boat today';
    expect(classifyLine(evidence({ text: wordy, talkingMs: 2000 }))).toBe('voicemail');
    expect(
      classifyLine(evidence({ sinceAnswerMs: 4000, text: 'Hey it is Doug Ford', talkingMs: 2600 }))
    ).toBe('voicemail');
  });
});

describe('voicemailMessage', () => {
  it('is the opener’s disclosure, asks for no callback', () => {
    const msg = voicemailMessage({ recipientName: 'Doug', sponsorName: 'Seth', personal: true });
    expect(msg).toBe(
      "Hi Doug, it's Ferni, Seth's AI friend. Seth asked me to check in, no need to call back, I'll try again another time."
    );
    for (const parties of [
      { personal: true },
      { recipientName: 'Doug', personal: true },
      { sponsorName: 'Seth', personal: false },
    ]) {
      const text = voicemailMessage(parties);
      expect(text).toMatch(/\bAI\b/);
      expect(text).toMatch(/no need to call back/i);
      expect(text).not.toMatch(/assistant|companion/i);
    }
  });
});

/** A fake AgentSession: the events screening listens to, and say(). */
function fakeSession() {
  const session = Object.assign(new EventEmitter(), {
    say: vi.fn(() => ({ waitForPlayout: async () => undefined })),
  });
  return session;
}
const heard = (s: EventEmitter, transcript: string, isFinal = true) =>
  s.emit('user_input_transcribed', { transcript, isFinal });

describe('screenLine', () => {
  const parties = { recipientName: 'Doug', sponsorName: 'Seth', personal: true };

  it('on a machine: waits out the greeting, leaves one message, then hangs up', async () => {
    vi.useFakeTimers();
    const session = fakeSession();
    const order: string[] = [];
    session.say.mockImplementation(() => {
      order.push('say');
      return { waitForPlayout: async () => void order.push('played') };
    });
    const deps = {
      hangUp: vi.fn(async () => void order.push('hangUp')),
      record: vi.fn(async () => undefined),
      tickMs: 50,
    };
    const result = screenLine(session as never, parties, deps);
    expect(isScreeningCall(session)).toBe(true);
    session.emit('user_state_changed', { newState: 'speaking' });
    heard(session, "Hi, you've reached Doug", false);
    await vi.advanceTimersByTimeAsync(300);
    expect(session.say, 'not over the greeting').not.toHaveBeenCalled();
    heard(session, "Hi, you've reached Doug. Leave a message after the tone.");
    session.emit('user_state_changed', { newState: 'listening' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(session.say, 'not before the greeting has ended').not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);

    await expect(result).resolves.toBe('voicemail');
    expect(session.say).toHaveBeenCalledTimes(1);
    expect(session.say.mock.calls[0]).toEqual([
      voicemailMessage(parties),
      { allowInterruptions: false },
    ]);
    expect(order).toEqual(['say', 'played', 'hangUp']);
    expect(deps.record).toHaveBeenCalledWith('voicemail');
    expect(isScreeningCall(session)).toBe(false);
    vi.useRealTimers();
  });

  it('on a person: lets the opener play, says nothing itself, never hangs up', async () => {
    vi.useFakeTimers();
    const session = fakeSession();
    const deps = {
      hangUp: vi.fn(async () => undefined),
      record: vi.fn(async () => undefined),
      tickMs: 50,
    };
    const result = screenLine(session as never, parties, deps);
    session.emit('user_state_changed', { newState: 'speaking' });
    heard(session, 'Hello?');
    session.emit('user_state_changed', { newState: 'listening' });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toBe('human');
    expect(session.say).not.toHaveBeenCalled();
    expect(deps.hangUp).not.toHaveBeenCalled();
    expect(deps.record).toHaveBeenCalledWith('human');
    expect(isScreeningCall(session)).toBe(false);
    vi.useRealTimers();
  });
});

describe('FerniAgent while a call is screened', () => {
  it('holds the LLM’s reply to the machine, and replies again after', async () => {
    vi.useFakeTimers();
    const onUserTurn = vi.fn(async () => undefined);
    const agent = new PersonaVoiceAgent('You are Ferni.', { skipGreeting: true, onUserTurn });
    const session = fakeSession();
    Object.defineProperty(agent, 'session', { value: session });
    const turn = () =>
      agent.onUserTurnCompleted(
        llm.ChatContext.empty(),
        llm.ChatMessage.create({ role: 'user', content: "You've reached Doug" })
      );

    const result = screenLine(
      session as never,
      { personal: true },
      {
        hangUp: vi.fn(async () => undefined),
        record: vi.fn(async () => undefined),
        tickMs: 50,
      }
    );
    await expect(turn()).rejects.toBeInstanceOf(voice.StopResponse);
    expect(onUserTurn).not.toHaveBeenCalled();

    heard(session, 'Hello?');
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    await expect(turn()).resolves.toBeUndefined();
    expect(onUserTurn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
