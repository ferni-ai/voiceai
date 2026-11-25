/**
 * The other direction of closeFromSource: when a person's follow-up closes
 * (they said they did it, or to let it go), the item it was made from closes
 * too, in its own store. One port, dispatched by the follow-up's source store;
 * the Firestore closers live in services/stores/source-closer.ts. Pure.
 *
 * @module services/follow-through/close-source
 */

export type CloseHow = 'done' | 'release';

export interface SourceCloser {
  /** True only when this call closed the item; already closed, missing or unknown is false. */
  close(
    userId: string,
    source: { store: string; ref: string },
    how: CloseHow,
    now: Date
  ): Promise<boolean>;
}

/** One store's closer: the item's ref within that store. */
export type StoreCloser = (
  userId: string,
  ref: string,
  how: CloseHow,
  now: Date
) => Promise<boolean>;

/** A SourceCloser over per-store closers. A store with no closer closes nothing. */
export function sourceCloserOf(byStore: Readonly<Record<string, StoreCloser>>): SourceCloser {
  return {
    close: async (userId, source, how, now) => {
      const closer = Object.hasOwn(byStore, source.store) ? byStore[source.store] : undefined;
      return closer ? closer(userId, source.ref, how, now) : false;
    },
  };
}
