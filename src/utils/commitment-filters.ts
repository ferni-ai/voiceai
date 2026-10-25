/**
 * What is said in commitment words but is not the caller's own commitment.
 *
 * - Sarcasm ("yeah right, I'll go to the gym") and outside pressure ("everyone
 *   says I should") make the whole transcript a non-commitment.
 * - A sentence that asks something, asks Ferni to do something ("I'm going to
 *   need you to do 7 jumping jacks") or orders food or a drink ("I'll take
 *   butter and honey") is dropped, and the rest is still read: "I'll take a
 *   coffee. I'm going to call my sister tomorrow." keeps the second sentence.
 *
 * @module utils/commitment-filters
 */

import { createHash } from 'crypto';

// Sarcasm indicators: never a commitment when detected (P2 FIX)
const SARCASM_INDICATORS = [
  /\(not\)$/i,
  /\bas if\b/i,
  /\byeah right\b/i,
  /\bsure,? (yeah|right|okay|uh huh)/i,
  /\boh (sure|yeah|definitely|absolutely)\b/i,
  /\bwhen (pigs fly|hell freezes)/i,
  /\b(totally|definitely|absolutely),? (not|never)/i,
  /\b🙄|\/s$/i, // Eye roll emoji or /s tag
  /\blol as if\b/i,
  /\bsuuure\b/i, // Drawn out "sure"
];

// External pressure - NOT the user's own commitment (P3 FIX)
const EXTERNAL_PRESSURE_PATTERNS = [
  /\b(everyone|they|people|my (mom|dad|parents|boss|friends)) (say|says|tell|tells|think|thinks) i should\b/i,
  /\b(everyone|they) (want|wants) me to\b/i,
  /\bi('m| am) supposed to\b/i, // Obligation, not commitment
  /\bi('m| am) expected to\b/i,
];

/** Sarcasm or someone else's expectation: nothing in the transcript is the caller's commitment. */
export function isNotOwnCommitment(transcript: string): boolean {
  return [...SARCASM_INDICATORS, ...EXTERNAL_PRESSURE_PATTERNS].some((p) => p.test(transcript));
}

const FUTURE_I = String.raw`\b(i('m| am) (going to|gonna)|i('ll| will)|imma)`;

/** "I'm going to need you to...", "I'll have you...", "I'm gonna ask you to...": a request to Ferni. */
const REQUEST_TO_FERNI = new RegExp(`${FUTURE_I}\\s+(need|have|ask|want)\\s+you\\b`, 'i');

/** A question even when speech-to-text dropped the "?": "Am I going to...", "How am I going to...". */
const QUESTION_START =
  /^(?:(?:what|why|how|when|where|who|which)\s+)?(are|am|is|do|does|did|can|could|would|will|should|shall)\s+(i|you|we|they|he|she|it)\b/i;

const FOOD = new Set(
  (
    'coffee tea latte cappuccino espresso water beer wine butter honey jam toast bagel salad ' +
    'sandwich burger fries pizza salmon steak chicken fish soup cake pie cheese bread egg eggs ' +
    'bacon pancakes waffles juice soda milk sugar cream dessert special combo order side ' +
    'drink drinks fruit muffin cookie cookies pasta rice tacos burrito sushi'
  ).split(' ')
);

/** "I'll take butter and honey", "I'll have the salmon, please": ordering, not committing. */
function isOrder(sentence: string): boolean {
  const m = sentence.match(/\bi('ll| will) (take|have)\s+(.*)$/i);
  if (!m) return false;
  const rest = (m[3].toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w !== 'please');
  // "to", "care", "done", "it" or a long tail means an action: "I'll take my mom to the doctor".
  if (rest.length === 0 || rest.length > 6) return false;
  if (rest.some((w) => ['to', 'care', 'done', 'it', 'off', 'time', 'tomorrow'].includes(w)))
    return false;
  return rest.some((w) => FOOD.has(w));
}

/**
 * The transcript without its questions, requests to Ferni and food orders, so
 * only sentences that can hold the caller's own commitment are read.
 */
export function commitmentSentences(transcript: string): string {
  return transcript
    .split(/(?<=[.!?])\s+/)
    .filter((s) => {
      const t = s.trim();
      return (
        t !== '' &&
        !t.includes('?') &&
        !QUESTION_START.test(t) &&
        !REQUEST_TO_FERNI.test(t) &&
        !isOrder(t.replace(/[.!]+$/, ''))
      );
    })
    .join(' ');
}

/**
 * A stored commitment worth asking the caller about: something is left after
 * dropping questions, requests to Ferni and orders, and it is the caller's own.
 * "I'll take butter and honey" and "Can you call my mom?" are not.
 */
export function isAskableCommitment(text: string): boolean {
  return commitmentSentences(text).trim() !== '' && !isNotOwnCommitment(text);
}

/** "I'm going to finish the AI project!" and "i'm going to finish the AI project" are one commitment. */
export function normalizeCommitmentText(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/['’]/g, '')
      .match(/[a-z0-9]+/g) ?? []
  ).join(' ');
}

/**
 * One commitment's stable key: a hash of the user and its normalized text, so
 * every call, instance and duplicate record of it agrees (commitment_checkins).
 */
export function commitmentKey(userId: string, text: string): string {
  return createHash('sha256')
    .update(`${userId}\n${normalizeCommitmentText(text)}`)
    .digest('hex')
    .slice(0, 32);
}
