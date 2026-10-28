/**
 * GET /api/app-config/ios: the iPhone app's minimum build and its crisis-mode
 * switch (docs/api/app-config-ios.md).
 *
 * Public (no auth, no user data) and cacheable for 5 minutes. The values are
 * the env vars IOS_MIN_BUILD (a positive whole number) and IOS_MIN_BUILD_MESSAGE.
 * Anything unset or malformed reads as null, and a route that can't answer
 * never blocks anyone: the client only holds a build it knows is below a minimum
 * it knows. It can force an update; otherwise it never reveals or hides UI.
 *
 * The one exception is `crisisMode`, a safety kill switch. Crisis mode (988 up
 * front, a calm goodbye, no celebration) ships ON in the app; iOS has no other
 * remote flags, so this is how it is turned off without an app update if false
 * alarms show up. It is false only when IOS_CRISIS_MODE is exactly "off"
 * (trimmed, any case). Unset, a typo or any other word keeps it true: a
 * misconfigured switch must never take the safety UI away.
 *
 * @module api/app-config-ios
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { sendJSONEdgeCached } from './helpers.js';

export const APP_CONFIG_IOS_PATH = '/api/app-config/ios';
export const APP_CONFIG_IOS_MAX_AGE_SECONDS = 300;
export const MESSAGE_MAX_CHARS = 280;

export interface AppConfigIos {
  minimumBuild: number | null;
  message: string | null;
  crisisMode: boolean;
}

type Env = Record<string, string | undefined>;

/** A positive whole number of at most 9 digits ("1234"), else null. Not "12.5", "-3", "1e3", "0x10" or ""... */
function minimumBuild(raw: string | undefined): number | null {
  const text = raw?.trim();
  if (!text || !/^\d{1,9}$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}

/** One line of plain text up to MESSAGE_MAX_CHARS, else null. */
function message(raw: string | undefined): string | null {
  const text = (raw ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, MESSAGE_MAX_CHARS) : null;
}

/** False only for "off" (trimmed, any case); anything else keeps the safety UI on. */
function crisisMode(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() !== 'off';
}

export function appConfigIos(env: Env = process.env): AppConfigIos {
  return {
    minimumBuild: minimumBuild(env.IOS_MIN_BUILD),
    message: message(env.IOS_MIN_BUILD_MESSAGE),
    crisisMode: crisisMode(env.IOS_CRISIS_MODE),
  };
}

/** Answers GET /api/app-config/ios; false for anything else. */
export function handleAppConfigIos(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  env: Env = process.env
): boolean {
  if (pathname !== APP_CONFIG_IOS_PATH || req.method !== 'GET') return false;
  sendJSONEdgeCached(res, appConfigIos(env), APP_CONFIG_IOS_MAX_AGE_SECONDS);
  return true;
}
