/**
 * Hands the letters to future you (tools/domains/engagement/future-letters.ts)
 * what a tool may not import itself: the Firestore store, the caller's
 * forgotten topics, and whether the account's owner is on the line. Imported
 * for its side effect by gce/job-executor.ts; until it is, no letter is kept.
 *
 * @module agents/voice-agent-entry/future-letter-register
 */
import {
  forgottenInProcess,
  forgottenTopicsOrNull,
  isForgotten,
} from '../../memory/recall/forget.js';
import { createFutureLetterStore } from '../../services/stores/future-letter-store.js';
import { setFutureLetterPorts } from '../../tools/domains/engagement/future-letters.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { ownerOnTheLine } from './follow-through-import-register.js';

setFutureLetterPorts({
  store: () => {
    const db = getFirestoreDb();
    return db ? createFutureLetterStore(db) : null;
  },
  async forgotten(userId, text) {
    const stored = await forgottenTopicsOrNull(userId);
    if (stored === null) return null;
    return isForgotten(text, [...stored, ...forgottenInProcess(userId)]);
  },
  ownerOnTheLine,
});
