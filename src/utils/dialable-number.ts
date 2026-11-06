/**
 * Whether Ferni may dial a number on someone's behalf: telephony compliance,
 * the call read-back (telephony/call-confirm.ts), family check-in calls and
 * persona-voice calls (services/voice/persona-call-refusal.ts). Conversational
 * calls (scheduleProactiveCall) dial international numbers too, so they apply
 * only the emergency rule (emergencyDialRefusal).
 * Its one import is the safety kernel's in-danger words, a constants module, so the
 * layer map places this file with the safety rules (L3:judgment); code outside them
 * at L4 reads it through services/safety's index.
 *
 * @module utils/dialable-number
 */

import { IN_DANGER_NOW } from '../services/safety/crisis-guard-replies.js';

export type DialCheck = { ok: true; e164: string; spoken: string } | { ok: false; reason: string };

const EMERGENCY_NUMBERS = new Set(['911', '112', '999', '000', '988', '933']);

/**
 * Why Ferni won't dial this emergency or N11 service number, in any spelling ("9-1-1",
 * "+1911", "1-988", "+44 999"), or null. Six digits or fewer can't be a phone Ferni
 * dials, so a short number ending in one (a country code in front) is that number.
 * The words go to the model. An emergency number keeps the kernel's in-danger words
 * (services/safety), so a caller in crisis still hears where to turn; a service number
 * (311, 711, ...) is plain, with no crisis framing. No trailing full stop: each path adds
 * its own.
 */
export function emergencyDialRefusal(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const number = digits.length >= 3 && digits.length <= 6 ? digits.slice(-3) : '';
  if (EMERGENCY_NUMBERS.has(number)) {
    return `${number} is an emergency number, and Ferni can't place emergency calls. Tell the caller plainly to dial ${number} themselves. If they may be in danger right now, tell them: ${IN_DANGER_NOW.replace(/\.$/, '')}`;
  }
  if (/^[2-9]11$/.test(number)) {
    return `${number} is a service number Ferni can't dial, so tell the caller to dial ${number} themselves`;
  }
  return null;
}

/**
 * Whether Ferni may dial this number on someone's behalf. Mirrors how the
 * orchestrator normalizes (digits only, US +1): 10 digits, or 11 starting
 * with 1, with a real area code. Never emergency/N11 or premium-rate numbers.
 */
export function checkDialableNumber(raw: string): DialCheck {
  const emergency = emergencyDialRefusal(raw);
  if (emergency) return { ok: false, reason: emergency };
  const digits = raw.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10 || !/^[2-9]\d{2}/.test(national) || /^[2-9]11/.test(national)) {
    return { ok: false, reason: `"${raw}" isn't a valid US phone number` };
  }
  if (national.startsWith('900') || national.slice(3, 6) === '976') {
    return { ok: false, reason: `"${raw}" is a premium-rate number, which I won't dial` };
  }
  const spoken = `${national.slice(0, 3)}-${national.slice(3, 6)}-${national.slice(6)}`;
  return { ok: true, e164: `+1${national}`, spoken };
}
