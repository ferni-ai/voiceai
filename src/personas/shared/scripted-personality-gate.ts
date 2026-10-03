/**
 * Whether the "Better Than Human" personality system may write lines for the
 * model to say.
 *
 * That system composes sentences in code (time-of-day remarks like "That golden
 * hour light, weekend evenings feel different, don't they?", noticing lines
 * like "You took a moment there", and LLM-pre-generated "what I'm doing right
 * now" asides like "Just poured myself a cup of tea") and tells the model to
 * speak them. On the 2026-10-03 dev call these came out word for word and
 * repeated, so Ferni talked about herself instead of answering the caller.
 *
 * Off by default. PERSONALITY_EXPRESSIONS=on (the same flag as
 * scripted-self-disclosure.ts, so one switch restores all of it) restores:
 * the per-turn injection and the expression-cache prewarm (which costs an LLM
 * call per batch).
 *
 * @module personas/shared/scripted-personality-gate
 */
import { scriptedSelfDisclosureEnabled } from './scripted-self-disclosure.js';

export function scriptedPersonalityEnabled(): boolean {
  return scriptedSelfDisclosureEnabled();
}
