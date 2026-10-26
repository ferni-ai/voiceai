import { describe, expect, it, vi } from 'vitest';
import type { WellbeingProfile, WellbeingSnapshot } from '../../services/wellbeing-tracking/index.js';

const stored = vi.hoisted(() => ({
  profile: null as WellbeingProfile | null,
  snapshots: [] as WellbeingSnapshot[],
}));

vi.mock('../../services/wellbeing-tracking/persistence.js', () => ({
  loadProfile: async () => stored.profile,
  loadSnapshots: async () => stored.snapshots,
}));
vi.mock('../../services/wellbeing-tracking/index.js', () => ({
  getRecentSnapshots: () => [],
  getAllWellbeingProfiles: () => [],
}));

import { loadWellbeingData } from '../wellbeing-data.js';

const snap = (id: string, at: string): WellbeingSnapshot => ({
  id,
  userId: 'u1',
  timestamp: new Date(at),
  source: 'inferred',
  dimensions: { mood: 0.5 },
  confidence: { mood: 0.6 },
});

describe('loadWellbeingData current state', () => {
  it('shows a call written after the profile pointer, not the pointed-at older snapshot', async () => {
    const older = snap('wb_old', '2026-10-01T10:00:00Z');
    const call = snap('wb_call_s1', '2026-10-20T10:00:00Z');
    stored.profile = { userId: 'u1', current: older } as WellbeingProfile;
    stored.snapshots = [call, older];

    const data = await loadWellbeingData('u1');

    expect(data.current?.id).toBe('wb_call_s1');
  });

  it('keeps the profile pointer when it is the newest snapshot', async () => {
    const pointed = snap('wb_new', '2026-10-20T10:00:00Z');
    const older = snap('wb_old', '2026-10-01T10:00:00Z');
    stored.profile = { userId: 'u1', current: pointed } as WellbeingProfile;
    stored.snapshots = [older, pointed];

    const data = await loadWellbeingData('u1');

    expect(data.current?.id).toBe('wb_new');
  });
});
