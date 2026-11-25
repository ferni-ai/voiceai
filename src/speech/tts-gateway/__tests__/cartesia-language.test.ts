/**
 * The Cartesia request carries the reply's language (#4062). It was hardcoded 'en' in all three
 * request builders, so the Spanish crisis lines were voiced by an English-language voice.
 *
 * English requests must not change by one byte: each builder's English body is pinned as a
 * string, field order included. A Spanish request differs from it in the language only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartesiaTTSProvider } from '../providers/cartesia.js';
import type { ContextHandler } from '../providers/cartesia-socket.js';
import type { TTSLanguage } from '../reply-language.js';

class FakeSocket {
  sent: Array<Record<string, unknown>> = [];
  async send(_contextId: string, request: object, handler: ContextHandler) {
    this.sent.push(request as Record<string, unknown>);
    // A context is done when its last piece (continue: false) is sent.
    if (!(request as { continue?: boolean }).continue)
      void Promise.resolve().then(() => handler.onDone());
  }
  cancel() {}
  release() {}
}

const tick = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
const VOICE = '{"mode":"id","id":"voice-1"}';
const PCM = '{"container":"raw","encoding":"pcm_s16le","sample_rate":24000}';
const asSpanish = (english: string) => english.replace('"language":"en"', '"language":"es"');

function provider(): { tts: CartesiaTTSProvider; socket: FakeSocket } {
  const tts = new CartesiaTTSProvider();
  const socket = new FakeSocket();
  (tts as unknown as { socket: FakeSocket }).socket = socket;
  return { tts, socket };
}

describe('Cartesia requests carry the reply language (#4062)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv('CARTESIA_API_KEY', 'test-key');
    vi.stubEnv('CARTESIA_PRONUNCIATION_DICT_ID', '');
    vi.stubEnv('TTS_ALIGNED_TRANSCRIPT', 'off');
    fetchMock.mockImplementation(async () => new Response(new ArrayBuffer(4)));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('bytes API: the English body is unchanged; Spanish differs only in language', async () => {
    const { tts } = provider();
    await tts.synthesize('Hello there.', 'voice-1');
    await tts.synthesize('Hello there.', 'voice-1', undefined, 'en');
    await tts.synthesize('Hello there.', 'voice-1', undefined, 'es');
    const [byDefault, english, spanish] = fetchMock.mock.calls.map((c) => c[1].body as string);
    const model = JSON.stringify(JSON.parse(byDefault).model_id);
    const pinned = `{"model_id":${model},"transcript":"Hello there.","voice":${VOICE},"output_format":${PCM},"language":"en"}`;
    expect(byDefault).toBe(pinned);
    expect(english).toBe(pinned);
    expect(spanish).toBe(asSpanish(pinned));
  });

  it('single-context socket send: the English body is unchanged; Spanish differs only in language', async () => {
    const { tts, socket } = provider();
    const drain = async (language?: TTSLanguage) => {
      for await (const _ of tts.synthesizeStreaming(
        'Hello there.',
        'voice-1',
        undefined,
        language
      )) {
        // audio is not under test
      }
    };
    await drain();
    await drain('es');
    const [english, spanish] = socket.sent.map((r) => JSON.stringify(r));
    const sent = socket.sent[0];
    const pinned = `{"model_id":${JSON.stringify(sent.model_id)},"transcript":"Hello there.","voice":${VOICE},"output_format":${PCM},"language":"en","context_id":${JSON.stringify(sent.context_id)},"continue":false}`;
    expect(english).toBe(pinned);
    expect(spanish).toBe(
      asSpanish(pinned).replace(String(sent.context_id), String(socket.sent[1].context_id))
    );
  });

  it('reply stream: the English body is unchanged; Spanish differs only in language', async () => {
    const send = async (language?: () => TTSLanguage) => {
      const { tts, socket } = provider();
      const reply = tts.openReplyStream('voice-1', language);
      reply.push('Hello there.');
      reply.end();
      await tick();
      return socket.sent[0];
    };
    const english = await send();
    const spanish = await send(() => 'es');
    const pinned = (r: Record<string, unknown>) =>
      `{"model_id":${JSON.stringify(r.model_id)},"transcript":"Hello there.","voice":${VOICE},"output_format":${PCM},"language":"en","context_id":${JSON.stringify(r.context_id)},"continue":true,"max_buffer_delay_ms":0}`;
    expect(JSON.stringify(english)).toBe(pinned(english));
    expect(JSON.stringify(spanish)).toBe(asSpanish(pinned(spanish)));
  });

  it('reply stream: the language is read when each piece is sent, not when the stream opens', async () => {
    const { tts, socket } = provider();
    let language: TTSLanguage = 'en';
    const reply = tts.openReplyStream('voice-1', () => language);
    language = 'es';
    reply.push('Escucho cuánto dolor sientes ahora.');
    reply.end();
    await tick();
    expect(socket.sent.map((r) => r.language)).toEqual(['es', 'es']);
  });
});
