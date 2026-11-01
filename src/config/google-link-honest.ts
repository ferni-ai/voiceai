/**
 * GOOGLE_LINK_HONEST: the Google link tells the truth about what it can do.
 *
 * Ferni asks Google for the calendar only. Gmail read needs Google's restricted
 * scope review (CASA), which is not planned, so a Gmail call always meets a 403.
 * On: that 403 is "not permitted", never an empty inbox, and a connect where the
 * user unticked the calendar box is stored as insufficient_scope, not as a working
 * link. Off (default): all as before. Whether the Gmail read tools are offered at
 * all is GMAIL_READ_TOOLS (services/gmail/gmail-honesty.ts).
 *
 * @module config/google-link-honest
 */

import { flagOn } from './env-flag.js';

export function isGoogleLinkHonest(): boolean {
  return flagOn('GOOGLE_LINK_HONEST');
}
