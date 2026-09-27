/**
 * The gateway turns the reply's Cartesia markup into per-chunk prosody (speed,
 * volume, emotion). The Cartesia provider ignored it (`_prosody`) and sent
 * plain text, so on the live cascade path every emotional delivery cue was
 * dropped. sonic-3 renders these inline tags on both /tts/bytes and the
 * WebSocket (verified 2026-09-27), so the provider re-attaches them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartesiaTTSProvider, prosodyTags } from '../providers/cartesia.js';

describe('prosodyTags', () => {
  it('renders speed, volume and emotion as sonic-3 inline tags', () => {
    expect(prosodyTags({ speed: 0.9, volume: 1.2, emotion: 'sympathetic' })).toBe(
      '<speed ratio="0.9"/><volume ratio="1.2"/><emotion value="sympathetic"/>'
    );
  });

  it('clamps to Cartesia ranges and skips neutral or invalid values', () => {
    expect(prosodyTags({ speed: 3, volume: 0.1 })).toBe(
      '<speed ratio="1.5"/><volume ratio="0.5"/>'
    );
    expect(prosodyTags({ speed: 1, volume: 1 })).toBe('');
    expect(prosodyTags({ emotion: 'happy"/><break' })).toBe('');
    expect(prosodyTags(undefined)).toBe('');
  });
});

describe('CartesiaTTSProvider.synthesize', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv('CARTESIA_API_KEY', 'test-key');
    fetchMock.mockResolvedValue(new Response(new ArrayBuffer(4)));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends the chunk prosody with the transcript', async () => {
    await new CartesiaTTSProvider().synthesize('That sounds really hard.', 'voice-1', {
      speed: 0.9,
      emotion: 'sympathetic',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.transcript).toBe(
      '<speed ratio="0.9"/><emotion value="sympathetic"/>That sounds really hard.'
    );
  });
});
