import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Round-trip contract: anything persistHumanSignals writes must be visible
 * to the dynamic-memory context reader used on the next session.
 *
 * Uses mocks when Firestore emulator is unavailable; with
 * FIRESTORE_EMULATOR_HOST set, prefer real admin SDK.
 */

const mockProfileStore = new Map<string, Record<string, unknown>>();
const mockSignalShards = new Map<string, Record<string, unknown>>();

vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Prefer testing the pure merge helper once extracted — see Step 3.
import {
  mergeHumanSignalSources,
  type HumanMemoryProfileLike,
} from '../storage/human-signal-merge.js';

describe('human signal round-trip merge', () => {
  beforeEach(() => {
    mockProfileStore.clear();
    mockSignalShards.clear();
  });

  it('surfaces shard dreams when profile is empty', () => {
    const profile: HumanMemoryProfileLike = {
      importantDates: [],
      values: [],
      dreams: [],
      fears: [],
      growthMarkers: [],
      comfortPatterns: [],
      challenges: [],
      stressTriggers: [],
      importantPeople: [],
    };
    const shards = {
      dreams: [
        { id: 'd1', content: 'sail around the world', extractedAt: new Date().toISOString() },
      ],
      values: [{ id: 'v1', content: 'family first', extractedAt: new Date().toISOString() }],
    };
    const merged = mergeHumanSignalSources(profile, shards);
    expect(merged.dreams.some((d) => String(d.content).includes('sail'))).toBe(true);
    expect(merged.values.some((v) => String(v.content).includes('family'))).toBe(true);
  });

  it('does not drop profile dreams when shards empty', () => {
    const profile: HumanMemoryProfileLike = {
      importantDates: [],
      values: [],
      dreams: [{ id: 'p1', content: 'write a novel', extractedAt: 'x' }],
      fears: [],
      growthMarkers: [],
      comfortPatterns: [],
      challenges: [],
      stressTriggers: [],
      importantPeople: [],
    };
    const merged = mergeHumanSignalSources(profile, {});
    expect(merged.dreams).toHaveLength(1);
  });
});
