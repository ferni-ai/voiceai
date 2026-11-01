/**
 * The only lines whose output with CRISIS_LEXICAL_V2 on may differ from main's
 * (legacy-word-checks-equivalence.test.ts). Recorded over 217 lines x 6 modes; every other
 * line is equal to main in full. Fictional lines.
 */

/**
 * Suicide or self-harm-only lines the gate's own patterns guide or replace: on gate live +
 * cascade the transfer note is left to the gate, and nothing else changes (transfer-need.ts).
 * A few are false alarms of main's word check ("go on that trip / hike / date") that the
 * guard reads too, so the gate still answers them (its patterns are lanes L1/L2).
 */
export const DEFERRED: readonly string[] = [
  "I'm at the bridge and I'm going to end it here",
  "I don't want to go on another day like this",
  'I cut my finger cooking earlier but I have been cutting myself at night',
  'i want to kill myself tonight',
  "I never want to say I'm going to hurt myself",
  'I want to end it all on my birthday',
  "There's no point in a future, I want to die",
  'I want to hurt myself after school',
  "I'm going to hurt myself at work today",
  'I cut my finger chopping onions and I want to die',
  "I won't be here tomorrow, I'm going to end it",
  'I want to die in my sleep tonight',
  "I'm going to kill myself at the game tonight",
  "I don't want to go on the trip, I just want to end it all",
  'I want to kill myself',
  "I'm going to end it tonight",
  'I cut myself on purpose',
  "I don't want to be here anymore",
  "I don't want to go on like this",
  "what's the point of these meds, nothing helps and I'm tired of living",
  "I've been thinking about ending it",
  'everyone would be better off without me',
  "I'm not gonna lie, what's the point of anything",
  'I never told anyone, but I cut myself',
  "I wasn't going to say this but I don't want to live",
  "I cut my finger cooking, but honestly I've been cutting myself too",
  'I cut myself opening a can and honestly sometimes I cut myself to cope',
  "I don't want to be here at the party, I want to die",
  "I've been burning myself with a lighter",
  "I'm so tired of everything, what's the point of the morning",
  "I don't want to go on that trip",
  "I don't want to go on that hike",
  "I don't want to go on the trip with them",
  "I don't want to go on that date",
];

/** Everyday "can't see" lines: CRISIS_LEXICAL_V2 implies CRISIS_SIGHT_NEEDS_CUE. */
export const SIGHT_CUE: readonly string[] = [
  "I can't see your text, it never came through",
  "I can't see your message",
];
