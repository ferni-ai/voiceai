/**
 * The booking-prefs fields (booking-prefs-store.ts): what is stored, each typed and bounded,
 * and nothing else.
 *
 * - kind: dentist | doctor | restaurant | salon | general (bookingKindOf maps free text);
 * - days: mon..sun; windows: early_morning (before 9) | morning (9-12) | midday (12-2) |
 *   afternoon (2-5) | evening (after 5); earliest and latest: "HH:MM", 24-hour;
 * - askFor: a name ("Dr. Lee"): 1 to 4 words of letters, apostrophes, hyphens and periods,
 *   at most 40 characters (a period only ends a word), no digit, and no word instructions are made of ("always", "book",
 *   "ignore", "system", "you"...). Anything else is refused whole, never cut;
 * - restaurants only: partySize 1 to 20, seating indoor | outdoor | window | booth | bar | quiet;
 * - dentist, doctor, general: insurance, one canonical carrier name from a closed list
 *   (CARRIERS) matched in the text. No match, or two carriers, stores nothing; the text
 *   itself (a member id, a group or policy number, a name) is never stored;
 * - updatedAt, and per field who said it (said_by_owner | inferred) and when. An inferred
 *   value never replaces one the owner said.
 *
 * There is no free-text field (no notes): lexical screens for free text never converge.
 *
 * @module services/stores/booking-prefs-fields
 */

const KINDS = ['dentist', 'doctor', 'restaurant', 'salon', 'general'] as const;
export type BookingKind = (typeof KINDS)[number];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const WINDOWS = ['early_morning', 'morning', 'midday', 'afternoon', 'evening'] as const;
const SEATING = ['indoor', 'outdoor', 'window', 'booth', 'bar', 'quiet'] as const;
export const FIELDS = [
  'days',
  'windows',
  'earliest',
  'latest',
  'askFor',
  'partySize',
  'seating',
  'insurance',
] as const;
type Field = (typeof FIELDS)[number];
export type Provenance = 'said_by_owner' | 'inferred';

/** Canonical carrier name -> the words that name it (lower case, whole words) */
const CARRIERS: Readonly<Record<string, readonly string[]>> = {
  Aetna: ['aetna'],
  Ambetter: ['ambetter'],
  Anthem: ['anthem blue cross', 'anthem'],
  'Blue Cross Blue Shield': ['blue cross blue shield', 'bcbs', 'blue cross', 'blue shield'],
  CareSource: ['caresource'],
  Cigna: ['cigna'],
  'Delta Dental': ['delta dental'],
  'Health Net': ['health net'],
  Highmark: ['highmark'],
  Humana: ['humana'],
  'Kaiser Permanente': ['kaiser permanente', 'kaiser'],
  Medicaid: ['medicaid'],
  Medicare: ['medicare'],
  MetLife: ['metlife'],
  'Molina Healthcare': ['molina healthcare', 'molina'],
  'Oscar Health': ['oscar health'],
  Tricare: ['tricare'],
  UnitedHealthcare: ['unitedhealthcare', 'united healthcare', 'united health care', 'uhc'],
  WellCare: ['wellcare'],
};
/** Longest first, so "anthem blue cross" is Anthem, not also Blue Cross Blue Shield */
const ALIASES = Object.entries(CARRIERS)
  .flatMap(([name, words]) => words.map((w) => [w, name] as const))
  .sort((a, b) => b[0].length - a[0].length);

/** Words instructions are made of; a name holding one is refused ("always book the suite") */
const INSTRUCTION_WORDS = new Set(
  (
    'a about above act after all always and any approve as ask assistant at be book booking ' +
    'call can cancel charge com confirm developer disregard does dot every everything ' +
    'for forget from give http https ignore in instead instruction instructions is it make ' +
    'me must my never new next not now of on only or override pay please pretend previous ' +
    'prompt reply rule rules say says send should slash system tell than that the them ' +
    'then this time to update upgrade use when with www yes you your'
  ).split(' ')
);
const MAX_NAME_CHARS = 40;
const MAX_NAME_WORDS = 4;
/** A word of a name: letters, apostrophes and hyphens, and a period only at its end ("Dr.") */
const NAME_WORD = /^\p{L}[\p{L}'’-]*\.?$/u;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface Prefs {
  days?: Array<(typeof DAYS)[number]>;
  windows?: Array<(typeof WINDOWS)[number]>;
  earliest?: string;
  latest?: string;
  askFor?: string;
  partySize?: number;
  seating?: (typeof SEATING)[number];
  insurance?: string;
}

export interface BookingPrefs extends Prefs {
  kind: BookingKind;
  updatedAt: string;
  provenance: Partial<Record<Field, { by: Provenance; at: string }>>;
}

