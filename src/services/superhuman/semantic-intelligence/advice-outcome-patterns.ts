/**
 * Advice outcome patterns: what a caller says when reporting back on advice.
 *
 * Read by detectAdviceOutcome in integration.ts. Kept in its own file so
 * integration.ts stays under its size limit.
 */

/**
 * Patterns that indicate user is talking about following advice.
 */
export const FOLLOW_THROUGH_PATTERNS = [
  /\bi tried\b/i,
  /\bi did what you/i,
  /\byou suggested\b.*\bi\b/i,
  /\btook your advice\b/i,
  /\bfollowed your\b/i,
  /\bdid the thing\b/i,
  /\bactually did\b/i,
  /\bfinally did\b/i,
  /\bwent ahead and\b/i,
];

export const NOT_FOLLOW_PATTERNS = [
  /\bdidn't try\b/i,
  /\bcouldn't do\b/i,
  /\bdidn't do\b/i,
  /\bnever got around\b/i,
  /\bforgot to\b/i,
  /\bdidn't follow\b/i,
  /\bignored your\b/i,
];

export const POSITIVE_OUTCOME_PATTERNS = [
  /\bit worked\b/i,
  /\bhelped\b/i,
  /\bfeel(s|ing)? better\b/i,
  /\bmade a difference\b/i,
  /\bso glad\b/i,
  /\bthank(s| you)\b/i,
  /\bwas right\b/i,
  /\bgreat advice\b/i,
  /\bworked out\b/i,
];

export const NEGATIVE_OUTCOME_PATTERNS = [
  /\bdidn't work\b/i,
  /\bdidn't help\b/i,
  /\bmade (it )?worse\b/i,
  /\bbackfired\b/i,
  /\bstill (feel|feeling)\b/i,
  /\bno difference\b/i,
  /\bwaste of time\b/i,
];
