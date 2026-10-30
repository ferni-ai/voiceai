import type { FlagSpec } from '../flag-spec.js';

// on: when the owner, alone on their own line, calls after Ferni made a call for them (newest undelivered on-behalf result, last 48 h), the hello leads with it ahead of a letter, win, check-in, pondered ask or welcome-back; it yields to an unknown caller, their own reason for calling and crisis risk on the call. Never the callee's words: only who, how the call went, a callback ask and whether they left a message (offered, never told). Not reached is said plainly, hard news gets "got a sec?", any crisis or risky signal only "I need to tell you about your call". Never marks the result delivered; the call report (#3080) carries the message (agents/multi-agent/call-news-opener.ts). Off: the hello is as before.
export const CALL_NEWS_OPENER = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
