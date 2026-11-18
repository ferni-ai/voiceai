import type { FlagSpec } from '../flag-spec.js';

// On a multi-agent call that has gone quiet, Ferni checks in once, a minute before the idle
// end (session-end-watch.ts), instead of hanging up without a word. A caller who answers keeps
// the call; a quiet minute after the check-in ends it 'idle' as before. Never on a call with any
// crisis signal: that call ends exactly as with the flag off. Read in
// agents/voice-agent/phases/idle-checkin.ts.
export const IDLE_END_CHECKIN = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-18',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4077',
  context: 'calls that went quiet were hung up at 10 minutes with nothing said',
} as const satisfies FlagSpec;
