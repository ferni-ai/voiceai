/**
 * Why the model handed the caller on: the handoff tool's `reason` and
 * `context_summary`, kept for the multi-agent handler that runs the handoff.
 *
 * That handler only hears the tool's voiceSwitch event, which carries the persona,
 * not the reason, so every LLM handoff reached the orchestrator as "LLM requested
 * handoff" and the teammate never learned why the caller came (dev, 2026-10-11).
 * Keyed by call and teammate like ready-agents.ts; read once.
 *
 * @module tools/handoff/handoff-reasons
 */
import { withoutUnescalatedCrisis } from '../../services/safety/index.js';
import { toCanonicalId } from './state.js';

const reasons = new Map<string, string>();
const key = (sessionId: string, personaId: string): string =>
  `${sessionId}:${toCanonicalId(personaId)}`;

export function noteHandoffReason(
  sessionId: string | undefined,
  personaId: string,
  reason: string,
  contextSummary?: string
): void {
  if (!sessionId) return;
  const why = [reason.trim(), contextSummary?.trim()].filter(Boolean).join(' — ');
  if (why) reasons.set(key(sessionId, personaId), why.slice(0, 400));
}

/** The reason the model gave for this handoff, once; undefined if it gave none. */
export function takeHandoffReason(sessionId: string, personaId: string): string | undefined {
  const k = key(sessionId, personaId);
  const why = reasons.get(k);
  reasons.delete(k);
  return why;
}

/** What a reason with nothing left after the crisis wording was removed says instead. */
export const NEUTRAL_HANDOFF_REASON = 'The caller asked for this teammate.';

/**
 * The tool's reason and summary as the teammate may read them: with
 * HANDOFF_CRISIS_WORDING=on, no crisis wording unless the crisis gate really
 * escalated on this call (services/safety/crisis-escalations.ts).
 */
export function handoffWords(
  sessionId: string | undefined,
  reason: string,
  summary?: string
): { reason: string; summary?: string } {
  return {
    reason: withoutUnescalatedCrisis(reason, sessionId) ?? NEUTRAL_HANDOFF_REASON,
    summary: withoutUnescalatedCrisis(summary, sessionId),
  };
}
