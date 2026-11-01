/**
 * OWNER_OUTREACH_STORED_TEXT_SCREEN on pondering's input (readRecentCalls): the
 * notes pondering writes are sent to the owner, so summary lines that the content
 * filter refuses are not read into the pondering prompt while the screen is on;
 * off, every line is read as before. All data is fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { pathFirestore } from '../../../services/outreach/proactive-channels/__tests__/path-firestore.js';
import { readRecentCalls } from '../ponder-user.js';

const OWNER = 'owner-uid';
const PHISH = 'call 212 555 0198 about your bank account';
const docs = new Map<string, Record<string, unknown>>([
  [
    `bogle_users/${OWNER}/summaries/s1`,
    {
      timestamp: '2026-10-18T20:00:00Z',
      mainTopics: ['the garden', PHISH],
      keyPoints: [PHISH, 'planting tulips this weekend'],
    },
  ],
]);
const db = pathFirestore(docs) as unknown as Firestore;

afterEach(() => vi.unstubAllEnvs());

describe('readRecentCalls with the stored-text screen', () => {
  it('on: lines that carry a phone number are not read; the rest are', async () => {
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'on');
    const [summary] = (await readRecentCalls(db, OWNER)).summaries;
    expect(summary.topics).toEqual(['the garden']);
    expect(summary.keyPoints).toEqual(['planting tulips this weekend']);
  });

  it('off: every line is read as before', async () => {
    const [summary] = (await readRecentCalls(db, OWNER)).summaries;
    expect(summary.topics).toEqual(['the garden', PHISH]);
    expect(summary.keyPoints).toEqual([PHISH, 'planting tulips this weekend']);
  });
});
