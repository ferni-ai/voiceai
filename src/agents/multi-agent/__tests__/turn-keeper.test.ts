/**
 * A caller turn left hanging gets an answer after a short grace period; a
 * turn that was answered, a backchannel, or a busy agent does not.
 */
import { describe, expect, it, vi } from 'vitest';
import { createTurnKeeper, unansweredUserTurn } from '../turn-keeper.js';

const msg = (role: string, textContent: string, id = `${role}-${textContent.length}`) => ({
  type: 'message',
  role,
  textContent,
  id,
});

function harness(items: unknown[], state = { agentState: 'listening', userState: 'listening' }) {
  const timers: Array<() => void> = [];
  const reply = vi.fn();
  const session = { ...state, history: { items } };
  const keeper = createTurnKeeper({
    session,
    reply,
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
  });
  return { keeper, reply, session, fire: () => timers.splice(0).forEach((f) => f()) };
}

describe('unansweredUserTurn', () => {
  it('finds the caller turn after an interrupted reply (the Biscuit case)', () => {
    const items = [
      msg('user', 'Oh, and Biscuit chewed up my phone charger this morning.'),
      msg('assistant', 'Biscuit'),
      msg('user', 'So, that was fun.'),
    ];
    expect(unansweredUserTurn(items)?.textContent).toBe('So, that was fun.');
  });

  it('ignores answered turns, backchannels and tool items', () => {
    expect(
      unansweredUserTurn([msg('user', 'my day was long'), msg('assistant', 'Oh no')])
    ).toBeUndefined();
    expect(unansweredUserTurn([msg('assistant', 'So...'), msg('user', 'Yeah.')])).toBeUndefined();
    expect(
      unansweredUserTurn([
        msg('user', 'play some jazz please'),
        { type: 'function_call', name: 'playMusic' },
      ])?.textContent
    ).toBe('play some jazz please');
  });
});

describe('createTurnKeeper', () => {
  it('answers a hanging caller turn once both sides are quiet', () => {
    const h = harness([msg('assistant', 'Biscuit'), msg('user', 'So, that was fun.')]);
    h.keeper.onStateChange();
    h.fire();
    expect(h.reply).toHaveBeenCalledTimes(1);
    h.keeper.onStateChange();
    h.fire();
    expect(h.reply).toHaveBeenCalledTimes(1); // once per caller turn
  });

  it('does nothing while Ferni is thinking or speaking', () => {
    const h = harness([msg('user', 'So, that was fun.')], {
      agentState: 'thinking',
      userState: 'listening',
    });
    h.keeper.onStateChange();
    h.fire();
    expect(h.reply).not.toHaveBeenCalled();
  });

  it('does nothing if Ferni starts talking during the grace period', () => {
    const h = harness([msg('user', 'So, that was fun.')]);
    h.keeper.onStateChange();
    (h.session as { agentState: string }).agentState = 'speaking';
    h.fire();
    expect(h.reply).not.toHaveBeenCalled();
  });
});
