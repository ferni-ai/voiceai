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
 * @module config/gmail-send-flag
 */

/** Env var that turns the feature on (must be exactly 'on'). */
export const GMAIL_SEND_AS_USER_ENV = 'GMAIL_SEND_AS_USER';

/** The provider id used by POST /auth/oauth/start. */
export const GMAIL_SEND_OAUTH_PROVIDER = 'gmail_send';

/** True only when the feature is on and the Google OAuth client is configured. */
export function isGmailSendAsUserEnabled(): boolean {
  return (
    process.env[GMAIL_SEND_AS_USER_ENV] === 'on' &&
    !!process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    !!process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  );
}
