/**
 * The director is told whether the call is in the app or on a phone line
 * (DIRECTOR_KNOWS_CHANNEL, director-channel.ts).
 *
 * A caller in the app who asks to be rung (#2709): the director's prompt calls
 * every call "a live, unscripted phone call", so the note it wrote said the
 * caller was already on the phone line.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Director, type Line } from '../director-notes.js';
import {
  APP_CHANNEL_NOTE,
  callChannelOf,
  rememberCallChannel,
  type CallChannel,
} from '../director-channel.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

/** Set or clear the flag (a helper, so no env write follows an await in a test body). */
function setFlag(value: string | undefined): void {
  if (value === undefined) delete process.env.DIRECTOR_KNOWS_CHANNEL;
  else process.env.DIRECTOR_KNOWS_CHANNEL = value;
}

const TURN: Line[] = [
  { speaker: 'user', text: 'No, call me on the phone.' },
  { speaker: 'ferni', text: "I'm calling you now." },
];

/** The system prompt the real Director sends its model for this channel. */
async function systemFor(channel: CallChannel | undefined): Promise<string> {
  const asked: string[] = [];
  const director = new Director({
    sessionId: 's1',
    userName: 'Seth',
    channel: () => channel,
    writer: async (system) => {
      asked.push(system);
      return 'NONE';
    },
  });
  await director.observe(TURN);
  expect(asked).toHaveLength(1);
  return asked[0];
}

describe('DIRECTOR_KNOWS_CHANNEL=on', () => {
  it('an app call is described as in the app, and a call request as real', async () => {
    setFlag('on');
    const system = await systemFor('app');
    expect(system).toContain('a live, unscripted voice call in the Ferni app');
    expect(system).not.toContain('a live, unscripted phone call');
    expect(system).toContain(APP_CHANNEL_NOTE);
  });

  it('a phone call keeps the prompt exactly as it was', async () => {
    setFlag(undefined);
    const before = await systemFor('phone');
    setFlag('on');
    expect(await systemFor('phone')).toBe(before);
    expect(before).toContain('a live, unscripted phone call');
  });

  it('an unknown channel keeps the prompt exactly as it was', async () => {
    setFlag(undefined);
    const before = await systemFor(undefined);
    setFlag('on');
    expect(await systemFor(undefined)).toBe(before);
  });
});

describe('DIRECTOR_KNOWS_CHANNEL off (the default)', () => {
  it('an app call gets the same prompt as before, byte for byte', async () => {
    setFlag(undefined);
    const unset = await systemFor(undefined);
    expect(await systemFor('app')).toBe(unset);
    setFlag('off');
    expect(await systemFor('app')).toBe(unset);
    expect(unset).not.toContain(APP_CHANNEL_NOTE);
  });
});

describe('the call channel recorded per session', () => {
  it('phone and app callers are told apart; an unknown caller stays unknown', () => {
    const phone = {};
    const app = {};
    const unknown = {};
    rememberCallChannel(phone, true);
    rememberCallChannel(app, false);
    rememberCallChannel(unknown, undefined);
    expect(callChannelOf(phone)).toBe('phone');
    expect(callChannelOf(app)).toBe('app');
    expect(callChannelOf(unknown)).toBeUndefined();
  });
});
