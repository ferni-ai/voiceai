import type { FlagSpec } from '../flag-spec.js';

// on: when the proven owner calls after Ferni made a call for them (newest undelivered on-behalf result, last 48 h), the hello leads with that news ahead of a letter, win, check-in, pondered ask or welcome-back; it yields to an unknown caller, to their own reason for calling and to crisis risk on the call. Hard news gets a gentle "got a sec?", and a result with crisis or risky words gets only "I need to tell you about your call" (the turn context carries the rest). Marked delivered (voice) only when the spoken hello conveys it (agents/multi-agent/call-news-opener.ts). Off: the hello is as before.
export const CALL_NEWS_OPENER = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
