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
 * The match is the shared one (isForgotten), with one tightening: a name in
 * a topic ("Mark") must appear in the memory as that whole word, so
 * forgetting Mark no longer hides "marked" (isForgotten stems memory words).
 *
 * @module memory/recall/forget-every-reader
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { forgottenInProcess, forgottenTopicsOrNull } from './forget.js';
import { foldedWords } from './forget-tokens.js';
import { scrubProfile } from './forget-profile.js';
import { readTopics, topicsNow, topicsWithin } from './forget-topics-source.js';
import { isForgotten } from './session-recall.js';

export function forgetEveryReaderEnabled(env: Env = process.env): boolean {
  return flagOn('FORGET_EVERY_READER', env);
}

/** True when a text is about something the caller asked to forget. */
export type ForgottenCheck = (text: string) => boolean;

/**
 * The likely names in a stored topic, folded as memory words are: its
 * capitalized words but the first ("Divorce papers": the capital is the
 * sentence's), unless the topic is that one word ("Mark").
 */
function namesOf(topic: string): string[] {
  const words = topic.match(/\S+/g) ?? [];
  return words
    .filter((w, i) => /^\p{Lu}/u.test(w) && (i > 0 || words.length === 1))
    .flatMap((w) => foldedWords(w).map((f) => f.word));
}

/**
 * A topic of several words whose first is capitalized, with that word in
 * lower case: the shared matcher reads a capital as a name and won't stem it,
 * so "Divorce papers" missed "divorcing ... papers".
 */
function sentenceCase(topic: string): string | undefined {
  const words = topic.match(/\S+/g) ?? [];
  if (words.length < 2 || !/^\p{Lu}/u.test(words[0]!)) return undefined;
  return [words[0]!.toLowerCase(), ...words.slice(1)].join(' ');
}

/** isForgotten, with every likely name in the topic required as a whole word of the text. */
export function aboutForgotten(text: string, topics: readonly string[]): boolean {
  let whole: Set<string> | undefined;
  return topics.some((t) => {
    const lower = sentenceCase(t);
    if (!isForgotten(text, [t]) && !(lower && isForgotten(text, [lower]))) return false;
    const names = namesOf(t);
    if (names.length === 0) return true;
    whole ??= new Set(foldedWords(text).map((f) => f.word));
    return names.every((n) => whole!.has(n));
  });
}

function checkFor(userId: string, stored: string[] | null): ForgottenCheck {
  if (stored === null) return () => true; // no source at all: fail closed
  const topics = [...new Set([...stored, ...forgottenInProcess(userId)])];
  return (text) => aboutForgotten(text, topics);
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
  if (forgetEveryReaderEnabled(env) && isMemberIdentity(userId)) void readTopics(userId);
}

/**
 * The recall snapshot's read of the topics (recall-firestore-store.ts). With
 * the flag on it is the shared read (forced past a backoff: the snapshot
 * tries once per call), so its result is every other reader's fallback.
 */
export function snapshotTopics(userId: string, env: Env = process.env): Promise<string[] | null> {
  return forgetEveryReaderEnabled(env) ? readTopics(userId, true) : forgottenTopicsOrNull(userId);
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
