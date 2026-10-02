/**
 * Reply Reminder
 *
 * The note added to a copy of the context before every LLM request
 * (preemptive or not): the turn-length reminder, this moment's expression
 * cues (e.g. laughing along), and background turn notes. Used by
 * PersonaVoiceAgent.llmNode in ferni-agent.ts.
 *
 * Extracted from ferni-agent.ts; behavior is unchanged.
 *
 * @module agents/personas/reply-reminder
 */

import type { llm } from '@livekit/agents';
import { NAME_WINDOW } from '../../conversation/name-use.js';
import { getTTSProvider } from '../../speech/tts-gateway/providers/index.js';
import type { TurnNotesSource } from '../multi-agent/background-turn-intelligence.js';
import { replyCues } from './reply-cues.js';
import {
  composeTurnReminder,
  lastExchange,
  recentAgentReplies,
  turnStyleReminderEnabled,
} from './turn-style.js';

/** Compose the reminder for the next reply, or null when there is nothing to add. */
export function composeReplyReminder(
  chatCtx: llm.ChatContext,
  userData: Record<string, unknown> | undefined,
  turnNotes?: TurnNotesSource
): string | null {
  const exchange = lastExchange(chatCtx);
  const sessionId = (userData?.services as { sessionId?: string } | undefined)?.sessionId;
  return composeTurnReminder(
    turnStyleReminderEnabled(),
    replyCues({
      userData,
      sessionId,
      exchange,
      recentReplies: recentAgentReplies(chatCtx, NAME_WINDOW),
      voice: getTTSProvider().voice,
    }),
    turnNotes?.notesForReply()
  );
}
