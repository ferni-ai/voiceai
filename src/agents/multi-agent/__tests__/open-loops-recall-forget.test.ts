/**
 * A forgotten topic never comes back through the call's open-loops note (#3995 part 1):
 * a loop about it is left out, a promise about it is left out and never marked offered,
 * an unreadable forget list gives no note at all, and a loop stored twice shows once.
 */
import { describe, expect, it, vi } from 'vitest';

import type { OpenLoop } from '../../../services/superhuman/semantic-intelligence/open-loops.js';
import type { FerniCommitment } from '../../../services/superhuman/semantic-intelligence/ferni-commitments.js';
import { isForgotten } from '../../../memory/domain/forgotten.js';
import { createCallLoopsRecall, type CallLoopsSources } from '../open-loops-recall.js';

const NOW = new Date('2026-11-17T12:00:00Z');

function loop(id: string, content: string, context = ''): OpenLoop {
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

const MISS = { id: 'p1', commitment: "I'll ask about the landlord" } as FerniCommitment;

function sources(over: Partial<CallLoopsSources> = {}): CallLoopsSources & {
  markOffered: ReturnType<typeof vi.fn>;
} {
  return {
    loops: async () => [
      loop('a', 'whether to take the Denver offer'),
      loop('b', 'what to say to the landlord'),
    ],
    promises: async () => ({ text: 'PROMISES: check in about the landlord', misses: [MISS] }),
    forgotten: async () => (text: string) => isForgotten(text, ['landlord']),
    ...over,
    markOffered: vi.fn(async () => undefined),
  };
}

async function noteFor(src: CallLoopsSources, callId: string): Promise<string | null> {
  const recall = createCallLoopsRecall({
    userId: 'u-fiction',
    callId,
    sources: src,
    now: () => NOW,
  });
  await recall.ready;
  const note = recall.note();
  recall.raised();
  return note;
}

describe('open-loops note leaves forgotten topics out (#3995)', () => {
  it('a loop about a forgotten topic is not in the note; the others are', async () => {
    const note = await noteFor(sources(), 'c-loop');
    expect(note).toContain('Denver offer');
    expect(note).not.toMatch(/landlord/i);
  });

  it('a loop whose context names the topic is left out too; the others are not', async () => {
    const src = sources({
      loops: async () => [
        loop('c', 'that call on Friday', 'about the landlord'),
        loop('e', 'whether to take the Denver offer'),
      ],
    });
    const note = await noteFor(src, 'c-context');
    expect(note).toContain('Denver offer');
    expect(note).not.toMatch(/landlord|Friday/i);
  });

  it('a promise about a forgotten topic is left out and never marked offered', async () => {
    const src = sources();
    await noteFor(src, 'c-promise');
    expect(src.markOffered).toHaveBeenCalledWith('u-fiction', []);
  });

  it('an unreadable forget list gives no note at all (fails closed)', async () => {
    const src = sources({ forgotten: async () => null });
    expect(await noteFor(src, 'c-null')).toBeNull();
    expect(src.markOffered).not.toHaveBeenCalled();
  });

  it('a forget list that throws gives no note at all', async () => {
    const src = sources({
      forgotten: async () => {
        throw new Error('firestore down');
      },
    });
    expect(await noteFor(src, 'c-throw')).toBeNull();
  });

  it('a loop stored twice shows once', async () => {
    const src = sources({
      loops: async () => [
        loop('d1', 'whether to take the Denver offer'),
        loop('d2', 'Whether to take the  Denver offer.'),
      ],
      forgotten: async () => () => false,
    });
    const note = (await noteFor(src, 'c-dup')) ?? '';
    expect(note.match(/Denver offer/g)).toHaveLength(1);
  });

  it('nothing forgotten: loops and promises as before', async () => {
    const src = sources({ forgotten: async () => () => false });
    const note = (await noteFor(src, 'c-none')) ?? '';
    expect(note).toContain('Denver offer');
    expect(note).toContain('landlord');
    expect(src.markOffered).toHaveBeenCalledWith('u-fiction', [MISS]);
  });
});
