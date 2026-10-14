/**
 * Session event for late words of turn 1 that joined the turn instead of
 * opening a new one (personas/late-words.ts, EOT_CONTINUED_MERGE). Its payload
 * has the shape of a final `user_input_transcribed` event, with the whole
 * merged turn as the transcript, so per-turn work that reads final transcripts
 * (turn intelligence) still sees every word. A leaf module: both sides import
 * it without an import cycle.
 *
 * @module agents/shared/late-words-event
 */

export const LATE_WORDS_MERGED = 'late_words_merged';

export interface LateWordsMergedEvent {
  transcript: string;
  isFinal: true;
}
