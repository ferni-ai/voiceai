import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookCandidates, spokenLength, videoCandidates } from '../candidates.js';

const urls: URL[] = [];

function respond(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function videoItem(id: string, seconds: number) {
  return {
    id,
    snippet: {
      title: `Title ${id}`,
      description: '',
      channelTitle: 'Coach Channel',
      channelId: 'c',
      publishedAt: '2026-01-01',
      thumbnails: {},
      categoryId: '26',
    },
    contentDetails: { duration: `PT${Math.floor(seconds / 60)}M${seconds % 60}S` },
    statistics: { viewCount: '100', likeCount: '5' },
  };
}

beforeEach(() => {
  urls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input);
      urls.push(url);
      if (url.pathname.endsWith('/search')) {
        return respond({
          items: ['a', 'b', 'c', 'd'].map((id) => ({
            id: { videoId: id },
            snippet: {
              title: id,
              description: '',
              channelTitle: 'C',
              channelId: 'c',
              publishedAt: '',
              thumbnails: {},
            },
          })),
        });
      }
      if (url.pathname.endsWith('/videos')) {
        return respond({ items: [videoItem(url.searchParams.get('id') ?? '', 512)] });
      }
      return respond({
        totalItems: 3,
        items: [
          { id: 'b1', volumeInfo: { title: 'No description', authors: ['X'] } },
          {
            id: 'b2',
            volumeInfo: {
              title: 'Your Money or Your Life',
              authors: ['Vicki Robin'],
              description: 'A classic on spending.',
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
  it('searches the topic safely and returns the top three with their length', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'test-key');
    const found = await videoCandidates('beginner shin splint stretches', false);
    const search = urls.find((u) => u.pathname.endsWith('/search'))!;
    expect(search.searchParams.get('q')).toBe('beginner shin splint stretches');
    expect(search.searchParams.get('safeSearch')).toBe('strict');
    expect(search.searchParams.has('videoDuration')).toBe(false);
    expect(found.map((c) => c.url)).toEqual([
      'https://www.youtube.com/watch?v=a',
      'https://www.youtube.com/watch?v=b',
      'https://www.youtube.com/watch?v=c',
    ]);
    expect(found[0]).toMatchObject({ kind: 'video', by: 'Coach Channel', length: '9 minutes' });
  });

  it('asks for short videos tagged #shorts when they want a short', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'test-key');
    await videoCandidates('desk posture', true);
    const search = urls.find((u) => u.pathname.endsWith('/search'))!;
    expect(search.searchParams.get('q')).toBe('desk posture #shorts');
    expect(search.searchParams.get('videoDuration')).toBe('short');
  });

  it('returns nothing without a YouTube key', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', '');
    expect(await videoCandidates('x', false)).toEqual([]);
    expect(urls).toHaveLength(0);
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
    await bookCandidates('personal finance basics');
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
