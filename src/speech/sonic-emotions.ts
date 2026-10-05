/**
 * The emotions Cartesia Sonic 3 accepts in `<emotion value="..."/>`, and the
 * nearest one for names it doesn't.
 *
 * Source: docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 * (checked 2026-10-04). Content across src/ writes names Sonic 3 never knew
 * ("friendly" 23 times, "thoughtful", "gentle", ...) or Sonic 2 names
 * ("happiness", "positivity"). The SSML processor used to drop the first kind
 * silently and send the second kind on to Cartesia; both now become the
 * closest Sonic 3 emotion instead.
 *
 * @module speech/sonic-emotions
 */

export const SONIC3_EMOTIONS: ReadonlySet<string> = new Set([
  'neutral',
  'happy',
  'excited',
  'enthusiastic',
  'elated',
  'euphoric',
  'triumphant',
  'amazed',
  'surprised',
  'flirtatious',
  'curious',
  'content',
  'peaceful',
  'serene',
  'calm',
  'grateful',
  'affectionate',
  'trust',
  'sympathetic',
  'anticipation',
  'mysterious',
  'angry',
  'mad',
  'outraged',
  'frustrated',
  'agitated',
  'threatened',
  'disgusted',
  'contempt',
  'envious',
  'sarcastic',
  'ironic',
  'sad',
  'dejected',
  'melancholic',
  'disappointed',
  'hurt',
  'guilty',
  'bored',
  'tired',
  'rejected',
  'nostalgic',
  'wistful',
  'apologetic',
  'hesitant',
  'insecure',
  'confused',
  'resigned',
  'anxious',
  'panicked',
  'alarmed',
  'scared',
  'proud',
  'confident',
  'distant',
  'skeptical',
  'contemplative',
  'determined',
]);

/** Names used in our content or by Sonic 2, mapped to the closest Sonic 3 emotion. */
const ALIASES: Readonly<Record<string, string>> = {
  // Sonic 2
  happiness: 'happy',
  sadness: 'sad',
  anger: 'angry',
  fear: 'scared',
  surprise: 'surprised',
  disgust: 'disgusted',
  curiosity: 'curious',
  positivity: 'content',
  negativity: 'sad',
  // Ours
  friendly: 'happy',
  amused: 'happy',
  playful: 'happy',
  joking: 'happy',
  comedic: 'happy',
  thoughtful: 'contemplative',
  reflective: 'contemplative',
  gentle: 'calm',
  hopeful: 'anticipation',
  satisfied: 'content',
  relieved: 'content',
  warm: 'affectionate',
  caring: 'affectionate',
  empathetic: 'sympathetic',
  interested: 'curious',
  inspired: 'enthusiastic',
};

/** The Sonic 3 emotion for a name, or undefined when there is no sensible one. */
export function toSonicEmotion(name: string): string | undefined {
  const key = name.trim().toLowerCase();
  if (SONIC3_EMOTIONS.has(key)) return key;
  return ALIASES[key];
}
