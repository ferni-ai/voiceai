/**
 * A failed load of an identified user's saved voice patterns must never be
 * followed by a save: the session would start from defaults and the save at
 * cleanup would overwrite the user's history (sessionCount back to 1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase-admin', () => ({
  default: {
    apps: [{}],
    initializeApp: vi.fn(),
    firestore: () => ({ doc: () => ({ get: firestore.get, set: firestore.set }) }),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'server-timestamp' },
}));

const { persistSessionVoicePatterns, startVoicePatterns } =
  await import('../voice-pattern-session.js');
const { getVoicePatterns, resetVoicePatternEngine } = await import('../voice-pattern-learning.js');

describe('voice pattern session persistence', () => {
  const sessions: string[] = [];
  const session = (id: string) => {
    sessions.push(id);
    return id;
  };
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    for (const id of sessions.splice(0)) resetVoicePatternEngine(id);
  });

  it('never saves after the saved patterns failed to load', async () => {
    firestore.get.mockRejectedValueOnce(new Error('14 UNAVAILABLE: connection reset'));
    const id = session('session-load-failed');

    await startVoicePatterns(id, 'user-returning');

    // The session still learns, it just can't be trusted to replace the record.
    expect(getVoicePatterns(id)).not.toBeNull();
    expect(await persistSessionVoicePatterns(id)).toBe(false);
    expect(firestore.set).not.toHaveBeenCalled();
  });

  it('saves a new user whose record does not exist yet', async () => {
    firestore.get.mockResolvedValueOnce({ exists: false });
    const id = session('session-new-user');

    await startVoicePatterns(id, 'user-new');

    expect(await persistSessionVoicePatterns(id)).toBe(true);
    expect(firestore.set).toHaveBeenCalledTimes(1);
  });

  it('carries a returning user forward from the loaded record', async () => {
    firestore.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        userId: 'user-returning',
        preferredAgentWpm: 150,
        preferredTurnGapMs: 900,
        interruptionProbability: 0.1,
        prefersQuickResponses: false,
        timeOfDayPatterns: {
          morning: { preferredWpm: 150, preferredGapMs: 900, avgEnergy: 0.5, sampleCount: 0 },
          afternoon: { preferredWpm: 150, preferredGapMs: 900, avgEnergy: 0.5, sampleCount: 0 },
          evening: { preferredWpm: 150, preferredGapMs: 900, avgEnergy: 0.5, sampleCount: 0 },
          lateNight: { preferredWpm: 150, preferredGapMs: 900, avgEnergy: 0.5, sampleCount: 0 },
        },
        sessionCount: 7,
        totalObservations: 40,
        confidence: 0.7,
        updatedAt: '2026-10-01T00:00:00.000Z',
        version: 1,
      }),
    });
    const id = session('session-returning');

    await startVoicePatterns(id, 'user-returning');
    await persistSessionVoicePatterns(id);

    // No turns recorded, so the loaded history is saved back unchanged.
    expect(firestore.set).toHaveBeenCalledWith(
      expect.objectContaining({ sessionCount: 7, totalObservations: 40 })
    );
  });
});
