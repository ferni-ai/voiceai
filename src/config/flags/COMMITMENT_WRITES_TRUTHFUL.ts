import type { FlagSpec } from '../flag-spec.js';

// on: when a commitment status update (done, on hold, let go) fails to reach Firestore, updateCommitmentStatus reports it not saved and the commitment tools (completeCommitment, deferCommitment, updateCommitment, celebrateCompletion) say they couldn't (services/superhuman/commitment-store.ts unsavedWrite). Off: as on main, the failure is logged and the tools celebrate a change the next read lacks.
export const COMMITMENT_WRITES_TRUTHFUL = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4263',
  context:
    'Turn on in dev; promote after a dev night with no COMMITMENT_WRITES_TRUTHFUL warning on a healthy Firestore and no commitment tool reporting a change the next read lacks.',
} as const satisfies FlagSpec;
