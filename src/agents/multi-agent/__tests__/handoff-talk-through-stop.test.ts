/**
 * HANDOFF_TALK_THROUGH: the goodbye is stopped through its own SpeechHandle (task #63).
 *
 * Nightly 2026-11-13: `session.interrupt()` threw "This generation handle does not allow
 * interruptions" twice ("goodbye not stopped"). While the handoff tool's reply is still
 * playing it is LiveKit's current speech, held uninterruptible (held-handoff-speech.ts),
 * and AgentActivity.interrupt() throws on it before it reaches the speeches queued behind
 * it. A goodbye queued there would play over the caller. The fake session below throws the
 * same way, so a stop that goes through `session.interrupt()` leaves the goodbye playing.
 */
import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { talkThroughFor } from '../handoff-talk-through.js';

/** Every line the module logs: [level, fields, message] */
const logged = vi.hoisted(() => [] as Array<[string, Record<string, unknown>, string]>);
vi.mock('../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const at =
    (level: string) =>
    (fields: Record<string, unknown>, msg: string): void => {
      logged.push([level, fields, msg]);
    };
  const logger = (): unknown => ({
    info: at('info'),
    warn: at('warn'),
    debug: at('debug'),
    error: at('error'),
    child: logger,
  });
  return { ...real, getLogger: logger, createLogger: logger };
});

const HELD = 'This generation handle does not allow interruptions';

function handle(allowInterruptions: boolean) {
  const h = {
    allowInterruptions,
    interrupted: false,
    done: () => false,
    interrupt: vi.fn(() => {
      if (!h.allowInterruptions) throw new Error(HELD);
      h.interrupted = true;
      return h;
    }),
  };
  return h;
}

function call(agent: object = {}) {
  const listeners = new Map<string, Set<(ev: unknown) => void>>();
  const held = handle(false); // the handoff tool's reply: current, held
  const session = {
    userState: 'listening',
    // As AgentActivity.interrupt (1.9.3): the current speech first, which throws when held
    interrupt: vi.fn(() => held.interrupt()),
    on: (event: string, fn: (ev: unknown) => void) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(fn));
    },
    off: (event: string, fn: (ev: unknown) => void) => listeners.get(event)?.delete(fn),
  };
  const emit = (event: string, ev: unknown) => {
    for (const fn of listeners.get(event) ?? []) fn(ev);
  };
  /** session.say: the SDK announces the new handle, queued behind the held reply */
  const say = (allowInterruptions = true) => {
    const h = handle(allowInterruptions);
    emit(voice.AgentSessionEventTypes.SpeechCreated, { source: 'say', speechHandle: h });
    return h;
  };
  const listening = () => [...listeners.values()].reduce((n, set) => n + set.size, 0);
  const open = () => talkThroughFor({ personaId: 'jordan-taylor', session, agent }, 's-63');
  return { open, session, held, say, listening };
}

/** A call with its window open */
function openCall() {
  const c = call();
  const talk = c.open();
  if (!talk) throw new Error('window not opened');
  return { ...c, talk };
}

const messages = (level: string) => logged.filter(([l]) => l === level).map(([, , m]) => m);

