/**
 * The caller's last words get an answer: including when LiveKit cut Ferni's
 * reply to the first half and never committed the second half as a turn.
 */
import { describe, expect, it, vi } from 'vitest';
import { createTurnKeeper, isRealAnswer, lastUserMessageIs } from '../turn-keeper.js';

const msg = (role: string, textContent: string, interrupted = false) => ({
  type: 'message',
  role,
  textContent,
  interrupted,
});

function harness(items: unknown[] = []) {
  const timers: Array<() => void> = [];
  const reply = vi.fn();
  const session = { agentState: 'listening', userState: 'listening', history: { items } };
  const keeper = createTurnKeeper({
    session,
    reply,
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
  });
  const fire = () => timers.splice(0).forEach((f) => f());
  return { keeper, reply, session, fire };
}

describe('isRealAnswer', () => {
  it('counts a finished reply, or a cut-off one that said something', () => {
    expect(isRealAnswer(msg('assistant', 'Ha, yeah.'))).toBe(true);
    expect(isRealAnswer(msg('assistant', 'Biscuit,', true))).toBe(false);
    expect(
      isRealAnswer(msg('assistant', 'Oh no, that cat, first the deadline and now this', true))
    ).toBe(true);
    expect(isRealAnswer(msg('user', 'hello there friend'))).toBe(false);
  });
});

describe('lastUserMessageIs', () => {
  it('compares against the last user message only', () => {
    const items = [msg('user', 'So, that was fun.'), msg('assistant', 'Ha')];
    expect(lastUserMessageIs(items, 'So, that was fun.')).toBe(true);
    expect(lastUserMessageIs([msg('user', 'Oh, and Biscuit...')], 'So, that was fun.')).toBe(false);
  });
});

describe('createTurnKeeper', () => {
  it('answers the Biscuit case, passing the words LiveKit never committed', () => {
    const h = harness([
      msg('user', 'Oh, and Biscuit chewed up my phone charger this morning.'),
      msg('assistant', 'Biscuit,', true),
    ]);
    h.keeper.onTranscript({ transcript: 'So, that was fun.', isFinal: true });
    h.keeper.onItemAdded({ item: msg('assistant', 'Biscuit,', true) }); // cut after one word
    h.keeper.onStateChange();
    h.fire();
    expect(h.reply).toHaveBeenCalledWith('So, that was fun.');
  });

  it('replies without repeating the words when they are in the history', () => {
    const h = harness([msg('user', 'So, that was fun.')]);
    h.keeper.onTranscript({ transcript: 'So, that was fun.', isFinal: true });
    h.fire();
    expect(h.reply).toHaveBeenCalledWith(undefined);
  });

  it('stays quiet once the turn was answered', () => {
    const h = harness();
    h.keeper.onTranscript({ transcript: 'My day was really long', isFinal: true });
    h.keeper.onItemAdded({ item: msg('assistant', 'Oh no, what happened?') });
    h.keeper.onStateChange();
    h.fire();
    expect(h.reply).not.toHaveBeenCalled();
  });

  it('ignores interim transcripts, backchannels, and a busy agent', () => {
    const h = harness();
    h.keeper.onTranscript({ transcript: 'So, that was fun.', isFinal: false });
    h.keeper.onTranscript({ transcript: 'Yeah.', isFinal: true });
    h.fire();
    expect(h.reply).not.toHaveBeenCalled();

    h.keeper.onTranscript({ transcript: 'So, that was fun.', isFinal: true });
    (h.session as { agentState: string }).agentState = 'thinking';
    h.fire();
    expect(h.reply).not.toHaveBeenCalled();
  });

  it('recovers a given turn only once', () => {
    const h = harness();
    h.keeper.onTranscript({ transcript: 'So, that was fun.', isFinal: true });
    h.fire();
    h.keeper.onTranscript({ transcript: 'So, that was fun.', isFinal: true });
    h.fire();
    expect(h.reply).toHaveBeenCalledTimes(1);
  });
});
