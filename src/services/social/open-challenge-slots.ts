/**
 * How many unanswered challenges a user has out (sent) and waiting (received),
 * enforced atomically.
 *
 * Counting records before writing raced: N concurrent creates all saw 49 open
 * and all wrote. Now each user has one small slots document per service,
 * { sent: {challengeId: expiresAtMs}, received: {…} }, and creating a challenge
 * reads the sender's and recipient's documents, refuses at the cap, writes the
 * challenge and takes the slots in ONE transaction. Answering (accept,
 * complete, decline) frees the slots in the same transaction as the state
 * change. A slot whose challenge has expired stops counting by itself, so
 * expiry needs no sweep, and a document never holds more than the cap
 * (expired slots are dropped whenever a document is read for a write).
 *
 * A sender may have only one open challenge to each recipient: the 50-slot
 * cap alone let one sender fill someone's inbox with 50 challenges. Answering
 * a pending challenge past its expiry marks it expired instead (and frees its
 * slots). Account deletion (eraseUser) resolves the user's open challenges,
 * freeing the other party's slots, then removes everything naming them.
 *
 * @module services/social/open-challenge-slots
 */
import {
  sharedRecords,
  sharedTransaction,
  type SharedRecords,
  type SharedTx,
} from './shared-records.js';

/** Who is acting on a challenge: the verified caller, and whether they are an admin. */
export interface ChallengeActor {
  userId: string;
  isAdmin?: boolean;
}

/** A per-user bound was reached (too many open challenges): the route answers 429. */
export class LimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimitReachedError';
  }
}

/** Unanswered challenges a user may have out, and waiting for them. */
export const OPEN_SENT_LIMIT = 50;
export const OPEN_RECEIVED_LIMIT = 50;

/** One user's open challenges: challengeId -> expiresAt (ms), sent and received. */
export interface Slots {
  sent: Record<string, number>;
  received: Record<string, number>;
}

/** A pair of users' slots as read inside a transaction. */
export interface SlotPair {
  senderId: string;
  recipientId: string;
  sender: Slots;
  recipient: Slots;
}

const live = (slots: Record<string, number>, now: number) =>
  Object.fromEntries(Object.entries(slots).filter(([, expiresAt]) => expiresAt > now));

export function openChallengeSlots(collection: string) {
  const records = sharedRecords<Slots>(collection, { dateFields: [] });
  const empty = (): Slots => ({ sent: {}, received: {} });

  /** Write both users' slots (once, when it's the same user). */
  const write = (tx: SharedTx, pair: SlotPair) => {
    tx.set(records, pair.senderId, pair.sender);
    if (pair.recipientId !== pair.senderId) tx.set(records, pair.recipientId, pair.recipient);
  };

  return {
    records,

    /**
     * Read sender's and recipient's slots, without expired ones (so whatever is
     * written next drops them). Call before any write in the transaction.
     */
    async read(tx: SharedTx, senderId: string, recipientId: string): Promise<SlotPair> {
      const now = Date.now();
      const fresh = (slots: Slots | null): Slots =>
        slots ? { sent: live(slots.sent, now), received: live(slots.received, now) } : empty();
      const sender = fresh(await tx.get(records, senderId));
      const recipient =
        recipientId === senderId ? sender : fresh(await tx.get(records, recipientId));
      return { senderId, recipientId, sender, recipient };
    },

    /** Take a slot on both sides for a new challenge, or throw LimitReachedError. */
    reserve(tx: SharedTx, pair: SlotPair, challengeId: string, expiresAt: Date): void {
      const now = Date.now();
      const sent = live(pair.sender.sent, now);
      const received = live(pair.recipient.received, now);
      if (Object.keys(sent).length >= OPEN_SENT_LIMIT) {
        throw new LimitReachedError('Too many open challenges sent');
      }
      if (Object.keys(received).length >= OPEN_RECEIVED_LIMIT) {
        throw new LimitReachedError('Recipient has too many open challenges');
      }
      // A challenge in the sender's sent and the recipient's received is one between them.
      if (Object.keys(sent).some((id) => id in received)) {
        throw new LimitReachedError('You already have an open challenge with them');
      }
      const at = expiresAt.getTime();
      const sender = { ...pair.sender, sent: { ...sent, [challengeId]: at } };
      const recipient =
        pair.recipientId === pair.senderId
          ? { ...sender, received: { ...received, [challengeId]: at } }
          : { ...pair.recipient, received: { ...received, [challengeId]: at } };
      write(tx, {
        ...pair,
        sender: pair.recipientId === pair.senderId ? recipient : sender,
        recipient,
      });
    },

    /** Free a challenge's slots (it was answered). */
    release(tx: SharedTx, pair: SlotPair, challengeId: string): void {
      const drop = (slots: Record<string, number>) =>
        Object.fromEntries(Object.entries(slots).filter(([id]) => id !== challengeId));
      const sender = { ...pair.sender, sent: drop(pair.sender.sent) };
      const recipient =
        pair.recipientId === pair.senderId
          ? { ...sender, received: drop(sender.received) }
          : { ...pair.recipient, received: drop(pair.recipient.received) };
      write(tx, {
        ...pair,
        sender: pair.recipientId === pair.senderId ? recipient : sender,
        recipient,
      });
    },
  };
}

