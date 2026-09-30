/**
 * Conversational repair as a cue, not a script.
 *
 * The repair engine (conversational-repair.ts) already recognizes when a
 * reply missed: a correction, a missed point, advice when they wanted to be
 * heard, a topic they do not want. People repair these in a few words and
 * move on; a canned apology makes it worse. So the engine's decision becomes
 * one line for the next reply, and the model says it in its own voice.
 *
 * @module conversation/repair-cue
 */

import {
  getConversationalRepairEngine,
  type MiscueType,
  type RepairDecision,
} from './conversational-repair.js';

const CUES: Partial<Record<MiscueType, string>> = {
  misunderstanding:
    'They are correcting you. Own it in a few words ("ah, I had that wrong"), use what they just said, and carry on. No long apology, no explaining why.',
  assumption_wrong:
    'You assumed something that was not true. Drop it in a few words and follow what they actually said.',
  missed_point:
    'You missed their point. Show you heard what actually matters to them, briefly, and follow that.',
  tone_mismatch:
    'Your tone missed. They want to be heard, not fixed: no advice and no jokes this time. Reflect what they said and stay with them.',
  topic_unwanted:
    'They do not want to go there. Let it go lightly, no questions about it, and follow their lead.',
};

/**
 * Only strong evidence gets a cue. Weaker engine signals ("ugh", "the thing
 * is...") are often about their day, not about us; answering them with "ah,
 * I had that wrong" would be worse than no repair.
 */
const MIN_CONFIDENCE = 0.8;

/** The cue for a repair decision, or null when nothing needs repairing. */
export function repairCue(decision: RepairDecision): string | null {
  if (!decision.shouldRepair || decision.miscue.confidence < MIN_CONFIDENCE) return null;
  return CUES[decision.miscue.type] ?? null;
}

interface RepairMemo {
  text: string;
  cue: string | null;
}

/**
 * The repair cue for this user turn. The engine counts consecutive misses,
 * so each user message is analyzed once; a preemptive and a final generation
 * for the same turn get the same answer (memoized on the session data).
 */
export function sessionRepairCue(
  userData: Record<string, unknown> | undefined,
  sessionId: string | undefined,
  userText: string | undefined,
  previousAgentText?: string
): string | null {
  if (!userData || !sessionId || !userText?.trim()) return null;
  const memo = userData.repairCue as RepairMemo | undefined;
  if (memo?.text === userText) return memo.cue;
  const decision = getConversationalRepairEngine(sessionId).analyze(userText, previousAgentText);
  const cue = repairCue(decision);
  userData.repairCue = { text: userText, cue } satisfies RepairMemo;
  return cue;
}
