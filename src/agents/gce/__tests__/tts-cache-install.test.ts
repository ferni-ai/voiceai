import { beforeEach, describe, expect, it, vi } from 'vitest';

const setTTSCache = vi.fn();
const getCachedGreetingAudio = vi.fn((): ArrayBuffer | ArrayBufferView | null => null);
const getPrewarmedGreetingAudio = vi.fn((): ArrayBuffer | ArrayBufferView | null => null);
const getCachedConversationalAudio = vi.fn((): ArrayBuffer | ArrayBufferView | null => null);

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

vi.mock('../../shared/performance/greeting-audio-prewarm.js', () => ({
  getPrewarmedGreetingAudio,
}));

vi.mock('../../shared/conversational-audio-cache.js', () => ({
  getCachedAudio: getCachedConversationalAudio,
}));

describe('installProductionTTSCache', () => {
  beforeEach(() => {
    setTTSCache.mockClear();
    getCachedGreetingAudio.mockReset();
    getPrewarmedGreetingAudio.mockReset();
    getCachedConversationalAudio.mockReset();
    getCachedGreetingAudio.mockReturnValue(null);
    getPrewarmedGreetingAudio.mockReturnValue(null);
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

  it('installs a cache that checks greeting audio before conversational audio', async () => {
    const greetingAudio = new ArrayBuffer(48_000);
    getCachedGreetingAudio.mockReturnValue(greetingAudio);
    getCachedConversationalAudio.mockReturnValue(new ArrayBuffer(96_000));

    const { installProductionTTSCache } = await import('../tts-cache-install.js');
    await installProductionTTSCache();

    const [installedCache] = setTTSCache.mock.calls[0] ?? [];
    const result = await installedCache.get('Hey there', 'ferni');

    expect(setTTSCache).toHaveBeenCalledTimes(1);
    expect(result?.audio).toBe(greetingAudio);
    expect(result?.durationMs).toBe(1000);
    expect(getCachedGreetingAudio).toHaveBeenCalledWith('Hey there', 'ferni');
    expect(getPrewarmedGreetingAudio).not.toHaveBeenCalled();
    expect(getCachedConversationalAudio).not.toHaveBeenCalled();
  });

  it('falls back to prewarmed GCE greeting audio before conversational audio', async () => {
    const prewarmedGreetingAudio = new Uint8Array(48_000);
    getPrewarmedGreetingAudio.mockReturnValue(prewarmedGreetingAudio);
    getCachedConversationalAudio.mockReturnValue(new ArrayBuffer(96_000));

    const { installProductionTTSCache } = await import('../tts-cache-install.js');
    await installProductionTTSCache();

    const [installedCache] = setTTSCache.mock.calls[0] ?? [];
    const result = await installedCache.get('Hey there', 'ferni');

    expect(setTTSCache).toHaveBeenCalledTimes(1);
    expect(result?.audio.byteLength).toBe(prewarmedGreetingAudio.byteLength);
    expect(result?.durationMs).toBe(1000);
    expect(getCachedGreetingAudio).toHaveBeenCalledWith('Hey there', 'ferni');
    expect(getPrewarmedGreetingAudio).toHaveBeenCalledWith('Hey there', 'ferni');
    expect(getCachedConversationalAudio).not.toHaveBeenCalled();
    expect(getCachedGreetingAudio.mock.invocationCallOrder[0]).toBeLessThan(
      getPrewarmedGreetingAudio.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('checks conversational audio after both greeting caches miss', async () => {
    const conversationalAudio = new ArrayBuffer(96_000);
    getCachedConversationalAudio.mockReturnValue(conversationalAudio);

    const { installProductionTTSCache } = await import('../tts-cache-install.js');
    await installProductionTTSCache();

    const [installedCache] = setTTSCache.mock.calls[0] ?? [];
    const result = await installedCache.get('Hey there', 'ferni');

    expect(setTTSCache).toHaveBeenCalledTimes(1);
    expect(result?.audio).toBe(conversationalAudio);
    expect(result?.durationMs).toBe(2000);
    expect(getCachedGreetingAudio.mock.invocationCallOrder[0]).toBeLessThan(
      getPrewarmedGreetingAudio.mock.invocationCallOrder[0] ?? 0
    );
    expect(getPrewarmedGreetingAudio.mock.invocationCallOrder[0]).toBeLessThan(
      getCachedConversationalAudio.mock.invocationCallOrder[0] ?? 0
    );
  });
});
