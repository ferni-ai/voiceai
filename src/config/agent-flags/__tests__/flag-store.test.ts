/**
 * The Firestore flag store on an in-memory Firestore keyed by path: the snapshot lives at
 * ops/agent_flag_snapshot, the audit trail in agent_flag_changes, newest first.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { pathFirestore } from '../../../services/outreach/proactive-channels/__tests__/path-firestore.js';
import { type FlagChange, firestoreFlagStore } from '../adapters/flag-store.js';
import type { FlagSnapshot } from '../domain/snapshot.js';

let docs: Map<string, Record<string, unknown>>;
let store: ReturnType<typeof firestoreFlagStore>;

beforeEach(() => {
  docs = new Map();
  store = firestoreFlagStore(pathFirestore(docs) as never);
});

const SNAP: FlagSnapshot = {
  startedAt: '2026-11-16T12:00:00.000Z',
  buildSha: null,
  flags: {
    FLAG_SNAPSHOT: { raw: 'on', resolved: 'on' },
    APP_HANGUP_SIGNAL: { raw: null, resolved: 'on' },
  },
};

function change(at: string, extra: Partial<FlagChange> = {}): FlagChange {
  return {
    at,
    actor: 'admin@example.test',
    set: { SOUND_CONDUCTOR: 'on' },
    reset: [],
    result: 'applied',
    ...extra,
  };
}

describe('firestoreFlagStore', () => {
  it('writes the snapshot to ops/agent_flag_snapshot and reads it back', async () => {
    expect(await store.readSnapshot()).toBeNull();
    await store.writeSnapshot(SNAP);
    expect(docs.get('ops/agent_flag_snapshot')).toEqual(SNAP);
    expect(await store.readSnapshot()).toEqual(SNAP);
  });

  it('replaces the whole snapshot, so a flag file deleted since is not left behind', async () => {
    await store.writeSnapshot(SNAP);
    const next = { ...SNAP, flags: { FLAG_SNAPSHOT: { raw: 'on', resolved: 'on' } } };
    await store.writeSnapshot(next);
    expect(await store.readSnapshot()).toEqual(next);
  });

  it('reads a malformed snapshot as none', async () => {
    docs.set('ops/agent_flag_snapshot', { startedAt: 5, flags: 'x' });
    expect(await store.readSnapshot()).toBeNull();
    docs.set('ops/agent_flag_snapshot', { ...SNAP, flags: { A: { raw: 1, resolved: 'on' } } });
    expect(await store.readSnapshot()).toBeNull();
  });

  it('appends changes to agent_flag_changes and lists the newest first, up to the limit', async () => {
    await store.appendChange(change('2026-11-16T10:00:00.000Z'));
    await store.appendChange(
      change('2026-11-16T12:00:00.000Z', { result: 'refused', detail: 'room occupied' })
    );
    await store.appendChange(
      change('2026-11-16T11:00:00.000Z', { reset: ['SOUND_CONDUCTOR'], set: {} })
    );
    const stored = [...docs.keys()].filter((p) => p.startsWith('agent_flag_changes/'));
    expect(stored).toHaveLength(3);
    const recent = await store.recentChanges(2);
    expect(recent.map((c) => c.at)).toEqual([
      '2026-11-16T12:00:00.000Z',
      '2026-11-16T11:00:00.000Z',
    ]);
    expect(recent[0]).toEqual(
      change('2026-11-16T12:00:00.000Z', { result: 'refused', detail: 'room occupied' })
    );
  });

  it('stores a change with no detail without an undefined field (Firestore rejects those)', async () => {
    await store.appendChange(change('2026-11-16T10:00:00.000Z', { detail: undefined }));
    const [doc] = [...docs.values()];
    expect(doc && Object.hasOwn(doc, 'detail')).toBe(false);
  });
});
