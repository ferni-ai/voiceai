/**
 * #1521: a dropped name after a hello that already went out. The space after
 * "Hey" went out before the name arrived, so the gate drops the name, its
 * comma or dash, and the spaces after them, even when those spaces arrive in a
 * later chunk ("Hey morning.", never "Hey  morning.").
 *
 * What this does not change: text that went out is never held or taken back,
 * and a name that stays is said exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { ReadableStream } from 'node:stream/web';

import { withNameGate, type HistoryItem } from '../name-gate.js';

const msg = (role: string, textContent: string): HistoryItem => ({
  type: 'message',
  role,
  textContent,
});
/** Mid-call: Ferni said the name in the greeting, so this reply drops it. */
const midCall: HistoryItem[] = [
  msg('assistant', 'Hey Sam. Afternoon.'),
  msg('user', 'Thing.'),
  msg('assistant', 'Reply.'),
  msg('user', 'Yeah.'),
];
/** The call's first reply: the name may stay. */
const firstReply: HistoryItem[] = [];

const V2 = { NAME_GATE_V2: 'on' };
const SPLIT = { NAME_FALLING_INTONATION: 'on', NAME_FALLING_SPLIT: 'on' };

/** What the gate sends, one entry per piece it sends. */
async function pieces(
  chunks: string[],
  history: HistoryItem[],
  env: Record<string, string> = {}
): Promise<string[]> {
  const input = new ReadableStream<string>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });
  const out: string[] = [];
  for await (const ch of withNameGate(input as never, {
    name: 'Sam',
    history,
    env,
  }) as unknown as AsyncIterable<string>)
    out.push(ch);
  return out;
}

describe('name gate: spaces after a dropped name whose hello went out (#1521)', () => {
  // Main sent a second space here ("Hey  morning."): the stretch dropped was
  // fixed when the name was decided, before the space after the comma came.
  it.each([
    [
      ['Hey ', 'Sam,', ' morning.'],
      ['Hey ', 'morning.'],
    ],
    [
      ['Oh ', 'Sam,', ' that is awful.'],
      ['Oh ', 'that is awful.'],
    ],
    [
      ['Hey ', 'Sam', ',', ' morning.'],
      ['Hey ', 'morning.'],
    ],
    [
      ['Hey ', 'Sam —', ' morning.'],
      ['Hey ', 'morning.'],
    ],
    [
      ['Hey ', 'Sam,', ' ', ' morning.'],
      ['Hey ', 'morning.'],
    ],
  ])('%j -> %j', async (chunks, want) => {
    expect(await pieces(chunks, midCall)).toEqual(want);
    expect(await pieces(chunks, midCall, V2)).toEqual(want);
  });

  it('with NAME_FALLING_SPLIT on too', async () => {
    expect(await pieces(['Oh ', 'Sam,', ' that is awful.'], midCall, SPLIT)).toEqual([
      'Oh ',
      'that is awful.',
    ]);
  });

  it('takes only spaces: the next word, or a second name, is still decided as before', async () => {
    expect((await pieces(['Hey ', 'Sam,', ' ', ' Sam, hi.'], midCall)).join('')).toBe(
      'Hey Sam, hi.'
    );
    expect((await pieces(['Hey ', 'Sam,', ' Sam,', ' morning.'], midCall)).join('')).toBe(
      'Hey Sam, morning.'
    );
  });

  it('holds nothing that went out before: the hello and its space go at once', async () => {
    for (const chunks of [
      ['Hey ', 'Sam,', ' morning.'],
      ['Hello ', 'Sam, welcome back.'],
      ['Hey', ' Sam, good to hear you.'],
    ]) {
      expect((await pieces(chunks, midCall))[0]).toBe(chunks[0]);
    }
  });

  it('a name that stays is said as before (byte-identical to main)', async () => {
    const cases: Array<[string[], string[]]> = [
      [
        ['Hey ', 'Sam,', ' morning.'],
        ['Hey ', 'Sam, morning.'],
      ],
      [
        ['Oh ', 'Sam,', ' that is awful.'],
        ['Oh ', 'Sam, that is awful.'],
      ],
      [
        ['Hey ', 'Sam —', ' morning.'],
        ['Hey ', 'Sam —', ' morning.'],
      ],
      [
        ['Hey ', 'Sam,', ' ', ' morning.'],
        ['Hey ', 'Sam,  morning.'],
      ],
      [
        ['Hi ', 'Sam! How'],
        ['Hi ', 'Sam! How'],
      ],
    ];
    for (const [chunks, want] of cases) {
      expect(await pieces(chunks, firstReply)).toEqual(want);
      // NAME_GATE_V2 may send the same text in fewer pieces.
      expect((await pieces(chunks, firstReply, V2)).join('')).toBe(want.join(''));
    }
  });

  it('shapes it does not touch read as on main', async () => {
    const join = async (c: string[]): Promise<string> => (await pieces(c, midCall)).join('');
    expect(await join(['Hello ', 'Sam, welcome back.'])).toBe('Hello welcome back.');
    expect(await join(['Hey', ' Sam, good to hear you.'])).toBe('Hey, good to hear you.');
    expect(await join(['That deadline is brutal, ', 'Sam,', ' honestly.'])).toBe(
      'That deadline is brutal, honestly.'
    );
  });

  // Left for a product call (#1521): each needs text the gate releases today
  // to wait, or a first-piece comma that continuation-tts already spoke to be
  // taken back.
  it.todo('"Hi " + "Sam! How" -> "Hi! How" (main and here: "Hi ! How")');
  it.todo('"Hello " + "Sam. Welcome" -> "Hello. Welcome" (main and here: "Hello . Welcome")');
  it.todo('"Well, glad to hear it," + " Sam." -> "Well, glad to hear it." (main and here: "it,.")');
  it.todo(
    '"Did I miss something, " + "Sam? Tell me" -> "something? Tell me" (main and here: ", ?")'
  );
});
