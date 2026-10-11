import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const groundedSearch = vi.fn();
vi.mock('../grounded-search.js', () => ({ groundedSearch }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const UNSAFE: Record<string, object> = {
  ageRestrict: { ageRestricted: true },
  privateVid1: { privacyStatus: 'private' },
  noEmbed0001: { embeddable: false },
};
const searchVideos = vi.fn(async (_q: string, _o: Record<string, unknown>) => ({
  found: true,
  videos: [{ id: 'srchA00000a' }, { id: 'srchB00000b' }],
}));
const getVideoDetails = vi.fn(async (id: string) => ({
  found: true,
  video: {
    id,
    title: `Title ${id}`,
    channelTitle: 'Coach Channel',
    durationSeconds: 512,
    privacyStatus: 'public',
    embeddable: true,
    ...UNSAFE[id],
  },
}));
vi.mock('../../video/youtube-search.js', () => ({ searchVideos, getVideoDetails }));

const { bookCandidates, spokenLength, videoCandidates, youtubeId } =
  await import('../candidates.js');
const { resetQuotaMemory, SEARCH_BUDGET_PER_DAY } = await import('../quota.js');

const urls: URL[] = [];

function respond(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const grounded = (...links: string[]) => ({
  answer: 'a',
  sources: links.map((url) => ({ title: 't', url })),
  searchSuggestionsHtml: '<div>chips</div>',
});

beforeEach(() => {
  urls.length = 0;
  resetQuotaMemory();
  groundedSearch.mockReset();
  searchVideos.mockClear();
  getVideoDetails.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input);
      urls.push(url);
      return respond({
        totalItems: 2,
        items: [
          { id: 'b1', volumeInfo: { title: 'No description', authors: ['X'] } },
          {
            id: 'b3',
            volumeInfo: {
              title: 'Adult',
              authors: ['Y'],
              description: 'd',
              maturityRating: 'MATURE',
            },
          },
          {
            id: 'b2',
            volumeInfo: {
              title: 'Your Money or Your Life',
              authors: ['Vicki Robin'],
              description: 'A classic on spending.',
              maturityRating: 'NOT_MATURE',
              pageCount: 352,
            },
          },
        ],
      });
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('videoCandidates', () => {
  it('finds videos through grounding and spends only videos.list on them', async () => {
    groundedSearch.mockResolvedValue(
      grounded(
        'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        'https://youtu.be/bbbbbbbbbbb',
        'https://www.nhs.uk/shin-splints',
        'https://www.youtube.com/shorts/ccccccccccc',
        'https://www.youtube.com/watch?v=aaaaaaaaaaa'
      )
    );
    const found = await videoCandidates('beginner shin splint stretches', false);
    expect(groundedSearch.mock.calls[0][0]).toContain('beginner shin splint stretches');
    expect(searchVideos).not.toHaveBeenCalled();
    expect(getVideoDetails.mock.calls.map((c) => c[0])).toEqual([
      'aaaaaaaaaaa',
      'bbbbbbbbbbb',
      'ccccccccccc',
    ]);
    expect(found[0]).toMatchObject({
      kind: 'video',
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      by: 'Coach Channel',
      length: '9 minutes',
    });
    // Kept for the sources card the user sees.
    expect(found[0].grounding?.searchSuggestionsHtml).toBe('<div>chips</div>');
    expect(found[0].grounding?.sources).toHaveLength(5);
  });

  it('serves a repeated topic from the cache with no grounding or API call', async () => {
    groundedSearch.mockResolvedValue(grounded('https://youtu.be/bbbbbbbbbbb'));
    const first = await videoCandidates('desk posture', false);
    expect(first).toHaveLength(1);
    const again = await videoCandidates('desk posture', false);
    expect(again).toEqual(first);
    expect(groundedSearch).toHaveBeenCalledTimes(1);
    expect(getVideoDetails).toHaveBeenCalledTimes(1);
  });

  it('falls back to search.list, short and #shorts for Shorts, only within the daily budget', async () => {
    groundedSearch.mockResolvedValue(grounded('https://www.nhs.uk/x'));
    expect(await videoCandidates('desk posture', true)).toHaveLength(2);
    expect(searchVideos.mock.calls[0]).toEqual([
      'desk posture #shorts',
      { limit: 5, duration: 'short', safeSearch: 'strict' },
    ]);

    for (let i = 1; i < SEARCH_BUDGET_PER_DAY; i++) await videoCandidates(`topic ${i}`, false);
    expect(searchVideos).toHaveBeenCalledTimes(SEARCH_BUDGET_PER_DAY);
    expect(await videoCandidates('one more topic', false)).toEqual([]);
    expect(searchVideos).toHaveBeenCalledTimes(SEARCH_BUDGET_PER_DAY);
  });
});

describe('video safety', () => {
  it('never offers an age-restricted, private or non-embeddable video found by grounding', async () => {
    groundedSearch.mockResolvedValue(
      grounded(
        'https://youtu.be/ageRestrict',
        'https://youtu.be/privateVid1',
        'https://youtu.be/noEmbed0001'
      )
    );
    expect(await videoCandidates('stretch routine', false)).toEqual([]);
    groundedSearch.mockResolvedValue(
      grounded('https://youtu.be/ageRestrict', 'https://youtu.be/okVideo0001')
    );
    const found = await videoCandidates('another routine', false);
    expect(found.map((c) => c.url)).toEqual(['https://www.youtube.com/watch?v=okVideo0001']);
  });
});

describe('youtubeId', () => {
  it('reads watch, shorts and youtu.be links and nothing else', () => {
    expect(youtubeId('https://m.youtube.com/watch?v=aaaaaaaaaaa&t=3')).toBe('aaaaaaaaaaa');
    expect(youtubeId('https://evil.example/watch?v=aaaaaaaaaaa')).toBeNull();
    expect(youtubeId('https://www.youtube.com/watch?v=short')).toBeNull();
  });
});

describe('bookCandidates', () => {
  it('keeps books with a description and uses the YouTube key with COACH_MEDIA=on', async () => {
    vi.stubEnv('COACH_MEDIA', 'on');
    vi.stubEnv('YOUTUBE_API_KEY', 'yt-key');
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', '');
    const found = await bookCandidates('personal finance basics');
    expect(urls[0].searchParams.get('key')).toBe('yt-key');
    expect(found).toEqual([
      {
        kind: 'book',
        title: 'Your Money or Your Life',
        by: 'Vicki Robin',
        url: 'https://books.google.com/books?id=b2',
        length: '352 pages',
        summary: 'A classic on spending.',
      },
    ]);
  });

  it('does not use the YouTube key with the flag off', async () => {
    vi.stubEnv('COACH_MEDIA', '');
    vi.stubEnv('YOUTUBE_API_KEY', 'yt-key');
    vi.stubEnv('GOOGLE_BOOKS_API_KEY', '');
    await bookCandidates('personal finance basics, again');
    expect(urls[0].searchParams.has('key')).toBe(false);
  });
});

describe('spokenLength', () => {
  it('says seconds, minutes or hours', () => {
    expect(spokenLength(45)).toBe('45 seconds');
    expect(spokenLength(512)).toBe('9 minutes');
    expect(spokenLength(9000)).toBe('2.5 hours');
  });
});
