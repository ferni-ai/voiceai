/**
 * The never-silent pre-render request (fallback-line-render.ts): a failed or
 * non-audio response is never read as PCM, a real one is, and the request has
 * the shape Cartesia documents for /tts/bytes. No network: fetch is stubbed.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderFallbackLine } from '../fallback-line-render.js';
import { FALLBACK_LINES, measureClip, MIN_VOICED_MS } from '../never-silent.js';

const RATE = 24_000;
const VOICE = 'voice-riley-test';
const ENV = { CARTESIA_API_KEY: 'test-key' };
const LINE = FALLBACK_LINES[0];

/** s16le PCM of a loud 220 Hz tone: voiced all through. */
function tonePcm(ms: number): ArrayBuffer {
  const samples = Int16Array.from({ length: (RATE * ms) / 1000 }, (_, i) =>
    Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / RATE))
  );
  return samples.buffer;
}

function stubFetch(
  status: number,
  contentType: string | null,
  body: ConstructorParameters<typeof Response>[0]
) {
  const headers = contentType ? { 'content-type': contentType } : undefined;
  return vi.fn(async () => new Response(body, { status, headers }));
}

const ERROR_JSON = JSON.stringify({ error: 'invalid request', message: 'bad content type' });

describe('renderFallbackLine', () => {
  it('a failed HTTP response is not audio, even with bytes in the body', async () => {
    const fetch = stubFetch(400, 'application/json', ERROR_JSON);
    const result = await renderFallbackLine(LINE, VOICE, { fetch, env: ENV });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ failure: 'http_status', statusClass: '4xx' });
  });

  it('a server error is reported by status class', async () => {
    const fetch = stubFetch(503, 'audio/pcm', tonePcm(500));
    expect(await renderFallbackLine(LINE, VOICE, { fetch, env: ENV })).toEqual({
      failure: 'http_status',
      statusClass: '5xx',
    });
  });

  it('a 2xx body that is not audio (JSON error) is not read as PCM', async () => {
    const fetch = stubFetch(200, 'application/json', ERROR_JSON);
    expect(await renderFallbackLine(LINE, VOICE, { fetch, env: ENV })).toEqual({
      failure: 'not_audio',
    });
  });

  it('a 2xx body with no content type is not trusted either', async () => {
    const fetch = stubFetch(200, null, tonePcm(500));
    expect(await renderFallbackLine(LINE, VOICE, { fetch, env: ENV })).toEqual({
      failure: 'not_audio',
    });
  });

  it('a valid audio response becomes frames carrying the voice', async () => {
    const fetch = stubFetch(200, 'audio/pcm; rate=24000', tonePcm(1500));
    const result = await renderFallbackLine(LINE, VOICE, { fetch, env: ENV });
    if (!('frames' in result)) throw new Error(`expected frames, got ${result.failure}`);
    const clip = measureClip(result.frames);
    expect(clip.ms).toBe(1500);
    expect(clip.voicedMs).toBeGreaterThanOrEqual(MIN_VOICED_MS);
    expect(result.frames[0].sampleRate).toBe(RATE);
  });

  it('an empty audio body is reported, not kept', async () => {
    const fetch = stubFetch(200, 'audio/pcm', new ArrayBuffer(0));
    expect(await renderFallbackLine(LINE, VOICE, { fetch, env: ENV })).toEqual({
      failure: 'empty',
    });
  });

  it('a network error is reported, never thrown', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await renderFallbackLine(LINE, VOICE, { fetch, env: ENV })).toEqual({
      failure: 'network',
    });
  });

  it('no API key: no request', async () => {
    const fetch = stubFetch(200, 'audio/pcm', tonePcm(500));
    expect(await renderFallbackLine(LINE, VOICE, { fetch, env: {} })).toEqual({
      failure: 'no_key',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the documented /tts/bytes request: JSON content type, raw 24 kHz s16le, no WebSocket fields', async () => {
    const fetch = stubFetch(200, 'audio/pcm', tonePcm(500));
    await renderFallbackLine(LINE, VOICE, { fetch, env: ENV });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/tts\/bytes$/);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-API-Key': 'test-key',
      'Cartesia-Version': expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      transcript: LINE,
      voice: { mode: 'id', id: VOICE },
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: RATE },
      language: 'en',
    });
    expect(body.model_id).toEqual(expect.any(String));
    expect(body).not.toHaveProperty('max_buffer_delay_ms');
  });
});
