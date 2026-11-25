import type { FlagSpec } from '../flag-spec.js';

// on: when a life-automation store (workflows, subscriptions, meals, documents) cannot save to Firestore, the save rejects and the in-memory copy is dropped, so the next read shows the state before the change, and the routine, automation and subscription-cancel tools say they couldn't (services/stores/store-write-truth.ts). Off: as on main, the change is kept in memory and the tool reports it done.
export const STORE_WRITES_TRUTHFUL = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4260',
  context:
    'Turn on in dev; promote after a dev night with no STORE_WRITES_TRUTHFUL warning on a healthy store and no routine or subscription tool reporting a change the next read lacks.',
} as const satisfies FlagSpec;
