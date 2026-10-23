/**
 * What a caller asked Ferni to forget stays out of every memory reader that
 * reaches the prompt, not only recall's (FORGET_EVERY_READER=on).
 *
 * forget.ts marks facts and records the topic, and recall, the vector store,
 * episode quotes, summaries, the mind note and the memory tool each check it.
 * These readers never did (code-health 2026-10-23, ddd.md 2.6): the caller
 * profile in the system prompt and the greeting (last call summary, life
 * events, goals, concerns), the conversation recap's last summary, the BM25
 * and entity legs of hybrid search, UnifiedStore.recall (memory
 * intelligence), entity proactive surfacing, and recall notes already in the
 * chat, which a forget mid-call left in place. Each now asks one check, by
 * the shared matcher (isForgotten), with the topics recorded in the store
 * (cached briefly, like the vector filter's) and those forgotten in this
 * process. If the stored topics can't be read in
 * time, every text counts as forgotten: readers of raw words fail closed.
 *
 * @module memory/recall/forget-every-reader
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import type { UserProfile } from '../../types/user-profile.js';
import { forgetGeneration, forgottenInProcess, forgottenTopicsOrNull } from './forget.js';
import { isForgotten } from './session-recall.js';

export function forgetEveryReaderEnabled(env: Env = process.env): boolean {
  return flagOn('FORGET_EVERY_READER', env);
}

/** True when a text is about something the caller asked to forget. */
export type ForgottenCheck = (text: string) => boolean;

/** Topics change rarely; a short cache keeps each turn from paying a read. */
const TOPICS_TTL_MS = 15_000;
/** A read slower than this counts as unreadable, so a reader fails closed instead of waiting. */
export const READ_TIMEOUT_MS = 300;
const lastRead = new Map<string, { at: number; gen: number; topics: string[] }>();

/** The stored topics, cached until a forget in this process or the TTL; null when unreadable. */
async function storedTopics(userId: string): Promise<string[] | null> {
  const gen = forgetGeneration(userId);
  const hit = lastRead.get(userId);
  if (hit && hit.gen === gen && Date.now() - hit.at < TOPICS_TTL_MS) return hit.topics;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
  });
  const topics = await Promise.race([forgottenTopicsOrNull(userId), late]);
  clearTimeout(timer);
  if (topics) lastRead.set(userId, { at: Date.now(), gen, topics });
  return topics;
}

/**
 * The caller's forgotten topics as a check, or null when the flag is off or
 * there is no member (nothing is stored for anonymous or on-behalf callers).
 */
export async function forgottenCheck(
  userId: string | null | undefined,
  env: Env = process.env
): Promise<ForgottenCheck | null> {
  if (!forgetEveryReaderEnabled(env) || !isMemberIdentity(userId)) return null;
  const stored = await storedTopics(userId);
  if (stored === null) return () => true;
  const topics = [...new Set([...stored, ...forgottenInProcess(userId)])];
  return (text) => isForgotten(text, topics);
}

/**
 * The same check without waiting, for a reader on the transcript tick:
 * topics forgotten in this process plus the last ones read (refreshed in the
 * background for the next turn). Null when the flag is off or no member.
 */
export function forgottenCheckNow(
  userId: string | null | undefined,
  env: Env = process.env
): ForgottenCheck | null {
  if (!forgetEveryReaderEnabled(env) || !isMemberIdentity(userId)) return null;
  void forgottenCheck(userId, env);
  const topics = [
    ...new Set([...(lastRead.get(userId)?.topics ?? []), ...forgottenInProcess(userId)]),
  ];
  return (text) => isForgotten(text, topics);
}

/** For tests. */
export function clearLastRead(): void {
  lastRead.clear();
}

const TEXT_FIELDS = ['text', 'content', 'naturalPhrasing', 'title', 'description', 'name'];
const NAME_FIELDS = ['canonicalName', 'aliases', 'peopleMentioned', 'topics', 'relationship'];
const NESTED = ['data', 'memory', 'entity', 'metadata'];

/** The words a stored record is about: its text, names and topics, one level down too. */
export function recordText(record: unknown, depth = 0): string {
  if (typeof record === 'string') return record;
  if (!record || typeof record !== 'object') return '';
  const r = record as Record<string, unknown>;
  const words = [...TEXT_FIELDS, ...NAME_FIELDS].flatMap((k) => {
    const v = r[k];
    if (typeof v === 'string') return [v];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  });
  if (depth === 0) for (const k of NESTED) words.push(recordText(r[k], 1));
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
  return remembered(items, await forgottenCheck(userId), textOf);
}

/** The text, or undefined when it is about a forgotten topic. */
export async function rememberedText(
  userId: string | null | undefined,
  text: string | undefined
): Promise<string | undefined> {
  if (!text) return text;
  const forgotten = await forgottenCheck(userId);
  return forgotten?.(text) ? undefined : text;
}

/**
 * The caller's profile as the system prompt and the greeting read it
 * (agent-setup.ts "Who you're talking to", greeting-direction.ts
 * callerHistory): the last call summary, life events, goals and concerns
 * about a forgotten topic left out. The stored profile is not changed.
 */
export async function profileForPrompt(services: {
  userId?: string | null;
  userProfile: UserProfile | null;
}): Promise<UserProfile | null> {
  const profile = services.userProfile;
  const forgotten = profile && (await forgottenCheck(services.userId));
  if (!profile || !forgotten) return profile;
  const summary = profile.lastCallerSummary;
  return {
    ...profile,
    lastCallerSummary: summary && !forgotten(summary) ? summary : undefined,
    lifeEvents: profile.lifeEvents && remembered(profile.lifeEvents, forgotten),
    goals: remembered(profile.goals ?? [], forgotten),
    primaryConcerns: remembered(profile.primaryConcerns ?? [], forgotten, String),
  };
}
