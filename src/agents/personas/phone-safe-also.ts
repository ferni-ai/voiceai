/**
 * What a turn kept to the phone-safe set (shared/phone-safe-tools.ts) also keeps, by who is on it.
 *
 * A try-first visitor (synthetic-user.ts isAnonymousDemoUser) keeps every protected support tool
 * a member's turn offers: PROTECTED_TOOL_NAMES, the unverified turn's SAFETY_TOOLS among them.
 * None reads or acts on an account, and each one's writes are held for a demo id (minor-care.ts
 * userHeld, owner-write-gate.ts ownerWritesBlocked). PLACED_CALL_NOT_OWNER_PROOF: a call Ferni
 * placed keeps PLACED_CALL_ALSO_SAFE.
 *
 * @module agents/personas/phone-safe-also
 */
import { PROTECTED_TOOL_NAMES } from '../../tools/orchestrator/index.js';
import { isAnonymousDemoUser } from '../../utils/synthetic-user.js';
import { PLACED_CALL_ALSO_SAFE } from '../shared/phone-safe-tools.js';

/** `placedCall`: Ferni placed this session's call (caller-recognition.ts onPlacedCallSession). */
export function alsoSafe(
  userId: string | undefined,
  placedCall: boolean
): ReadonlySet<string> | undefined {
  if (isAnonymousDemoUser(userId)) return PROTECTED_TOOL_NAMES;
  return placedCall ? PLACED_CALL_ALSO_SAFE : undefined;
}
