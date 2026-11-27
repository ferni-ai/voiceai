/**
 * captureCommitmentEntity passed `data.emotionalWeight || 0.5` to the store, so a commitment
 * captured with a real weight of 0 was stored at 0.5. Only a missing weight takes the 0.5 default.
 * The real capture function; the store's createEntity is a spy. Fictional commitment text.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection() {
      return { doc: () => ({ get: async () => ({ exists: false }) }) };
    }
  },
}));

const context = {
  sessionId: 's-1',
  personaId: 'ferni',
  transcript: 'I will water the fictional plants on Sunday.',
};

async function storedWeight(emotionalWeight: number | undefined): Promise<number | undefined> {
  const { initializeEntityStore, captureCommitmentEntity } = await import('../integration.js');
  const { getEntityStore } = await import('../store.js');
  await initializeEntityStore();
  const createEntity = vi
    .spyOn(getEntityStore(), 'createEntity')
    .mockResolvedValue({ id: 'entity-fictional' } as never);
  await captureCommitmentEntity(
    'user-fictional',
    { commitment: 'water the plants', emotionalWeight },
    context
  );
  const options = createEntity.mock.calls[0]?.[4] as { emotionalWeight?: number } | undefined;
  createEntity.mockRestore();
  return options?.emotionalWeight;
}

describe('captureCommitmentEntity emotional weight', () => {
  it('stores a real 0 as 0', async () => {
    expect(await storedWeight(0)).toBe(0);
  });

  it('stores a given weight as it is', async () => {
    expect(await storedWeight(0.9)).toBe(0.9);
  });

  it('uses 0.5 when no weight was given', async () => {
    expect(await storedWeight(undefined)).toBe(0.5);
  });
});
