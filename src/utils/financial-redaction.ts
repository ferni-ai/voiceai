/**
 * Financial secret redaction.
 *
 * Ferni may remember that someone is paying down a credit card; it must never
 * remember the card number. This runs before anything is written to memory
 * (finance memory, extracted facts): card numbers, bank account and routing
 * numbers, IBANs, social security numbers, passwords, PINs, CVVs and security
 * answers are replaced with a short placeholder.
 *
 * Two levels:
 * - default: specific patterns (Luhn-valid card numbers, SSN format, and
 *   numbers or words right after "account number", "routing", "PIN",
 *   "password", "maiden name", ...). Safe for any memory text, so a phone
 *   number in an ordinary fact is left alone.
 * - strict: also any long run of digits (8+, not a currency amount). Used for
 *   money memory, where a long number is never something worth keeping.
 *
 * Pure, no I/O. Transcripts are not changed here; this only keeps secrets out
 * of what memory copies from them.
 *
 * @module utils/financial-redaction
 */

export type FinancialSecretKind =
  | 'card_number'
  | 'account_number'
  | 'routing_number'
  | 'iban'
  | 'ssn'
  | 'password'
  | 'pin'
  | 'cvv'
  | 'security_answer'
  | 'long_number';

export interface RedactionResult {
  readonly text: string;
  readonly kinds: readonly FinancialSecretKind[];
}

export const REDACTED = '[removed]';

const SEP = '[ \\t.-]?';

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

interface Rule {
  readonly kind: FinancialSecretKind;
  readonly pattern: RegExp;
  /** Replace the whole match, or only the captured value (group `v`). */
  readonly accept?: (match: string) => boolean;
}

/** Words that introduce a secret value: the value after them is removed. */
const VALUE_RULES: readonly Rule[] = [
  {
    kind: 'password',
    pattern:
      /\b(?:pass(?:word|code|phrase)|log-?in|online banking login)(?:'s|\s+is|\s+was|\s*[:=])\s*["']?(?<v>[^\s"',;]+)/gi,
  },
  {
    kind: 'pin',
    pattern: /\bpin(?:\s*(?:number|code))?(?:'s|\s+is|\s+was|\s*[:=]|\s+)\s*(?<v>\d{3,8})\b/gi,
  },
  {
    kind: 'cvv',
    pattern: /\b(?:cvv2?|cvc|csc|security code)(?:'s|\s+is|\s*[:=]|\s+)\s*(?<v>\d{3,4})\b/gi,
  },
  {
    kind: 'security_answer',
    pattern:
      /\b(?:mother'?s maiden name|maiden name|security (?:question|answer)s?|secret (?:question|answer)|first pet'?s name|name of my first (?:pet|school))(?:'s|\s+is|\s+was|\s*[:=])\s*(?<v>[^.,;!?\n]{1,60})/gi,
  },
  {
    kind: 'ssn',
    pattern:
      /\b(?:ssn|social security(?: number)?|social insurance(?: number)?|national insurance(?: number)?|tax id|tin)(?:'s|\s+is|\s*[:#=]|\s+)\s*(?:number\s+)?(?<v>[A-Z]{0,2}[\d][\d -]{6,12}\d[A-Z]?)\b/gi,
  },
  {
    kind: 'routing_number',
    pattern:
      /\b(?:routing|aba|sort code|transit|bsb)(?:\s*(?:number|no\.?|#|code))?(?:'s|\s+is|\s*[:#=]|\s+)\s*(?<v>\d[\d -]{4,14}\d)\b/gi,
  },
  {
    kind: 'account_number',
    pattern:
      /\b(?:account|acct|a\/c|card|member(?:ship)?|policy|loan)(?:\s*(?:number|no\.?|#|num))(?:'s|\s+is|\s*[:#=]|\s+)\s*(?<v>[A-Z0-9][A-Z0-9 -]{2,30}\d)\b/gi,
  },
  {
    kind: 'account_number',
    pattern: /\b(?:bank\s+)?account(?:'s|\s+is|\s*[:#=])\s*(?<v>\d[\d -]{4,}\d)\b/gi,
  },
  {
    kind: 'account_number',
    pattern:
      /\b(?:ending in|ends in|last (?:four|4)(?: digits)?(?: (?:are|is))?)\s*(?<v>\d{3,4})\b/gi,
  },
];

/** Formats that are a secret wherever they appear. */
const SHAPE_RULES: readonly Rule[] = [
  { kind: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  {
    kind: 'iban',
    pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g,
  },
  {
    kind: 'card_number',
    pattern: new RegExp(`\\b\\d(?:${SEP}\\d){12,18}\\b`, 'g'),
    accept: (m) => luhnValid(m.replace(/\D/g, '')),
  },
];

/** Strict only: any long run of digits that isn't a currency amount. */
const LONG_NUMBER: Rule = {
  kind: 'long_number',
  pattern: /(?<![$£€\d,.])\b(?!\d{4}-\d{2}-\d{2}\b)\d(?:[ -]?\d){7,}\b(?![.,]\d)/g,
};

function applyRule(text: string, rule: Rule, found: Set<FinancialSecretKind>): string {
  return text.replace(rule.pattern, (...args: unknown[]) => {
    const match = String(args[0]);
    const groups = args[args.length - 1] as Record<string, string | undefined> | undefined;
    const value = groups && typeof groups === 'object' ? groups.v : undefined;
    if (value !== undefined) {
      if (value.includes(REDACTED)) return match;
      found.add(rule.kind);
      return match.slice(0, match.lastIndexOf(value)) + REDACTED;
    }
    if (rule.accept && !rule.accept(match)) return match;
    found.add(rule.kind);
    return REDACTED;
  });
}

/** Replace every financial secret in `text`. Returns the clean text and what was removed. */
export function redactFinancialSecrets(
  text: string,
  opts: { strict?: boolean } = {}
): RedactionResult {
  if (!text) return { text: text ?? '', kinds: [] };
  const found = new Set<FinancialSecretKind>();
  let out = text;
  for (const rule of VALUE_RULES) out = applyRule(out, rule, found);
  for (const rule of SHAPE_RULES) out = applyRule(out, rule, found);
  if (opts.strict) out = applyRule(out, LONG_NUMBER, found);
  return { text: out, kinds: [...found] };
}

export function containsFinancialSecret(text: string, opts: { strict?: boolean } = {}): boolean {
  return redactFinancialSecrets(text, opts).kinds.length > 0;
}

const SECRET_KEY =
  /(^|_)(card_?number|account_?number|acct|routing|iban|swift|sort_code|ssn|social_security|password|passcode|pin|cvv|cvc|security_(question|answer)|maiden_name|login)(_|$)/i;

/** A fact key that can only hold a secret ("card_number", "bank_password"). */
export function isSecretFactKey(key: string): boolean {
  return SECRET_KEY.test(key.trim().replace(/[\s-]+/g, '_'));
}

/** True when nothing worth keeping is left after redaction. */
export function isOnlyRedacted(text: string): boolean {
  const rest = text
    .split(REDACTED)
    .join(' ')
    .replace(/\b(my|the|is|was|number|no|code|pin|password|account|card)\b/gi, ' ')
    .replace(/[^A-Za-z0-9]+/g, '');
  return rest.length < 3;
}
