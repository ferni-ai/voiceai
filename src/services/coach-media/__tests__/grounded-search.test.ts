import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
const getGeminiClient = vi.fn(async () => ({ models: { generateContent } }));
vi.mock('../../../config/gemini-config.js', () => ({ getGeminiClient }));

const { groundedAnswer, GROUNDING_SYSTEM_INSTRUCTION, resolveSourceUrl, safeHttpsUrl } =
  await import('../grounded-search.js');

const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc';

function chunk(uri: string, title: string) {
  return { web: { uri, title } };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  generateContent.mockReset();
  getGeminiClient.mockClear();
  fetchMock = vi.fn(async () => ({
    headers: new globalThis.Headers({ location: 'https://www.youtube.com/watch?v=abc123' }),
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('groundedAnswer', () => {
  it('asks Gemini with Google Search grounding and returns the answer with resolved sources', async () => {
    generateContent.mockResolvedValue({
      text: ' Calf raises and eccentric heel drops help. ',
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              chunk(REDIRECT, 'youtube.com'),
              chunk(REDIRECT, 'youtube.com'), // duplicate
              chunk('https://www.nhs.uk/conditions/shin-splints/', 'nhs.uk'),
              chunk('javascript:alert(1)', 'bad'),
              {},
            ],
            groundingSupports: [
              { segment: { text: 'Heel drops help.' }, groundingChunkIndices: [2] },
              { segment: { text: 'Calf raises help.' }, groundingChunkIndices: [0, 2] },
            ],
            searchEntryPoint: { renderedContent: '<div>chips</div>' },
            webSearchQueries: ['shin splint stretches'],
          },
        },
      ],
    });

    const result = await groundedAnswer('beginner shin splint stretches');

    const req = generateContent.mock.calls[0][0];
    expect(req.config.tools).toEqual([{ googleSearch: {} }]);
    expect(req.config.systemInstruction).toBe(GROUNDING_SYSTEM_INSTRUCTION);
    expect(req.contents).toContain('beginner shin splint stretches');
    expect(result).toEqual({
      answer: 'Calf raises and eccentric heel drops help.',
      sources: [
        {
          title: 'youtube.com',
          url: 'https://www.youtube.com/watch?v=abc123',
          summary: 'Calf raises help.',
        },
        {
          title: 'nhs.uk',
          url: 'https://www.nhs.uk/conditions/shin-splints/',
          summary: 'Heel drops help.',
        },
      ],
      searchSuggestionsHtml: '<div>chips</div>',
      webSearchQueries: ['shin splint stretches'],
    });
    // One HEAD for the redirect, none for the direct link.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'HEAD', redirect: 'manual' });
  });

  it('returns null when the search throws, Gemini is not configured, or nothing came back', async () => {
    generateContent.mockRejectedValueOnce(new Error('deadline exceeded'));
    expect(await groundedAnswer('sleep hygiene')).toBeNull();

    generateContent.mockResolvedValueOnce({ text: '', candidates: [] });
    expect(await groundedAnswer('sleep hygiene')).toBeNull();

    getGeminiClient.mockResolvedValueOnce(null as never);
    expect(await groundedAnswer('sleep hygiene')).toBeNull();
  });
});

describe('resolveSourceUrl', () => {
  it('never fetches links that are not grounding redirects', async () => {
    expect(await resolveSourceUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the redirect when its target is not https or the request fails', async () => {
    fetchMock.mockResolvedValueOnce({
      headers: new globalThis.Headers({ location: 'http://plain.example/' }),
    });
    expect(await resolveSourceUrl(REDIRECT)).toBe(REDIRECT);
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    expect(await resolveSourceUrl(REDIRECT)).toBe(REDIRECT);
  });

  it('accepts only https links', () => {
    expect(safeHttpsUrl('http://x.example/')).toBeNull();
    expect(safeHttpsUrl('data:text/html,hi')).toBeNull();
    expect(safeHttpsUrl('not a url')).toBeNull();
    expect(safeHttpsUrl('https://x.example/a b')).toBe('https://x.example/a%20b');
  });
});
