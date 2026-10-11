/**
 * The subscription a voice-eval caller starts with (EVAL_TIER). Pure: no Firestore.
 *
 * A fresh eval user is a free newcomer, so every teammate but Ferni is locked and no
 * handoff can be proven. EVAL_TIER=partner gives that one synthetic user the tier that
 * unlocks the whole team, through the same profile field a real subscriber has: no
 * global bypass secret, nothing that changes what real callers get.
 */
import { EVAL_PREFIX } from './eval-users.js';

export const EVAL_TIERS = ['free', 'friend', 'partner'] as const;
export type EvalTier = (typeof EVAL_TIERS)[number];

/** Why this uid and tier can't be seeded, or null when they can. */
export function seedTierRefusal(uid: string, tier: string): string | null {
  if (!uid.startsWith(EVAL_PREFIX) || uid.length <= EVAL_PREFIX.length) {
    return `only ${EVAL_PREFIX}* users can be seeded (got: ${uid})`;
  }
  if (!(EVAL_TIERS as readonly string[]).includes(tier)) {
    return `tier must be one of ${EVAL_TIERS.join(', ')} (got: ${tier})`;
  }
  return null;
}
