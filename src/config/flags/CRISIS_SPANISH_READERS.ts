import type { FlagSpec } from '../flag-spec.js';

// off | on (#4060): Spanish words read where today only English ones do. Someone close went down or isn't breathing ("mi papá se cayó y no respira") is 911 for them first, in Spanish (crisis-third-person-es.ts, crisis-guard-replies.ts). "Tengo 14 años" or "soy menor de edad" is a stated age under 18 (minor-care-detect-es.ts). Each new read only adds care; English reads are unchanged. Read from process.env, by the readers and the replies alike.
export const CRISIS_SPANISH_READERS = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-19',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4060',
  context:
    "Promote only after: a Spanish speaker reviews every new line's wording; #4066 (Spanish lines spoken in Spanish) is merged and its keys include FOR_THEM_911_ES; an independent verify; the crisis owner's yes. Then make permanent; else delete.",
} as const satisfies FlagSpec;
