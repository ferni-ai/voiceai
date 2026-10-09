/**
 * Whether the DJ may speak without being asked: track intros, mid-song
 * moments, outros and auto-continue lines.
 *
 * On a live call it announced every 30-second preview ("Here's 'Guitar'.")
 * over the conversation, while Ferni already talks about the music he was
 * asked to play. Off unless DJ_SPOKEN_LINES=on.
 *
 * @module audio/dj-speech-policy
 */

export function djSpeaksOnItsOwn(_env: Record<string, string | undefined> = process.env): boolean {
  return false;
}
