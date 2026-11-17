/**
 * The open-loops note through the real forget filter (#3995): a loop's context is the caller's
 * raw words, so a topic of several words leaves it out on any distinctive word, and a topic
 * forgotten during the call leaves the note out from then on. Only the stored list is faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OpenLoop } from '../../../services/superhuman/semantic-intelligence/open-loops.js';

const stored = vi.hoisted(() => ({ topics: [] as string[] | null, now: [] as string[] }));

vi.mock('../../../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: vi.fn(async () => stored.topics),
  forgottenInProcess: vi.fn(() => [...stored.now]),
}));

import { createCallLoopsRecall } from '../open-loops-recall.js';

const NOW = new Date('2026-11-17T12:00:00Z');

function loop(id: string, content: string, context: string): OpenLoop {
  return {
    id,
    userId: 'u-fiction',
    type: 'intention',
    content,
    context,
    created: new Date(NOW.getTime() - 2 * 86_400_000),
    followUpAfter: NOW,
    followUpBefore: new Date(NOW.getTime() + 86_400_000),
    status: 'open',
    priority: 5,
    followUpCount: 0,
  };
}

function recall(loops: OpenLoop[], callId: string) {
  return createCallLoopsRecall({
    userId: 'u-fiction',
    callId,
    now: () => NOW,
    sources: {
      loops: async () => loops,
      promises: async () => ({ text: '', misses: [] }),
      markOffered: async () => undefined,
    },
  });
}

const DENVER = loop('a', 'whether to take the offer', 'I got the offer from the Denver office');
const BROTHER = loop('b', 'text my brother tonight', 'his number is 435 555 0199');
const GARDEN = loop('c', 'plant the tomatoes this weekend', 'the garden is finally dry');

describe('open-loops note, real forget filter (#3995)', () => {
  beforeEach(() => {
    stored.topics = [];
    stored.now = [];
  });

  it('a topic of several words leaves out a loop whose context has one of them', async () => {
    stored.topics = ['brother phone number', 'Denver job offer'];
    const r = recall([DENVER, BROTHER, GARDEN], 'c-passage');
    await r.ready;
    const note = r.note() ?? '';
    expect(note).toContain('tomatoes');
    expect(note).not.toContain('435 555 0199');
    expect(note).not.toContain('Denver');
  });

  it('a topic forgotten after the note loaded leaves the note out', async () => {
    const r = recall([GARDEN], 'c-later');
    await r.ready;
    expect(r.note()).toContain('tomatoes');
    stored.now = ['tomatoes'];
    expect(r.note()).toBeNull();
  });

  it('an unreadable stored list gives no note', async () => {
    stored.topics = null;
    const r = recall([GARDEN], 'c-unread');
    await r.ready;
    expect(r.note()).toBeNull();
  });
});
