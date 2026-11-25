/**
 * GROUP_CALL: every way out of sttChain with people heard apart. If the floor arbiter
 * fails, the mix is heard again (labelled while a guest is on) and the output lives on;
 * the end of the mix, a base STT error and cancel each stop listening at once.
 */
import { stt } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonSpeechEvent } from '../../group-conversation/floor-arbiter.js';
import { SARAH, said } from '../../group-conversation/__tests__/person-speech-events.js';
import {
  call,
  feed,
  final,
  saidBySarah,
  settle,
  textOf,
  typesOf,
} from './stt-chain-people-call.js';

const guest = vi.hoisted(() => ({ on: false }));
vi.mock('../../group-conversation/group-hearing.js', () => ({
  groupHearingFor: () => (guest.on ? { guestLastOnAt: () => Number.MAX_SAFE_INTEGER } : undefined),
}));
const warned = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: Record<string, unknown>) =>
      bindings.module === 'SttChain'
        ? { debug: vi.fn(), info: vi.fn(), warn: warned, error: vi.fn() }
        : real.createLogger(bindings),
  };
});

const { START_OF_SPEECH, END_OF_SPEECH, FINAL_TRANSCRIPT } = stt.SpeechEventType;

/** A person event the arbiter throws on: its label can't be read. */
const unreadable = (type: stt.SpeechEventType): PersonSpeechEvent => ({
  identity: SARAH.identity,
  get label(): string {
    throw new Error(`no label for ${SARAH.identity}`);
  },
  event: { type },
});

beforeEach(() => {
  vi.stubEnv('FIRST_TURN_FAST', 'off');
  vi.stubEnv('NAME_MISHEAR_NORMALIZE', 'off');
  vi.stubEnv('GROUP_CALL', 'on');
  guest.on = false;
  warned.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sttChain with people heard apart: every way out', () => {
  it('an arbiter error mid-call: the mix is heard again, labelled, and the output lives', async () => {
    guest.on = true;
    const c = await call();
    const own = feed<PersonSpeechEvent>();
    c.people.add(SARAH.identity, own.stream);
    own.put(unreadable(START_OF_SPEECH));
    await settle();
    expect(c.people.live).toBe(true); // Sarah is still heard apart, but the merge has failed
    c.mixedSaid.put(final('see you at six'));
    await settle();
    expect(textOf(c.out[0])).toBe('[unclear] see you at six');
    expect(c.outcome.error).toBeUndefined();
    expect(warned).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warned.mock.calls)).not.toMatch(/guest_call1|Sarah/);
  });

  it('an arbiter error mid-turn ends that turn once, before the mix takes over', async () => {
    guest.on = true;
    const c = await call();
    const own = feed<PersonSpeechEvent>();
    c.people.add(SARAH.identity, own.stream);
    own.put(said(SARAH, START_OF_SPEECH));
    await settle();
    own.put(unreadable(FINAL_TRANSCRIPT));
    await settle();
    c.mixedSaid.put(final('see you at six'));
    await settle();
    expect(typesOf(c.out)).toEqual([START_OF_SPEECH, END_OF_SPEECH, FINAL_TRANSCRIPT]);
    expect(textOf(c.out[2])).toBe('[unclear] see you at six');
  });

  it('an arbiter error between turns ends nothing', async () => {
    const c = await call();
    const own = feed<PersonSpeechEvent>();
    c.people.add(SARAH.identity, own.stream);
    own.put(said(SARAH, START_OF_SPEECH));
    own.put(said(SARAH, END_OF_SPEECH));
    own.put(unreadable(START_OF_SPEECH));
    await settle();
    c.mixedSaid.put(final('see you at six'));
    await settle();
    expect(typesOf(c.out)).toEqual([START_OF_SPEECH, END_OF_SPEECH, FINAL_TRANSCRIPT]);
  });

  it('cancel stops listening at once: what is said next waits for the next chain', async () => {
    const c = await call();
    await settle(); // the arbiter is waiting on the next event
    void c.cancel();
    const sarah = c.hearApart(SARAH);
    await sarah(START_OF_SPEECH);
    expect(await c.nextChainHears()).toEqual(saidBySarah);
    expect(c.mixedSaid.cancelled).toHaveBeenCalledTimes(1);
    expect(c.mixedSaid.stream.locked).toBe(false);
  });

  it('cancel stops listening at once with nothing read pending, the output full', async () => {
    const c = await call({ read: false });
    c.mixedSaid.put({ type: START_OF_SPEECH }); // solo: it waits in the output, unread
    await settle();
    void c.cancel();
    const sarah = c.hearApart(SARAH);
    await sarah(START_OF_SPEECH);
    expect(await c.nextChainHears()).toEqual(saidBySarah);
    expect(c.mixedSaid.stream.locked).toBe(false);
  });

  it('a base STT error errors the output and stops listening', async () => {
    const c = await call();
    await settle();
    c.mixedSaid.fail(new Error('stt socket closed'));
    await settle();
    expect(String(c.outcome.error)).toContain('stt socket closed');
    const sarah = c.hearApart(SARAH);
    await sarah(START_OF_SPEECH);
    expect(await c.nextChainHears()).toEqual(saidBySarah);
  });

  it('the end of the mix closes the output, stops listening and lets go of the mix', async () => {
    const c = await call();
    c.mixedSaid.end();
    await settle();
    expect(c.outcome.ended).toBe(true);
    expect(c.mixedSaid.stream.locked).toBe(false);
    const sarah = c.hearApart(SARAH);
    await sarah(START_OF_SPEECH);
    expect(await c.nextChainHears()).toEqual(saidBySarah);
  });
});
