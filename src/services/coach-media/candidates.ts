/**
 * Candidates for a checked pick. Only the topic-only query is sent.
 *
 * Videos are found through grounded search first: YouTube links among the
 * grounding sources, then videos.list (1 quota unit each) for title, channel
 * and length. search.list (100 units) is the fallback only when grounding
 * found none, and only within the shared daily budget (quota.ts); past it the
 * tool falls back to the grounded answer. Shorts have no search filter:
 * "short" duration (under 4 minutes) plus #shorts is the closest. Books come
 * from Google Books (services/books). Both are cached per topic for 7 days.
 *
 * @module services/coach-media/candidates
 */

import { searchBooks, type Book } from '../books/google-books.js';
import { getVideoDetails, searchVideos, type YouTubeVideo } from '../video/youtube-search.js';
import type { Candidate } from './checked-pick.js';
import { MAX_CHECKED } from './checked-pick.js';
import { groundedSearch } from './grounded-search.js';
import { cachedFor, SEARCH_BUDGET_PER_DAY, takeDailyBudget } from './quota.js';

const YOUTUBE_ID = /^[\w-]{11}$/;

/** The video id in a YouTube watch, shorts or youtu.be link, or null. */
export function youtubeId(link: string): string | null {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^(www|m)\./, '');
    const id =
      host === 'youtu.be'
        ? url.pathname.slice(1)
        : host === 'youtube.com'
          ? (url.searchParams.get('v') ?? /^\/shorts\/([^/]+)/.exec(url.pathname)?.[1] ?? '')
          : '';
    return YOUTUBE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function groundedVideoIds(query: string, shorts: boolean): Promise<string[]> {
  const kind = shorts ? 'YouTube Shorts' : 'YouTube videos';
  const found = await groundedSearch(
    `Find the best ${kind} on: ${query}. Name each video, its channel and its YouTube link.`
  );
  const ids = (found?.sources ?? []).flatMap((s) => youtubeId(s.url) ?? []);
  return [...new Set(ids)];
}

async function searchedVideoIds(query: string, shorts: boolean): Promise<string[]> {
  if (!(await takeDailyBudget('youtube-search', SEARCH_BUDGET_PER_DAY))) return [];
  const found = await searchVideos(shorts ? `${query} #shorts` : query, {
    limit: 5,
    duration: shorts ? 'short' : 'any',
    safeSearch: 'strict',
  });
  return found.found ? found.videos.map((v) => v.id) : [];
}

export function spokenLength(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round(seconds / 360) / 10} hours`;
}

function videoCandidate(v: YouTubeVideo): Candidate {
  return {
    kind: 'video',
    title: v.title,
    by: v.channelTitle,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`,
    length: v.durationSeconds ? spokenLength(v.durationSeconds) : undefined,
  };
}

/** Up to MAX_CHECKED videos for `query`, with their lengths. */
export async function videoCandidates(query: string, shorts: boolean): Promise<Candidate[]> {
  return cachedFor(`video:${shorts ? 'short' : 'any'}:${query}`, async () => {
    let ids = await groundedVideoIds(query, shorts);
    if (ids.length === 0) ids = await searchedVideoIds(query, shorts);
    const details = await Promise.all(
      ids.slice(0, MAX_CHECKED).map(async (id) => getVideoDetails(id))
    );
    return details.flatMap((d) => (d.found && d.video ? [videoCandidate(d.video)] : []));
  });
}

function bookCandidate(b: Book): Candidate {
  return {
    kind: 'book',
    title: b.subtitle ? `${b.title}: ${b.subtitle}` : b.title,
    by: b.authors.join(', ') || 'unknown author',
    url: `https://books.google.com/books?id=${encodeURIComponent(b.id)}`,
    length: b.pageCount ? `${b.pageCount} pages` : undefined,
    summary: b.description,
  };
}

/** Up to MAX_CHECKED books for `query` that have a description to judge. */
export async function bookCandidates(query: string): Promise<Candidate[]> {
  return cachedFor(`book:${query}`, async () => {
    const found = await searchBooks(query, { limit: 10, langRestrict: 'en' });
    if (!found.found) return [];
    return found.books
      .filter((b) => Boolean(b.description))
      .slice(0, MAX_CHECKED)
      .map(bookCandidate);
  });
}
