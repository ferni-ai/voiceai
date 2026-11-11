/**
 * "Send email as me" on/off switch (server side).
 *
 * When GMAIL_SEND_AS_USER=on AND the Google OAuth app credentials
 * (GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET, the same client
 * the calendar connect uses) are set, a user can grant gmail.send ("send email
 * as me"). Otherwise POST /auth/oauth/start refuses the provider.
 *
 * Off by default: gmail.send is a Sensitive scope, and until Google verifies
 * the app every user sees the "unverified app" screen and the project is capped
 * at 100 users (docs/compliance/google-oauth-gmail/README.md).
 *
 * One person can have it before everyone: their own GMAIL_SEND_AS_USER=on
 * (a cohort or feature_flag_overrides/{uid}, read through personFlagOn) turns
 * it on for them alone, so Seth can record Google's verification demo while
 * the env stays off for every other user.
 *
 * @module config/gmail-send-flag
 */

import { isGoogleCalendarOAuthConfigured } from './google-calendar-oauth-env.js';
import { personFlagOn } from './person-flag.js';

/** Env var that turns the feature on (must be exactly 'on'). */
export const GMAIL_SEND_AS_USER_ENV = 'GMAIL_SEND_AS_USER';

/** The provider id used by POST /auth/oauth/start. */
export const GMAIL_SEND_OAUTH_PROVIDER = 'gmail_send';

/** True only when the feature is on for everyone and the Google OAuth client is configured. */
function isGmailSendAsUserEnabled(): boolean {
  return (
    process.env[GMAIL_SEND_AS_USER_ENV] === 'on' && isGoogleCalendarOAuthConfigured()
  );
}

/**
 * True when the feature is on for everyone, or the Google OAuth client is
 * configured and this person's own GMAIL_SEND_AS_USER is on. Without a user,
 * the env alone decides. A failed per-person read counts as off. Never throws.
 */
export async function isGmailSendAsUserEnabledFor(
  userId: string | null | undefined
): Promise<boolean> {
  if (isGmailSendAsUserEnabled()) return true;
  if (!userId || !isGoogleCalendarOAuthConfigured()) return false;
  // An empty env: only the person's own value can turn it on here.
  return personFlagOn(userId, 'GMAIL_SEND_AS_USER', {});
}
