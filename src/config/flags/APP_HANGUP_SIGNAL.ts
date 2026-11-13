import type { FlagSpec } from '../flag-spec.js';

// on | off (kill switch, 2026-11-11, #3749): each call's frontend signals (conversation_end, conversation_continue, conversation_hold, wrap_up, reply tone, ...) go to the app through the call's own publisher on every entry path, so the app hangs up after a goodbye. Off: no signal is bound by the publisher, as before #3749, when the multi-agent path dropped every one (agents/realtime/session-publishers.ts).
export const APP_HANGUP_SIGNAL = {
  default: 'on',
  owner: 'voice',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
