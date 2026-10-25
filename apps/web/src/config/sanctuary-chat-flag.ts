/**
 * Sanctuary chat flag. Off by default.
 *
 * A self-guided practice (opened from The Sanctuary while not in a call) had
 * a "chat with Ferni" step that posted to /api/practice/chat. Without an LLM
 * key that route answers 200 with a random canned line ("Tell me more about
 * that.") picked from a fixed list, so the reply looked like Ferni and wasn't.
 * While off, practices skip their chat step; the intro, prompts, reflections,
 * breathing and the close still run, and in a call the practice still goes to
 * Ferni by voice. Turn it on with `VITE_SANCTUARY_CHAT=true` once the route
 * gives real replies or an honest failure.
 */
export function isSanctuaryChatOn(): boolean {
  return import.meta.env.VITE_SANCTUARY_CHAT === 'true';
}
