import type { FlagSpec } from '../flag-spec.js';

// on: a user's team-insight writes in one process run one at a time (insight-store.ts afterPreviousWrite), so a scan's burst of adds stops aborting its own transactions on team_insights/data. Off: each write starts its transaction at once, as before.
export const TEAM_INSIGHT_WRITE_QUEUE = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-24',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4420',
  context:
    'Keep if FIRESTORE_ERROR ABORTED on team_insights drops to near zero with no lost notes; else delete.',
} as const satisfies FlagSpec;
