/**
 * What recallFromMemory may say back: nothing the caller asked to forget,
 * cached or not, from the vector index or from extracted_facts. Topics that
 * can't be read mean nothing is recalled (fails closed); an indexed fact is
 * checked by its id, since its text may not name the topic.
 *
 * @module agents/shared/tool-executors/recall-forget-guard
 */

export interface RecallForgetGuard {
  /** True when this text is about a topic the caller asked to forget. */
  hides: (text: string) => boolean;
  /** Index results minus those about a forgotten topic or copying a forgotten or deleted fact. */
  keep: <T extends { id?: string; content: string }>(results: T[]) => Promise<T[]>;
}

/** The guard for this caller, or null when the forgotten topics can't be read. */
export async function loadRecallForgetGuard(userId: string): Promise<RecallForgetGuard | null> {
  const { readForgottenTopics, forgottenFactCopies } =
    await import('../../../memory/signals/user-memory-indexer.js');
  const { isForgotten } = await import('../../../memory/recall/session-recall.js');
  const forgotten = await readForgottenTopics(userId);
  if (forgotten === null) return null;
  const hides = (text: string) => isForgotten(text, forgotten);
  return {
    hides,
    keep: async (results) => {
      const dropped = await forgottenFactCopies(
        userId,
        results.map((r) => r.id)
      );
      return results.filter((r) => !(r.id && dropped.has(r.id)) && !hides(r.content));
    },
  };
}
