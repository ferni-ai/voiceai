/**
 * Identifiers recognised by shape and checksum (#2385): card numbers (Luhn), Social
 * Security numbers, routing numbers (ABA) and API keys. Pure: no flag, no logging.
 * spoken-credential.ts reads facts with these and re-exports them.
 *
 * @module memory/identifier-shapes
 */

/**
 * Secrets that are not codes or passwords: a card number (Luhn-checked), a Social
 * Security number, a bank account or routing number (ABA-checked), an API key or token.
 * A mother's maiden name given as one counts as a security answer.
 */
export type IdentifierCategory = 'card-number' | 'ssn' | 'bank-account' | 'api-key';

/** Luhn checksum over a run of digits. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return /^\d{13,19}$/.test(digits) && sum % 10 === 0;
}

const ABA_WEIGHTS = [3, 7, 1] as const;
export const abaValid = (d: string): boolean =>
  /^\d{9}$/.test(d) &&
  [...d].reduce((s, c, i) => s + Number(c) * (ABA_WEIGHTS[i % 3] ?? 0), 0) % 10 === 0;

/** Never issued: area 000, 666 or 9xx, group 00, serial 0000. */
export const ssnValid = (d: string): boolean =>
  /^(?!000|666|9)\d{3}(?!00)\d{2}(?!0000)\d{4}$/.test(d);

/** Secrets recognised by shape alone, wherever they appear. */
const CARD = /(?<![\w-])[2-6](?:[ -]?\d){12,18}(?![\w-])/g;
const SSN = /(?<![\w-])\d{3}-\d{2}-\d{4}(?![\w-])/g;
const API_KEY =
  /\b(?:(?:sk|rk)[-_](?:live[-_]|test[-_]|proj[-_]|ant[-_])?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_\w{30,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[\w-]{35}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})/g;

export interface Span {
  start: number;
  end: number;
}

/** Card numbers, dashed SSNs and API keys in `text`, by shape and checksum. */
export function shapedSecrets(text: string): Array<Span & { category: IdentifierCategory }> {
  const found: Array<Span & { category: IdentifierCategory }> = [];
  for (const m of text.matchAll(CARD)) {
    // A card read out with its CVV after it: try the whole run, then the usual lengths
    const at = m.index ?? 0;
    const digitEnds = [...m[0]].flatMap((c, i) => (/\d/.test(c) ? [i + 1] : []));
    const len = [digitEnds.length, 16, 15].find(
      (n) => n <= digitEnds.length && luhnValid(m[0].replace(/\D/g, '').slice(0, n))
    );
    if (len !== undefined)
      found.push({ start: at, end: at + (digitEnds[len - 1] ?? 0), category: 'card-number' });
  }
  for (const m of text.matchAll(SSN)) {
    if (ssnValid(m[0].replace(/\D/g, ''))) {
      found.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, category: 'ssn' });
    }
  }
  for (const m of text.matchAll(API_KEY)) {
    found.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, category: 'api-key' });
  }
  return found;
}
