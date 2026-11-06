/**
 * Whether a sentence names an emergency service or a help line: the one reader
 * for "is this about getting someone help?". It reads wider than any one
 * caller needs, because every caller fails closed on it. The action-claim
 * guard leaves such a sentence as the model wrote it, and a pending read-back
 * keeps Ferni's offer of the line. A sentence read here by mistake keeps
 * main's behaviour. A miss rings the wrong person or drops the line.
 *
 * What counts:
 * - a crisis line in any form offersCrisisLine reads (988, 741741, a line by name);
 * - emergency services by name, as the action-claim guard reads Ferni's emergency
 *   claims (EMERGENCY_SERVICE): police, an ambulance, paramedics, EMS, the fire
 *   department. "The police drama" and "999 problems" are not a service;
 * - emergency care: the ER, A&E, the emergency room, urgent care, poison control;
 * - help by kind: a hotline, helpline, warmline or crisis line, the crisis team,
 *   a crisis counselor, suicide prevention, Samaritans;
 * - a CRISIS_RESOURCES line by its name, by the short name it starts with
 *   (RAINN, NAMI, SAMHSA, Childhelp), or by its phone or text number;
 * - emergency numbers: 911 and 999, 112 and 000 (with or without a dash or
 *   space, or spelled out). An N11 number or 933 counts after a call word or
 *   on its own. Any toll-free number counts.
 *
 * @module services/safety/safety-talk
 */
import { offersCrisisLine } from './crisis-line-speech.js';
import { CRISIS_RESOURCES } from './crisis-response.js';
import { EMERGENCY_NUMBER, EMERGENCY_SERVICE } from './emergency-number.js';

const SEP = String.raw`[\s.-]?`;
/** Not part of a longer number, an amount or a word. */
const ALONE_BEFORE = String.raw`(?<![\w$€£#]|\d[.,])`;
const ALONE_AFTER = String.raw`(?![\w%]|[.,]\d)`;
const spaced = (digits: string): string => digits.split('').join(SEP);

/** After a service's name, the words that make it a story ("the police drama"). */
const A_STORY =
  /^[\s-]+(?:dramas?|shows?|series|procedurals?|movies?|films?|novels?|podcasts?|thrillers?|games?)\b/;
/** After a number, a plural noun makes it a count ("999 problems"). */
const A_COUNT = /^\s+[a-z]+s\b/;
const SERVICE = new RegExp(EMERGENCY_SERVICE, 'g');

function namesService(lower: string): boolean {
  for (const m of lower.matchAll(SERVICE)) {
    const after = lower.slice(m.index + m[0].length);
    if (!(/\d/.test(m[0]) ? A_COUNT : A_STORY).test(after)) return true;
  }
  return false;
}

/** Emergency care and help by kind. */
const CARE = new RegExp(
  [
    String.raw`\b(?:the|an|to|in|at)\s+er\b`,
    String.raw`\ba\s?&\s?e\b|\baccident and emergency\b`,
    String.raw`\bemergency (?:room|department|ward|line|number|services?|dispatch|operators?)\b`,
    String.raw`\burgent care\b|\bpoison control\b|\bfirst responders?\b|\bfire ?fighters?\b`,
    String.raw`\b(?:hot|help|warm|crisis|suicide)[\s-]?lines?\b|\b(?:988)?lifelines?\b`,
    String.raw`\bcrisis (?:teams?|counsel+ors?|cent(?:er|re)s?|workers?|services?)\b`,
    String.raw`\bsuicide prevention\b|\bsamaritan'?s\b|\btrevor project\b`,
  ].join('|'),
  'i'
);

/** 911 as digits or words; 999, 112 and 000 unless a count follows ("999 problems"). */
const EMERGENCY_DIGITS = new RegExp(
  [
    `${ALONE_BEFORE}${spaced(EMERGENCY_NUMBER)}${ALONE_AFTER}`,
    String.raw`\bnine[\s-]+one[\s-]+one\b`,
    String.raw`(?:${ALONE_BEFORE}(?:${['999', '112', '000'].map(spaced).join('|')})${ALONE_AFTER}|\b(?:nine[\s-]+nine[\s-]+nine|triple[\s-]+(?:nine|zero)|one[\s-]+one[\s-]+two|zero[\s-]+zero[\s-]+zero)\b)(?!\s+[a-z]+s\b)`,
  ].join('|'),
  'i'
);
/** An N11 number or 933 after a call word ("call 311"). */
const SERVICE_NUMBER_CALLED =
  /\b(?:call(?:ed|ing)?|dial(?:l?ed|l?ing)?|ring(?:ing)?|rang|phon(?:e|ed|ing)|text(?:ed|ing)?|contact(?:ed|ing)?)\s+(?:[2-9]11|933)(?!\w)/i;
/** 1-800, 1-888 ... with or without the 1, letters allowed ("1-800-273-TALK"). */
const TOLL_FREE =
  /(?<![\w$])(?:1[\s.-]?)?\(?8(?:00|33|44|55|66|77|88)\)?[\s.-]?[a-z\d]{3}[\s.-]?[a-z\d]{4}(?![\w])/i;

const RESOURCES = Object.values(CRISIS_RESOURCES).flat();
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LINE_WORD = /^(?:national|helpline|hotline|lifeline)$/i;
/** A resource's name, and the short name it starts with ("RAINN National Sexual Assault Hotline"). */
const names = RESOURCES.flatMap((r) => {
  const words = r.name.split(/\s+/);
  const short = words.length > 1 && LINE_WORD.test(words[1]) && /^[a-z]+$/i.test(words[0]);
  return short ? [r.name, words[0]] : [r.name];
});
const BY_NAME = new RegExp(
  `\\b(?:${[...new Set(names)]
    .map((n) =>
      escape(n)
        .replace(/\s+/g, String.raw`\s+`)
        .replace('&', '(?:&|and)')
    )
    .join('|')})\\b`,
  'i'
);
/** Each resource's phone and text numbers, three digits or more. */
const numbers = RESOURCES.flatMap((r) => [r.phone, r.text])
  .map((s) => (s ?? '').replace(/\D/g, ''))
  .filter((d) => d.length >= 3);
const BY_NUMBER = new RegExp(
  `${ALONE_BEFORE}(?:${[...new Set(numbers)].map(spaced).join('|')})${ALONE_AFTER}`
);
/** Text that is only a number, as a `who` often is ("311", "(888) 555-0100"). */
const ONLY_A_NUMBER = /^\+?[\d\s().-]+$/;
const N11 = /^(?:[2-9]11|933)$/;

/** Whether `text` names an emergency service or a help line (see the module note). */
export function namesSafetyHelp(text: string): boolean {
  const lower = text.toLowerCase();
  if (offersCrisisLine(text) || namesService(lower) || CARE.test(text)) return true;
  if (BY_NAME.test(text) || BY_NUMBER.test(text) || TOLL_FREE.test(text)) return true;
  if (EMERGENCY_DIGITS.test(text) || SERVICE_NUMBER_CALLED.test(text)) return true;
  return ONLY_A_NUMBER.test(text.trim()) && N11.test(text.replace(/\D/g, ''));
}
