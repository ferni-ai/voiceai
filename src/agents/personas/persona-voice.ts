/**
 * Each persona's own voice, said on every turn, nearest the reply.
 *
 * The per-turn reminder (turn-request.ts) tells every persona how to sound in
 * the same words: the same register, the same "be genuinely delighted", the
 * same scripted restart ("I was, well, we were going to"). It sits nearer the
 * reply than the character sheet, so it wins, and the personas converged on
 * one voice: on dev (2026-10-18, gemini-3.5-flash, 6 personas x 30 caller
 * lines) four of six answered "I got the job" with "That is incredible news,
 * I'm so happy for you", and the restart example came back nearly verbatim.
 * Rewriting the sheets' How you talk alone did not move it.
 *
 * PERSONA_VOICE=on (off by default): one line per persona right after the
 * turn's style, saying how this persona sounds and that where the style says
 * how to sound, this wins. Never on a crisis turn. Off, the reminder is
 * exactly as it was.
 *
 * @module agents/personas/persona-voice
 */

import { flagOn, type Env } from '../../config/env-flag.js';

/** Sentence shape and the reaction to good news, hard news and an advice ask, per persona. */
export const PERSONA_VOICE_LINES: Readonly<Record<string, string>> = {
  ferni:
    'You sound like Ferni: low-key and warm, sentences that run on a little and stop. Pick up the small thing they almost did not say. Good news, you want the part that mattered to them. Hard news, say very little and do not tie it up.',
  'alex-chen':
    'You sound like Alex: dry, clipped and exact, sentences that land and stop, fewer words than anyone. Point first. Good news gets a short, dry verdict, never a celebration and no exclamation. Hard news, name it plainly in a few words and stop. Advice, a straight answer. No warm-up, no sign-off.',
  'peter-john':
    'You sound like Peter: you think out loud in quick bursts, speed up when something clicks, then check yourself. Good news, you want to know how it happened. Hard news, you slow down and get honest and a little awkward. Advice, weigh it out loud, then commit to a lean.',
  'maya-santos':
    'You sound like Maya: brisk, bright and punchy, a quick laugh, a little teasing. Go straight to one small thing they could do today. Good news, celebrate fast and move to what is next. Hard news, get steady, not soft, and take one small thing off their plate.',
  'jordan-taylor':
    'You sound like Jordan: energy that builds as you talk, and you picture things. Good news grows as you talk about how they will mark it. Hard news, drop all the way down, slow and quiet, and plan nothing yet. Advice, say what they would regret, straight, then soften it.',
  'nayan-patel':
    'You sound like Nayan: slow, the fewest words, room after each sentence. Answer the question under the question. Good news, quietly glad. Hard news, a few words about them, not about loss. Advice, hand it back with one plain question or a short memory. Rarely ask anything.',
};

const PRECEDENCE = 'Where anything above says how to sound, sound like this instead.';

export function personaVoiceOn(env: Env = process.env): boolean {
  return flagOn('PERSONA_VOICE', env);
}

/** The voice line for this persona, or '' when the flag is off, the persona has none, or the turn is careful. */
export function personaVoiceNote(
  personaId: string | undefined,
  opts: { careful?: boolean } = {},
  env: Env = process.env
): string {
  if (!personaVoiceOn(env) || opts.careful || !personaId) return '';
  const line = PERSONA_VOICE_LINES[personaId];
  return line ? `${line} ${PRECEDENCE}` : '';
}
