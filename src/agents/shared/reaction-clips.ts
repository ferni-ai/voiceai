/**
 * Which short clips each persona renders in its own voice (rendered and
 * served by conversational-audio-cache.ts).
 *
 * @module agents/shared/reaction-clips
 */

/**
 * Every clip the clip player can be asked for, in whoever's voice is on the
 * call: neutral and soft backchannels (backchannel-policy.ts), contextual
 * reactions (backchannel-context.ts), the laugh-along, and the turn-opening
 * "Hmm"/"Mm" (turn-opening-sound.ts). A missing clip plays nothing, so every
 * persona renders all of them (reaction-clip-coverage.test.ts holds this).
 */
// prettier-ignore
export const REACTION_CLIPS: readonly string[] = ['Mm', 'Hmm', 'Yeah', 'Mhm', 'Right', 'Mm-hmm',
  'Oh', '[laughter]', 'Oh no', 'Oof', 'Whoa', 'No way', 'Ha', 'Aw'];

/** Each persona's own sounds on top of REACTION_CLIPS. */
const EXTRAS: Readonly<Record<string, readonly string[]>> = {
  ferni: ['I hear you'],
  'maya-santos': ['Okay', 'I hear you'],
  'peter-john': ['Okay', 'Interesting', 'Oh!'],
  'alex-chen': ['Got it', 'Okay', 'I see'],
  'jordan-taylor': ['Oh!', 'Yes!', 'Uh-huh'],
  'nayan-patel': ['Yes', 'Indeed', 'I see', 'Ah'],
};

/** Every persona whose voice can be on a call: the team and the financial legends. */
export const CLIP_PERSONAS: readonly string[] = [
  ...Object.keys(EXTRAS),
  'joel-dickson',
  'john-bogle',
  'peter-lynch',
];

/** A persona's full clip list: the shared reactions plus its own extras. */
export function backchannelsFor(personaId: string): string[] {
  return [...new Set([...REACTION_CLIPS, ...(EXTRAS[personaId] ?? [])])];
}

/**
 * What worker boot renders: Ferni's full list (calls start on Ferni) and only
 * the teammates' extras, so boot makes fewer TTS calls than before, not more.
 * The boot prewarm races a 10 s budget (gce/warmup.ts) and serves no clip
 * until it finishes; ~100 more calls for personas most calls never reach would
 * only lengthen that window. A teammate's reactions (9-14 one-word clips, in
 * parallel) render when its voice is set up for a call, seconds before its
 * first pause (warmPersonaReactions).
 */
export function bootBackchannels(personaId: string): readonly string[] {
  return personaId === 'ferni' ? backchannelsFor('ferni') : (EXTRAS[personaId] ?? []);
}
