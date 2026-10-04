/**
 * Save what Ferni said, so conversation history has both sides.
 *
 * The cascade path only recorded the user's final transcripts; the agent-side
 * recorder was called from the legacy voice-agent pipeline, which LiveKit Cloud
 * sessions never reach. Production conversation threads held user messages
 * only (2026-09-30). This listens for the session's conversation_item_added
 * event, which carries each assistant message as it was spoken (cut short
 * when the user interrupted), and records it through the same thread recorder.
 *
 * @module agents/multi-agent/assistant-transcript
 */

import { stripSSML } from '../../speech/tts-gateway/ssml/processor.js';

/** What was said, without the speech markup (emotion/speed/break tags, [laughter]). */
export function transcriptText(text: string): string {
  return stripSSML(text)
    .replace(/\[[a-z_ ]+\]/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface ItemAddedEvent {
  item?: { type?: string; role?: string; textContent?: string; interrupted?: boolean };
}

export type AssistantRecorder = (options: {
  userId: string;
  sessionId: string;
  personaId: string;
  threadId?: string;
  content: string;
  interrupted?: boolean;
}) => Promise<void>;

/**
 * Handler for conversation_item_added. Records assistant messages; ignores
 * user, system and handoff items (user turns are recorded from transcripts).
 */
export function assistantTranscriptHandler(
  getContext: () => { userId?: string; sessionId: string; personaId?: string; threadId?: string },
  record: AssistantRecorder
): (event: unknown) => void {
  return (event: unknown) => {
    const item = (event as ItemAddedEvent)?.item;
    if (!item || (item.type && item.type !== 'message') || item.role !== 'assistant') return;
    const content = transcriptText(item.textContent ?? '');
    const { userId, sessionId, personaId, threadId } = getContext();
    if (!content || !userId) return;
    void record({
      userId,
      sessionId,
      personaId: personaId || 'ferni',
      threadId,
      content,
      interrupted: item.interrupted === true,
    }).catch(() => undefined); // the recorder logs its own failures
  };
}
