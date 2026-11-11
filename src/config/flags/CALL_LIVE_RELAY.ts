import type { FlagSpec } from '../flag-spec.js';

// On (and only with CALL_RESULT_LIVE_REPORT on): while a call Ferni placed for the owner is going, the owner's live call hears one short line, at a pause, when a person picks up ("they picked up, I'm talking to Priya now") and when it goes to voicemail ("I'm leaving a message"); each once per call across workers (progress.* on the call record, claimed like liveReport). A call that ends unanswered is told by the end-of-call report, never a second line. Written by agents/shared/line-screen.ts and agents/outbound-call/livekit-call-opening.ts, read by the owner's watch (services/outreach/call-progress.ts, call-result-watch.ts). No callee words. Off: nothing written or said.
export const CALL_LIVE_RELAY = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-01-31',
  issue: 'TBD',
  context:
    'Keep if owners on placed calls hear the pickup/voicemail line once and on time; else delete.',
} as const satisfies FlagSpec;
