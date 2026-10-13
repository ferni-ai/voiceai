/**
 * Journal placeholder check.
 *
 * Voice journal saves used to store a stand-in when no words came back:
 * "[Transcription unavailable]" from transcribeAudioBuffer, or the web panel's
 * "[Voice recording - N seconds]" (optionally after a `Prompt: "..."` line).
 * Neither is something the person said, so neither may be saved as an entry.
 *
 * @module services/custom-agent/journal-placeholder
 */

/** A bracketed stand-in, never real words. */
const PLACEHOLDER = /^\[(?:transcription unavailable|voice recording\b[^\]]*)\]$/i;

/** The panel prefixes the prompt it showed: `Prompt: "..."` and a blank line. */
const PROMPT_PREFIX = /^Prompt: "[^\n]*"\s*/;

/** True when the text holds no words of the person's own: empty or a stand-in. */
export function isJournalPlaceholder(text: string | null | undefined): boolean {
  const body = (text ?? '').trim().replace(PROMPT_PREFIX, '').trim();
  return body === '' || PLACEHOLDER.test(body);
}
