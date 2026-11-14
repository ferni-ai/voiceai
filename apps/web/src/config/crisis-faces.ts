/**
 * The only faces, and the only affect, Ferni may show while someone is in crisis.
 *
 * Allow-lists, so they fail closed: a face nobody thought of (a laugh, a
 * kiss, an eye-roll, a scream) is refused because it is missing here, not
 * because someone remembered to ban it. The first face is the safety face the
 * crisis window holds. Read by the crisis face hold (ui/face/crisis-face-hold.ts)
 * and the conductor's crisis pin (app/call/conductor-character.ts).
 *
 * No smile is listed. Whether the soft `warm` face may show is a product call
 * that has not been made.
 *
 * @module config/crisis-faces
 */

export const CRISIS_CALM_FACES = ['holdingSpace', 'empathetic', 'attentive', 'listening'] as const;

/**
 * Affect a face, presence or coach writer may play: the calm ones (`warm`, the
 * soft warmth pulse, and `glow`), then the playful ones the hold refuses.
 */
export type CrisisAffect =
  | 'warm'
  | 'glow'
  | 'squash' // hops, bounces, the double-take, the laugh/happy/surprise reactions, dancing to music
  | 'sparkle' // sparkles, the joy flash, the memory spark, the waveform's laugh particles
  | 'lamp' // the lamp's bounce, laugh shake and perk-up
  | 'tap-reaction' // laugh, wink and giggle when the avatar is tapped, and the rapid-tap "tickles"
  | 'celebration'; // overlays, confetti, the milestone pulse and celebrations, the celebration buzz

/** The only affect the crisis hold allows (the crisis lead, 2026-11-09). */
export const CRISIS_CALM_AFFECT: readonly CrisisAffect[] = ['warm', 'glow'];
