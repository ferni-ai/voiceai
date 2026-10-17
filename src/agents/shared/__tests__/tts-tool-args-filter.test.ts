import { ReadableStream, type ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { voice } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_CUT, toolArgsCutter } from '../tts-tool-args-filter.js';

/** What TTS gets: the gateway node is replaced by one that records the text it reads. */
const heard: string[][] = [];
vi.mock('../../../speech/tts-gateway/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../speech/tts-gateway/index.js')>()),
  isTTSGatewayEnabled: () => true,
  createGatewayTTSNode: () => async (text: NodeReadableStream<string>) => {
    const got: string[] = [];
    for await (const chunk of text) got.push(chunk);
    heard.push(got);
    return null;
  },
}));

afterEach(() => {
  delete process.env.TOOL_ARGS_GUARD;
  heard.length = 0;
});

const run = (chunks: string[]): string => {
  const cut = toolArgsCutter();
  return chunks.map((c) => cut(c).kept).join('');
};

// How the model streamed it on prod, 2026-10-17 01:09:47 (its reasoning shortened).
const PROD = [
  'Sure. ',
  '<template-call:default_api:softTeamIntro{ context: the caller asked what Maya is up to.',
  ' ,teamm',
  'ate_specialty: habits }',
  ' Maya is probably winding down herself.',
];

describe('toolArgsCutter', () => {
  it('cuts the prod call across chunks and keeps the words around it', () => {
    expect(run(PROD)).toBe('Sure.  Maya is probably winding down herself.');
  });

  it('cuts a call inside one chunk, and a key with no brace to the end of its chunk', () => {
    expect(run(['Okay {"fn": "playMusic"} here goes.'])).toBe('Okay  here goes.');
    expect(run(['So contact_query="mom" ', 'and then we talk.'])).toBe('So and then we talk.');
  });

  it.each([
    "I'll call her at 3:30, she's usually up by then.",
    'It was a 2:1 vote, honestly.',
    'Okay, so, um,<break time="80ms"/> let the rest sit till Monday.',
    "[laughter] I really did, didn't I?",
  ])('leaves speech alone: %s', (text) => {
    expect(run([text])).toBe(text);
  });

  it('a brace that never closes stops cutting after MAX_CUT characters', () => {
    // 291 characters cut by the first chunk, so the last 9 of the cap come from the next.
    const args = `{ context: ${'x'.repeat(MAX_CUT - 20)}`;
    expect(run([args, ' Anyway, how was your day?'])).toBe('how was your day?');
    expect(run([`{ ${'y'.repeat(MAX_CUT + 20)}`, ' still here'])).toBe(
      `${'y'.repeat(22)} still here`
    );
  });
});

describe('tts-wrapper: tool arguments never reach TTS', () => {
  const speak = async (chunks: string[]): Promise<string> => {
    const { wrappedTtsNode } = await import('../tts-wrapper.js');
    await wrappedTtsNode(
      {} as voice.Agent,
      new ReadableStream<string>({
        start(c) {
          for (const chunk of chunks) c.enqueue(chunk);
          c.close();
        },
      }),
      {} as voice.ModelSettings,
      { sessionContext: { sessionId: 'tool-args-1', personaId: 'ferni', turnNumber: 5 } }
    );
    return heard.flat().join('');
  };

  it('the prod reply reaches TTS without the softTeamIntro call', async () => {
    const said = await speak(PROD);
    expect(said).not.toMatch(/template-call|softTeamIntro|specialty|context:|[{}]/);
    expect(said).toContain('Maya is probably winding down herself.');
  });

  it('TOOL_ARGS_GUARD=off sends it as before', async () => {
    process.env.TOOL_ARGS_GUARD = 'off';
    expect(await speak(PROD)).toContain('softTeamIntro');
  });
});
