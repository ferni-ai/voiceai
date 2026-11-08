import type { FlagSpec } from '../flag-spec.js';

// on: Plaid items live in the sealed per-user store (bogle_users/{uid}/plaid_tokens) for web, agent and tools, not the .plaid-tokens.json file; keep off until P2 drops the model-supplied userId (services/identity/plaid-item-store.ts)
export const PLAID_UNIFIED_STORE = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
