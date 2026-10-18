/**
 * Whether the crisis gate really escalated on this call, and handoff wording
 * kept to that (HANDOFF_CRISIS_WORDING=on, off by default).
 *
 * Prod 2026-10-18: a classifier-only crisis read of "Can you pass me to 9?"
 * (STT for Nayan) gave the caller the 988 line. When Alex then handed the
 * caller to Nayan, the handoff tool's summary said they were "earlier in a
 * crisis context", and that went into Nayan's brief.
 *
 * A real escalation, recorded per call: a pattern match (guide or script), the
 * crisis script from any source, or a classifier read that went through the
 * agreement gate or adjudicator and still escalated. With the flag on, a
 * handoff's reason and summary lose every clause with crisis wording unless
 * the call had one. Without a call id nothing is removed.
 *
 * @module CrisisEscalations
 */

import { flagOn, type Env } from '../../config/env-flag.js';

const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CALLS = 512;
/** Calls with a real escalation. */
const escalated = new Map<string, number>();
/** Calls where any read found risk or failed (crisis-transfer-request.ts). */
const risky = new Map<string, number>();

function note(calls: Map<string, number>, sessionId: string | undefined, now: number): void {
  if (!sessionId) return;
  for (const [id, at] of calls) if (now - at > TTL_MS) calls.delete(id);
  if (!calls.has(sessionId) && calls.size >= MAX_CALLS) {
    const oldest = calls.keys().next().value;
    if (oldest !== undefined) calls.delete(oldest);
  }
  calls.set(sessionId, now);
}

const seen = (calls: Map<string, number>, sessionId: string, now: number): boolean => {
  const at = calls.get(sessionId);
  return at !== undefined && now - at <= TTL_MS;
};

/** Record a real escalation on this call (see the module comment for what counts). */
export function noteCrisisEscalation(sessionId: string | undefined, now = Date.now()): void {
  note(escalated, sessionId, now);
}

export function crisisEscalatedThisCall(sessionId: string, now = Date.now()): boolean {
  return seen(escalated, sessionId, now);
}

/** Record that a read on this call found risk, or gave no verdict. */
export function noteCrisisRisk(sessionId: string | undefined, now = Date.now()): void {
  note(risky, sessionId, now);
}

/** Any read or pattern on this call found risk (or a read failed), or it escalated. */
export function crisisRiskThisCall(sessionId: string, now = Date.now()): boolean {
  return seen(risky, sessionId, now) || seen(escalated, sessionId, now);
}

/** For tests. */
export function resetCrisisEscalations(): void {
  escalated.clear();
  risky.clear();
}

/** Crisis talk in a handoff's wording: the word itself, lines, self-harm, dying, distress. */
const CRISIS_WORDING =
  /\b(?:crisis|crises|suicid\w*|self[- ]?harm\w*|988|911|hotline|lifeline|helpline|kill(?:ing)? (?:my|him|her|them|your)sel(?:f|ves)|want(?:s|ed)? to die|end(?:ing)? (?:my|his|her|their|your) life|overdos\w*|at risk|unsafe|safety (?:check|plan|concern)\w*|distress\w*|not alone)\b/i;

/** Clauses: sentences, semicolons, dashes and commas, each with what ends it. */
const CLAUSE = /[^.!?;,—–]+(?:[.!?;,—–]+\s*|$)/g;

/** The text without each clause that holds crisis wording; undefined when nothing is left. */
function withoutCrisisClauses(text: string): string | undefined {
  const kept = (text.match(CLAUSE) ?? []).filter((c) => !CRISIS_WORDING.test(c));
  const out = kept
    .join('')
    .replace(/[\s,;—–-]+$/, '')
    .trim();
  return /[a-z0-9]/i.test(out) ? out : undefined;
}

/**
 * A handoff's reason or summary as the teammate may read it: unchanged with the
 * flag off, without a call id, after a real escalation this call, or when it
 * holds no crisis wording; otherwise without the clauses that do.
 */
export function withoutUnescalatedCrisis(
  text: string | undefined,
  sessionId: string | undefined,
  env: Env = process.env
): string | undefined {
  if (!text || !sessionId || !flagOn('HANDOFF_CRISIS_WORDING', env)) return text;
  if (!CRISIS_WORDING.test(text) || crisisEscalatedThisCall(sessionId)) return text;
  return withoutCrisisClauses(text);
}
