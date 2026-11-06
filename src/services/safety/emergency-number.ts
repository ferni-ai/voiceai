/**
 * The US emergency number, for code that must recognise it in text (the
 * unverified owner-message filter exempts it, owner-message-content.ts), and
 * emergency services by name. Kept out of CRISIS_RESOURCES on purpose: nothing
 * that reads that list changes.
 * Its own file because crisis-response.ts is over the 500-line limit.
 *
 * @module services/safety/emergency-number
 */
export const EMERGENCY_NUMBER = '911';

/**
 * Emergency services by name, as a regex source for lower-case text. Not "the
 * police report", "the emergency vet", "the emergency room". The action-claim
 * guard reads Ferni's emergency claims with it (agents/personas/emergency-claim.ts),
 * and scheduleCall reads whom a call is for (help-line-who.ts).
 */
export const EMERGENCY_SERVICE =
  '(?<![\\w-])(?:(?:an|the) )?(?:ambulance|paramedics|emts?|ems|police|cops|fire (?:department|brigade)|emergency services|emergency(?! contacts?\\b)|authorities|9[- ]?1[- ]?1|nine[- ]one[- ]one|999|112)\\b(?![- ](?:report|number|non-emergency|vet|room|station)\\b)';
