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
import { TEAM_FIRST_NAMES as TEAM_NAMES, isTeammateTalk } from '../utils/teammate-talk.js';
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

/** The team's first names (utils/teammate-talk.ts, kept in step with persona-ids by a test). */
export const TEAM_FIRST_NAMES: ReadonlySet<string> = new Set(TEAM_NAMES);
const TEAM = TEAM_FIRST_NAMES;

/** What an item is about: content words that aren't summary filler or a teammate's name. */
function topicWordsOf(text: string): string[] {
  return [...contentWords(text)]
    .map((w) => w.replace(/'+$/, ''))
    .filter((w) => !NOT_THE_TOPIC.has(w) && !fillerLemmas().has(lemma(w)) && !TEAM.has(w));
}

let fillers: Set<string> | undefined;
/** NOT_THE_TOPIC by lemma ("called" is "call"), built on first use. */
const fillerLemmas = (): Set<string> => (fillers ??= new Set([...NOT_THE_TOPIC].map(lemma)));

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

/**
 * Everyday words a summary uses for what the caller said another way. Only the caller's
 * own words go through it (callerWords), so it can't launder a word Ferni brought up.
 */
const FAMILY = new Map(
  Object.entries({
    mother: 'mom',
    mum: 'mom',
    father: 'dad',
    child: 'kid',
    children: 'kid',
    wedding: 'marry',
    married: 'marry',
    presentation: 'present',
  }).map(([k, v]) => [lemma(k), lemma(v)])
);

export interface Turn {
  role: string;
  content: string;
}

/**
 * The words the caller said first, in call order. A word Ferni or a teammate brought up
 * before the caller ever said it stays theirs for the rest of the call, whatever the
 * caller says back: "What offer", "Huh. Offer.", "Nobody gave me an offer", "Yeah, the
 * offer thing" and "I got the offer" alike. Reading consent from a reply's wording
 * failed four review rounds; an echo can't be told from a claim by its words. The cost
 * is a thread Ferni asked about first ("how did the interview go?"), which isn't stored
 * again from that call; the earlier call's summary that raised it still holds it.
 */
export function callerWords(turns: readonly Turn[]): string[] {
  const raised: string[] = [];
  const said: string[] = [];
  const known = (w: string, list: string[]) => list.some((x) => sameWord(w, x));
  for (const turn of turns) {
    const words = topicWordsOf(turn.content);
    if (turn.role !== 'user') raised.push(...words.filter((w) => !known(w, said)));
    else said.push(...words.filter((w) => !known(w, raised)));
  }
  return said;
}

/** Turns from lines when the order isn't known: the assistant's are taken to come first. */
const asTurns = (callerLines: readonly string[], assistantLines: readonly string[]): Turn[] => [
  ...assistantLines.map((content) => ({ role: 'assistant', content })),
  ...callerLines.map((content) => ({ role: 'user', content })),
];

/** Every topic word of `item` is in `said`, give or take an ending. */
function backedBy(item: string, said: readonly string[]): boolean {
  const words = topicWordsOf(item);
  return words.length > 0 && words.every((w) => said.some((s) => sameWord(w, s)));
}

/**
 * True when the caller's own lines back `item` up: every word it is about is one they
 * said (callerWords), give or take an ending. One added detail is enough to refuse it.
 * A teammate's name in their line backs nothing up.
 */
export function saidByCaller(
  item: string,
  callerLines: readonly string[],
  assistantLines: readonly string[] = []
): boolean {
  return backedBy(item, callerWords(asTurns(callerLines, assistantLines)));
}

/** Fields that become "you mentioned…": every word must be the caller's. */
const THREAD_FIELDS: ReadonlySet<string> = new Set([
  'questionsRemaining',
  'followUpItems',
  'keyPoints', // the next greeting's "what you talked about last time"
]);

/** True when a word of `item` came from Ferni's or a teammate's side and never became theirs. */
function fromTheirSide(item: string, said: readonly string[], raised: readonly string[]): boolean {
  return topicWordsOf(item).some(
    (w) => !said.some((s) => sameWord(w, s)) && raised.some((a) => sameWord(w, a))
  );
}

/**
 * True when `item` came from the assistant's side of the call: a word it is about was
 * brought up by Ferni or a teammate and never became the caller's ("career offer" after a
 * teammate's "Ferni told me you're weighing the offer"). A label the model chose for
 * their own talk ("cooking" for a risotto story) is not.
 */
export function raisedByAssistant(item: string, turns: readonly Turn[]): boolean {
  const raised = turns.filter((t) => t.role !== 'user').flatMap((t) => topicWordsOf(t.content));
  return fromTheirSide(item, callerWords(turns), raised);
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
 * marker set. Threads and key points stay only when every word is the caller's; topics
 * and decisions go only when they came from the assistant's side. What goes is moved to
 * assistantRaisedItems. `fields` limits the check.
 */
export function withCallerProvenance<T extends ProvenanceSummary>(
  summary: T,
  turns: readonly Turn[],
  fields: ReadonlyArray<(typeof PROVENANCE_FIELDS)[number]> = PROVENANCE_FIELDS
): T & Pick<ProvenanceSummary, 'assistantRaisedItems' | 'callerProvenance'> {
  const said = callerWords(turns);
  const raisedWords = turns
    .filter((t) => t.role !== 'user')
    .flatMap((t) => topicWordsOf(t.content));
  const raised = new Set(summary.assistantRaisedItems ?? []);
  const out: T = { ...summary, callerProvenance: CALLER_PROVENANCE };
  for (const field of fields) {
    const items = summary[field];
    if (!Array.isArray(items)) continue;
    const kept = items.filter((item) => {
      // "Did you ever talk to Jordan about those plans?": a teammate, not their life
      const theirs = THREAD_FIELDS.has(field)
        ? backedBy(item, said) && !isTeammateTalk(item)
        : !fromTheirSide(item, said, raisedWords);
      if (!theirs) raised.add(item);
      return theirs;
    });
    (out as ProvenanceSummary)[field] = kept;
  }
  if (raised.size > 0) out.assistantRaisedItems = [...raised];
  return out;
}

/** The items that didn't come from the assistant's side of the call (raisedByAssistant). */
export function theirs(items: readonly string[], turns: readonly Turn[]): string[] {
  return items.filter((i) => !raisedByAssistant(i, turns));
}
