import type { FlagSpec } from '../flag-spec.js';

// on: a covered tool starting gets a cached line in the persona's own voice on the clip track ("Let me look.", "On it."), in place of the in-stream lead-in, so the answer never waits for a lead-in to play out (integrations/tool-ack-clip.ts)
export const TOOL_ACK_CLIP = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
