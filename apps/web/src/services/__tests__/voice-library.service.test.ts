/**
 * The agent voice picker lists the server's voices (GET /api/custom-agents/voices), so
 * the id it sends to select-premade is a real Cartesia voice id the server accepts.
 * The old built-in list sent ids like "cartesia-friendly-female", which it refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/api.js', () => ({
  getUserId: () => 'u1',
  getApiHeadersAsync: async () => ({ Authorization: 'Bearer t' }),
}));

type Service = typeof import('../voice-library.service.js');
async function fresh(): Promise<Service> {
  vi.resetModules();
  return import('../voice-library.service.js');
}

const JANICE = '69092565-1c93-4a88-9f2c-ac8cddaf9f65';
const catalog = {
  voices: [
    {
      voiceId: JANICE,
      name: 'Janice',
      description: 'Bright and friendly',
      gender: 'female',
      age: 'adult',
      accent: 'american',
      tags: ['upbeat'],
    },
  ],
};

describe('the voice library', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is empty until loaded, then holds the server voices with their Cartesia ids', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));
    const s = await fresh();
    expect(s.getVoiceLibrary()).toEqual([]);
    expect(s.getVoiceLibraryState()).toBe('idle');

    const voices = await s.loadVoiceLibrary();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/custom-agents/voices');
    expect(voices).toEqual([
      {
        id: JANICE,
        name: 'Janice',
        description: 'Bright and friendly',
        previewUrl: `/sounds/voice-library/${JANICE}.mp3`,
        gender: 'female',
        age: 'adult',
        accent: 'american',
        tags: ['upbeat'],
      },
    ]);
    expect(s.getVoiceLibraryState()).toBe('ready');
    expect(s.getVoiceFromLibrary(JANICE)?.name).toBe('Janice');
    expect(s.getVoiceLibrary().some((v) => v.id.startsWith('cartesia-'))).toBe(false);
  });

  it('asks the server once when several screens load it at the same time', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));
    const s = await fresh();
    await Promise.all([s.loadVoiceLibrary(), s.loadVoiceLibrary(), s.loadVoiceLibrary()]);
    await s.loadVoiceLibrary();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a failed load and can try again', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const s = await fresh();
    expect(await s.loadVoiceLibrary()).toEqual([]);
    expect(s.getVoiceLibraryState()).toBe('failed');
    expect(s.getVoiceLibraryFailedAt()).toBeGreaterThan(0);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(catalog), { status: 200 }));
    expect((await s.loadVoiceLibrary()).map((v) => v.id)).toEqual([JANICE]);
    expect(s.getVoiceLibraryState()).toBe('ready');
  });
});
