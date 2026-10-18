/**
 * On a heavy moment the laugh cues the model writes never reach the voice;
 * otherwise the reply's text passes through exactly as before.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it } from 'vitest';

import { forgetCallerTurns } from '../../../adaptive-ssml/heavy-moment.js';
import { laughterGuard, replyIsHeavy, withoutLaughter } from '../heavy-laughter-guard.js';
import { RawCues } from '../raw-cues.js';

const SESSION = 'heavy-guard';
afterEach(() => forgetCallerTurns(SESSION));

/** The chunks out of the guard for `chunks` in, and what the raw cues saw. */
async function through(
  userRequest: string,
  chunks: string[],
  turnNumber = 1
): Promise<{ out: string[]; cues: RawCues }> {
  const cues = new RawCues();
  const input = new ReadableStream<string>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk);
      c.close();
    },
  });
  const out: string[] = [];
  const guard = laughterGuard(
    { sessionId: SESSION, turnContext: { userRequest, turnNumber } },
    cues
  );
  for await (const chunk of input.pipeThrough(guard)) out.push(chunk);
  return { out, cues };
}

describe('laughterGuard', () => {
  it('passes a light reply through chunk for chunk, laugh and all', async () => {
    const chunks = ['[laughter] Okay, ', 'that is ', 'ridiculous.'];
    const { out, cues } = await through('hahaha you are ridiculous', chunks);
    expect(out).toEqual(chunks);
    expect(cues.sawLaughter).toBe(true);
  });

  it('takes every laugh cue out of a reply to hard news', async () => {
    const { out, cues } = await through('kms lol', [
      '[laughter] Hey. [laughs softly] I hear you. *chuckles* (laughs) [giggles] Talk to me.',
    ]);
    expect(out.join('')).toBe('Hey. I hear you. Talk to me.');
    expect(cues.sawLaughter).toBe(false);
  });

  it('takes out a cue split across chunks', async () => {
    const { out } = await through('my grandma passed lol', ['Oh. [laugh', 's] I am ', 'so sorry.']);
    expect(out.join('')).toBe('Oh. I am so sorry.');
  });

  it('takes out a laugh written as words at the start, however it streams', async () => {
    const ha = await through('kms lol', [
      '<emotion value="sympathetic"/>Ha',
      'ha, oh no. ',
      'Haha.',
    ]);
    expect(ha.out.join('')).toBe('<emotion value="sympathetic"/>Oh no. Haha.');
    expect((await through('we lost the baby lol', ['Heh. I am so sorry.'])).out.join('')).toBe(
      'I am so sorry.'
    );
    expect((await through('we lost the baby lol', ['Hang on.'])).out.join('')).toBe('Hang on.');
  });

  it("keeps a light reply's written laugh", async () => {
    expect((await through('hahaha you are ridiculous', ['Haha, ', 'okay.'])).out).toEqual([
      'Haha, ',
      'okay.',
    ]);
  });

  it('strips on the two turns after grief, and not on the third', async () => {
    await through('my dad died last week', ['I am so sorry.'], 1);
    expect((await through('haha anyway', ['[laughter] Okay. '], 2)).out.join('')).toBe('Okay. ');
    expect((await through('lol okay', ['[laughter] Sure. '], 3)).out.join('')).toBe('Sure. ');
    expect((await through('hahaha stop', ['[laughter] Fine. '], 4)).out.join('')).toBe(
      '[laughter] Fine. '
    );
  });
});

describe('replyIsHeavy', () => {
  it('reads the words alone when there is no session', () => {
    expect(replyIsHeavy({ turnContext: { userRequest: 'we lost the baby lol' } })).toBe(true);
    expect(replyIsHeavy({ turnContext: { userRequest: 'my phone died lol' } })).toBe(false);
  });

  it('keeps every word but the laugh cues', () => {
    expect(withoutLaughter('Ha, no. [laughter] Fine.')).toBe('Ha, no. Fine.');
  });
});
