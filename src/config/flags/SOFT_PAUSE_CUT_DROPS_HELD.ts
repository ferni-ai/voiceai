import type { FlagSpec } from '../flag-spec.js';

// on: when a soft pause is decided 'interrupted', the resume buffer drops the cut reply's held
// frames unplayed, so LiveKit's cut ends at once instead of after its 2 s forwarder wait
// (multi-agent/resume-buffer.ts dropCutReply, barge-in-soft-pause.ts). It does nothing unless
// SOFT_PAUSE_ONE_OUTCOME is on too (one BARGE_IN_SOFT_PAUSE cut-drop-refused line says so).
export const SOFT_PAUSE_CUT_DROPS_HELD = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: '#3857',
} as const satisfies FlagSpec;
