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
