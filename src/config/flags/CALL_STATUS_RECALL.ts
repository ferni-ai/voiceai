import type { FlagSpec } from '../flag-spec.js';

// on: "did you call my dad?" is answered from the owner's own call records (on_behalf_calls whatever `delivered` says, deferred_calls, read-backs waiting on a yes) over 30 days through the callStatus tool, for the owner proven on the live call only; callOnBehalf tells that status once before a new read-back when a call to that person went out, was answered, or was read back with no yes in the last two days; the honesty note sends a call question to callStatus instead of denying from this conversation's history (services/outreach/call-recall.ts, tools/domains/telephony/call-status-tool.ts). Off: callStatus says it can't check, and callOnBehalf reads back as before. Interim until the recall ledger (lane 5).
export const CALL_STATUS_RECALL = {
  default: 'on',
  owner: 'outreach',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
