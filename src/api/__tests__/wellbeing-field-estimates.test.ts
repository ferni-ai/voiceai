import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  WellbeingProfile,
  WellbeingSnapshot,
} from '../../services/wellbeing-tracking/index.js';

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

import { buildDashboardResponse, loadWellbeingData } from '../wellbeing-data.js';

const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);
const snap = (id: string, daysAgo: number, dimensions: WellbeingSnapshot['dimensions']) =>
  ({
    id,
    userId: 'u1',
    timestamp: at(daysAgo),
    source: 'inferred',
    dimensions,
    confidence: {},
  }) satisfies WellbeingSnapshot;

afterEach(() => {
  vi.unstubAllEnvs();
  stored.profile = null;
  stored.snapshots = [];
});

describe('WELLBEING_FIELD_ESTIMATES off (the default)', () => {
  it('loads no estimates and the dashboard carries no fields block', async () => {
    stored.snapshots = [snap('wb_1', 0, { mood: 0.7 })];
    const data = await loadWellbeingData('u1');
    expect(data.estimates).toBeUndefined();

    const res = buildDashboardResponse('u1', data, []);
    expect(res.currentState).not.toHaveProperty('fields');
    expect(res.currentState?.mood).toBe(0.7);
  });
});

describe('WELLBEING_FIELD_ESTIMATES on', () => {
  it('shows each field with its date, and leaves untouched fields null', async () => {
    vi.stubEnv('WELLBEING_FIELD_ESTIMATES', 'on');
    stored.snapshots = [snap('wb_1', 1, { mood: 0.7 }), snap('wb_2', 4, { sleepQuality: 0.3 })];

    const res = buildDashboardResponse('u1', await loadWellbeingData('u1'), []);

    expect(res.currentState?.fields?.mood).toMatchObject({ observations: 1 });
    expect(res.currentState?.fields?.sleep).toMatchObject({ observations: 1 });
    expect(res.currentState?.fields?.purpose).toBeNull();
  });

  it('shows connection as the opposite of loneliness, so its direction flips', async () => {
    vi.stubEnv('WELLBEING_FIELD_ESTIMATES', 'on');
    stored.snapshots = [
      snap('wb_1', 8, { loneliness: 0.2 }),
      snap('wb_2', 4, { loneliness: 0.5 }),
      snap('wb_3', 0, { loneliness: 0.9 }),
    ];

    const res = buildDashboardResponse('u1', await loadWellbeingData('u1'), []);

    expect(res.currentState?.fields?.connection?.direction).toBe('falling');
  });

  it('counts an old saved profile as one observation, not as the answer', async () => {
    vi.stubEnv('WELLBEING_FIELD_ESTIMATES', 'on');
    stored.profile = {
      userId: 'u1',
      current: snap('wb_old', 60, { mood: 0.2 }),
    } as WellbeingProfile;
    stored.snapshots = [snap('wb_new', 1, { mood: 0.8 })];

    const res = buildDashboardResponse('u1', await loadWellbeingData('u1'), []);

    expect(res.currentState?.fields?.mood?.observations).toBe(2);
    expect(res.currentState?.fields?.mood?.asOf).toBe(at(1).toISOString());
  });
});
