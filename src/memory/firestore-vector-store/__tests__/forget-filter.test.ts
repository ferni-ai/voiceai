import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetTopic, type ForgetStore } from '../../recall/forget.js';
import {
  READ_TIMEOUT_MS,
  clearForgottenTopicsCache,
  sourcePath,
  withoutForgotten,
  type ForgetReads,
} from '../forget-filter.js';

const r = (id: string, text: string, metadata: Record<string, unknown> = {}) => ({
  document: { id, text, metadata },
  score: 0.9,
});

function reads(
  topics: unknown,
  docs: Record<string, Record<string, unknown> | undefined> = {},
  opts: { topicsFail?: boolean; docsFail?: boolean } = {}
): ForgetReads & { topicReads: string[] } {
  const topicReads: string[] = [];
  return {
    topicReads,
    topics: async (uid) => {
      topicReads.push(uid);
      if (opts.topicsFail) throw new Error('down');
      return topics as string[] | null;
    },
    docs: async (paths) => {
      if (opts.docsFail) throw new Error('down');
      return new Map(paths.map((p) => [p, docs[p]]));
    },
  };
}

beforeEach(() => clearForgottenTopicsCache());

describe('vector search never returns what the caller asked to forget', () => {
  it('drops results about a forgotten topic, for this caller', async () => {
    const rd = reads(['divorce']);
    const out = await withoutForgotten(
      'u1',
      [r('a', 'Finalised the divorce papers'), r('b', 'Trip to Lisbon')],
      rd
    );
    expect(out.map((x) => x.document.id)).toEqual(['b']);
    expect(rd.topicReads).toEqual(['u1']);
  });

  it('drops copies of a forgotten or deleted fact by its source, whatever the text says', async () => {
    const rd = reads([], {
      'bogle_users/u1/dynamic_facts/f1': { value: 'plumber', forgottenAt: '2026-01-07' },
      'bogle_users/u1/dynamic_facts/f2': { value: 'nurse' },
      'bogle_users/u1/extracted_facts/e1': { fact: 'Steve', forgottenAt: { seconds: 1 } },
    });
    const out = await withoutForgotten(
      'u1',
      [
        r('conversation_fact_f1', 'job: plumber'),
        r('conversation_fact_f2', 'job: nurse'),
        r('conversation_fact_gone', 'deleted fact'),
        r('fact_u1_123', 'Steve is my brother', {
          sourceCollection: 'extracted_facts',
          sourceDocId: 'e1',
        }),
        r('fact_fact_u1_m1_topic', 'graph copy from memories'), // source unknown: kept
        r('chronicle_u1_j1', 'journal entry'),
      ],
      rd
    );
    expect(out.map((x) => x.document.id)).toEqual([
      'conversation_fact_f2',
      'fact_fact_u1_m1_topic',
      'chronicle_u1_j1',
    ]);
  });

  it('fails closed: unreadable topics drop everything; unreadable sources drop the copies', async () => {
    const all = [r('conversation_fact_f2', 'job: nurse'), r('b', 'Trip to Lisbon')];
    expect(await withoutForgotten('u1', all, reads(null, {}, { topicsFail: true }))).toEqual([]);
    clearForgottenTopicsCache();
    expect(await withoutForgotten('u1', all, reads('divorce'))).toEqual([]); // malformed
    clearForgottenTopicsCache();
    const out = await withoutForgotten('u1', all, reads([], {}, { docsFail: true }));
    expect(out.map((x) => x.document.id)).toEqual(['b']);
  });

  it('a forget in this process counts at once, not after the cache TTL', async () => {
    let stored: string[] = [];
    const rd: ForgetReads = { topics: async () => stored, docs: async () => new Map() };
    const store: ForgetStore = {
      facts: async () => [],
      markForgotten: async () => undefined,
      addTopic: async (_u, t) => {
        stored = [...stored, t];
      },
      topics: async () => stored,
    };
    const hits = [r('a', 'Finalised the divorce papers')];
    expect(await withoutForgotten('u-gen', hits, rd, 1000)).toHaveLength(1); // caches []
    await forgetTopic('u-gen', 'my divorce', store);
    expect(await withoutForgotten('u-gen', hits, rd, 2000)).toEqual([]); // well within the TTL
  });

  it('treats a read slower than the timeout as unreadable (fails closed)', async () => {
    vi.useFakeTimers();
    const hang: ForgetReads = {
      topics: () => new Promise(() => undefined),
      docs: async () => new Map(),
    };
    const pending = withoutForgotten('u-slow', [r('b', 'Trip to Lisbon')], hang);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    expect(await pending).toEqual([]);
    vi.useRealTimers();
  });

  it('reads sources only under the caller, and never from a path-like id', () => {
    for (const id of ['', '.', '..']) {
      expect(
        sourcePath('u1', {
          id: 'x',
          metadata: { sourceCollection: 'extracted_facts', sourceDocId: id },
        })
      ).toBeUndefined();
    }
    expect(sourcePath('u1', { id: 'conversation_fact_..' })).toBeUndefined();
    expect(sourcePath('u1', { id: 'conversation_fact_f1' })).toBe(
      'bogle_users/u1/dynamic_facts/f1'
    );
    expect(sourcePath('u1', { id: 'fact_fact_u2_f1' })).toBeUndefined(); // another user's graph id
    expect(
      sourcePath('u1', { id: 'x', metadata: { sourceCollection: 'a/b', sourceDocId: 'c' } })
    ).toBeUndefined();
    expect(
      sourcePath('u1', {
        id: 'x',
        metadata: { sourceCollection: 'extracted_facts', sourceDocId: '../x' },
      })
    ).toBeUndefined();
  });

  it('caches topics briefly per caller', async () => {
    const rd = reads(['divorce']);
    await withoutForgotten('u1', [r('a', 'x')], rd, 1000);
    await withoutForgotten('u1', [r('a', 'x')], rd, 5000);
    expect(rd.topicReads).toEqual(['u1']);
    await withoutForgotten('u1', [r('a', 'x')], rd, 20_000);
    expect(rd.topicReads).toEqual(['u1', 'u1']);
  });
});

describe('call summaries the caller disputed an item of (dispute.ts)', () => {
  const DEV = 'conversation_summary_session-AJ_2cEy';
  const OTHER = 'conversation_summary_session-AJ_old';
  const LEGACY = 'conversation_summary_session-AJ_legacy';

  it('maps a summary copy to its summary doc', () => {
    expect(sourcePath('u1', { id: DEV })).toBe('bogle_users/u1/summaries/summary_session-AJ_2cEy');
  });

  it('drops the copy of a summary with a disputed item, keeps the others and legacy copies', async () => {
    const rd = reads([], {
      'bogle_users/u1/summaries/summary_session-AJ_2cEy': {
        keyPoints: ['The user was working on contracts on the evening of 2026-10-11.'],
        disputedItems: ['The user was working on contracts on the evening of 2026-10-11.'],
      },
      'bogle_users/u1/summaries/summary_session-AJ_old': { keyPoints: ['Mail pile'] },
    });
    const out = await withoutForgotten(
      'u1',
      [
        r(DEV, 'The user was working on contracts on the evening of 2026-10-11.'),
        r(OTHER, 'Mail pile'),
        r(LEGACY, 'From conversation_summaries, no summaries doc'),
      ],
      rd
    );
    expect(out.map((x) => x.document.id)).toEqual([OTHER, LEGACY]);
  });
});
