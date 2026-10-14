/**
 * How a reply carried over at a single-session handoff is marked with who
 * said it (DIRECTOR_PERSONA_AWARE, persona-swap.ts markWhoSpoke). A chat
 * message has no speaker field the model sees, so the mark goes in the words;
 * the director's transcript reads it back off (director-notes.ts linesFromChat).
 *
 * @module agents/personas/said-by
 */

export const saidBy = (name: string): string => `(${name} said:) `;
const SAID_BY = /^\(([^()]{1,40}) said:\) /;

/** The speaker and words of a marked reply, or undefined if it isn't marked. */
export function splitSaidBy(text: string): { name: string; text: string } | undefined {
  const m = SAID_BY.exec(text);
  return m ? { name: m[1], text: text.slice(m[0].length) } : undefined;
}
