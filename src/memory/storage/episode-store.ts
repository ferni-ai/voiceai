/**
 * The caller's earlier calls for episode recall (recall/episodes.ts), read
 * from the turns the live pipeline stores.
 *
 * @module memory/storage/episode-store
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { CALLS_READ, MIN_TURNS, type EpisodeStore } from '../recall/episodes.js';

function millis(v: unknown): number {
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  return Date.parse(String(v));
}

/** bogle_users/{uid}/conversations by startedAt, and each call's turns. */
export const firestoreEpisodeStore: EpisodeStore = {
  async calls(userId, before) {
    const db = getFirestoreDb();
    if (!db) return [];
    const convs = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('conversations')
      .where('startedAt', '<', before)
      .orderBy('startedAt', 'desc')
      .limit(CALLS_READ * 2)
      .get();
    const recent = convs.docs
      .filter((d) => {
        const n = d.data().turnCount;
        return typeof n !== 'number' || n >= MIN_TURNS;
      })
      .slice(0, CALLS_READ);
    return Promise.all(
      recent.map(async (d) => {
        const turns = (await d.ref.collection('turns').get()).docs
          .map((t) => t.data())
          .filter((t) => t.role === 'user' && typeof t.content === 'string')
          .map((t) => ({ at: millis(t.timestamp), text: String(t.content) }))
          .sort((a, b) => a.at - b.at);
        return {
          id: d.id,
          at: new Date(millis(d.data().startedAt)).toISOString(),
          lines: turns.map((t) => t.text),
        };
      })
    );
  },
};
