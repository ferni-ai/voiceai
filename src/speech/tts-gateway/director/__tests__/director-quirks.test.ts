/**
 * The laugh the director adds reaches Cartesia but never the chat history, so
 * it goes to the quirk log (QUIRK_AWARENESS) for the next reply's note. Only
 * when it was really added (live), not decided in shadow.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { quirkEvents } from '../../../../services/session/quirk-log.js';
import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { directSpeech } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

class Recorder implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

const TEASE = ["I'm just teasing you, you know that. ", 'Anyway, how was the weekend?'];
let sid = 0;

async function reply(env: Record<string, string>): Promise<{ sessionId: string; all: string }> {
  const sessionId = `director-quirk-${++sid}`;
  const inner = new Recorder();
  const directed = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(TEASE.join(''));
        c.close();
      },
    }),
    voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    sessionId,
    personaId: 'jordan-taylor', // laughs readily; Ferni's odds need more rapport (laughter.test.ts)
    turnContext: { turnNumber: 10, userRequest: 'haha that was a good one' },
    comfortLevel: 1,
    env,
    sessions: new DirectorSessions(),
    onPlan: () => {},
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  for (const p of TEASE) directed.reply.push(p);
  directed.reply.end();
  return { sessionId, all: inner.pushes.join('') };
}

const LIVE = { SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_LAUGHTER: 'live', QUIRK_AWARENESS: 'on' };

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0); // every roll passes
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('director laughs in the quirk log', () => {
  it('live: the [laughter] it added is recorded, with where it went', async () => {
    const { sessionId, all } = await reply(LIVE);
    expect(all).toContain('[laughter]');
    expect(quirkEvents(sessionId)).toEqual([
      expect.objectContaining({ kind: 'laugh', source: 'director', personaId: 'jordan-taylor' }),
    ]);
    expect(['before', 'after']).toContain(quirkEvents(sessionId)[0].where);
  });

  it('shadow (decided, not added) and QUIRK_AWARENESS off record nothing', async () => {
    const shadow = await reply({ ...LIVE, SPEECH_DIRECTOR_LAUGHTER: 'shadow' });
    expect(shadow.all).not.toContain('[laughter]');
    expect(quirkEvents(shadow.sessionId)).toEqual([]);
    const off = await reply({ ...LIVE, QUIRK_AWARENESS: 'off' });
    expect(off.all).toContain('[laughter]');
    expect(quirkEvents(off.sessionId)).toEqual([]);
  });
});
