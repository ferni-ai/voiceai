/**
 * forget() is reachable from DELETE /api/cognitive/memories/:id and the
 * forgetThisAboutMe tool. The memory cache holds every loaded user's
 * memories, so it must refuse to delete a memory the caller doesn't own.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory profile store: nothing here may reach Firestore.
const profiles = new Map<string, Record<string, unknown>>();
vi.mock('../../../memory/index.js', () => ({
  getDefaultStore: () => ({
    getProfile: async (userId: string) => profiles.get(userId) ?? { userId, personaMemories: {} },
    saveProfile: async (profile: Record<string, unknown>) => {
      profiles.set(profile.userId as string, profile);
    },
  }),
}));

const { forget, getAllUserMemories, rememberPreference } = await import('../persona-memories.js');

beforeEach(() => profiles.clear());

describe('forget()', () => {
  it("refuses to delete another user's memory", async () => {
    const memory = await rememberPreference('owner-user', 'oat milk');

    await expect(forget(memory.id, 'attacker-user')).resolves.toBe(false);

    const remaining = await getAllUserMemories('owner-user');
    expect(remaining.map((m) => m.id)).toContain(memory.id);
  });

  it('deletes the memory for its owner', async () => {
    const memory = await rememberPreference('owner-user', 'jazz');

    await expect(forget(memory.id, 'owner-user')).resolves.toBe(true);

    const remaining = await getAllUserMemories('owner-user');
    expect(remaining.map((m) => m.id)).not.toContain(memory.id);
  });
});
