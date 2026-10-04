/**
 * Whether per-turn hints may quote a ready-made line for the model to say.
 *
 * Several live hints handed the model a code-written sentence: a mood aside
 * ("Bear with me - I didn't sleep great."), a reply opener ("Start your response
 * with: ..."), a sign-off catchphrase ("You've got this."), and a topic-shift
 * bridge ("Consider: 'Speaking of which...'"). Spoken word for word they sound
 * scripted and pull the reply away from what the caller said, so they are off
 * by default. The hint around each line (mood, style) stays.
 *
 * FERNI_SCRIPTED_HINT_LINES=on restores the quoted lines.
 *
 * @module intelligence/scripted-hint-lines
 */
export function scriptedHintLinesEnabled(): boolean {
  return process.env.FERNI_SCRIPTED_HINT_LINES === 'on';
}
