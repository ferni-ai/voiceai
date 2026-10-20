/**
 * Which numbers a verification code may go to: US and Canadian numbers only.
 * NANP shape is not enough: +1 also covers the Caribbean and the US
 * territories (their own regions, international rates), premium 900 and 976,
 * and unassigned codes. So a number must:
 *
 * - be written as +1, or with no country code at all (call-retry's toE164 never
 *   re-reads a "+" with another country code as +1: "+234 803 1234" is Nigeria);
 * - have a US or Canadian geographic area code (the area-code table in
 *   area-code-timezones.ts, minus Puerto Rico and the US Virgin Islands, plus
 *   Canada's 867), which excludes 900, N11, x11, 0xx/1xx and unassigned codes;
 * - not use a premium (976) or N11 exchange.
 *
 * @module services/outreach/us-ca-numbers
 */
import { usCaAreaCodes } from './area-code-timezones.js';
import { toE164 } from './call-retry.js';

/** Canada's northern code; not in the time-zone table (it spans several zones). */
const EXTRA_US_CA = ['867'];
const US_CA = new Set([...usCaAreaCodes(), ...EXTRA_US_CA]);
const PREMIUM = new Set(['900', '976']);

/** '+1NXXNXXXXXX' for a US or Canadian number, else null (never guessed). */
export function toUsCaE164(raw: string | undefined | null): string | null {
  // toE164 never re-reads a "+" with another country code as +1.
  const e164 = toE164(raw);
  if (!e164) return null;
  const area = e164.slice(2, 5);
  const exchange = e164.slice(5, 8);
  if (!US_CA.has(area)) return null; // also excludes 900, N11, x11 and unassigned codes
  if (PREMIUM.has(exchange) || /^[2-9]11$/.test(exchange)) return null;
  return e164;
}
