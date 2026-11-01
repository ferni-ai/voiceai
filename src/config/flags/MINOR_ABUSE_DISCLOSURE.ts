import type { FlagSpec } from '../flag-spec.js';

// off | on (L8 recall audit, 2026-11-01): a caller who sounds under 18 (MINOR_CARE's signals) and says someone touches them, makes them do sexual things, did things to them, raped them or makes them send pictures is a crisis-level safety turn, never the scripted takeover: child-safety care (not their fault, are you safe, 911 if in danger now, a safe adult, Childhelp, no details; 988 too unless the whole call is abuse-only) and the call's memory held. Only adds: a turn already read as a crisis keeps everything (services/safety/minor-abuse-disclosure.ts).
export const MINOR_ABUSE_DISCLOSURE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
