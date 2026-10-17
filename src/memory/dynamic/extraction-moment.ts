/**
 * What the fact extractor is told about the moment of a line: when the call
 * took place (call-moment.ts) and, with EXTRACTION_CONTEXT=on, what the
 * caller said just before it in the same call.
 *
 * The extractor saw one line at a time. Real speech spreads a fact over
 * several: "could you call my brother?", "his name is Pete", "it's uh 435
 * 555 0188". On Seth's real calls (memory benchmark, 2026-10-11) the number
 * was stored as "him | phone number = 435-555-0188", which no question
 * about Pete could find. Scripted histories put each fact in one sentence,
 * so they never showed it.
 *
 * Lines are remembered as jobs are extracted, which is in call order. Only
 * a few are kept per call, and only for the most recent calls in the
 * process.
 *
 * @module memory/dynamic/extraction-moment
 */
import { callMomentLine, callerTimeZoneFor } from '../operations/call-moment.js';

export function extractionContextEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.EXTRACTION_CONTEXT === 'on';
}

/** Earlier lines of a call shown with each new one. */
const LINES_KEPT = 6;
/** Calls remembered at once; the oldest is forgotten first. */
const CALLS_KEPT = 200;

const earlier = new Map<string, string[]>();

/** For tests. */
export function forgetExtractionContext(): void {
  earlier.clear();
}

/** The lines said before this one in the call; then this one joins them. */
function linesBefore(sessionId: string, line: string): string[] {
  const before = earlier.get(sessionId) ?? [];
  earlier.delete(sessionId); // re-inserted below, so the map stays oldest-first
  earlier.set(sessionId, [...before, line].slice(-LINES_KEPT));
  if (earlier.size > CALLS_KEPT) earlier.delete(earlier.keys().next().value!);
  return before;
}

export function extractionMoment(
  job: { sessionId: string; timestamp: number | string | Date; transcript: string },
  env: Record<string, string | undefined> = process.env
): string {
  const moment = callMomentLine(new Date(job.timestamp), callerTimeZoneFor(job.sessionId));
  if (!extractionContextEnabled(env)) return moment;
  const before = linesBefore(job.sessionId, job.transcript.trim());
  if (before.length === 0) return moment;
  return [
    moment,
    'Earlier in this call they said (context only: extract facts from the transcript below, not from these lines):',
    ...before.map((l) => `- "${l}"`),
    'Name people and things as they were named earlier, never as "him", "her", "it" or "they". A detail that completes an earlier line (a number, a name, a date) belongs to what that line was about.',
  ].join('\n');
}
