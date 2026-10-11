/**
 * Where a recalled fact came from: the caller's own words and the call's date.
 *
 * A fact reaches recall as "Brother | phone number = 435-339-7687", a model's
 * paraphrase with no trace of who said it or when. Ferni could only assert it,
 * and a grader could not tell a memory from a guess: on Seth's real calls the
 * recall note held the evidence for 21 to 31% of questions (memory benchmark,
 * 2026-10-11). Episodes (episodes.ts) quote passages found by meaning; this
 * grounds the facts themselves. Each fact recall picks for a turn gets the
 * caller's line that says it, found among their last few calls by the fact's
 * words (preferring the call it was extracted on), so Ferni can say "you said
 * on Jan 9 ...". A fact with no line that clearly says it gets no quote.
 *
 * Quotes come from stored transcripts, so they pass the same forgotten-topic
 * check as episode quotes, and nothing is quoted when the topics can't be read.
 * Nothing on the turn path waits: the lines load when the call starts.
 *
 * RECALL_FACT_QUOTES=on turns it on.
 *
 * @module memory/recall/fact-quotes
 */
import { createLogger } from '../../utils/safe-logger.js';
import { forgottenInProcess, forgottenTopicsOrNull } from './forget.js';
import { contentWords, type RecallFact } from './session-recall.js';
import { isForgottenPassage, type EpisodeCall } from './episodes.js';
import { estimateTokens, withinTokens } from './semantic-recall.js';

const log = createLogger({ module: 'recall-fact-quotes' });

export function factQuotesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.RECALL_FACT_QUOTES === 'on';
}

export interface FactQuote {
  /** The caller's words, trimmed to at most MAX_QUOTE_WORDS. */
  text: string;
  /** When the call started (ISO). */
  at: string;
}

/** Quoted words per turn, in tokens: about two short quotes. */
export const FACT_QUOTE_TOKENS_PER_TURN = 60;
const MAX_QUOTE_WORDS = 22;
/** Words that name the caller, not the fact. */
const SUBJECT_WORDS = new Set(['speaker', 'user', 'caller']);
const DAY_MS = 86_400_000;

function factWords(f: RecallFact): Set<string> {
  const words = contentWords(`${f.entity} ${f.key.replace(/_/g, ' ')} ${f.value}`);
  for (const w of SUBJECT_WORDS) words.delete(w);
  return words;
}

/** Numbers of three digits or more, spaces and dashes removed ("435 339 7687" = "4353397687"). */
function numbersIn(text: string): Set<string> {
  const joined = text.replace(/(\d)[\s().-]+(?=\d)/g, '$1');
  return new Set(joined.match(/\d{3,}/g) ?? []);
}

/** At most MAX_QUOTE_WORDS of `line`, centred on the words the fact shares with it. */
function trimAround(line: string, want: ReadonlySet<string>): string {
  const words = line.trim().split(/\s+/);
  if (words.length <= MAX_QUOTE_WORDS) return words.join(' ');
  const hits = words
    .map((w, i) => ([...contentWords(w)].some((c) => want.has(c)) ? i : -1))
    .filter((i) => i >= 0);
  const mid = hits[Math.floor(hits.length / 2)] ?? 0;
  const start = Math.max(0, Math.min(words.length - MAX_QUOTE_WORDS, mid - MAX_QUOTE_WORDS / 2));
  const cut = words.slice(start, start + MAX_QUOTE_WORDS).join(' ');
  return `${start > 0 ? '... ' : ''}${cut}${start + MAX_QUOTE_WORDS < words.length ? ' ...' : ''}`;
}

/**
 * The caller's line (or two adjacent lines, when the fact is spread over
 * them) that best says the fact, or null when none clearly does: one of its
 * numbers, or at least two of its words and more than a third of them.
 */
export function quoteFor(f: RecallFact, calls: readonly EpisodeCall[]): FactQuote | null {
  const want = factWords(f);
  const nums = numbersIn(f.value);
  if (want.size === 0 && nums.size === 0) return null;
  const extracted = f.extractedAt ? Date.parse(f.extractedAt) : NaN;
  let best: { score: number; text: string; at: string } | null = null;
  for (const call of calls) {
    // The call it was extracted on ranks first; extraction runs during or just after it.
    const sameCall =
      Number.isFinite(extracted) && Math.abs(extracted - Date.parse(call.at)) < DAY_MS;
    for (const text of spans(call.lines)) {
      const score = sourceScore(text, want, nums);
      if (score === null) continue;
      // A second line has to earn its place: it must add a shared word.
      const total = score.value + (sameCall ? 0.5 : 0) - (score.lines - 1) * 0.75;
      if (!best || total > best.score)
        best = { score: total, text: trimAround(text, want), at: call.at };
    }
  }
  return best && { text: best.text, at: best.at };
}

