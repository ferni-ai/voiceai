/**
 * Tell the client a memory was actually kept: `memory_saved { id, sensitive, ts }`.
 *
 * The memory writers (rememberAboutUser and rememberImportantFact in
 * tools-unified.ts, and agents/shared/tool-executors/memory-executor.ts) call
 * announceMemorySaved only after their store write resolved successfully. The
 * message carries no content: no text, no topic, no category. `id` is an opaque
 * handle (the stored memory's id when it is a plain id, else a random one) the
 * client can hand back later for "how did you know that". `sensitive` tells the
 * client to keep its own UI quiet about it.
 *
 * Nothing is sent when CLIENT_SIGNALS_V2 is off, there is no call, or MINOR_CARE
 * holds this caller's memory (the writers skip the store then; this is the backstop).
 * Contract: docs/api/client-signals.md.
 *
 * The room is the session's, so the session layer hands in the sender
 * (agents/realtime/session-publishers.ts); until it has, nothing is sent.
 *
 * @module tools/domains/memory/memory-saved
 */

import { randomUUID } from 'node:crypto';
import { flagOn } from '../../../config/env-flag.js';
import { isSensitiveThread } from '../../../memory/index.js';
import { memoryHeld, userHeld } from '../../../utils/minor-care.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

export const MEMORY_SAVED = 'memory_saved';

/** Categories that are sensitive whatever the words (remember-moment.ts keeps these off screen too). */
const SENSITIVE_CATEGORIES = new Set(['emotional', 'financial', 'concern']);

/**
 * What isSensitiveThread (memory/recall/sensitive.ts: health, grief, mental
 * health, money, break-ups) does not cover: sexuality, legal trouble, crisis,
 * minors, romantic relationships and the rest of mental health. Whole words only.
 */
const ALSO_SENSITIVE =
  /\b(?:gay|lesbian|bisexual|queer|trans(?:gender)?|lgbtq?\+?|coming out|came out|sex\w*|lawyer|attorney|lawsuit|sued|court|custody|arrest\w*|probation|parole|jail|prison|convict\w*|immigration|deport\w*|suicid\w*|self[- ]harm|overdos\w*|abus\w*|assault\w*|rape\w*|kid|kids|child|children|son|daughter|teen\w*|minor|baby|toddler|school|girlfriend|boyfriend|wife|husband|partner|dating|married|marriage|affair|ex|rehab|sober\w*|addict\w*|bipolar|ptsd|trauma\w*|adhd|ocd|eating disorder|medication|meds|salary|income|loans?|mortgage|tax(?:es)?)\b/i;

/** Whether a stored memory is about health, mental health, sexuality, money, the law, a crisis, a minor or a relationship. */
export function memoryIsSensitive(fact: string, category?: string): boolean {
  if (category && SENSITIVE_CATEGORIES.has(category)) return true;
  return isSensitiveThread(fact) || ALSO_SENSITIVE.test(fact);
}

/** An id the client may see: plain, short, nothing in it but the store's own handle. */
const PLAIN_ID = /^[A-Za-z0-9_-]{6,64}$/;

export function opaqueMemoryId(stored: string | undefined): string {
  return stored && PLAIN_ID.test(stored) ? stored : randomUUID();
}

export interface SavedMemory {
  sessionId: string | undefined;
  userId: string | undefined;
  /** The stored memory's id, when the store returned one. */
  id: string | undefined;
  /** Read only to set `sensitive`; never sent. */
  fact: string;
  category?: string;
}

/** Publish to the call's room; false when nothing was delivered. */
export type MemorySavedSend = (
  sessionId: string,
  type: string,
  payload: Record<string, unknown>
) => Promise<boolean>;

let sender: MemorySavedSend | null = null;

/** Called by the session layer once a room can be reached; null unplugs (tests). */
export function setMemorySavedSender(next: MemorySavedSend | null): void {
  sender = next;
}

/**
 * Tell the client a memory was stored. Call only after the store succeeded.
 * Never throws; resolves true only when the message was sent.
 */
export async function announceMemorySaved(
  saved: SavedMemory,
  env: Record<string, string | undefined> = process.env,
  via: MemorySavedSend | null = sender
): Promise<boolean> {
  if (!via || !flagOn('CLIENT_SIGNALS_V2', env) || !saved.sessionId) return false;
  if (memoryHeld(saved.sessionId, env) || userHeld(saved.userId, env)) return false;
  try {
    return await via(saved.sessionId, MEMORY_SAVED, {
      id: opaqueMemoryId(saved.id),
      sensitive: memoryIsSensitive(saved.fact, saved.category),
      ts: Date.now(),
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'memory_saved not sent');
    return false;
  }
}
