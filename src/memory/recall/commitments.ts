/**
 * What the caller said they would do.
 *
 * "I'm going to call my mom this weekend." "I need to talk to my boss on
 * Monday." A friend remembers and, a few days later, asks whether they got
 * to it: gently, once, without keeping score. Only a plan with a when counts
 * ("I'll be fine" and "I have to go now" are not plans), and it joins the
 * open threads (follow-ups.ts): dated, asked about once, then closed.
 *
 * Pure: detection and shaping. Storage lives with the recall store.
 *
 * @module memory/recall/commitments
 */

import { followUpId, type FollowUp } from './follow-ups.js';

/** "I'm going to", "I'll", "I need to", "I plan to"... followed by what. */
const INTENT =
  /\b(i'?m (going to|gonna|planning to|finally going to)|i will|i'll|i plan to|i need to|i have to|i promised( myself)? (to|i'd)|i'?m determined to)\s+([^.!?]{4,100})/i;

/** When: the part that makes it a plan worth asking about later. */
const WHEN =
  /\b(today|tonight|tomorrow|this (morning|afternoon|evening|week|weekend|month)|next (week|month|weekend)|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|the weekend|the end of)|before (the weekend|friday|monday))\b/i;

/** Not plans: leaving the call, reassurance, or talk about the call itself. */
const NOT_A_PLAN =
  /\b(go now|get going|let you go|talk to you|be (fine|ok|okay|alright)|think about it|see you|call you back)\b/i;

const MAX_TEXT = 140;

/** The caller's plan in something they said (their own sentence), or null. */
export function commitmentIn(text: string): string | null {
  for (const sentence of text.match(/[^.!?]+[.!?]*/g) ?? []) {
    const s = sentence.replace(/\s+/g, ' ').trim();
    if (!INTENT.test(s) || !WHEN.test(s) || NOT_A_PLAN.test(s)) continue;
    return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1).trimEnd()}…` : s;
  }
  return null;
}

/** A plan as an open thread, worded so it reads as theirs, not the persona's. */
export function commitmentFollowUp(sentence: string, at: number): FollowUp {
  return { id: followUpId(sentence), text: `They said: "${sentence}"`, at };
}