interface ChallengeLike {
  id: string;
  challengerId: string;
  challengeeId: string;
  status: string;
  expiresAt: Date;
}

/**
 * The atomic create/answer operations for one service's challenges, each one
 * transaction over the challenge and both users' slots.
 */
export function boundedChallenges<C extends ChallengeLike>(
  challenges: SharedRecords<C>,
  slotsCollection: string
) {
  const slots = openChallengeSlots(slotsCollection);
  return {
    slots: slots.records,

    /** Write a new pending challenge, taking both users' slots; LimitReachedError at a cap. */
    async create(challenge: C): Promise<C> {
      return sharedTransaction(async (tx) => {
        const pair = await slots.read(tx, challenge.challengerId, challenge.challengeeId);
        slots.reserve(tx, pair, challenge.id, challenge.expiresAt);
        tx.set(challenges, challenge.id, challenge);
        return challenge;
      });
    },

    /**
     * Change a challenge: `change` returns the new record or null (refused).
     * When it leaves 'pending', its slots are freed in the same transaction.
     * A pending challenge past its expiry is marked expired instead (slots
     * freed) and `change` isn't called. Resolves to the stored record before
     * and what `change` wrote.
     */
    async answer(
      id: string,
      change: (current: C) => C | null
    ): Promise<{ current: C | null; written: C | null }> {
      return sharedTransaction(async (tx) => {
        const current = await tx.get(challenges, id);
        if (!current) return { current, written: null };
        const pair = await slots.read(tx, current.challengerId, current.challengeeId);
        if (current.status === 'pending' && current.expiresAt.getTime() <= Date.now()) {
          tx.set(challenges, id, { ...current, status: 'expired' } as C);
          slots.release(tx, pair, id);
          return { current, written: null };
        }
        const written = change(current);
        if (!written) return { current, written };
        tx.set(challenges, id, written);
        if (current.status === 'pending' && written.status !== 'pending') {
          slots.release(tx, pair, id);
        }
        return { current, written };
      });
    },

    /**
     * Account deletion: resolve the user's open challenges (deleting each one
     * and freeing the other party's slot in one transaction), then delete every
     * challenge naming them and their slots document. Resolves to how many
     * challenges were deleted.
     */
    async eraseUser(userId: string): Promise<number> {
      const own = await slots.records.get(userId);
      const open = new Set(own ? [...Object.keys(own.sent), ...Object.keys(own.received)] : []);
      let removed = 0;
      for (const id of open) {
        removed += await sharedTransaction(async (tx) => {
          const current = await tx.get(challenges, id);
          if (!current) return 0;
          const pair = await slots.read(tx, current.challengerId, current.challengeeId);
          slots.release(tx, pair, id);
          tx.remove(challenges, id);
          return 1;
        });
      }
      removed += await challenges.removeWhere('challengerId', userId);
      removed += await challenges.removeWhere('challengeeId', userId);
      await slots.records.remove(userId);
      return removed;
    },
  };
}
