import type { FlagSpec } from '../flag-spec.js';

// Log-only: per tool call, its domain, whether a candidate core holds it, whether the turn named the domain; once per session the schema token estimate. Numbers only. Decides how to shrink the always-on tool set.
export const TOOL_COVERAGE_SHADOW = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#4399',
} as const satisfies FlagSpec;
