/**
 * What a caller asked Ferni to forget stays out of every memory reader that
 * reaches the prompt, not only recall's (FORGET_EVERY_READER=on).
 *
 * forget.ts marks facts and records the topic, and recall, the vector store,
 * episode quotes, summaries, the mind note and the memory tool each check it.
 * These readers never did (code-health 2026-10-23, ddd.md 2.6): the caller
 * profile in the system prompt and the greeting (last call summary, life
 * events, goals, concerns), the single-agent awareness block, the handoff
 * summary, the relationship-summary tool, the BM25 and entity legs of hybrid
 * search, UnifiedStore.recall (memory intelligence), entity proactive
 * surfacing, and recall notes already in the chat, which a forget mid-call
 * left in place. Each now asks one check over the topics recorded in the
 * store (forget-topics-source.ts: one shared read, a last-known fallback,
 * fail closed only with no source) and those forgotten in this process.
 *
 * The match is the shared one (isForgotten), with a topic's capitalized
 * words read in lower case (so they stem: "Divorce" catches "divorced")
 * unless they are names the caller's memory knows (rememberFactNames, from
 * recall's facts). A known name must appear whole, or as its plural or
 * possessive: forgetting Mark keeps "marked". With no known names, every
 * word stems: erring toward leaving a memory out.
 *
 * @module memory/recall/forget-every-reader
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { forgottenInProcess, forgottenTopicsOrNull } from './forget.js';
import { foldedWords } from './forget-tokens.js';
import { scrubProfile } from './forget-profile.js';
import {
  knownNames,
  markCallStart,
  readTopics,
  rememberNames,
  topicsNow,
  topicsWithin,
} from './forget-topics-source.js';
import { isForgotten } from './session-recall.js';

export function forgetEveryReaderEnabled(env: Env = process.env): boolean {
  return flagOn('FORGET_EVERY_READER', env);
}

/** True when a text is about something the caller asked to forget. */
export type ForgottenCheck = ((text: string) => boolean) & {
  /** Same topics and names, same answers: a key for caching what a check filtered. */
  readonly signature?: string;
};

/**
 * A stored topic as the matcher reads it: every capitalized word in lower
 * case unless it is a name the caller's memory knows (`names`), so "Divorce
 * Papers" stems like "divorce papers" and "Divorce" catches "divorced",
 * while a known "Mark" stays a name.
 */
function asMatched(topic: string, names: ReadonlySet<string>): { topic: string; kept: string[] } {
  const kept: string[] = [];
  const words = (topic.match(/\S+/g) ?? []).map((w) => {
    if (!/^\p{Lu}/u.test(w)) return w;
    const folded = foldedWords(w).map((f) => f.word);
    if (folded.length > 0 && folded.every((f) => names.has(f))) {
      kept.push(...folded);
      return w;
    }
    return w.toLowerCase();
  });
  return { topic: words.join(' '), kept };
}

/**
 * isForgotten, with a known name required as a whole word of the text, or
 * its plural or possessive ("the Biscuits", "Mark's"), never another
 * inflection: forgetting Mark keeps "marked".
 */
export function aboutForgotten(
  text: string,
  topics: readonly string[],
  names: ReadonlySet<string> = new Set()
): boolean {
  let whole: Set<string> | undefined;
  return topics.some((t) => {
    const { topic, kept } = asMatched(t, names);
    if (!isForgotten(text, [topic])) return false;
    if (kept.length === 0) return true;
    whole ??= new Set(foldedWords(text).map((f) => f.word));
    return kept.every((n) => whole!.has(n) || whole!.has(`${n}s`) || whole!.has(`${n}es`));
  });
}

function checkFor(userId: string, stored: string[] | null): ForgottenCheck {
  if (stored === null) return Object.assign(() => true, { signature: 'closed' }); // no source
  const topics = [...new Set([...stored, ...forgottenInProcess(userId)])].sort();
  const names = knownNames(userId);
  const signature = `${topics.join('\u0000')}\u0001${[...names].sort().join(',')}`;
  return Object.assign((text: string) => aboutForgotten(text, topics, names), { signature });
}

/**
 * The caller's forgotten topics as a check, or null when the flag is off or
 * there is no member (nothing is stored for anonymous or on-behalf callers).
 * `reader` names the caller in logs.
 */
export async function forgottenCheck(
  userId: string | null | undefined,
  reader = 'reader',
  env: Env = process.env
): Promise<ForgottenCheck | null> {
  if (!forgetEveryReaderEnabled(env) || !isMemberIdentity(userId)) return null;
  return checkFor(userId, await topicsWithin(userId, reader));
}

