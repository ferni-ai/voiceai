/**
 * The only faces Ferni may show while someone is in crisis.
 *
 * An allow-list, so it fails closed: a face nobody thought of (a laugh, a
 * kiss, an eye-roll, a scream) is refused because it is missing here, not
 * because someone remembered to ban it. The first entry is the safety face the
 * crisis window holds. Read by the crisis face hold (ui/face/crisis-face-hold.ts)
 * and the conductor's crisis pin (app/call/conductor-character.ts).
 *
 * No smile is listed. Whether the soft `warm` face may show is a product call
 * that has not been made.
 *
 * @module config/crisis-faces
 */

export const CRISIS_CALM_FACES = ['holdingSpace', 'empathetic', 'attentive', 'listening'] as const;
