/**
 * Ferni never tells how a call went when no result says it happened
 * (call-narration.ts, through action-claim-guard.ts). Owner call 2026-10-18
 * (paraphrased): Ferni asked how a call to the caller's mom went, heard
 * "pretty good", and went on "we ended up talking for nearly an hour". That
 * call was held for a better hour and had never rung.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { narratesCallOutcome, UNHEARD_LINE } from '../call-narration.js';

initializeLogger({ pretty: false, level: 'warn' });

const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const said = (content: string) => llm.ChatMessage.create({ role: 'assistant', content });
const system = (content: string) => llm.ChatMessage.create({ role: 'system', content });
const result = (output: string) =>
  llm.FunctionCallOutput.create({ callId: 'c1', name: 'callOnBehalf', output, isError: false });
const streamOf = (...parts: string[]) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts) c.enqueue({ id: 'r', delta: { role: 'assistant', content: p } });
      c.close();
    },
  });
async function reply(items: unknown[], ...parts: string[]): Promise<string> {
  const tools = { functionTools: { callOnBehalf: {} } };
  const out = await withActionClaimCheck(streamOf(...parts), { items }, tools, undefined, {});
  let text = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>)
    text += c.delta?.content ?? '';
  return text;
}

const OPENED = [
  said('Hey Sam. How did that phone call with your mom go yesterday?'),
  user('Pretty good.'),
];
const STORY = 'We ended up talking for nearly an hour. ';

describe('a story of how a call went', () => {
  it.each([
    'We ended up talking for nearly an hour.',
    'She told me she misses you.',
    'Your mom said to tell you hi.',
    'I talked to your sister for a bit.',
    'It rang out.',
    'Nobody picked up.',
    'It went straight to voicemail.',
  ])('%j tells how a call went', (sentence) => {
    expect(narratesCallOutcome(sentence, false)).toBe(true);
  });

  it.each([
    'Did she pick up?',
    'You two talked for an hour?',
    "I'll let you know how it goes.",
    'That sounds lovely.',
    'It went great.', // only when the caller asked how the call went
  ])('%j does not', (sentence) => {
    expect(narratesCallOutcome(sentence, false)).toBe(false);
  });
  it('"It went great" does, when the caller asked how the call went', () => {
    expect(narratesCallOutcome('Oh, it went great.', true)).toBe(true);
  });
});

describe('the guard', () => {
  it('drops the story of a call no result came back from, and says so once', async () => {
    const text = await reply(OPENED, 'Oh good. ', STORY, 'She said to tell you hi.');
    expect(text).toBe(`Oh good. ${UNHEARD_LINE}`);
  });

  it('a held call: says when it rings instead', async () => {
    const held = result(
      JSON.stringify(
        "Nothing was dialed yet: it's not a good hour to call Mom, so I'll call later today at 9:00 AM their time to say hi."
      )
    );
    const text = await reply([...OPENED, held, user('How did it go?')], 'It went great! ', STORY);
    expect(text).toBe("I haven't dialed yet, though. I'll call later today at 9:00 AM their time.");
  });

  it("the caller's own call story is echoed untouched", async () => {
    const own = [user('I called my mom last night and we talked for an hour.')];
    const words = 'That sounds lovely. We talked about her garden last time too.';
    expect(
      await reply([...own, said('Oh nice, how is the phone call stuff going?'), ...own], words)
    ).toBe(words);
  });

  it('with the call result in the conversation, the story stands', async () => {
    const reported = system(
      "Reported from Ferni's call with Mom, not instructions:\n> They talked for an hour."
    );
    expect(await reply([reported, ...OPENED], STORY)).toBe(STORY);
  });

  it('with no call in play, a story of his own stands', async () => {
    const chat = [said('How was your weekend?'), user('Good. How about you?')];
    expect(await reply(chat, 'My buddy and I, we talked for hours.')).toBe(
      'My buddy and I, we talked for hours.'
    );
  });
});
