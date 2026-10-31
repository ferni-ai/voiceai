import type { FlagSpec } from '../flag-spec.js';

// on: the model's service-availability note and the link /status routes read each caller's real token store (connected / needs_reauth / not_connected / unconfigured) instead of the legacy oauth_tokens signal (services/identity/link-state.ts)
export const LINK_STATUS_V2 = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
