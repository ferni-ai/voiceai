import type { FlagSpec } from '../flag-spec.js';

// off | on (#4315): the Spanish twins of the CRISIS_MEANS_IN_HAND live forms ("tengo las pastillas aquí y me las voy a tomar ahora", "me tomé 40 tylenol", "la soga está alrededor de mi cuello") read where the English ones do. With CRISIS_MEANS_IN_HAND=live the turn reads explicit and imminent (911 first); the shadow log names the twin (es_<form>); with CRISIS_MEANS_IN_HAND off or shadow nothing changes. The caller's own medication ("mis pastillas"), negated, hypothetical, a dream or story, someone else's words, the past or a joke keep main's read. Read from process.env (safety/crisis-means-in-hand-es.ts, called by crisis-means-in-hand.ts).
export const CRISIS_ES_MEANS_IN_HAND = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-23',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4315',
  context:
    'Promote after an independent verify, a Spanish speaker listen, the crisis owner yes and clean dev nights with no false emergency scripts; then make permanent, else delete.',
} as const satisfies FlagSpec;
