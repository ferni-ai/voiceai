/**
 * A display name that names a device or a generated handle is not the caller's name.
 *
 * Prod 2026-10-18 (#2061): a new caller on the iPhone app was greeted "Hey iphone,
 * good afternoon." The client sent `iphone` as the display name, and isRealName
 * (user-identification-handler.ts) only rejected `user_123`, UUIDs and a few
 * exact words. The token route's guest names (`guest-ab12cd`, routes/token.ts) and
 * the native iOS client's (`ios-6e193758`) got through the same way.
 *
 * Behind DEVICE_NAME_GUARD (flag-manifest.ts), off by default. When it's on, these
 * names count as no name, so Ferni asks instead of guessing.
 *
 * Whole-name matches only: "Iris" or "Phoenix" are names, "iphone" is not.
 *
 * @module agents/voice-agent/device-name-guard
 */
import { flagOn, type Env } from '../../config/env-flag.js';

const DEVICE_WORDS = new Set([
  'iphone',
  'ipad',
  'ipod',
  'ios',
  'android',
  'mobile',
  'phone',
  'tablet',
  'device',
  'web',
  'browser',
  'desktop',
  'macbook',
  'iphone user',
  'android user',
  'my iphone',
  'my phone',
]);

const HANDLE_PREFIX = '(?:guest|ios|iphone|ipad|android|web|mobile|device|visitor|anon)';
/** `guest-ab12cd`, `ios-6e193758`, `web_xkqzpa`: a prefix, a dash or underscore, a generated tail. */
const SEPARATED_HANDLE = new RegExp(`^${HANDLE_PREFIX}[-_][a-z0-9]+$`);
/** `guest 2`, `iphone12`: a prefix and a tail with a digit in it ("Webster" stays a name). */
const NUMBERED_HANDLE = new RegExp(`^${HANDLE_PREFIX} ?[a-z]*\\d[a-z0-9]*$`);
/** The default device name: "Seth's iPhone", "Ana's Galaxy". It names the phone, not the caller. */
const OWNERS_DEVICE = /^.+['’]s (?:iphone|ipad|phone|android|galaxy|pixel|macbook|computer|pc)$/;

export function deviceNameGuardEnabled(env: Env = process.env): boolean {
  return flagOn('DEVICE_NAME_GUARD', env);
}

/** True when the name is a device/platform word or a generated handle, not a person's name. */
export function isDeviceOrHandleName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (DEVICE_WORDS.has(normalized)) return true;
  return (
    SEPARATED_HANDLE.test(normalized) ||
    NUMBERED_HANDLE.test(normalized) ||
    OWNERS_DEVICE.test(normalized)
  );
}
