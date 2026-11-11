import type { FlagSpec } from '../flag-spec.js';

// off | shadow | on (crisis lead, 2026-11-11): a voice turn the patterns answer with the caller's 988 script (English, not imminent) still asks the live classifier. The script's first sentence is said at once; an imminent read about the caller that lands before the classifier's deadline, and before that sentence is said, makes the rest 911-first; one landing while the rest is still being said adds "And if you're in danger right now, call 911." at the end. A pattern alone never sends 911. Shadow asks and logs counts only, the script unchanged; off: the classifier never reads a scripted turn (agents/personas/crisis-script-imminent.ts).
export const CRISIS_SCRIPT_IMMINENT_READ = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-11',
  issue: 'TBD',
  context:
    'Shadow first (imminent reads per scripted turn, would-swap rate), then on after the held-out run and the owner yes; then make it the default.',
} as const satisfies FlagSpec;
