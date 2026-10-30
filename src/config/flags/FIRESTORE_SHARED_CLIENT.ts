import type { FlagSpec } from '../flag-spec.js';

// on: modules that build their Firestore client without ignoreUndefinedProperties share the one
// that has it (utils/shared-firestore.ts): one client per database instead of two, ~100 ms less on
// a fresh process's first reads, but their writes drop undefined fields instead of throwing.
export const FIRESTORE_SHARED_CLIENT = {
  default: 'off',
  owner: 'platform',
  kind: 'experiment',
} as const satisfies FlagSpec;
