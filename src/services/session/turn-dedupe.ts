/**
 * Two writers record each caller turn on a live call (transcript-handler's
 * recordUserTurn and the turn processor's analyzeMessage), 3-5 ms apart, so
 * every caller line was stored twice and fed summaries, learning and the next
 * call's opener twice (dev Firestore, 2026-10-05). The session's addTurn sink
 * drops an identical turn that repeats within a few seconds.
 *
 * @module services/session/turn-dedupe
 */

export interface LastTurn {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

/** Long enough for both writers of one turn; far shorter than a person repeating themself. */
export const REPEAT_WINDOW_MS = 3000;

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function isRepeatTurn(
  last: LastTurn | undefined,
  role: LastTurn['role'],
  content: string,
  at: number
): boolean {
  return (
    last !== undefined &&
    last.role === role &&
    at - last.at < REPEAT_WINDOW_MS &&
    norm(last.content) === norm(content)
  );
}
