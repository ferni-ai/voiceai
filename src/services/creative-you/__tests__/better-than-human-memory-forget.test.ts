/**
 * Creative You's "you mentioned this 3 weeks ago" reads (getSuperhumanMemoryContext) leave out
 * call summaries and key moments about a topic the caller asked Ferni to forget, with
 * FORGET_EVERY_READER on; off, every one is read as before. Runs the real reader and the real
 * forget check; only Firestore and the forgotten list are faked. Fictional data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import { resetForgetTopicsSource } from '../../../memory/recall/forget-topics-source.js';

const DAY = 864e5;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
const DOCS: Record<string, Array<Record<string, unknown>>> = {
  // Newest first, as the query orders them.
  summaries: [
    {
      timestamp: at(7),
      mainTopics: ['job search'],
      keyPoints: ['Theo is updating his resume'],
      emotionalArc: 'curious',
    },
    {
      timestamp: at(21),
      mainTopics: ['job search'],
      keyPoints: ['Theo got the offer from the Denver office'],
      emotionalArc: 'started anxious, ended hopeful',
    },
  ],
  key_moments: [
    {
      timestamp: at(7),
      type: 'milestone',
      summary: 'Theo finished his resume',
      topics: ['job search'],
    },
    {
      timestamp: at(21),
      type: 'breakthrough',
      summary: 'Theo said yes to the Denver office interview',
      topics: ['job search'],
    },
  ],
};

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return {
        doc: () => ({
          collection: (sub: string) => {
            const query = {
              orderBy: () => query,
              limit: () => query,
              get: async () => ({
                empty: (DOCS[sub] ?? []).length === 0,
                docs: (DOCS[sub] ?? []).map((d, i) => ({ id: `${sub}${i}`, data: () => d })),
              }),
            };
            return query;
          },
        }),
      };
    }
  },
}));

const { getSuperhumanMemoryContext } = await import('../better-than-human-memory.js');

const forgotten = (topics: string[]) =>
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);

beforeEach(() => {
  vi.stubEnv('FORGET_EVERY_READER', 'on');
  resetForgetTopicsSource();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getSuperhumanMemoryContext with FORGET_EVERY_READER on', () => {
  it('leaves out the summary and the moment about a forgotten topic, keeps the rest', async () => {
    forgotten(['Denver job']);
    const context = await getSuperhumanMemoryContext('u-fiction', 'job search');
    expect(JSON.stringify(context)).not.toContain('Denver');
    expect(context.topicFrequency?.count).toBe(1);
    expect(context.firstMention?.timeAgo).toBe('last week');
    expect(context.emotionalMemory?.emotionalArc).toBe('curious');
    expect(context.relatedMoments?.map((m) => m.summary)).toEqual(['Theo finished his resume']);
  });

  it('nothing forgotten: every summary and moment', async () => {
    forgotten([]);
    const context = await getSuperhumanMemoryContext('u-fiction', 'job search');
    expect(context.topicFrequency?.count).toBe(2);
    expect(context.relatedMoments).toHaveLength(2);
  });
});

describe('with FORGET_EVERY_READER off (prod today)', () => {
  it.each([[undefined], ['off']])('FORGET_EVERY_READER=%s reads every one', async (v) => {
    vi.stubEnv('FORGET_EVERY_READER', v);
    const read = forgotten(['Denver job']);
    const context = await getSuperhumanMemoryContext('u-fiction', 'job search');
    expect(context.topicFrequency?.count).toBe(2);
    expect(context.relatedMoments?.map((m) => m.summary)).toEqual([
      'Theo finished his resume',
      'Theo said yes to the Denver office interview',
    ]);
    expect(read).not.toHaveBeenCalled();
  });
});
