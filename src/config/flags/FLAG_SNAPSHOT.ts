import type { FlagSpec } from '../flag-spec.js';

// off | on (dev switchboard, #3930): on the dev agent only (FIRESTORE_DATABASE=ferni-dev), each worker start writes the raw and resolved value of every per-file flag it booted with to ops/agent_flag_snapshot, so the admin page can show what is running and confirm a restart picked up a change. Never written on any other database (config/agent-flags/boot-snapshot.ts).
export const FLAG_SNAPSHOT = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
  expires: '2027-02-14',
  issue: '#3930',
} as const satisfies FlagSpec;
