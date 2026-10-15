/**
 * Memory keeps what the caller asserts, not what they ask.
 *
 * Seth's prod call (2026-10-12): Peter asked "How did those contracts end
 * up?" (a mishearing from an earlier call), Seth said "What contracts?", and
 * the entity "Contracts" was stored a minute later from that very question.
 * The same call stored "Freddy (person)" from "How are you doing, Freddy?"
 * (Ferni misheard), "User's home" from "Do you know where I live?" and "Check
 * the weather" from "Could you check the weather?". Both per-turn extractors
 * (entity capture and deep extraction) read only the caller's lines, so the
 * junk came from the caller's own questions.
 *
 * With CALLER_ASSERTED_MEMORY=on, the extractors read the caller's lines
 * without their questions, and the after-call summary is told to keep only
 * what the caller said or confirmed and to drop what they questioned or
 * denied. A question that also carries a fact ("is my sister's wedding on
 * Saturday?") is lost to these extractors; the after-call summary still reads
 * the whole call.
 *
 * @module memory/caller-assertions
 */
import { flagOn, type Env } from '../config/env-flag.js';
import { CALLER_PROVENANCE, contentWords } from './recall/session-recall.js';

export { CALLER_PROVENANCE };

/** True when CALLER_ASSERTED_MEMORY is on. */
export function callerAssertedMemoryOn(env: Env = process.env): boolean {
  return flagOn('CALLER_ASSERTED_MEMORY', env);
}

/** A caller's line without the sentences that are questions. */
export function withoutQuestions(line: string): string {
  return line
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !sentence.trim().endsWith('?'))
    .join(' ')
    .trim();
}

/** Caller lines for an extractor: unchanged when the flag is off, questions removed when on. */
export function assertedLines(lines: readonly string[], env: Env = process.env): string[] {
  if (!callerAssertedMemoryOn(env)) return [...lines];
  return lines.map(withoutQuestions).filter((line) => line.length > 0);
}

/** Told to the after-call summarizer: what the caller only asked about or denied is not a fact. */
export const CALLER_ASSERTION_RULE =
  'Keep only what the USER said or confirmed. Something only the ASSISTANT said, or the USER only asked about, is not a fact about the USER. If the USER questions or denies something the ASSISTANT brought up ("What contracts?", "I never said that", "No, that\'s wrong"), leave that thing out of every field.';

/** The summarizer prompt's rule lines: SPEAKER_RULE always, the question rule with the flag. */
export function summaryAssertionRule(env: Env = process.env): string {
  return `\n${SPEAKER_RULE}${callerAssertedMemoryOn(env) ? `\n${CALLER_ASSERTION_RULE}` : ''}`;
}

/**
 * Always told to the after-call summarizer, flag or not: who said it decides whose it is.
 * Prod 2026-10-13: a teammate's handoff greeting said "the offer", the caller never did,
 * and the summary kept "career offer" as the caller's topic; later calls asked about it.
 */
export const SPEAKER_RULE =
  'Only what the USER said is about the USER. Something only the ASSISTANT said (Ferni, or a teammate who took over the call, including a greeting like "Ferni told me you\'re...") is not a topic, key point, open thread, follow-up or concern of the USER: leave it out unless the USER said it too. Asking for a teammate by name ("can I talk to Jordan?") is not a topic. Call them USER, never by name, and use their own words for each item.';

/** Summary fields whose items say something about the caller. */
export const PROVENANCE_FIELDS = [
  'mainTopics',
  'keyPoints',
  'questionsRemaining',
  'followUpItems',
  'decisionsReached',
] as const;

/** Summary words that say nothing about what the item is ("User wants to follow up on…"). */
const NOT_THE_TOPIC = new Set(
  'user caller ask asked talk talked talking discuss discussed discussing mention mentioned share shared said tell told want wanted wants feel feeling felt follow check next time how went goe going coming upcoming recent recently new update thing stuff conversation call help anxious nervous worried excited stressed happy sad upset hear heard back whether did does doing get got any yet see way go goes went go'.split(
    ' '
  )
);

/**
 * The team's first names (personas/persona-ids.ts DISPLAY_NAMES; a test keeps them in step).
 * Not imported: memory can't reach into personas, and its index pulls in the whole agent.
 */
export const TEAM_FIRST_NAMES: ReadonlySet<string> = new Set(
  'ferni peter alex maya jordan nayan'.split(' ')
);
const TEAM = TEAM_FIRST_NAMES;

