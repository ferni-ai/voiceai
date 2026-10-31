/**
 * House facts: what is true about Ferni itself, read from the config that makes
 * it true. The prompt states these and the reply guard checks against them
 * (agents/personas/house-facts.ts), so Ferni never makes up his own website or
 * the address his texts and emails come from (#3001).
 *
 * Each value comes from the one place that decides it; an unset one is left out,
 * and Ferni says he doesn't have it rather than guess:
 * - website, web app: LANDING_URL and APP_URL (api-urls.ts);
 * - texts: TWILIO_PHONE_NUMBER, the number every text to a member is sent from;
 * - email: EMAIL_FROM, the Workspace From address (docs/runbooks/email-via-workspace.md).
 *
 * @module config/house-facts
 */
import { APP_URL, LANDING_URL } from './api-urls.js';
import type { Env } from './env-flag.js';

export interface HouseFacts {
  /** The public website's host, e.g. "ferni.ai". */
  website?: string;
  /** Where the app runs on the web, e.g. "app.ferni.ai". */
  webApp?: string;
  /** The number texts come from, as configured (E.164). */
  textsFrom?: string;
  /** The address app email comes from. */
  emailFrom?: string;
}

/** The From address set for app email, or undefined when none is set. */
export function configuredEmailFrom(env: Env = process.env): string | undefined {
  return env.EMAIL_FROM?.trim() || undefined;
}

/** A public https host; a local or malformed URL is no fact to tell a caller. */
function publicHost(url: string): string | undefined {
  if (!URL.canParse(url)) return undefined;
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' && hostname.includes('.') ? hostname : undefined;
}

export function houseFacts(env: Env = process.env): HouseFacts {
  return {
    website: publicHost(LANDING_URL),
    webApp: publicHost(APP_URL),
    textsFrom: env.TWILIO_PHONE_NUMBER?.trim() || undefined,
    emailFrom: configuredEmailFrom(env),
  };
}
