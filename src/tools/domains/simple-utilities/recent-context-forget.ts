/**
 * What recentContext may say back about a topic the caller asked Ferni to forget (#2719).
 *
 * Its conversation history (session topics and insights) and its memories fallback read stored
 * words with no forget check, so "what did we talk about re the divorce" brought back the
 * divorce. Every line now goes through the caller's forgotten topics, the stored ones and this
 * process's. When the stored topics can't be read, nothing from memory is said (fail closed, like
 * the other readers of raw words: forget.ts forgottenTopicsOrNull). The match is aboutForgotten,
 * so forgetting "Mark" hides "Mark called" but not "marked the calendar".
 *
 * @module tools/domains/simple-utilities/recent-context-forget
 */

/** True when a line is about a topic the caller asked Ferni to forget. */
export type Forgotten = (text: string) => boolean;

type TopicsReader = (userId: string) => Promise<string[] | null>;
let topicsReader: TopicsReader | undefined;

/** For tests: read the stored topics here instead of Firestore; undefined restores it. */
export function setRecentContextTopicsReader(next: TopicsReader | undefined): void {
  topicsReader = next;
}

/** The caller's forgotten check, or null when the stored topics can't be read. */
export async function forgottenFor(userId: string): Promise<Forgotten | null> {
  const { aboutForgotten, forgottenInProcess, forgottenTopicsOrNull } =
    await import('../../../memory/index.js');
  const stored = await (topicsReader ?? forgottenTopicsOrNull)(userId).catch(() => null);
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
