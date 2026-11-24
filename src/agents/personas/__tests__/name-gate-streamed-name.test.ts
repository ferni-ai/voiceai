/**
 * #3189: a reply streamed in small pieces came out different from the same reply arriving
 * whole, and lost the rest of it: "Okay. [laughter] José, stop." a character at a time said
 * "Okay. [laughter] José," and nothing after.
 *
 * Not the letters in the name: a name dropped where its comma could end continuation-tts's
 * first piece (12+ characters through it) was settled as "José,"; the space after it then
 * grew that stretch past the text sent, the name came back, and nothing more matched what had
 * gone out. "Sam" does the same once the text before it is long enough ("I know. Sam,").
 *
 * However the text is split, the caller hears what the whole reply would say. Invented lines.
 */
import { describe, expect, it } from 'vitest';
import { ReadableStream } from 'node:stream/web';

import { withNameGate, type HistoryItem } from '../name-gate.js';

const msg = (role: string, textContent: string): HistoryItem => ({
  type: 'message',
  role,
  textContent,
});
/** Mid-call: the name was said at hello, so this reply drops it. */
const midCall = (name: string): HistoryItem[] => [
  msg('assistant', `Hey ${name}. Afternoon.`),
  msg('user', 'Thing.'),
  msg('assistant', 'Reply.'),
  msg('user', 'Yeah.'),
];
/** The call's first reply: the name stays. */
const firstReply: HistoryItem[] = [];

async function said(
  name: string,
  chunks: string[],
  history: HistoryItem[],
  env: Record<string, string> = {}
): Promise<string> {
  const input = new ReadableStream<string>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });
  let out = '';
  for await (const ch of withNameGate(input as never, {
    name,
    history,
    env,
  }) as unknown as AsyncIterable<string>)
    out += ch;
  return out;
}

/** The reply four ways: whole, a word at a time, a character at a time, two at a time. */
const deliveries = (reply: string): Array<[string, string[]]> => [
  ['whole', [reply]],
  ['by word', reply.split(/(?<=\s)/)],
  ['by character', [...reply]],
  ['by pairs', reply.match(/[\s\S]{1,2}/gu) ?? []],
];
/** What each delivery said, by delivery. */
const streamed = (
  name: string,
  reply: string,
  history: HistoryItem[],
  env: Record<string, string> = {}
): Promise<Array<[string, string]>> =>
  Promise.all(
    deliveries(reply).map(async ([how, chunks]): Promise<[string, string]> => [
      how,
      await said(name, chunks, history, env),
    ])
  );
const sameAs = (reply: string, text: string): Array<[string, string]> =>
  deliveries(reply).map(([how]) => [how, text]);

const REPLIES = (name: string): string[] => [
  `Okay. [laughter] ${name}, stop.`,
  `Okay. ${name}, stop.`,
  `I know. ${name}, look, it's fine.`,
  `Yes, ${name}, I'm sure. It'll keep till Monday.`,
  `${name}, really? Again? That's the third time.`,
];

describe('name gate: a streamed reply says what the whole reply says (#3189)', () => {
  it('the reported reply, a character at a time, drops the name and keeps the rest', async () => {
    const reply = 'Okay. [laughter] José, stop.';
    expect(await said('José', [...reply], midCall('José'))).toBe('Okay. [laughter] Stop.');
  });

  it('an ASCII name long enough before it goes the same way', async () => {
    const reply = "I know. Sam, look, it's fine.";
    expect(await said('Sam', [...reply], midCall('Sam'))).toBe("I know. Look, it's fine.");
  });

  for (const name of ['José', 'Zoë', 'Søren', 'Ángel', 'Joséphine', 'Sam']) {
    for (const reply of REPLIES(name)) {
      it(`${name}: "${reply}"`, async () => {
        const history = midCall(name);
        const whole = await said(name, [reply], history);
        expect(whole).not.toContain(name);
        expect(await streamed(name, reply, history)).toEqual(sameAs(reply, whole));
      });
    }
  }

  it('a kept name that ends its own sentence streams the same as whole (unchanged)', async () => {
    const falling = { NAME_FALLING_INTONATION: 'on' };
    const reply = 'Okay. Søren, stop.';
    expect(await streamed('Søren', reply, firstReply, falling)).toEqual(
      sameAs(reply, 'Okay. Søren. Stop.')
    );
  });
});