/**
 * The same check without waiting, for a reader on the transcript tick: the
 * same topics (fresh or last known, plus this process's), the same fail
 * closed when there is no source, and the same shared read started if due.
 */
export function forgottenCheckNow(
  userId: string | null | undefined,
  reader = 'reader-now',
  env: Env = process.env
): ForgottenCheck | null {
  if (!forgetEveryReaderEnabled(env) || !isMemberIdentity(userId)) return null;
  return checkFor(userId, topicsNow(userId, reader));
}

/** Start the shared read early (agent setup, beside the prompt loads); never throws. */
export function prefetchForgotten(userId: string | null | undefined, env: Env = process.env): void {
  if (!forgetEveryReaderEnabled(env) || !isMemberIdentity(userId)) return;
  markCallStart(userId);
  void readTopics(userId);
}

/**
 * The names in the caller's facts (recall-firestore-store.ts), for the
 * matcher: the capitalized words of each fact's entity. Flag off: nothing.
 */
export function rememberFactNames(
  userId: string,
  facts: ReadonlyArray<Record<string, unknown>>,
  env: Env = process.env
): void {
  if (!forgetEveryReaderEnabled(env)) return;
  const words = facts.flatMap((f) =>
    [f.entityName, f.entity].flatMap((v) => (typeof v === 'string' ? (v.match(/\S+/g) ?? []) : []))
  );
  rememberNames(
    userId,
    words.filter((w) => /^\p{Lu}/u.test(w)).flatMap((w) => foldedWords(w).map((f) => f.word))
  );
}

/**
 * The recall snapshot's read of the topics (recall-firestore-store.ts). With
 * the flag on it is the shared read (forced past a backoff: the snapshot
 * tries once per call), so its result is every other reader's fallback.
 */
export function snapshotTopics(userId: string, env: Env = process.env): Promise<string[] | null> {
  return forgetEveryReaderEnabled(env) ? readTopics(userId, true) : forgottenTopicsOrNull(userId);
}

const TEXT_FIELDS = ['text', 'content', 'naturalPhrasing', 'title', 'description', 'name'];
const NAME_FIELDS = ['canonicalName', 'aliases', 'peopleMentioned', 'topics', 'relationship'];
const NESTED = ['data', 'memory', 'entity', 'metadata'];

/** The words a stored record is about: its text, names and topics, two levels down too. */
export function recordText(record: unknown, depth = 0): string {
  if (typeof record === 'string') return record;
  if (!record || typeof record !== 'object') return '';
  const r = record as Record<string, unknown>;
  const words = [...TEXT_FIELDS, ...NAME_FIELDS].flatMap((k) => {
    const v = r[k];
    if (typeof v === 'string') return [v];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  });
  // Two levels: a search result's data.metadata.aliases (hybrid-search.ts).
  if (depth < 2) for (const k of NESTED) words.push(recordText(r[k], depth + 1));
  return words.filter(Boolean).join(' ');
}

/** Items not about a forgotten topic; all of them when there is no check. */
export function remembered<T>(
  items: T[],
  forgotten: ForgottenCheck | null,
  textOf: (item: T) => string = recordText
): T[] {
  return forgotten ? items.filter((item) => !forgotten(textOf(item))) : items;
}

/** remembered(), reading the caller's topics first. */
export async function keepRemembered<T>(
  userId: string | null | undefined,
  items: T[],
  textOf: (item: T) => string = recordText
): Promise<T[]> {
  if (items.length === 0) return items;
  return remembered(items, await forgottenCheck(userId, 'search'), textOf);
}

/** The text, or undefined when it is about a forgotten topic. */
export async function rememberedText(
  userId: string | null | undefined,
  text: string | undefined
): Promise<string | undefined> {
  if (!text) return text;
  const forgotten = await forgottenCheck(userId, 'text');
  return forgotten?.(text) ? undefined : text;
}

export { PROFILE_PASS_THROUGH } from './forget-profile.js';

/**
 * The caller's profile as a prompt reads it, every field but an allowlist
 * filtered (forget-profile.ts). The stored profile is not changed; unchanged
 * when the flag is off.
 */
export async function profileForCaller<P extends object>(
  userId: string | null | undefined,
  profile: P,
  reader = 'profile'
): Promise<P> {
  const forgotten = await forgottenCheck(userId, reader);
  return forgotten ? scrubProfile(profile, forgotten) : profile;
}

/** profileForCaller for a session's services (agent-setup.ts, voice-agent-entry). */
export async function profileForPrompt<P extends object>(services: {
  userId?: string | null;
  userProfile?: P | null;
}): Promise<P | null> {
  const profile = services.userProfile ?? null;
  return profile && profileForCaller(services.userId, profile);
}
