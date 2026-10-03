/**
 * Speech-ready text: a narrow edge-case pass, not a number speller.
 *
 * Cartesia's prompting guide: "Write in conventional forms and let the system
 * normalize them" (1,234,567 / $19.99 / (415) 555-1212 / 04/20/2025 / 7:00 PM
 * / 12%), and "Pre-normalization: only use as fallback for edge cases."
 * Sonic normalizes those forms itself, and our own spelling-out got them
 * wrong ("the 1990s" read as "one thousand nine hundred ninetys", years and
 * counts mixed inside one list). So numbers, years, decades, dates,
 * negatives, money, times and percentages are left exactly as written.
 *
 * What this pass does is put text INTO those conventional forms where the
 * LLM wrote something Sonic reads badly:
 * - clock times get a spaced, capital AM/PM: "7pm" / "7 p.m." → "7 PM",
 *   "3:30pm" → "3:30 PM", and a range "7-9pm" → "7 to 9 PM";
 * - stage directions are not spoken: an *asterisk span* that starts with an
 *   action verb (*smiles*, *takes a breath*) or opens a sentence in lowercase
 *   is removed (Stage 2 renders sighs and breaths); paired emphasis asterisks
 *   keep their words; "5*3", "2 * 4" and "f***" are left alone;
 * - markdown: paired underscores, backticks, a leading heading mark, and
 *   [text](url) links (keeping the text); emoji are dropped;
 * - a shouted emphasis word ("That is REALLY good") is lowercased, because
 *   Sonic reads all-caps letter by letter. Fail safe: only words on an explicit
 *   emphasis list; every other caps token (FDIC, AAPL, HIIT, VIII) is kept.
 *
 * Nothing inside [...] or <...> markup is touched.
 *
 * @module speech/tts-gateway/director/normalize
 */

export interface NormalizeResult {
  text: string;
  /** How many rewrites were made (for the shadow log; never the text). */
  count: number;
}

type Rule = (text: string, count: () => void) => string;

/**
 * Words lowercased when shouted. Fail safe: ONLY these. Every other all-caps
 * token (FDIC, AAPL, VTSAX, HIIT, EBITDA, VIII, 401K) is left exactly as
 * written, because a wrongly lowercased acronym or ticker becomes an
 * unpronounceable pseudo-word. Words that are also common acronyms (WHO, IT,
 * AM, US) are deliberately absent.
 */
const EMPHASIS_WORDS = new Set(
  (
    'REALLY NEVER ALWAYS VERY SO NOT LOT WAY DID DO DOES DONE LOVE LOVED HATE HATED ' +
    'ALL NO YES NOW HUGE TOTALLY ABSOLUTELY DEFINITELY EVER MUST MUCH SUCH TOO ' +
    'GREAT AMAZING LITERALLY SERIOUSLY BIG TINY ONLY JUST STILL EVERY NOTHING ' +
    "EVERYTHING HAD HAVE WAS WERE ARE IS CAN WILL DON'T DIDN'T CAN'T WON'T ISN'T " +
    'BEST WORST GOOD BAD HAPPY PROUD TIRED SURE WOW YOU THIS THAT WHAT'
  ).split(' ')
);

const CAPS_WORD = /\b[A-Z]{2,}(?:'[A-Z]+)?\b/g;

const MERIDIEM = String.raw`\s?([ap])\.?\s?m(?![a-z])(\.)?`;
const CLOCK_WITH_MINUTES = new RegExp(String.raw`\b(\d{1,2}):(\d{2})${MERIDIEM}`, 'gi');
const CLOCK_ON_HOUR = new RegExp(String.raw`(?<![:\d])\b(\d{1,2})${MERIDIEM}`, 'gi');

/**
 * Keep the period a "p.m." swallowed only when it also ended the sentence:
 * at the end of the text, or before a capitalised word that is not "I"
 * ("after 7 p.m. I should be free" is one sentence; inserting a period there
 * adds a full-stop pause).
 */
function keepSentenceEnd(dot: string | undefined, rest: string): string {
  return dot && /^(\s*$|\s*\n|\s+(?!I\b)[A-Z][a-z])/.test(rest) ? '.' : '';
}

const EMOJI =
  /(?:(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])(?:\p{Emoji_Modifier}|\uFE0F)*\u200D?)+/gu;
/** A time range: "7-9pm", "7:30 - 9 p.m.", "11am-2pm". */
const CLOCK_RANGE = new RegExp(
  String.raw`\b(\d{1,2}(?::\d{2})?)(?:\s?([ap])\.?\s?m(?![a-z]))?\s?[-–]\s?(\d{1,2}(?::\d{2})?)${MERIDIEM}`,
  'gi'
);
/** Verbs that make an *asterisk span* a stage direction wherever it sits. */
const ACTION_VERB =
  /^(?:sighs?|smiles?|laughs?|chuckles?|giggles?|grins?|nods?|shrugs?|winks?|pauses?|breathes?|takes|clears|leans|looks|beams?|exhales?|inhales?|whispers?|gasps?|snorts?|hums?)\b/i;
