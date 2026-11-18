/**
 * Whether a memory is about a topic the caller asked Ferni to forget: the one
 * matcher every reader shares (facts, open threads, episode quotes, call
 * summaries, world facts, follow-ups). Pure: no I/O, no flags.
 *
 * The topics themselves are read through the ForgottenStore port
 * (memory/ports/forgotten-store.ts); this module only matches.
 *
 * @module memory/domain/forgotten
 */
import { contactNumberRuns, foldContactText } from './contact-data.js';
import { foldedWords, legacyForgetTokens, stem } from './forget-tokens.js';

/** Words too common to say what a memory is about (recall's content words share them). */
export const STOPWORDS = new Set(
  "the and but for with that this was are you your have has had not just about what when where how who why can could would should will from they them their there then than into onto been being its it's i'm im my our out get got going really very some like know think well yeah okay also".split(
    ' '
  )
);

/** Words that say nothing about what to forget: "forget what I said about that". */
const FORGET_FILLER = new Set(
  'forget forgot forgotten remember said say saying told tell talked talk mentioned thing things stuff part bit please user speaker'.split(
    ' '
  )
);

/**
 * The words of a forget request or a memory, for matching one to the other:
 * lower case, two letters or more ("my ex"), plural "s" dropped, stopwords
 * and filler left out, and a number written with spaces or dashes kept as
 * one ("555-123-4567" = "5551234567").
 */
export function forgetTokens(text: string): string[] {
  const out = topicWords(text).map((w) => (w.plain ? w.word : stem(w.word)));
  return [...new Set(out)];
}

const isTopicWord = (w: string) => w.length >= 2 && !STOPWORDS.has(w) && !FORGET_FILLER.has(w);

function topicWords(text: string): Array<{ word: string; plain: boolean }> {
  return foldedWords(text).filter((w) => isTopicWord(w.word));
}

/**
 * A topic as stored (forget.ts): its words with their case (so a name stays
 * a name when read back), filler left out. "Forget my sister's wedding" ->
 * "sister wedding"; "James" -> "James".
 */
export function storedTopic(topic: string): string {
  const words = topic.match(/\S+/g) ?? [];
  return words
    .filter((w) => topicWords(w).length > 0)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .join(' ');
}

const LEGACY_SKIP: ReadonlySet<string> = new Set([...STOPWORDS, ...FORGET_FILLER]);

/**
 * True when `text` is about a topic the caller asked to forget (forget.ts):
 * every word of the topic appears in it as a whole word. Erring toward
 * leaving a memory out is the right side for a privacy request.
 */
export function isForgotten(text: string, topics: readonly string[]): boolean {
  if (topics.length === 0) return false;
  if (holdsTopicNumber(text, topics)) return true;
  const words = new Set(forgetTokens(text));
  // "ex wife" in a memory is the "ex-wife" / "exwife" of a request, and back.
  const raw = foldedWords(text).map((w) => w.word);
  for (let i = 0; i + 1 < raw.length; i++) words.add(stem(`${raw[i]}${raw[i + 1]}`));
  // A capitalized word in a memory is often just a sentence's first word
  // ("Divorce papers came"): it matches stemmed too. A topic's name never
  // stems, so forgetting "James" can't hide "jam".
  for (const w of raw) {
    if (!isTopicWord(w)) continue;
    words.add(w); // a name kept whole in a topic ("Charles") matches "charles"
    words.add(stem(w));
  }
  let legacy: Set<string> | undefined;
  return topics.some((t) => {
    const want = forgetTokens(t);
    if (want.length > 0) {
      if (want.every((w) => words.has(w))) return true;
      if (want.length > 1 && want.length <= 3 && words.has(stem(want.join('')))) return true;
    }
    // A topic stored by the tokenizer before 2026-10-11 ("zo" for "Zoë",
    // "babie" for "babies") still hides what it hid then.
    const stored = t.toLowerCase().split(/\s+/).filter(Boolean);
    legacy ??= new Set(legacyForgetTokens(text, LEGACY_SKIP));
    return stored.length > 0 && stored.every((w) => legacy!.has(w));
  });
}

/**
 * True when a raw passage is about a forgotten topic. Speech rarely uses the
 * topic's own words ("forget my brother's number" vs "it's uh 435 555
 * 0188"), so a passage goes if it has any distinctive word of the topic
 * (five letters or more, or a number of four digits or more); otherwise it
 * needs all the topic's words, as facts do. One tokenizer (forgetTokens) on
 * both sides, so a request can't match one way and slip past the other. A
 * privacy request errs toward leaving a passage out.
 */
export function isForgottenPassage(text: string, topics: readonly string[]): boolean {
  if (isForgotten(text, topics)) return true;
  // "Forget my brother's number" and then "his cell is 435 555 0199": no topic word is in it.
  if (topics.some((t) => NUMBER_TOPIC.test(t)) && phoneNumbers(text).length > 0) return true;
  const words = new Set(forgetTokens(text));
  // "Distinctive" is judged on the word as written, not its stem: a stemmer
  // can shorten "wedding" below five letters, and the topic must still count.
  return topics.some((t) =>
    t
      .split(/\s+/)
      .map((raw) => ({ raw: raw.replace(/[^\p{L}\p{N}]/gu, ''), tokens: forgetTokens(raw) }))
      .some(
        ({ raw, tokens }) =>
          (/^\d{4,}$/.test(raw) || raw.length >= 5) &&
          tokens.length > 0 &&
          tokens.every((w) => words.has(w))
      )
  );
}

