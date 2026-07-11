import { beforeEach, describe, expect, it, vi } from 'vitest';

const setTTSCache = vi.fn();
const getCachedGreetingAudio = vi.fn((): ArrayBuffer | null => null);
const getCachedConversationalAudio = vi.fn((): ArrayBuffer | null => null);

vi.mock('../../../speech/tts-gateway/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../../speech/tts-gateway/index.js')>(
    '../../../speech/tts-gateway/index.js'
  );

  return {
    ...actual,
    setTTSCache,
  };
});

vi.mock('../../shared/greeting-audio-cache.js', () => ({
  getCachedGreetingAudio,
}));

vi.mock('../../shared/conversational-audio-cache.js', () => ({
  getCachedAudio: getCachedConversationalAudio,
}));

describe('installProductionTTSCache', () => {
  beforeEach(() => {
    setTTSCache.mockClear();
    getCachedGreetingAudio.mockReset();
    getCachedConversationalAudio.mockReset();
    getCachedGreetingAudio.mockReturnValue(null);
    getCachedConversationalAudio.mockReturnValue(null);
  });

  it('calls setTTSCache once with a delegating cache', async () => {
    const { installProductionTTSCache } = await import('../tts-cache-install.js');
    await installProductionTTSCache();

    expect(setTTSCache).toHaveBeenCalledTimes(1);
    expect(setTTSCache).toHaveBeenCalledWith(
      expect.objectContaining({
        get: expect.any(Function),
        set: expect.any(Function),
      })
    );
  });

  it('installs a cache that checks conversational audio before greeting audio', async () => {
    const conversationalAudio = new ArrayBuffer(96_000);
    const greetingAudio = new ArrayBuffer(48_000);
    getCachedConversationalAudio.mockReturnValue(conversationalAudio);
    getCachedGreetingAudio.mockReturnValue(greetingAudio);

    const { installProductionTTSCache } = await import('../tts-cache-install.js');
    await installProductionTTSCache();

    const [installedCache] = setTTSCache.mock.calls[0] ?? [];
    const result = await installedCache.get('Hey there', 'ferni');

    expect(result?.audio).toBe(conversationalAudio);
    expect(result?.durationMs).toBe(2000);
    expect(getCachedConversationalAudio).toHaveBeenCalledWith('Hey there', 'ferni');
    expect(getCachedGreetingAudio).not.toHaveBeenCalled();
  });
});
