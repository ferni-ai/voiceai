import type { FlagSpec } from '../flag-spec.js';

// on: when Firestore is there but a general list save fails, the save rejects with the in-memory copy untouched and the list tools (createList, addToList, checkOffItem, removeFromList, deleteList) say they couldn't (tools/domains/simple-utilities/list-store.ts). Off: as on main, the change goes to the in-memory copy and the tools say it was made, though the next read is Firestore's and lacks it.
export const LIST_WRITES_TRUTHFUL = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4264',
  context:
    'Turn on in dev; promote after a dev night with no LIST_WRITES_TRUTHFUL warning on a healthy Firestore and no list tool reporting a change the next read lacks.',
} as const satisfies FlagSpec;
