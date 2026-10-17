/**
 * The audio budget on journal transcription: every clip is measured with
 * countTokens before Vertex transcribes it, refused over the clip cap, and
 * charged to one hourly budget in audio tokens. The Vertex SDK is mocked and
 * the limiter runs in memory (no REDIS_URL): no test reaches Google Cloud.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ generateContent: vi.fn(), countTokens: vi.fn() }));

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: class {
    getGenerativeModel() {
      return { generateContent: sdk.generateContent, countTokens: sdk.countTokens };
    }
  },
}));

const words = (text: string) => ({
  response: { candidates: [{ content: { parts: [{ text }] } }] },
});
const clip = () => {
  const buf = Buffer.alloc(4096, 3);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};
/** Tokens in `minutes` of audio at Vertex's 25 a second. */
const minutes = (m: number) => m * 60 * 25;

let now = Date.parse('2026-10-16T09:00:00Z');

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  now += 2 * 60 * 60_000; // a fresh hour for each test
  vi.setSystemTime(now);
  sdk.generateContent.mockReset().mockResolvedValue(words('we counted eleven herons'));
  sdk.countTokens.mockReset().mockResolvedValue({ totalTokens: minutes(1) });
  vi.stubEnv('JOURNAL_TRANSCRIBE_VERTEX', 'on');
  vi.stubEnv('REDIS_URL', '');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const load = () => import('../vertex-transcribe.js');
const budget = () => import('../transcribe-budget.js');

describe('measuring before transcribing', () => {
  it('measures the clip, then transcribes it', async () => {
    const { vertexJournalFallback } = await load();
    expect(await vertexJournalFallback(clip(), 'audio/webm')).toBe('we counted eleven herons');
    expect(sdk.countTokens).toHaveBeenCalledTimes(1);
    expect(sdk.countTokens.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.generateContent.mock.invocationCallOrder[0] ?? 0
    );
  });

  it.each([
    ['fails', () => sdk.countTokens.mockRejectedValue(new Error('quota'))],
    ['returns no count', () => sdk.countTokens.mockResolvedValue({})],
    ['returns zero', () => sdk.countTokens.mockResolvedValue({ totalTokens: 0 })],
  ])('refuses the clip, without transcribing, when countTokens %s', async (_case, arrange) => {
    arrange();
    const { vertexJournalFallback } = await load();
    expect(await vertexJournalFallback(clip(), 'audio/webm')).toBeNull();
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });

  it('does nothing at all with the flag off', async () => {
    vi.stubEnv('JOURNAL_TRANSCRIBE_VERTEX', 'off');
    const { vertexJournalFallback } = await load();
    expect(await vertexJournalFallback(clip(), 'audio/webm')).toBeNull();
    expect(sdk.countTokens).not.toHaveBeenCalled();
  });
});

describe('the clip cap', () => {
  it('refuses a clip over 10 minutes with ClipTooLongError, and charges nothing', async () => {
    vi.stubEnv('TRANSCRIBE_MAX_AUDIO_MINUTES_PER_HOUR', '11');
    sdk.countTokens.mockResolvedValueOnce({ totalTokens: minutes(10) + 1 });
    const { vertexJournalFallback } = await load();
    const { ClipTooLongError } = await budget();

    await expect(vertexJournalFallback(clip(), 'audio/webm')).rejects.toBeInstanceOf(
      ClipTooLongError
    );
    expect(sdk.generateContent).not.toHaveBeenCalled();

    // Nothing was charged: a full 10-minute clip still fits the 11-minute hour.
    sdk.countTokens.mockResolvedValueOnce({ totalTokens: minutes(10) });
    expect(await vertexJournalFallback(clip(), 'audio/webm')).toBe('we counted eleven herons');
  });

  it('reads TRANSCRIBE_MAX_CLIP_MINUTES', async () => {
    vi.stubEnv('TRANSCRIBE_MAX_CLIP_MINUTES', '2');
    sdk.countTokens.mockResolvedValue({ totalTokens: minutes(3) });
    const { vertexJournalFallback } = await load();
    await expect(vertexJournalFallback(clip(), 'audio/webm')).rejects.toMatchObject({
      name: 'ClipTooLongError',
      maxMinutes: 2,
    });
  });
});