/** An *asterisk-wrapped* span of up to 5 words. */
const ASTERISK_SPAN = /(^|[^\w*])\*{1,3}([A-Za-z][A-Za-z' -]{0,60}?)\*{1,3}(?=$|[^\w*])/g;
const MARKDOWN_LINK = /\[([^\]\n]+)\]\((?:https?:\/\/|www\.)[^)\s]*\)/g;

/** Tidy the spaces a removal left behind ("good 😊." → "good."), keeping the original's edges. */
function tidy(text: string, original: string): string {
  let out = text.replace(/ {2,}/g, ' ').replace(/ +([.,!?;:])/g, '$1');
  if (!/^\s/.test(original)) out = out.trimStart();
  if (!/\s$/.test(original)) out = out.trimEnd();
  return out;
}

const RULES: readonly Rule[] = [
  // Time ranges: "7-9pm" → "7 to 9 PM" (a bare dash can read as "minus").
  (t, hit) =>
    t.replace(
      CLOCK_RANGE,
      (
        match,
        from: string,
        fromMer: string | undefined,
        to: string,
        mer: string,
        dot: string | undefined,
        at: number,
        all: string
      ) => {
        hit();
        const end = `${mer.toUpperCase()}M`;
        const start =
          fromMer && `${fromMer.toUpperCase()}M` !== end ? ` ${fromMer.toUpperCase()}M` : '';
        return `${from}${start} to ${to} ${end}${keepSentenceEnd(dot, all.slice(at + match.length))}`;
      }
    ),
  // Clock times: "3:30 p.m." / "9:05am" → "3:30 PM" / "9:05 AM".
  (t, hit) =>
    t.replace(
      CLOCK_WITH_MINUTES,
      (
        match,
        h: string,
        m: string,
        mer: string,
        dot: string | undefined,
        at: number,
        all: string
      ) => {
        if (Number(h) > 23 || Number(m) > 59) return match;
        const out = `${h}:${m} ${mer.toUpperCase()}M${keepSentenceEnd(dot, all.slice(at + match.length))}`;
        if (out !== match) hit();
        return out;
      }
    ),
  // Clock times on the hour: "7pm" / "7 p.m." → "7 PM".
  (t, hit) =>
    t.replace(
      CLOCK_ON_HOUR,
      (match, h: string, mer: string, dot: string | undefined, at: number, all: string) => {
        if (Number(h) < 1 || Number(h) > 12) return match;
        hit();
        return `${h} ${mer.toUpperCase()}M${keepSentenceEnd(dot, all.slice(at + match.length))}`;
      }
    ),
  // Stage directions and markdown.
  (t, hit) => {
    const out = t
      .replace(ASTERISK_SPAN, (match, lead: string, inner: string, at: number, all: string) => {
        const before = all.slice(0, at) + lead;
        // Lowercase at a sentence start reads as a direction (*a long pause*);
        // emphasis there would be capitalised (*Really*).
        const startsSentence = /(?:^|[.!?])\s*$/.test(before) && /^[a-z]/.test(inner);
        const words = inner.trim().split(/\s+/).length;
        const direction = words <= 5 && (ACTION_VERB.test(inner) || startsSentence);
        // A stage direction is not spoken at all; emphasis keeps its words.
        return direction ? lead : `${lead}${inner}`;
      })
      .replace(/^\s*\*\s+(?=\S)/, '')
      .replace(/(^|\s)__?([^_\s][^_]*?)__?(?=$|[\s.,!?;:])/g, '$1$2')
      .replace(/`+/g, '')
      .replace(/^\s*#{1,6}\s+(?=\D)/, '');
    if (out === t) return t;
    hit();
    return tidy(out, t);
  },
  // Emoji.
  (t, hit) => {
    const out = t.replace(EMOJI, '');
    if (out === t) return t;
    hit();
    return tidy(out, t);
  },
  // Shouted emphasis: lowercase it so Sonic says the word, not its letters.
  (t, hit) =>
    t.replace(CAPS_WORD, (word: string, at: number, all: string) => {
      if (!EMPHASIS_WORDS.has(word)) return word;
      hit();
      const lower = word.toLowerCase();
      const startsSentence = /(?:^|[.!?]\s+)$/.test(all.slice(0, at));
      return startsSentence ? lower[0].toUpperCase() + lower.slice(1) : lower;
    }),
];

/** Split off [...] and <...> markup so rules only see speakable text. */
const MARKUP = /(\[[^\]]*\]|<[^>]*>)/;

export function normalizeForSpeech(text: string): NormalizeResult {
  let count = 0;
  const hit = (): void => {
    count++;
  };
  // Links first: their "[text]" would otherwise read as bracket markup.
  const unlinked = text.replace(MARKDOWN_LINK, (_m, label: string) => {
    hit();
    return label;
  });
  const out = unlinked
    .split(MARKUP)
    .map((part, i) => (i % 2 === 1 ? part : RULES.reduce((acc, rule) => rule(acc, hit), part)))
    .join('');
  return { text: out, count };
}
