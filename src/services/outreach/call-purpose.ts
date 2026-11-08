/**
 * "How's the dentist thing?": a call Ferni placed, found by what it was about
 * when the words name no person. call-status.ts `about()` reads only who the
 * call was to (contact query, name, relationship, notes), so "the dentist
 * thing", "did the restaurant get back?" or "the reservation" found nothing
 * unless the contact record itself said so (errands state, 2026-10-30).
 *
 * Behind CALL_STATUS_BY_PURPOSE (off): the words are matched against the
 * request's purpose ("book a cleaning at the dentist") and objective
 * ("reservation"). Whole words only ("dent" never matches "accident"), and
 * filler ("thing", "call", "the", "update") never matches on its own.
 *
 * A match never answers as the person: the words may name someone ("did you
 * call Jessica?") who was only mentioned in a call to a clinic. So the reply is
 * the person's own "not yet" first, then the place called and what it was
 * about (call-recall.ts purposeLine). No list of person words is needed.
 *
 * @module services/outreach/call-purpose
 */

import { flagOn, type Env } from '../../config/env-flag.js';

type Doc = Record<string, unknown>;

export function callStatusByPurposeOn(env: Env = process.env): boolean {
  return flagOn('CALL_STATUS_BY_PURPOSE', env);
}

/** Words that say nothing about what a call was for. */
const FILLER = new Set(
  (
    'thing things stuff call calls called calling phone rang update updates news status ' +
    'the that this those these them they their there then than it its about with what whats ' +
    'how hows did does done get got gets back going went any and for from you your yours our ' +
    'his her him she was were has have had just out over one ones still yet ever ask asked ' +
    'tell told say said see let know make made want need can could would should will deal ' +
    'matter whole happened happen happening ferni please again today yesterday week'
  ).split(' ')
);

/** What a call's objective is called in speech; 'general' and the like add nothing. */
const OBJECTIVE_WORDS: Readonly<Record<string, readonly string[]>> = {
  reschedule: ['reschedule', 'rescheduling'],
  cancel: ['cancel', 'cancellation', 'canceling', 'cancelling'],
  new_appointment: ['appointment'],
  reservation: ['reservation', 'booking'],
};

const tokens = (v: unknown): string[] =>
  typeof v === 'string' ? (v.toLowerCase().match(/[a-z]+/g) ?? []) : [];

/** The words of a query that can name a purpose: whole words, filler and short words dropped. */
export function purposeWords(text: string | undefined): string[] {
  return [...new Set(tokens(text).filter((w) => w.length >= 3 && !FILLER.has(w)))];
}

/** Whether this call was about any of these purpose words (whole-word equality). */
export function aboutPurpose(doc: Doc, words: readonly string[]): boolean {
  if (words.length === 0) return false;
  const r = (doc.request ?? {}) as Doc;
  const own = new Set([...tokens(r.purpose), ...(OBJECTIVE_WORDS[String(r.objective)] ?? [])]);
  return words.some((w) => own.has(w));
}