/** Each line, and each pair of adjacent lines. */
function* spans(raw: readonly string[]): Generator<string> {
  const lines = raw.map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    yield line;
    if (i + 1 < lines.length) yield `${line}\n${lines[i + 1]}`;
  }
}

/** How clearly `text` says the fact, or null when it doesn't. */
function sourceScore(
  text: string,
  want: ReadonlySet<string>,
  nums: ReadonlySet<string>
): { value: number; lines: number } | null {
  const words = contentWords(text);
  const shared = [...want].filter((w) => words.has(w)).length;
  const numHit = [...numbersIn(text)].some((n) => nums.has(n));
  if (!numHit && (shared < 2 || shared / Math.max(1, want.size) <= 1 / 3)) return null;
  return { value: shared + (numHit ? 2 : 0), lines: text.split('\n').length };
}

/** "Jan 9", the way a friend would name the call. */
export function callDate(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return 'an earlier call';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatFactQuotes(
  quoted: ReadonlyArray<{ fact: RecallFact; quote: FactQuote }>,
  userName?: string
): string | null {
  if (quoted.length === 0) return null;
  const who = userName || 'they';
  return [
    `Where those memories come from, in ${userName ? `${userName}'s` : 'their'} own words (speech-to-text, so if a quote is unclear, ask rather than assert). If you use a memory, you can ground it in what ${who} said, like "you said on Jan 9 ...":`,
    ...quoted.map(
      ({ fact, quote }) =>
        `- ${fact.key.replace(/_/g, ' ')}: on ${callDate(quote.at)}, "${quote.text}"`
    ),
  ].join('\n');
}

export interface FactQuotes {
  ready: Promise<void>;
  /** Quotes for facts recall picked this turn, within the turn's quote budget, as a note. */
  take: (facts: readonly RecallFact[]) => string | null;
  newTurn: () => void;
}

export function createFactQuotes(deps: {
  userId: string;
  userName?: string;
  /** The caller's recent calls (episodes.ts's EpisodeStore, called once). */
  calls: Promise<EpisodeCall[]>;
  /** Topics the caller asked to forget, or null if unreadable: then nothing is quoted. */
  forgotten?: () => Promise<string[] | null>;
}): FactQuotes {
  let calls: EpisodeCall[] | null = null;
  let topics: string[] = [];
  let tokensLeft = FACT_QUOTE_TOKENS_PER_TURN;
  const quotedIds = new Set<string>();
  const ready = Promise.all([
    deps.calls,
    (deps.forgotten ?? (async () => forgottenTopicsOrNull(deps.userId)))(),
  ])
    .then(([loaded, forgotten]) => {
      if (forgotten === null) {
        log.warn('Forgotten topics unreadable: quoting no facts this call');
        return;
      }
      topics = forgotten;
      calls = loaded;
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Fact quotes not loaded'));
  return {
    ready,
    take(facts) {
      const loaded = calls;
      if (!loaded || facts.length === 0) return null;
      const forgotten = [...topics, ...forgottenInProcess(deps.userId)];
      const found = facts.flatMap((fact) => {
        const id = `${fact.entity}|${fact.key}|${fact.value}`;
        if (quotedIds.has(id)) return [];
        const quote = quoteFor(fact, loaded);
        // The quote and the fact it grounds, together: a number alone names no topic.
        const about = `${fact.entity} ${fact.key} ${fact.value} ${quote?.text ?? ''}`;
        return quote && !isForgottenPassage(about, forgotten) ? [{ id, fact, quote }] : [];
      });
      const picked = withinTokens(found, (q) => q.quote.text, tokensLeft);
      for (const q of picked) quotedIds.add(q.id);
      tokensLeft -= estimateTokens(picked.map((q) => q.quote.text));
      return formatFactQuotes(picked, deps.userName);
    },
    newTurn() {
      tokensLeft = FACT_QUOTE_TOKENS_PER_TURN;
    },
  };
}
