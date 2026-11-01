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

/** The text a stored fact document is about, in any fact collection's shape, for matching. */
export function factText(d: Record<string, unknown>): string {
  return ['entityName', 'key', 'attribute', 'value', 'fact', 'content']
    .map((k) => (typeof d[k] === 'string' ? (d[k] as string) : ''))
    .join(' ');
}
