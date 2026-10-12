/**
 * Four per-user stores reached firebase-admin through a bare require(), which
 * throws in the production ESM build, so they never persisted anything. They
 * now import it, and write to Firestore only when REQUIRE_FIX_MEMORY is on.
 * The visual-memory store stays off either way (its images would go to public
 * Cloud Storage that account deletion doesn't erase).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUIRE_FIX_MEMORY_ENV } from '../require-fix-memory-flag.js';

const writes: string[] = [];

function fakeRef(path: string): Record<string, unknown> {
  return {
    collection: (name: string) => fakeRef(`${path}/${name}`),
    doc: (id: string) => fakeRef(`${path}/${id}`),
    set: async () => {
      writes.push(path);
    },
    get: async () => ({ exists: false, data: () => undefined, docs: [] }),
  };
}

const getAdminFirestore = vi.fn(() => ({
  collection: (name: string) => fakeRef(name),
}));

vi.mock('../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => getAdminFirestore(),
}));

async function writeAllFour(): Promise<void> {
  const { storeAmbientState } = await import('../../services/ambient-mode/ambient-state-manager.js');
  const { storeHealthSummary } = await import('../../services/health/health-data-store.js');
  const { saveSemanticAvoidance } = await import(
    '../../intelligence/predictive/embeddings/embedding-persistence.js'
  );
  const { saveUserPreferences } = await import(
    '../../tools/domains/information/preferences/storage.js'
  );
  const { DEFAULT_PREFERENCES } = await import(
    '../../tools/domains/information/preferences/types.js'
  );

  await storeAmbientState({ userId: 'u1', locationType: 'home' } as never);
  await storeHealthSummary({ userId: 'u1', date: '2026-10-11' } as never);
  await saveSemanticAvoidance('u1', {} as never);
  await saveUserPreferences('u1', { ...DEFAULT_PREFERENCES });
}

describe('REQUIRE_FIX_MEMORY gates Firestore persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    writes.length = 0;
    getAdminFirestore.mockClear();
  });

  afterEach(() => {
    delete process.env[REQUIRE_FIX_MEMORY_ENV];
  });

  it('writes nothing to Firestore while the flag is off', async () => {
    await writeAllFour();

    expect(writes).toEqual([]);
    expect(getAdminFirestore).not.toHaveBeenCalled();
  });

  it('writes each store under bogle_users/{userId} when the flag is on', async () => {
    process.env[REQUIRE_FIX_MEMORY_ENV] = 'on';

    await writeAllFour();

    expect(writes).toEqual([
      'bogle_users/u1/ambient/current_state',
      'bogle_users/u1/health_summaries/2026-10-11',
      'bogle_users/u1/embedding_intelligence/semantic_avoidance',
      'bogle_users/u1/info_preferences/current',
    ]);
  });

  it('keeps visual memory off even with the flag on', async () => {
    process.env[REQUIRE_FIX_MEMORY_ENV] = 'on';
    const { uploadVisualMemory } = await import(
      '../../services/visual-memory/visual-memory-store.js'
    );

    const result = await uploadVisualMemory({
      userId: 'u1',
      imageData: Buffer.from('img').toString('base64'),
      mimeType: 'image/png',
      source: 'upload',
    } as never);

    expect(result).toEqual({ success: false, error: 'Storage not available' });
    expect(writes).toEqual([]);
    expect(getAdminFirestore).not.toHaveBeenCalled();
  });
});
