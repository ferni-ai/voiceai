import type { FlagSpec } from '../flag-spec.js';

// on: POST /api/soul-stats takes signed-in browsers' avatar soul counts into hourly
// soul_stats_hourly docs, and the admin Human Listening panel reads the last 24 h
// (src/api/soul-stats/). Off, the POST answers 404 and the panel says "not measured".

export const SOUL_STATS = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-17',
  issue: '#4069',
} as const satisfies FlagSpec;