describe('the hourly audio budget', () => {
  it('defaults to 45 audio minutes and 10-minute clips, ignoring bad values', async () => {
    const { maxAudioTokensPerHour, maxClipMinutes } = await budget();
    expect(maxAudioTokensPerHour({})).toBe(minutes(45));
    expect(maxClipMinutes({})).toBe(10);
    for (const bad of ['0', '-5', 'lots', '1.5']) {
      expect(maxAudioTokensPerHour({ TRANSCRIBE_MAX_AUDIO_MINUTES_PER_HOUR: bad })).toBe(
        minutes(45)
      );
    }
  });

  it('charges measured minutes, refuses once the hour is spent, and lets the next hour in', async () => {
    vi.stubEnv('TRANSCRIBE_MAX_AUDIO_MINUTES_PER_HOUR', '5');
    sdk.countTokens.mockResolvedValue({ totalTokens: minutes(2) });
    const { vertexJournalFallback } = await load();
    const { TranscribeBudgetSpentError } = await budget();

    expect(await vertexJournalFallback(clip(), 'audio/webm')).not.toBeNull(); // 2 of 5
    expect(await vertexJournalFallback(clip(), 'audio/webm')).not.toBeNull(); // 4 of 5
    // A third 2-minute clip would make 6: refused, not transcribed.
    await expect(vertexJournalFallback(clip(), 'audio/webm')).rejects.toBeInstanceOf(
      TranscribeBudgetSpentError
    );
    expect(sdk.generateContent).toHaveBeenCalledTimes(2);
    // The minute left over still takes a 1-minute clip.
    sdk.countTokens.mockResolvedValueOnce({ totalTokens: minutes(1) });
    expect(await vertexJournalFallback(clip(), 'audio/webm')).not.toBeNull();

    now += 61 * 60_000;
    vi.setSystemTime(now);
    expect(await vertexJournalFallback(clip(), 'audio/webm')).not.toBeNull();
  });

  it('does not refund a clip when transcription then fails, so retries cannot pass the budget', async () => {
    vi.stubEnv('TRANSCRIBE_MAX_AUDIO_MINUTES_PER_HOUR', '3');
    sdk.countTokens.mockResolvedValue({ totalTokens: minutes(1) });
    sdk.generateContent.mockRejectedValue(new Error('Vertex 500'));
    const { vertexJournalFallback } = await load();

    for (let i = 0; i < 3; i++) {
      expect(await vertexJournalFallback(clip(), 'audio/webm')).toBeNull(); // failed, still charged
    }
    await expect(vertexJournalFallback(clip(), 'audio/webm')).rejects.toMatchObject({
      name: 'TranscribeBudgetSpentError',
    });
    expect(sdk.generateContent).toHaveBeenCalledTimes(3);
  });
});

describe("each caller's share", () => {
  it('stops one caller at their share while others still get the hour', async () => {
    vi.stubEnv('TRANSCRIBE_MAX_AUDIO_MINUTES_PER_PERSON_HOUR', '3');
    sdk.countTokens.mockResolvedValue({ totalTokens: minutes(2) });
    const { vertexJournalFallback } = await load();
    const { withTranscribeCaller } = await budget();
    const as = (who: string) =>
      withTranscribeCaller(who, () => vertexJournalFallback(clip(), 'audio/webm'));

    expect(await as('user:a')).not.toBeNull(); // a: 2 of 3
    await expect(as('user:a')).rejects.toMatchObject({ name: 'TranscribeBudgetSpentError' });
    expect(await as('user:b')).not.toBeNull(); // b has their own share
    expect(await as('anon-ip:198.51.100.7')).not.toBeNull();
    expect(sdk.generateContent).toHaveBeenCalledTimes(3);
  });

  it('defaults the share to 15 audio minutes', async () => {
    const { maxPersonAudioTokensPerHour } = await budget();
    expect(maxPersonAudioTokensPerHour({})).toBe(minutes(15));
  });
});

describe('when the shared count is unreachable', () => {
  it('refuses the clip (fail closed) instead of counting in this instance', async () => {
    const { vertexJournalFallback } = await load();
    const { rateLimiter } = await import('../../platform/rate-limiter.js');
    vi.spyOn(rateLimiter, 'checkShared').mockResolvedValueOnce(null);
    await expect(vertexJournalFallback(clip(), 'audio/webm')).rejects.toMatchObject({
      name: 'TranscribeBudgetSpentError',
      retryAfterSeconds: 60,
    });
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });
});

describe('rateLimiter cost (memory fallback)', () => {
  it('allows a charge that lands exactly on the limit, refuses one over it, and keeps cost 1 as default', async () => {
    const { rateLimiter } = await import('../../platform/rate-limiter.js');
    const key = `test:cost:${now}`;
    expect((await rateLimiter.check(key, 10, 60_000, 7)).allowed).toBe(true);
    const over = await rateLimiter.check(key, 10, 60_000, 4);
    expect(over).toMatchObject({ allowed: false, remaining: 3 });
    expect(await rateLimiter.check(key, 10, 60_000, 3)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect((await rateLimiter.check(key, 10, 60_000)).allowed).toBe(false);

    const plain = `test:plain:${now}`;
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await rateLimiter.check(plain, 2, 60_000)).allowed);
    expect(results).toEqual([true, true, false]);
  });
});
