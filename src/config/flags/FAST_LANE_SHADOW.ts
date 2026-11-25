import type { FlagSpec } from '../flag-spec.js';

// off | decision | sample. With CASCADE_FAST_LANE off, each TURN_RECEIPT logs where the
// fast-lane router would send the turn (prompt.laneShadow: the lane and the router's reason,
// never words); where turns go does not change. sample logs the same until a sampled shadow
// reply exists. Ignored while the lane is on: prompt.lane then says where the turn went.
export const FAST_LANE_SHADOW = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-14',
  issue: '#3928',
  context: 'prod lane share and reasons with the lane off, before any CASCADE_FAST_LANE promotion',
} as const satisfies FlagSpec;
