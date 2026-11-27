import type { FlagSpec } from '../flag-spec.js';

// on: a tool id two domains define as different tools has one owner, and the other domain's tool is
// registered under its own id (tools/registry/tool-id-owners.ts), so the model never gets one in
// place of the other (#4291). Read at registration, for the whole process. Off: the domain that
// loads last wins the id, as before.
export const TOOL_ID_OWNERS = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: '#4291',
} as const satisfies FlagSpec;
