import type { FlagSpec } from '../flag-spec.js';

// off | live (Seth 11-11: regex nominates, never sends 911 alone). live, with CRISIS_MEANS_IN_HAND=live: the nominating means forms (NOMINATE_FORMS, services/safety/crisis-means-in-hand.ts) read a crisis that is never imminent: the guidance with 988 and "are you safe right now?"; 911 comes only from the classifier's imminent read or the caller saying they are not safe. off (default): reads stay as on main, and the means shadow log names the form and tier, never words. Any other value ("on", "shadow", a typo) is off and warned once. Flip only after an independent verify: false 911 on the everyday set at ~0, 0 imminent misses, and the check-in false-positive rate measured.
export const CRISIS_MEANS_NOMINATE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-09',
  issue: '#2697',
} as const satisfies FlagSpec;
