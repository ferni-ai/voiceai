import type { FlagSpec } from '../flag-spec.js';

// on: "When I'll Reach Out" can cancel a held call or a follow-up text and move it to another time, for its owner only (POST /api/outreach/upcoming/cancel|reschedule, services/outreach/upcoming-outreach-actions.ts); off = the routes answer 404 and every item says it can't be cancelled or moved. Web side: VITE_REACH_OUT_ACTIONS.
export const REACH_OUT_ACTIONS = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