/** What an item is about: content words that aren't summary filler or a teammate's name. */
function topicWordsOf(text: string): string[] {
  return [...contentWords(text)]
    .map((w) => w.replace(/'+$/, ''))
    .filter((w) => !NOT_THE_TOPIC.has(w) && !TEAM.has(w));
}

/** The same word, give or take an ending ("plan", "planning"; "interview", "interviews"). */
function sameWord(a: string, b: string): boolean {
  const [x, y] = [lemma(a), lemma(b)];
  return x === y || (FAMILY.get(x) ?? x) === (FAMILY.get(y) ?? y);
}

/**
 * A word without -s, -es, -ed or -ing, a doubled last consonant or a final "e", when at
 * least three letters are left: "planning" and "plans" are "plan", "moving" and "move" are
 * "mov". "-er" is never cut, so "offer" is never "off" and "career" never "care".
 */
function lemma(w: string): string {
  const cut = w.replace(/(?:ing|ed|es|s)$/, '');
  const base = cut.length >= 3 ? cut.replace(/([^aeiou])\1$/, '$1') : w;
  return base.length >= 4 ? base.replace(/e$/, '') : base;
}

/** Everyday words a summary uses for what the caller said another way. */
const FAMILY = new Map(
  Object.entries({
    mother: 'mom',
    mum: 'mom',
    father: 'dad',
    child: 'kid',
    children: 'kid',
    wedding: 'marry',
    married: 'marry',
    work: 'job',
    presentation: 'present',
  }).map(([k, v]) => [lemma(k), lemma(v)])
);

/**
 * True when the caller's own lines back `item` up: every word it is about is one they
 * said, give or take an ending. One added detail ("career", "the offer") is enough to
 * refuse it. A teammate's name in their line backs nothing up.
 */
export function saidByCaller(
  item: string,
  callerLines: readonly string[],
  assistantLines: readonly string[] = []
): boolean {
  const said = topicWordsOf(assertedOnly(callerLines, assistantLines).join(' '));
  const words = topicWordsOf(item);
  return words.length > 0 && words.every((w) => said.some((s) => sameWord(w, s)));
}

/** Fields Ferni follows up on ("did you hear back about…"): every word must be the caller's. */
const THREAD_FIELDS: ReadonlySet<string> = new Set([
  'questionsRemaining',
  'followUpItems',
  'keyPoints', // the next greeting's "what you talked about last time"
]);

const DENIAL =
  /^\s*(?:no|nope|nah)\b|\b(?:i never said|i didn'?t say|that'?s (?:not right|wrong|not true)|that never happened|where did you get that|what are you talking about)\b/i;

/**
 * The caller's lines without what they only denied ("No, that's wrong") or only asked back
 * about something Ferni or a teammate said ("What offer?"). A question with their own
 * news in it ("can you help me plan my sister's visit?") stays. Always on here, whatever
 * CALLER_ASSERTED_MEMORY says for the per-turn extractors.
 */
export function assertedOnly(
  lines: readonly string[],
  assistantLines: readonly string[] = []
): string[] {
  const theirs = topicWordsOf(assistantLines.join(' '));
  const echo = (sentence: string): boolean =>
    sentence.trim().endsWith('?') &&
    topicWordsOf(sentence).every((w) => theirs.some((a) => sameWord(w, a)));
  return lines
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .filter((sentence) => sentence.trim().length > 0 && !DENIAL.test(sentence) && !echo(sentence));
}

/**
 * True when `item` came from the assistant's side of the call: a word it is about was said
 * by Ferni or a teammate and never by the caller ("career offer" after a teammate's "Ferni
 * told me you're weighing the offer"). A label the model chose for their own talk
 * ("cooking" for a risotto story) is not.
 */
export function raisedByAssistant(
  item: string,
  callerLines: readonly string[],
  assistantLines: readonly string[]
): boolean {
  const said = topicWordsOf(assertedOnly(callerLines, assistantLines).join(' '));
  const theirs = topicWordsOf(assistantLines.join(' '));
  return topicWordsOf(item).some(
    (w) => !said.some((s) => sameWord(w, s)) && theirs.some((a) => sameWord(w, a))
  );
}

export interface ProvenanceSummary {
  mainTopics: string[];
  keyPoints: string[];
  questionsRemaining?: string[];
  followUpItems?: string[];
  decisionsReached?: string[];
  /**
   * Items that aren't the caller's: raised by Ferni or a teammate, or (for threads) not
   * backed by the caller's own words. Kept and labelled, never served as theirs.
   */
  assistantRaisedItems?: string[];
  callerProvenance?: number;
}

/**
 * The summary with its items checked against who said what, and the CALLER_PROVENANCE
 * marker set. Threads (open questions, follow-ups) stay only when every word is the
 * caller's; other items go only when they came from the assistant's side. What goes is
 * moved to assistantRaisedItems. `fields` limits the check.
 */
export function withCallerProvenance<T extends ProvenanceSummary>(
  summary: T,
  turns: ReadonlyArray<{ role: string; content: string }>,
  fields: ReadonlyArray<(typeof PROVENANCE_FIELDS)[number]> = PROVENANCE_FIELDS
): T & Pick<ProvenanceSummary, 'assistantRaisedItems' | 'callerProvenance'> {
  const lines = (role: string) => turns.filter((t) => t.role === role).map((t) => t.content);
  const [callerLines, assistantLines] = [lines('user'), lines('assistant')];
  const raised = new Set(summary.assistantRaisedItems ?? []);
  const out: T = { ...summary, callerProvenance: CALLER_PROVENANCE };
  for (const field of fields) {
    const items = summary[field];
    if (!Array.isArray(items)) continue;
    const kept = items.filter((item) => {
      const theirs = THREAD_FIELDS.has(field)
        ? saidByCaller(item, callerLines, assistantLines)
        : !raisedByAssistant(item, callerLines, assistantLines);
      if (!theirs) raised.add(item);
      return theirs;
    });
    (out as ProvenanceSummary)[field] = kept;
  }
  if (raised.size > 0) out.assistantRaisedItems = [...raised];
  return out;
}

/** The items that didn't come from the assistant's side of the call (raisedByAssistant). */
export function theirs(
  items: readonly string[],
  turns: ReadonlyArray<{ role: string; content: string }>
): string[] {
  const lines = (role: string) => turns.filter((t) => t.role === role).map((t) => t.content);
  return items.filter((i) => !raisedByAssistant(i, lines('user'), lines('assistant')));
}
