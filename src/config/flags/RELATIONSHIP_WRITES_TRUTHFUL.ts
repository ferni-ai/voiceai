import type { FlagSpec } from '../flag-spec.js';

// on: when Firestore is there but a relationship save fails, the save rejects with the in-memory copy untouched and addRelationship, recordContact, addInterestToRelationship and addFavoriteTeamToRelationship say they couldn't (tools/domains/information/relationships/storage.ts). Off: as on main, the change goes to the in-memory copy and the tools say it was saved, though the next read is Firestore's and lacks it.
export const RELATIONSHIP_WRITES_TRUTHFUL = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4265',
  context:
    'Turn on in dev; promote after a dev night with no RELATIONSHIP_WRITES_TRUTHFUL warning on a healthy Firestore and no relationship tool reporting a change the next read lacks.',
} as const satisfies FlagSpec;
