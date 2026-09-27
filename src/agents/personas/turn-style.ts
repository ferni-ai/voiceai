/**
 * Keep spoken turns short: a reminder on the user's latest turn, seen only by
 * the LLM request.
 *
 * The cascade prompt is ~55k characters and a length rule inside it was
 * mostly ignored: a scripted 4-turn call still averaged 66 words and two
 * paragraphs per reply. Offline, on the same conversation (gemini-3.5-flash,
 * MINIMAL, 6 samples each, 2026-09-27): prompt as is 74 words; rule moved to
 * the end 55; rule removed from "elaborate" 53; a reminder on the user turn
 * 33 words, one paragraph, one question.
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
  'Reply in one to three sentences, about 15 to 35 words, with at most one question and no paragraph breaks, unless they asked you to explain, plan or tell a story.';

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
