/**
 * Whether Ferni may dial a number on someone's behalf: telephony compliance,
 * the call read-back (telephony/call-confirm.ts), family check-in calls and
 * persona-voice calls (services/voice/persona-call-refusal.ts). Conversational
 * calls (scheduleProactiveCall) dial international numbers too, so they apply
 * only the emergency rule (emergencyDialRefusal).
 * No imports, so any layer can use it.
 *
 * @module utils/dialable-number
 */

export type DialCheck = { ok: true; e164: string; spoken: string } | { ok: false; reason: string };

const EMERGENCY_NUMBERS = new Set(['911', '112', '999', '000', '988', '933']);

/**
 * Why Ferni won't dial this emergency or N11 service number, in any spelling ("9-1-1",
 * "+1911", "1-988", "+44 999"), or null. Six digits or fewer can't be a phone Ferni
 * dials, so a short number ending in one (a country code in front) is that number.
 * The words go to the model: say plainly Ferni can't place the call, and keep the
 * crisis line and emergency number a crisis turn already gives (services/safety); no
 * copy of either number lives here.
 */
export function emergencyDialRefusal(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const number = digits.length >= 3 && digits.length <= 6 ? digits.slice(-3) : '';
  if (!EMERGENCY_NUMBERS.has(number) && !/^[2-9]11$/.test(number)) return null;
  return `${number} is an emergency or service number, and Ferni can't place emergency calls. Tell the caller plainly to dial ${number} themselves, and if they may be in crisis or in danger, still give them the crisis line and the emergency number`;
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
