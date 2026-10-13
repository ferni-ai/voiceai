import { describe, expect, it } from 'vitest';
import type { FollowUp } from '../follow-up.js';
import { importFollowUps } from '../import-follow-ups.js';
import type { FollowUpSources, FollowUpStore, NewFollowUp, SourceItem } from '../ports.js';

const NOW = new Date('2026-10-12T22:00:00.000Z');

function memoryStore(
  failOn?: string
): FollowUpStore & { opened: NewFollowUp[]; byRef: Map<string, FollowUp> } {
  const byRef = new Map<string, FollowUp>();
  const opened: NewFollowUp[] = [];
  return {
    opened,
    byRef,
    async open(f, now) {
      if (f.source.ref === failOn) throw new Error('boom');
      const prior = byRef.get(f.source.ref);
      if (prior) return prior;
      const at = now.toISOString();
      const made: FollowUp = {
        ...f,
        id: f.source.ref,
        status: 'open',
        surfaced: [],
        createdAt: at,
        updatedAt: at,
      };
      byRef.set(f.source.ref, made);
      opened.push(f);
      return made;
    },
    live: async () => [],
    due: async () => [],
    changedBetween: async () => [],
    save: async () => true,
  };
}
const sources = (items: SourceItem[]): FollowUpSources => ({ itemsFor: async () => items });
const item = (ref: string, over: Partial<SourceItem> = {}): SourceItem => ({
  kind: 'reminder',
  text: `t ${ref}`,
  dueAt: null,
  repeat: null,
  source: { store: 'reminders', ref },
  ...over,
});

describe('importFollowUps', () => {
  it('opens one follow-up per item, in the caller zone unless the source has its own', async () => {
    const store = memoryStore();
    const r = await importFollowUps(
      'u1',
      'America/Denver',
      sources([item('a'), item('b', { zone: 'Asia/Kolkata' })]),
      store,
      NOW
    );
    expect(r).toEqual({ seen: 2, opened: 2, failed: 0 });
    expect(store.opened.map((f) => [f.userId, f.zone])).toEqual([
      ['u1', 'America/Denver'],
      ['u1', 'Asia/Kolkata'],
    ]);
  });

  it('running again opens nothing new', async () => {
    const store = memoryStore();
    await importFollowUps('u1', 'UTC', sources([item('a')]), store, NOW);
    const again = await importFollowUps(
      'u1',
      'UTC',
      sources([item('a')]),
      store,
      new Date('2026-10-13T22:00:00Z')
    );
    expect(again.opened).toBe(0);
    expect(store.opened).toHaveLength(1);
  });

  it('does not reopen an item already closed as a follow-up', async () => {
    const store = memoryStore();
    await importFollowUps('u1', 'UTC', sources([item('a')]), store, NOW);
    const done = store.byRef.get('a');
    if (done) store.byRef.set('a', { ...done, status: 'done', closedAt: NOW.toISOString() });
    await importFollowUps(
      'u1',
      'UTC',
      sources([item('a')]),
      store,
      new Date('2026-10-13T22:00:00Z')
    );
    expect(store.byRef.get('a')?.status).toBe('done');
  });

  it('one item that fails is counted and skipped; the rest still import', async () => {
    const store = memoryStore('bad');
    const r = await importFollowUps(
      'u1',
      'UTC',
      sources([item('ok1'), item('bad'), item('ok2')]),
      store,
      NOW
    );
    expect(r).toEqual({ seen: 3, opened: 2, failed: 1 });
  });
});
