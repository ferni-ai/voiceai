/**
 * What recentContext may say back about a topic the caller asked Ferni to forget (#2719).
 *
 * Its conversation history (session topics and insights) and its memories fallback read stored
 * words with no forget check, so "what did we talk about re the divorce" brought back the
 * divorce. Every line now goes through the caller's forgotten topics, the stored ones and this
 * process's. The stored read is bounded (forgottenWithin: 300 ms, else nothing from memory);
 * with no source at all, nothing from memory is said (fail closed, like the other readers of raw
 * words). The match is aboutForgotten, so forgetting "Mark" hides "Mark called" but not "marked
 * the calendar".
 *
 * @module tools/domains/simple-utilities/recent-context-forget
 */

/** True when a line is about a topic the caller asked Ferni to forget. */
export type Forgotten = (text: string) => boolean;

type TopicsReader = (userId: string) => Promise<string[] | null>;
let topicsReader: TopicsReader | undefined;

/** For tests: read the stored topics here (no time bound); undefined restores the real read. */
export function setRecentContextTopicsReader(next: TopicsReader | undefined): void {
  topicsReader = next;
}

/** The caller's forgotten check, or null when no stored topics can be had (fail closed). */
export async function forgottenFor(userId: string): Promise<Forgotten | null> {
  const { aboutForgotten, forgottenInProcess, forgottenWithin } =
    await import('../../../memory/index.js');
  if (!topicsReader) return forgottenWithin(userId, 'recent-context').catch(() => null);
  const stored = await topicsReader(userId).catch(() => null);
  if (stored === null) return null;
  const topics = [...stored, ...forgottenInProcess(userId)];
  return (text) => aboutForgotten(text, topics);
}

/** A session with its lines about forgotten topics dropped. */
export function withoutForgottenLines<
  S extends { topicsDiscussed?: string[]; insights?: string[] },
>(session: S, forgotten: Forgotten): S {
  return {
    ...session,
    topicsDiscussed: session.topicsDiscussed?.filter((t) => !forgotten(t)),
    insights: session.insights?.filter((i) => !forgotten(i)),
  };
}