/**
 * The phone numbers in a text as their digits, so "(435) 555-0199", "435/555/0199" and "four
 * three five ..." read alike. The runs come from contact-data, the one reader of numbers in
 * any format, which fails closed: any 7+ digit run may be one. Here that holds too, except a
 * run that is plainly something else: a price in thousands ("1,250,000"), a time or a span of
 * times ("10:30-11:45", "15:00:00.000"), a date with its time ("2026-11-18 15:00"), a list of
 * years ("2019, 2020"), a date alone in its field, and a stored id's epoch in ms (thirteen digits from 2017 to 2033 joined
 * to a word by "-" or "_": "summary_session-AJ_x-1763478000123_1763478000456", as the voice
 * agent and outreach mint them). Those hid whole call summaries (#4042 reviews);
 * every other shape still counts, two numbers in one run and over-long ones included.
 * Known gaps: a trunk prefix ("020 ..." for "+44 20 ..."), and any other 7+ digit run (an order
 * number, counting aloud to eight, "2020-2019") still holds a passage under a number topic, and
 * a +1 number with a two-digit extension glued to a word ("mom-1555...12") reads as an epoch,
 * A number broken across lines is still one run. Held on purpose (fails closed): a date
 * with other digits beside it on its line ("abc123 2025-11-18", "2025-11-18 1234").
 */
const THOUSANDS = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const TIME = '\\d{1,2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,3})?)?';
const TIMES = new RegExp(
  `^(?:\\d{4}-\\d{2}-\\d{2}[ T])?${TIME}(?:\\s*[-\\u2010-\\u2015\\u2212]\\s*${TIME})?$`
);
// A list of years has a comma or semicolon: "2012 1999" may be an eight-digit phone number.
const YEARS = /^(?:19|20)\d\d(?:\s*[,;]\s*(?:19|20)\d\d)+$/;
const notAPhoneNumber = (run: string): boolean =>
  THOUSANDS.test(run) || TIMES.test(run) || YEARS.test(run);
// Only an epoch in ms glued to a word: a markdown "_435 555 0199_" keeps every digit.
const STORED_EPOCH = /(?<=[\p{L}\p{N}][-_])1[5-9]\d{11}(?!\p{N})/gu;
// A real date with no digit beside it on its own line (only non-letters between): readers
// put each field of a record on its own line (call-summaries, revived), and an id ending in
// digits ("…abc123") then a date field is no number anyone said. A date touching another
// number on its line ("2025-11-18-0199", "435 555 2025-11-18") stays in the run, as in
// contact-data, where only a whole run can be a date. The look is bounded (16) so a long
// stretch of punctuation stays linear.
const ISO_DATE =
  /(?<!\d[^\p{L}\n]{0,16})(?:19|20)\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?![^\p{L}\n]{0,16}\d)/gu;
// Both become words, so a run can't go on through them; one scan, so "435 555\n0199" is a
// number. The epoch is read raw (only ASCII digits are a stored id: a wide-digit "mom_１６１…"
// is someone's number); the date after folding, so no soft hyphen, zero-width mark, wide or
// spoken digit beside it escapes its guards.
const phoneNumbers = (text: string): string[] =>
  contactNumberRuns(
    foldContactText(text.replace(STORED_EPOCH, ' epoch ')).replace(ISO_DATE, ' date ')
  )
    .filter((run) => !notAPhoneNumber(run))
    .map((run) => run.replace(/\D/g, ''));

/**
 * A number a topic names is in the text, in any format (#3995 follow-up). Either may hold the
 * other: a country code ("+1 435 ..."), a number without its area code, or one run together
 * with another number all still count.
 */
function holdsTopicNumber(text: string, topics: readonly string[]): boolean {
  const wanted = topics.flatMap(phoneNumbers);
  if (wanted.length === 0) return false;
  const found = phoneNumbers(text);
  return wanted.some((w) => found.some((f) => f.includes(w) || w.endsWith(f)));
}

/**
 * A topic about a contact number ("brother phone number", "mom's cell", "his landline"), by
 * whole word. "Number of kids" counts too: "the number of my therapist" is a phone number, and
 * a privacy request errs toward hiding.
 */
const NUMBER_TOPIC =
  /\b(?:(?:tele|cell|smart)?phones?|numbers?|cell|mobile|digits|landline|tel)\b/i;

/** The text a stored fact document is about, in any fact collection's shape, for matching. */
export function factText(d: Record<string, unknown>): string {
  return ['entityName', 'key', 'attribute', 'value', 'fact', 'content']
    .map((k) => (typeof d[k] === 'string' ? (d[k] as string) : ''))
    .join(' ');
}
