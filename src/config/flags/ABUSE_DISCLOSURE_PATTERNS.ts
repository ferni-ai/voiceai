import type { FlagSpec } from '../flag-spec.js';

// off | on (L8 recall audit, 2026-11-01): a caller saying a named person (a parent or step-parent, a parent's partner, a sibling, a relative, a coach or teacher, a partner, or he/she/they) hits, beats, chokes, throws, locks in, starves, threatens or hurts them, or bruised them, or that they are scared to go home, is a crisis-level safety turn after every other read: are you safe right now, 911 if in danger now, Childhelp for family or a coach/teacher, the National Domestic Violence Hotline for a partner, 988 only with self-harm words. Only adds; anchored so "my dad hits golf balls" or "beat me at chess" never match (services/safety/abuse-disclosure.ts).
export const ABUSE_DISCLOSURE_PATTERNS = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
