import type { FlagSpec } from '../flag-spec.js';

// On: /token reads `from` (note, bookend or practice; types/call-launch.ts) into
// RoomMetadata.launch (servers/api/routes/call-launch-param.ts); a practice launch asks for
// Alex; the agent's hello gets a launch note (agents/shared/call-launch-hint.ts).
// Off: `from` is ignored, as before.
export const CALL_LAUNCH_CONTEXT = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
