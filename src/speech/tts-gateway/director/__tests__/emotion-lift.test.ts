/**
 * EMOTION_LIFT: Ferni rests calm and lifts on bright words (Seth's "lively"
 * pick, 2026-10-17: calm B at excited / 1.08).
 *
 * Asserted on the request bodies the real Cartesia provider sends over its
 * socket (openReplyStream through the Director).
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CartesiaTTSProvider } from '../../providers/cartesia.js';
import { CartesiaSocket } from '../../providers/cartesia-socket.js';
import { resetFerniRestingVoiceWarnings } from '../ferni-resting-voice.js';
import { resetPersonaDeliveryCache } from '../persona-delivery.js';
import { directSpeech } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

const CALM_B = '2e7f8a26-1627-4d66-88dc-293c297c1619';
const LIVELY = {
  SPEECH_DIRECTOR: 'live',
  FERNI_VOICE_EMOTION: 'excited',
  FERNI_VOICE_SPEED: '1.08',
};
const LIFT = { ...LIVELY, EMOTION_LIFT: 'on' };

let sent: Array<{ transcript: string }>;

beforeEach(() => {
  sent = [];
  resetFerniRestingVoiceWarnings();
  resetPersonaDeliveryCache();
  vi.spyOn(CartesiaSocket.prototype, 'send').mockImplementation(async (_id, request) => {
    sent.push(request as (typeof sent)[number]);
  });
});

afterEach(() => vi.restoreAllMocks());

/** One reply through the Director into the real provider; its opening request transcript. */
async function speak(
  text: string,
  env: Record<string, string>,
  opts: { personaId?: string; sessions?: DirectorSessions } = {}
): Promise<string> {
  const from = sent.length;
  const directed = directSpeech(new CartesiaTTSProvider().openReplyStream(CALM_B), {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(text);
        c.close();
      },
    }),
    voiceId: CALM_B,
    sessionId: 'lift',
    personaId: opts.personaId ?? 'ferni',
    env,
    sessions: opts.sessions ?? new DirectorSessions(),
    onPlan: () => {},
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  directed.reply.push(text);
  directed.reply.end();
  await vi.waitFor(() => expect(sent.length - from).toBeGreaterThanOrEqual(2));
  return sent[from]?.transcript ?? '';
}

const tagOf = (push: string, name: 'emotion' | 'speed'): string | undefined =>
  new RegExp(`<${name} (?:value|ratio)="([^"]+)"/>`).exec(push)?.[1];

describe('EMOTION_LIFT: bright replies lift', () => {
  it('a funny reply is sent excited at 1.08', async () => {
    const push = await speak('That was so funny, ha.', LIFT);
    expect(push).toBe('<speed ratio="1.08"/><emotion value="excited"/>That was so funny, ha. ');
  });

  it('a bright question is excited, not curious', async () => {
    const off = await speak('Wow, how did the first day go?', LIVELY);
    expect(tagOf(off, 'emotion')).toBe('curious');
    const push = await speak('Wow, how did the first day go?', LIFT);
    expect(tagOf(push, 'emotion')).toBe('excited');
    expect(tagOf(push, 'speed')).toBe('1.08');
  });

  it("on a bright reply the LLM's own curious gives way to excited", async () => {
    const text = '<emotion value="curious"/>Ha, and then what happened?';
    expect(tagOf(await speak(text, LIVELY), 'emotion')).toBe('curious');
    expect(tagOf(await speak(text, LIFT), 'emotion')).toBe('excited');
  });

  it('no reply runs faster than FERNI_VOICE_SPEED, even turn after bright turn', async () => {
    const sessions = new DirectorSessions();
    for (const line of ['Ha, I love that.', 'That is great news.', 'Wow, so much fun.']) {
      const push = await speak(line, LIFT, { sessions });
      expect(Number(tagOf(push, 'speed'))).toBeLessThanOrEqual(1.08);
      expect(tagOf(push, 'emotion')).toBe('excited');
    }
  });
});

describe('EMOTION_LIFT: other replies rest', () => {
  it('a neutral reply rests at 1.03 with no upbeat tone', async () => {
    const push = await speak('I checked the calendar for Thursday.', LIFT);
    expect(push).toBe('<speed ratio="1.03"/>I checked the calendar for Thursday. ');
  });

  it('a question that is not bright stays curious at the resting pace', async () => {
    const push = await speak('What did the doctor say about it?', LIFT);
    expect(tagOf(push, 'emotion')).toBe('curious');
    expect(tagOf(push, 'speed')).toBe('1.03');
  });
});

describe('EMOTION_LIFT: hard moments keep their tone and normal pace', () => {
  it('a sympathetic reply is sent exactly as with no overrides at all', async () => {
    const plain = await speak("I'm so sorry about your dad.", { SPEECH_DIRECTOR: 'live' });
    const push = await speak("I'm so sorry about your dad.", LIFT);
    expect(tagOf(push, 'emotion')).toBe('sympathetic');
    expect(push).toBe(plain);
  });

  it('a calm reply the LLM chose keeps calm at normal pace', async () => {
    const text = '<emotion value="calm"/>Take a breath with me.';
    const plain = await speak(text, { SPEECH_DIRECTOR: 'live' });
    const push = await speak(text, LIFT);
    expect(tagOf(push, 'emotion')).toBe('calm');
    expect(push).toBe(plain);
  });
});

describe('EMOTION_LIFT: a bright reply breaks the carry-over', () => {
  const after = async (env: Record<string, string>, line: string): Promise<string> => {
    const sessions = new DirectorSessions();
    await speak("I'm so sorry about your dad.", env, { sessions });
    return speak(line, env, { sessions });
  };

  it('[laughter] after a sympathetic turn is not voiced sympathetic', async () => {
    const line = '[laughter] Okay, that part is pretty good.';
    expect(tagOf(await after(LIVELY, line), 'emotion')).toBe('sympathetic');
    const push = await after(LIFT, line);
    expect(tagOf(push, 'emotion')).toBe('excited');
  });

  it('a fun line after a sympathetic turn drops the carried tone', async () => {
    expect(tagOf(await after(LIVELY, 'He sounds like fun.'), 'emotion')).toBe('sympathetic');
    expect(tagOf(await after(LIFT, 'He sounds like fun.'), 'emotion')).toBe('excited');
  });

  it('a plain line after a sympathetic turn keeps the care', async () => {
    expect(tagOf(await after(LIFT, 'Tell me about him.'), 'emotion')).toBe('sympathetic');
  });
});

describe('EMOTION_LIFT: scope', () => {
  it('a teammate is unchanged by the flag', async () => {
    const text = 'That was so funny, ha.';
    const off = await speak(text, LIVELY, { personaId: 'maya-santos' });
    expect(await speak(text, LIFT, { personaId: 'maya-santos' })).toBe(off);
  });

  it('without FERNI_VOICE_SPEED the pace is the Director’s own', async () => {
    const env = { SPEECH_DIRECTOR: 'live', EMOTION_LIFT: 'on', FERNI_VOICE_EMOTION: 'excited' };
    const plain = await speak('I checked the calendar for Thursday.', { SPEECH_DIRECTOR: 'live' });
    expect(await speak('I checked the calendar for Thursday.', env)).toBe(plain);
  });
});
