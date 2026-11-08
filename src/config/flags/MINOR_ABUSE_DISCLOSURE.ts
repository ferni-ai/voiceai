import type { FlagSpec } from '../flag-spec.js';

// off | on (L8 recall audit, 2026-11-01): a caller who sounds under 18 (MINOR_CARE's signals) and says someone touches them, makes them do sexual things, did things to them, raped them or makes them send pictures, or (owner decision 2026-11-02) hits, kicks, burns, chokes or locks them in, is a crisis-level safety turn: child-safety care (not their fault, are you safe, 911 if in danger now, a safe adult, Childhelp, no details; main's crisis guidance with 988 too whenever the caller may be at risk: self-harm words in any turn, earlier risk, any read of risk this turn, or no classifier read: off, an error or a timeout; the abuse read's own self-harm read) and, for sexual harm, the call's memory held. With ABUSE_DISCLOSURE_PATTERNS on, physical harm its read answers stays with that read. A turn the patterns script keeps the script first and whole, then the child-safety lines, on the voice turn and in the gate. Only adds: a turn already read as a crisis keeps everything (services/safety/minor-abuse-disclosure.ts).
export const MINOR_ABUSE_DISCLOSURE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
} as const satisfies FlagSpec;
