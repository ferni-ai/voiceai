/**
 * The public URLs we give Twilio for callbacks, and the origins a Twilio
 * signature is checked against.
 *
 * Twilio signs the exact URL it was given. Behind Firebase Hosting the request
 * reaches Cloud Run with the run.app Host, so a URL rebuilt from request
 * headers never matches what Twilio signed, and every callback was refused
 * (#2679). The origin therefore comes from our own configuration, never from
 * the request.
 *
 * @module services/outreach/webhooks/twilio-callback-url
 */

/** APP_URL's fallback: conversational calls and the numbers' webhooks use it. */
const DEFAULT_APP_ORIGIN = 'https://app.ferni.ai';
/** WEBHOOK_BASE_URL's fallback: group calls use it (multi-agent-mode.ts). */
const DEFAULT_WEBHOOK_ORIGIN = 'https://api.ferni.ai';

function originOf(value: string): string | null {
  try {
    const { origin } = new URL(value);
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/** Every public origin we hand Twilio callback URLs on, APP_URL's first. */
export function twilioCallbackOrigins(): string[] {
  const configured = [
    process.env.APP_URL || DEFAULT_APP_ORIGIN,
    process.env.WEBHOOK_BASE_URL || DEFAULT_WEBHOOK_ORIGIN,
  ];
  const origins = configured.map(originOf).filter((o): o is string => o !== null);
  return [...new Set(origins)];
}

/** The URL to give Twilio for `path`: one the signature check accepts. */
export function twilioCallbackUrl(path: string): string {
  return `${twilioCallbackOrigins()[0] ?? DEFAULT_APP_ORIGIN}${path}`;
}
