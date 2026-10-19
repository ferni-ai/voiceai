/**
 * The persona memory cache spans every user an instance has seen. Its
 * SessionDataManager registration had no caller, so a session's end never
 * dropped it. Loading the module now registers it; ending a session saves
 * pending changes and then clears that user only.
 */
import { describe, expect, it, vi } from 'vitest';

const profiles = new Map<string, Record<string, unknown>>();
vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    getProfile: async (userId: string) => profiles.get(userId) ?? { userId, personaMemories: {} },
    saveProfile: async (p: Record<string, unknown>) => {
      profiles.set(p.userId as string, p);
    },
  }),
  isAgentProfilePersistenceOn: () => false,
}));

const { getSessionDataManager } = await import('../../session/session-data-manager.js');
const memories = await import('../persona-memories.js');

describe('PersonaMemories session cleanup', () => {
  it('registers on load, and a session end clears only that user', async () => {
    await vi.waitFor(() => {
      expect(getSessionDataManager().getStats().services).toHaveProperty('PersonaMemories');
    });
    await memories.rememberPreference('ending', 'jazz');
    await memories.rememberPreference('staying', 'tea');
    expect(memories.getMemoriesCacheStats().users).toBe(2);

    const result = await getSessionDataManager().sessionEnded('ending');

    expect(result.cleaned).toContain('PersonaMemories');
    expect(memories.getMemoriesCacheStats().users).toBe(1);
  });
});
