/**
 * call_memories: what a person Ferni called for the owner said, kept under the owner
 * (bogle_users/{uid}/call_memories/{callId}) and nowhere else.
 *
 * Their words are untrusted: anyone can answer the phone. The unmerged
 * feat/contact-call-memory kept them in the owner's dynamic_facts, beside what the owner
 * said, and review found the same leak three times (prompt injection through recall, the
 * avoided-topic screen bypassed, the supersession LLM reading call rows): every reader of
 * that collection had to remember a filter, and a new reader forgot. So they live in their
 * own collection with one writer (writer.ts) and one reader, and an architecture test
 * fails when any other module imports this file.
 *
 * Erased with the account (bogle_users/{uid} is deleted with everything under it) and
 * exported ("take your story", user-records-export.ts). Each row carries `expireAt`, 90
 * days on: the reader ignores a row past it, and the Firestore TTL policy declared in
 * firestore.indexes.json deletes it.
 *
 * @module services/outreach/callee-memory/store
 */

import { getFirestoreDb } from '../../../utils/firestore-utils.js';

export const CALL_MEMORIES = 'call_memories';
export const CALL_MEMORY_TTL_MS = 90 * 86_400_000;

/** The only moods kept: one word, read from the call's summary (extract.ts). */
const CALL_MOODS = ['happy', 'well', 'tired', 'busy', 'worried', 'sad', 'unwell'] as const;
export type CallMood = (typeof CALL_MOODS)[number];

export interface CallMemory {
  /** personKey of the word the owner used ("mom" → "rel:mother"), else of the contact's name */
  contactKey: string;
  /** Every key they go by: the word the owner used, the contact's name, their relation */
  contactKeys: string[];
  contactName: string;
  callId: string;
  /** ISO time the call's result was captured */
  at: string;
  /** Their side of the call: screened lines, ≤ SAID_MAX characters in all */
  said: string[];
  /** What they asked the owner to know or do */
  asked?: string;
  /** What they said they'd do ("will call back Friday"), with the day when one was named */
  promised?: { text: string; date?: string };
  mood?: CallMood;
  provenance: 'callee';
  expireAt: Date;
}

/** Store one call's memory under the owner; the call id is the doc id, so a re-capture overwrites it. */
export async function saveCallMemory(uid: string, memory: CallMemory): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db || !memory.callId || memory.callId.includes('/')) return false;
  await db
    .collection('bogle_users')
    .doc(uid)
    .collection(CALL_MEMORIES)
    .doc(memory.callId)
    .set(memory);
  return true;
}
