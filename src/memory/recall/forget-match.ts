/**
 * The forget matcher: a topic the caller asked Ferni to forget (forget.ts)
 * against the text of a memory, a note or a message. Split out of
 * session-recall.ts, which re-exports it.
 *
 * @module memory/recall/forget-match
 */
import { flagOn } from '../../config/env-flag.js';
import { alsoReadAs, foldedWords, legacyForgetTokens, stem } from './forget-tokens.js';

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
export function isForgotten(
  text: string,
  topics: readonly string[],
  env: Record<string, string | undefined> = process.env
): boolean {
  if (topics.length === 0) return false;
  if (matchesTopics(text, topics)) return true;
  // FORGET_EVERY_READER: hyphenated compounds hide on either part; Turkish i folds alike.
  if (!flagOn('FORGET_EVERY_READER', env)) return false;
  const again = alsoReadAs(text);
  const folded = topics.map((t) => t.replace(/ı/g, 'i'));
  return (again !== text || folded.some((t, i) => t !== topics[i])) && matchesTopics(again, folded);
}

function matchesTopics(text: string, topics: readonly string[]): boolean {
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
