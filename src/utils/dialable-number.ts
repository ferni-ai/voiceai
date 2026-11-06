/**
 * Whether Ferni may dial a number on someone's behalf: telephony compliance,
 * the call read-back (telephony/call-confirm.ts) and family check-in calls.
 * No imports, so any layer can use it.
 *
 * @module utils/dialable-number
 */

export type DialCheck = { ok: true; e164: string; spoken: string } | { ok: false; reason: string };

const EMERGENCY_NUMBERS = new Set(['911', '112', '999', '000', '988', '933']);

/** Whether the digits are an emergency, crisis or N11 number (911, 988, 311): the caller dials it. */
export function isEmergencyNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return EMERGENCY_NUMBERS.has(digits) || /^[2-9]11$/.test(digits);
}

/**
 * Emergency services by name, in lower-case text. Not "the police report", "the
 * emergency vet", "the emergency room". The action-claim guard reads Ferni's
 * emergency claims with it too (agents/personas/emergency-claim.ts).
 */
export const EMERGENCY_SERVICE =
  '(?<![\\w-])(?:(?:an|the) )?(?:ambulance|paramedics|emts?|ems|police|cops|fire (?:department|brigade)|emergency services|emergency(?! contacts?\\b)|authorities|9[- ]?1[- ]?1|nine[- ]one[- ]one|999|112)\\b(?![- ](?:report|number|non-emergency|vet|room|station)\\b)';
/** A crisis line by name: "the suicide hotline", "a crisis text line", "the lifeline". */
const CRISIS_LINE = '\\b(?:(?:crisis|suicide)(?: text| hot| help)? ?line|lifeline)\\b';
const SERVICE_NAMED = new RegExp(`${EMERGENCY_SERVICE}|${CRISIS_LINE}`);

/** Whether whom a call is asked for is emergency services or a crisis line, by name or number. */
export function namesEmergencyService(who: string): boolean {
  return isEmergencyNumber(who) || SERVICE_NAMED.test(who.toLowerCase());
}

/** Why Ferni won't call one, as every tool says it: "911 is an emergency or service number, ...". */
export function dialItThemselves(what: string): string {
  return `${what} is an emergency or service number, so the caller should dial it themselves`;
}

/**
 * Whether Ferni may dial this number on someone's behalf. Mirrors how the
 * orchestrator normalizes (digits only, US +1): 10 digits, or 11 starting
 * with 1, with a real area code. Never emergency/N11 or premium-rate numbers.
 */
export function checkDialableNumber(raw: string): DialCheck {
  const digits = raw.replace(/\D/g, '');
  if (isEmergencyNumber(digits)) {
    return {
      ok: false,
      reason: dialItThemselves(digits),
    };
  }
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