/** What a caller hands remember: anything, since it comes from a model; each field is checked */
export type PrefsInput = Readonly<Partial<Record<Field, unknown>>>;

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
export const isKind = (x: unknown): x is BookingKind => KINDS.includes(x as BookingKind);
export const isProvenance = (x: unknown): x is Provenance =>
  x === 'said_by_owner' || x === 'inferred';
/** Fold look-alikes (NFKC), drop zero-width and bidi characters, one space between words */
const fold = (s: string): string =>
  s
    .normalize('NFKC')
    .replace(/\p{Cf}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/** A name to ask for, or undefined: 1 to 4 name-shaped words, no digit, no instruction word */
function nameOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = fold(raw);
  const words = name.split(' ');
  if (!name || name.length > MAX_NAME_CHARS || words.length > MAX_NAME_WORDS) return undefined;
  if (!words.every((w) => NAME_WORD.test(w))) return undefined;
  const plain = (w: string): string => w.toLowerCase().replace(/[.'’-]+/g, '');
  return words.some((w) => INSTRUCTION_WORDS.has(plain(w))) ? undefined : name;
}

/** The one carrier the text names, as its canonical name; none or two: undefined */
function carrierOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  let text = ` ${fold(raw)
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, ' ')} `;
  const found = new Set<string>();
  for (const [alias, name] of ALIASES) {
    if (!text.includes(` ${alias} `)) continue;
    found.add(name);
    text = text.split(` ${alias} `).join('  ');
  }
  return found.size === 1 ? [...found][0] : undefined;
}

function listOf<T extends string>(allowed: readonly T[], raw: unknown): T[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const kept = [...new Set(raw.filter((x): x is T => allowed.includes(x as T)))];
  return kept.length > 0 ? kept : undefined;
}

/** The fields this kind keeps, each checked; anything else is left out */
export function clean(kind: BookingKind, raw: PrefsInput): Prefs {
  const dining = kind === 'restaurant';
  const { partySize: size, seating, earliest, latest } = raw;
  const prefs: Prefs = {
    days: listOf(DAYS, raw.days),
    windows: listOf(WINDOWS, raw.windows),
    earliest: typeof earliest === 'string' && CLOCK.test(earliest) ? earliest : undefined,
    latest: typeof latest === 'string' && CLOCK.test(latest) ? latest : undefined,
    askFor: nameOf(raw.askFor),
    partySize:
      dining && typeof size === 'number' && Number.isInteger(size) && size >= 1 && size <= 20
        ? size
        : undefined,
    seating: dining ? SEATING.find((s) => s === seating) : undefined,
    insurance: dining || kind === 'salon' ? undefined : carrierOf(raw.insurance),
  };
  // Firestore refuses undefined values: a field left out is absent, not undefined
  for (const f of FIELDS) if (prefs[f] === undefined) delete prefs[f];
  return prefs;
}

/** A stored document, read as defensively as it is written */
export function toPrefs(kind: BookingKind, data: Record<string, unknown>): BookingPrefs {
  const fields = clean(kind, data);
  const raw = isRecord(data.provenance) ? data.provenance : {};
  const provenance: BookingPrefs['provenance'] = {};
  for (const f of FIELDS) {
    const p = raw[f];
    if (f in fields && isRecord(p) && isProvenance(p.by) && typeof p.at === 'string')
      provenance[f] = { by: p.by, at: p.at };
  }
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : '';
  return { ...fields, kind, updatedAt, provenance };
}

/** `next` merged over `current`, field by field; null when nothing would change */
export function merged(
  current: BookingPrefs,
  next: Prefs,
  by: Provenance,
  at: string
): BookingPrefs | null {
  const out: BookingPrefs = { ...current, provenance: { ...current.provenance } };
  let changed = false;
  for (const f of FIELDS) {
    if (!(f in next)) continue;
    if (by === 'inferred' && current.provenance[f]?.by === 'said_by_owner') continue;
    Object.assign(out, { [f]: next[f] });
    out.provenance[f] = { by, at };
    changed = true;
  }
  return changed ? { ...out, updatedAt: at } : null;
}

/** The kind of place a booking is for, from free text ("my dentist", "dinner at Luigi's") */
export function bookingKindOf(text: string): BookingKind {
  const t = text.toLowerCase();
  if (/\b(dentist|dental|teeth|tooth|orthodontist|hygienist)\b/.test(t)) return 'dentist';
  if (/\b(doctor|dr|physician|pediatrician|dermatologist|clinic|check-?up|physical)\b/.test(t))
    return 'doctor';
  if (/\b(salon|haircut|hair|barber|stylist|nails|manicure|pedicure|spa|massage)\b/.test(t))
    return 'salon';
  if (/\b(restaurant|table|dinner|lunch|brunch|breakfast|reservation|bistro|cafe)\b/.test(t))
    return 'restaurant';
  return 'general';
}
