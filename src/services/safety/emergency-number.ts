/**
 * The US emergency number, for code that must recognise it in text (the
 * unverified owner-message filter exempts it, owner-message-content.ts). Kept
 * out of CRISIS_RESOURCES on purpose: nothing that reads that list changes.
 * Its own file because crisis-response.ts is over the 500-line limit.
 *
 * @module services/safety/emergency-number
 */
export const EMERGENCY_NUMBER = '911';
