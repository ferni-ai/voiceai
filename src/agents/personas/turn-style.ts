/**
 * Keep spoken turns short: a reminder on the user's latest turn, seen only by
 * the LLM request.
 *
 * The cascade prompt is ~55k characters and a length rule inside it was
 * mostly ignored: a scripted 4-turn call still averaged 66 words and two
 * paragraphs per reply. Offline, on the same conversation (gemini-3.5-flash,
 * MINIMAL, 6 samples each, 2026-09-27): prompt as is 74 words; rule moved to
 * the end 55; rule removed from "elaborate" 53; a reminder on the user turn
 * 33 words, one paragraph, one question. Adding the opener and question
 * lines took stock openers ("Oh", "Ugh") from 8/9 to 0/9 and replies ending on
 * a question from 9/9 to 4/9 at the same length (9 samples each).
 *
 * A word band ("about 15 to 35 words") made every reply the same length: live
 * replies were 27-37 words (spread CV 0.06-0.12). On a 7-turn conversation,
 * 21 replies per variant (2026-09-28): the band gave mean 31 words, CV 0.25,
 * 52% ending on a question; dropping the number made replies longer (42);
 * "ask only when you really want to know" raised questions to 71-81%. The
 * wording below gave mean 22-25 words, CV 0.36-0.48, replies as short as 8
 * words, and 33-38% questions, in two separate batches.
 *
 * System messages cannot carry it: the Google plugin moves every system
 * message into systemInstruction, which is the "rule at the end" case. So the
 * reminder is appended to the last user message of a COPY of the context,
 * inside llmNode: the agent's saved history and transcripts never contain it,
 * and the SDK's preemptive-generation check (which compares saved contexts)
 * is unaffected. TURN_STYLE_REMINDER=off disables it.
 *
 * @module agents/personas/turn-style
 */

import { llm } from '@livekit/agents';

export const TURN_STYLE_REMINDER =
  'Keep it short, like a friend on a call: often one sentence, sometimes just a few words ("Again? That cat."), never more than three sentences unless they asked you to explain, plan or tell a story. No paragraph breaks. ' +
  'Start with the substance, not a stock reaction word like Oh, Ugh, Yeah or Hmm. Usually end on a thought, a reaction or an offer rather than a question, and never ask more than one. ' +
  "Talk like a close friend, not a therapist, coach or host: never ask how something feels or what it's like for them, no stock validation (\"that sounds exhausting\", \"I hear you\"), no cheerleading or exclamation marks. React like a person: your own take, a joke, surprise when it's surprising. Sound spoken, not written: the small hesitations, restarts and half-finished thoughts people really use, different each time and never the same filler twice in a row.";

export function turnStyleReminderEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.TURN_STYLE_REMINDER !== 'off';
}

/** A copy of `chatCtx` whose latest user message ends with the reminder. The input is not changed. */
export function withTurnStyleReminder(
  chatCtx: llm.ChatContext,
  reminder: string = TURN_STYLE_REMINDER
): llm.ChatContext {
  const ctx = chatCtx.copy();
  const items = [...ctx.items];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type !== 'message' || item.role !== 'user') continue;
    // copy() shares message objects with the original; replace, never mutate.
    items[i] = llm.ChatMessage.create({
      id: item.id,
      role: 'user',
      content: [...item.content, `\n\n(${reminder})`],
      createdAt: item.createdAt,
      transcriptConfidence: item.transcriptConfidence,
    });
    break;
  }
  ctx.items = items;
  return ctx;
}
