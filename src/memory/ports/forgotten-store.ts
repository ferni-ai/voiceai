/**
 * The caller's forgotten topics as one read: what they asked Ferni to forget,
 * and the store's forget generation, which goes up by one with every forget
 * written. A reader that keeps something derived from the topics (a cache, a
 * prepared call sheet) compares the generation it was built at with the
 * stored one, so it sees a forget made in any process, before or after a
 * restart. The Firestore adapter is memory/adapters/firestore/forgotten-store.ts.
 *
 * @module memory/ports/forgotten-store
 */

export interface ForgottenState {
  /** The topics as stored (storedTopic); null when they can't be read, so readers fail closed. */
  topics: string[] | null;
  /** Forgets written so far; 0 when none (or unreadable). */
  generation: number;
}

export interface ForgottenStore {
  readForgotten(userId: string): Promise<ForgottenState>;
}
