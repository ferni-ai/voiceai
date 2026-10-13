/**
 * Candidates for a checked pick, from the existing YouTube Data API and Google
 * Books services (services/video, services/books). Only the topic-only query
 * is sent. Shorts have no API filter: "short" duration (under 4 minutes) plus
 * the #shorts tag is the closest the search API offers.
 *
 * @module services/coach-media/candidates
 */

import { searchBooks, type Book } from '../books/google-books.js';
import { getVideoDetails, searchVideos, type YouTubeVideo } from '../video/youtube-search.js';
import type { Candidate } from './checked-pick.js';
import { MAX_CHECKED } from './checked-pick.js';

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
  const found = await searchVideos(shorts ? `${query} #shorts` : query, {
    limit: 5,
    duration: shorts ? 'short' : 'any',
    safeSearch: 'strict',
  });
  if (!found.found) return [];
  const details = await Promise.all(
    found.videos.slice(0, MAX_CHECKED).map(async (v) => getVideoDetails(v.id))
  );
  return details.flatMap((d) => (d.found && d.video ? [videoCandidate(d.video)] : []));
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
  const found = await searchBooks(query, { limit: 10, langRestrict: 'en' });
  if (!found.found) return [];
  return found.books
    .filter((b) => Boolean(b.description))
    .slice(0, MAX_CHECKED)
    .map(bookCandidate);
}