describe('HANDOFF_TALK_THROUGH stops the goodbye by its own handle (#63)', () => {
  beforeEach(() => {
    logged.length = 0;
    vi.useFakeTimers();
    vi.stubEnv('HANDOFF_TALK_THROUGH', 'on');
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('the caller talks after the goodbye is queued: the goodbye stops, nothing throws, the held reply is untouched', async () => {
    const c = openCall();
    const goodbye = c.say(); // queued behind the held reply
    expect(goodbye.interrupted).toBe(false);

    const heard = c.talk.listen(2500);
    await vi.advanceTimersByTimeAsync(300);
    c.session.userState = 'speaking'; // the caller starts over it
    await vi.advanceTimersByTimeAsync(50);

    expect(goodbye.interrupt).toHaveBeenCalledTimes(1);
    expect(goodbye.interrupted).toBe(true);
    expect(c.session.interrupt).not.toHaveBeenCalled(); // so no throw, no "not stopped"
    expect(c.held.interrupt).not.toHaveBeenCalled();
    expect(c.held.interrupted).toBe(false); // the handoff's own speech is left alone

    c.session.userState = 'listening';
    await vi.advanceTimersByTimeAsync(1100); // FINAL_GRACE_MS
    await heard;
    expect(messages('warn')).toEqual([]);
    const summary = logged.find(([, , m]) => m === 'HANDOFF_TALK_THROUGH')?.[1];
    expect(summary).toMatchObject({ goodbyesStopped: 1 });
  });

  it('a goodbye queued after the caller began talking is stopped as it is created', async () => {
    const c = openCall();
    c.session.userState = 'speaking';
    const heard = c.talk.listen(2500);
    await vi.advanceTimersByTimeAsync(50);

    const late = c.say(); // e.g. held a moment in the speech coordinator's queue
    expect(late.interrupted).toBe(true);
    expect(c.session.interrupt).not.toHaveBeenCalled();

    c.session.userState = 'listening';
    await vi.advanceTimersByTimeAsync(1100);
    await heard;
  });

  it('a goodbye queued after the caller has already finished, before the swap, is stopped too', async () => {
    const c = openCall();
    c.session.userState = 'speaking';
    const heard = c.talk.listen(2500);
    await vi.advanceTimersByTimeAsync(50);
    c.session.userState = 'listening';
    await vi.advanceTimersByTimeAsync(1100);
    await heard; // the caller is done and heard out; the window is still open

    const late = c.say();
    expect(late.interrupt).toHaveBeenCalledTimes(1);
    expect(late.interrupted).toBe(true); // never said after they spoke, over the next persona
  });

  it('a silent caller: the goodbye is never touched and plays in full', async () => {
    const c = openCall();
    const goodbye = c.say();
    const heard = c.talk.listen(2500);
    await vi.advanceTimersByTimeAsync(2600);
    await heard;

    expect(goodbye.interrupt).not.toHaveBeenCalled();
    expect(goodbye.interrupted).toBe(false);
    expect(c.session.interrupt).not.toHaveBeenCalled();
  });

  it('a line said uninterruptible in the window (never the goodbye with the flag on) plays on, logged, without a throw', async () => {
    const c = openCall();
    const kept = c.say(false); // e.g. reconnection's "One moment"
    const goodbye = c.say();
    c.session.userState = 'speaking';
    const heard = c.talk.listen(2500);
    await vi.advanceTimersByTimeAsync(50);

    expect(kept.interrupt).not.toHaveBeenCalled();
    expect(kept.interrupted).toBe(false);
    expect(goodbye.interrupted).toBe(true);
    expect(messages('info')).toContain('handoff talk-through: uninterruptible line kept');
    expect(messages('warn')).toEqual([]);

    c.session.userState = 'listening';
    await vi.advanceTimersByTimeAsync(1100);
    await heard;
  });

  it('once the window closes (arrive or abandon), the next lines are not stopped and no listener stays', async () => {
    for (const end of ['arrive', 'abandon'] as const) {
      const c = openCall();
      c.session.userState = 'speaking';
      const heard = c.talk.listen(2500);
      // eslint-disable-next-line no-await-in-loop -- one window at a time
      await vi.advanceTimersByTimeAsync(50);
      c.session.userState = 'listening';
      // eslint-disable-next-line no-await-in-loop -- one window at a time
      await vi.advanceTimersByTimeAsync(1100);
      // eslint-disable-next-line no-await-in-loop -- one window at a time
      await heard;

      if (end === 'arrive')
        expect(c.talk.arrive({ agent: {}, session: c.session })).toBeUndefined();
      else c.talk.abandon();
      expect(c.listening()).toBe(0);
      const greeting = c.say();
      expect(greeting.interrupted).toBe(false);
    }
  });

  it('a window that fails to open leaves no listener behind, and the handoff runs without it', () => {
    const c = call(Object.freeze({})); // the persona's turn hook cannot be replaced
    expect(c.open()).toBeNull();
    expect(c.listening()).toBe(0);
    expect(messages('warn')).toContain('HANDOFF_TALK_THROUGH window not opened');
  });
});
