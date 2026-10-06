/**
 * A call's social graph is written, then dropped from this process.
 * A failed write keeps the in-memory graph.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearSocialGraph, getUserGraph, recordMention } from '../../social-graph/index.js';
import * as socialGraph from '../../social-graph/index.js';
import { persistAndEvictSocialGraph } from '../realtime-persistence.js';

const USER_ID = 'social-graph-eviction-user';

afterEach(() => {
  clearSocialGraph(USER_ID);
  vi.restoreAllMocks();
});

describe('persistAndEvictSocialGraph', () => {
  it('drops the in-memory graph after the call ends', async () => {
    recordMention(USER_ID, 'Mom', 'she called this morning', 0.2);
    expect(getUserGraph(USER_ID)?.people.size).toBe(1);

    await persistAndEvictSocialGraph(USER_ID);

    expect(getUserGraph(USER_ID)).toBeUndefined();
  });

  it('keeps the graph when the write fails', async () => {
    recordMention(USER_ID, 'Dad', 'we talked about the house', 0.1);
    vi.spyOn(socialGraph, 'persistGraphToFirestore').mockRejectedValue(new Error('firestore down'));

    await persistAndEvictSocialGraph(USER_ID);

    expect(getUserGraph(USER_ID)?.people.size).toBe(1);
  });
});
