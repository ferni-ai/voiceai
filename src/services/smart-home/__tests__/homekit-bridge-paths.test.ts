/**
 * Firestore rejects a collection path with an even number of segments, so the
 * old `bogle_users/{uid}/homekit/devices` made every HomeKit device read and
 * command write throw. The fake below enforces the same rule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];

function segments(path: string): number {
  return path.split('/').filter(Boolean).length;
}

function query(path: string) {
  const q = {
    where: () => q,
    orderBy: () => q,
    limit: () => q,
    get: async () => ({ docs: [], empty: true, size: 0, forEach: () => undefined }),
  };
  return q;
}

function collection(path: string) {
  if (segments(path) % 2 === 0) throw new Error(`collectionPath must point to a collection, got "${path}"`);
  let n = 0;
  return {
    ...query(path),
    doc: (id = `auto-${++n}`) => doc(`${path}/${id}`),
  };
}

function doc(path: string) {
  if (segments(path) % 2 !== 0) throw new Error(`documentPath must point to a document, got "${path}"`);
  return {
    id: path.split('/').pop(),
    set: async (data: Record<string, unknown>) => void writes.push({ path, data }),
    update: async (data: Record<string, unknown>) => void writes.push({ path, data }),
    get: async () => ({ exists: false, data: () => undefined }),
    collection: (name: string) => collection(`${path}/${name}`),
  };
}

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection, doc, batch: () => ({ set: vi.fn(), commit: vi.fn(async () => undefined) }) }),
  FieldValue: { serverTimestamp: () => 'ts', delete: () => 'del', arrayUnion: (...v: unknown[]) => v },
}));

const bridge = await import('../homekit-bridge.js');

beforeEach(() => {
  writes.length = 0;
});

describe('HomeKit bridge Firestore paths', () => {
  it('reads devices from a real collection', async () => {
    await expect(bridge.getDevices('user-1')).resolves.toEqual([]);
  });

  it('queues commands where the iOS poll route reads them, with its ordering field', async () => {
    await bridge.queueDeviceCommand('user-1', 'lamp', { on: true });
    await bridge.queueSceneCommand('user-1', 'evening');
    expect(writes).toHaveLength(2);
    for (const { path, data } of writes) {
      expect(path).toMatch(/^bogle_users\/user-1\/homekit\/commands\/pending\/[^/]+$/);
      expect(typeof data.timestamp).toBe('number');
      expect(data.status).toBe('pending');
    }
  });

  it('lists pending commands without a path error', async () => {
    await expect(bridge.getPendingCommands('user-1')).resolves.toEqual([]);
  });
});
