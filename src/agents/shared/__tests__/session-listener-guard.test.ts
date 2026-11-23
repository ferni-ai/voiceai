import { initializeLogger, voice } from '@livekit/agents';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ error: logged.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { isolateSessionListeners } from '../session-listener-guard.js';

const TRANSCRIBED = voice.AgentSessionEventTypes.UserInputTranscribed;
const transcript = (text: string) =>
  voice.createUserInputTranscribedEvent({ transcript: text, isFinal: true });

/** A real SDK session, so its own emit override and its own transcript listener run too. */
function newSession(guarded: boolean): voice.AgentSession {
  const session = new voice.AgentSession({});
  if (guarded) isolateSessionListeners(session);
  return session;
}

beforeAll(() => initializeLogger({ pretty: false, level: 'fatal' }));
beforeEach(() => logged.error.mockReset());

describe('isolateSessionListeners', () => {
  function throwingThenHearing(session: voice.AgentSession): string[] {
    const heard: string[] = [];
    session.on(TRANSCRIBED, function brokenFeature() {
      throw new Error('feature bug');
    });
    session.on(TRANSCRIBED, (ev) => heard.push(ev.transcript));
    return heard;
  }

  it('a throwing listener does not stop a later listener hearing either turn', () => {
    const session = newSession(true);
    const heard = throwingThenHearing(session);

    expect(() => session.emit(TRANSCRIBED, transcript('first turn'))).not.toThrow();
    expect(() => session.emit(TRANSCRIBED, transcript('second turn'))).not.toThrow();

    expect(heard).toEqual(['first turn', 'second turn']);
  });

  it('is needed: without it the throw escapes emit (the STT loop dies) and later listeners hear nothing', () => {
    const session = newSession(false);
    const heard = throwingThenHearing(session);

    expect(() => session.emit(TRANSCRIBED, transcript('first turn'))).toThrow('feature bug');
    expect(heard).toEqual([]);
  });

  it('logs the event and the listener that threw', () => {
    const session = newSession(true);
    throwingThenHearing(session);
    session.emit(TRANSCRIBED, transcript('first turn'));

    expect(logged.error).toHaveBeenCalledTimes(1);
    expect(logged.error.mock.calls[0]?.[0]).toMatchObject({
      event: TRANSCRIBED,
      listener: 'brokenFeature',
      failures: 1,
      error: expect.objectContaining({ message: 'feature bug' }),
    });
  });

  it('logs a listener that keeps throwing at 1, 2, 4, 8 failures, not on every event', () => {
    const session = newSession(true);
    throwingThenHearing(session);
    for (let i = 0; i < 10; i++) session.emit(TRANSCRIBED, transcript(`turn ${i}`));

    expect(logged.error.mock.calls.map((c) => (c[0] as { failures: number }).failures)).toEqual([
      1, 2, 4, 8,
    ]);
  });

  it('catches an async listener’s rejection and logs it', async () => {
    const session = newSession(true);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      session.on(TRANSCRIBED, async function slowFeature() {
        await Promise.resolve();
        throw new Error('async bug');
      });
      session.emit(TRANSCRIBED, transcript('first turn'));
      // Node reports an unhandled rejection after the microtask queue drains: wait a macrotask.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    } finally {
      process.off('unhandledRejection', unhandled);
    }

    expect(unhandled).not.toHaveBeenCalled();
    expect(logged.error.mock.calls[0]?.[0]).toMatchObject({
      listener: 'slowFeature',
      error: expect.objectContaining({ message: 'async bug' }),
    });
  });

  it('off() with the original function still removes a guarded listener', () => {
    const session = newSession(true);
    const before = session.listenerCount(TRANSCRIBED);
    const heard: string[] = [];
    const onTranscript = (ev: { transcript: string }) => heard.push(ev.transcript);

    session.on(TRANSCRIBED, onTranscript);
    expect(session.listenerCount(TRANSCRIBED)).toBe(before + 1);
    session.off(TRANSCRIBED, onTranscript);
    session.emit(TRANSCRIBED, transcript('after off'));

    expect(session.listenerCount(TRANSCRIBED)).toBe(before);
    expect(heard).toEqual([]);
  });

  it('once() fires a single time, is guarded, and off() removes it before it fires', () => {
    const session = newSession(true);
    const heard: string[] = [];
    session.once(TRANSCRIBED, () => {
      throw new Error('once bug');
    });
    session.once(TRANSCRIBED, (ev) => heard.push(ev.transcript));
    const removed = vi.fn();
    session.once(TRANSCRIBED, removed);
    session.off(TRANSCRIBED, removed);

    expect(() => session.emit(TRANSCRIBED, transcript('first turn'))).not.toThrow();
    session.emit(TRANSCRIBED, transcript('second turn'));

    expect(heard).toEqual(['first turn']);
    expect(removed).not.toHaveBeenCalled();
  });

  it('prependListener runs first and is guarded too', () => {
    const session = newSession(true);
    const order: string[] = [];
    session.on(TRANSCRIBED, () => order.push('appended'));
    session.prependListener(TRANSCRIBED, () => {
      order.push('prepended');
      throw new Error('prepended bug');
    });

    expect(() => session.emit(TRANSCRIBED, transcript('first turn'))).not.toThrow();
    expect(order).toEqual(['prepended', 'appended']);
  });
});
