/**
 * PREEMPTIVE_TTS=on: a preemptive reply is also synthesized before the turn is
 * committed, not only generated.
 *
 * Preemptive generation already runs the LLM on Ink-2's early end of turn, and
 * prod reuses 70% of those replies (55 of 79, 2026-10-13 SDK audit). TTS still
 * waits for the commit, so a reused reply pays Sonic's first-audio time after
 * the caller stops. With preemptiveTts the SDK starts the TTS with the LLM.
 *
 * Nothing plays early. The SDK forwards a reply's audio to the room only after
 * the speech is scheduled and authorized (agent_activity.js, pipelineReply:
 * _waitForScheduled, then _waitForAuthorization, then forwardSegment), and
 * with PAUSE_HOLD on, pause-hold.ts holds a preemptive reply's first audio
 * until the commit decides whether ink hesitated. The SDK runs our ttsNode,
 * so the gateway voices the reply; preemptive-reply-gate.ts keeps a dropped
 * one out of the turn receipt and cancels its Cartesia context at the commit.
 *
 * @module agents/multi-agent/preemptive-tts
 */
import { flagOn } from '../../config/env-flag.js';

export interface PreemptiveGenerationOverrides {
  preemptiveGeneration?: { enabled: boolean; preemptiveTts: boolean };
}

/** turnHandling fields for preemptive generation: none unless PREEMPTIVE_TTS is on. */
export function preemptiveGenerationOverrides(
  env: Record<string, string | undefined> = process.env
): PreemptiveGenerationOverrides {
  if (!flagOn('PREEMPTIVE_TTS', env)) return {};
  return { preemptiveGeneration: { enabled: true, preemptiveTts: true } };
}
