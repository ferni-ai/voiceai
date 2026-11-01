import type { FlagSpec } from '../flag-spec.js';

// off | on (L8 recall audit, 2026-11-01): a caller who sounds under 18 (MINOR_CARE's signals) and says someone touches them, makes them do sexual things, did things to them, raped them or makes them send pictures is a crisis-level safety turn, never the scripted takeover: child-safety care (not their fault, are you safe, 911 if in danger now, a safe adult, Childhelp, no details; main's crisis guidance with 988 too whenever the caller may be at risk: self-harm words in any turn, earlier risk, or any read of risk this turn) and the call's memory held. Only adds: a turn already read as a crisis keeps everything (services/safety/minor-abuse-disclosure.ts).
export const MINOR_ABUSE_DISCLOSURE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
