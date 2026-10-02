/**
 * Voice "forget" flow, shared by the native `forgetMemory` tool and the
 * Gemini JSON executor.
 *
 *   1. forgetMemory({ query })                → finds matches, asks "I found X — want me to forget it?"
 *   2. forgetMemory({ query, confirm: true }) → deletes (tombstones + cascade), opens a 30s undo window
 *   3. forgetMemory({ undo: true })           → within 30s, restores everything that was deleted
 *
 * Design: delete immediately, undo by restoring before-images. Every document
 * the deletion touches is recorded in an in-memory UndoJournal; undo writes
 * them back (and removes the tombstones). If the process dies inside the
 * window the deletion simply stands, which is the privacy-safe failure.
 *
 * @module services/memory-control/voice-forget
 */

import { createLogger } from '../../utils/safe-logger.js';
import { UndoJournal } from './db.js';
import { restoreVectors } from './derived-stores.js';
import { deleteConversation, findLatestConversation } from './conversations.js';
import { deleteFact, deletePerson } from './facts.js';
import { findMemories } from './find.js';
import type { MemoryMatch } from './types.js';

const log = createLogger({ module: 'VoiceForget' });

export const CONFIRM_WINDOW_MS = 2 * 60_000;
export const UNDO_WINDOW_MS = 30_000;

const LAST_CONVERSATION =
  /\b(last|previous|latest|most recent)\s+(conversation|chat|talk|call|session)\b/i;

export interface ForgetRequest {
  query?: string;
  confirm?: boolean;
  undo?: boolean;
  /** 'last_conversation' forgets the most recent finished conversation. */
  scope?: 'match' | 'last_conversation';
  /** The live call's conversation ID, never treated as "our last conversation". */
  currentConversationId?: string;
}

interface PendingConfirmation {
  query: string;
  matches: MemoryMatch[];
  expiresAt: number;
}

interface UndoWindow {
  journal: UndoJournal;
  expiresAt: number;
}

const pending = new Map<string, PendingConfirmation>();
const undoable = new Map<string, UndoWindow>();

export const VOICE_COPY = {
  noUser: "I can't get to your memories just now. Try again in a bit?",
  askWhat: 'What should I forget?',
  nothingFound: "I couldn't find that in what I remember.",
  noConversation: "I don't have an earlier conversation to forget.",
  failed: "Hmm, I couldn't forget that just now. Try again?",
  undone: 'Okay, I put that back.',
  undoExpired: "That's past the undo window, so it's gone for good.",
  nothingToUndo: "There's nothing for me to undo.",
  done: "Done, it's forgotten. Changed your mind? Say undo in the next 30 seconds.",
} as const;

/** Clears in-memory state (tests). */
export function resetVoiceForgetState(): void {
  pending.clear();
  undoable.clear();
}

function normalize(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function describeMatches(matches: readonly MemoryMatch[]): string {
  const labels = matches.map((m) => (m.kind === 'fact' ? `"${m.label}"` : m.label));
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.length} things, like ${labels[0]} and ${labels[1]}`;
}

async function resolveMatches(
  userId: string,
  request: ForgetRequest,
  query: string
): Promise<MemoryMatch[] | string> {
  if (request.scope === 'last_conversation' || LAST_CONVERSATION.test(query)) {
    const latest = await findLatestConversation(userId, request.currentConversationId);
    if (!latest) return VOICE_COPY.noConversation;
    return [{ kind: 'conversation', id: latest.id, label: 'our last conversation', score: 1 }];
  }
  if (!query) return VOICE_COPY.askWhat;
  const found = await findMemories(userId, query);
  if (!found.ok) return VOICE_COPY.failed;
  return found.value.length > 0 ? found.value : VOICE_COPY.nothingFound;
}

async function forgetMatches(
  userId: string,
  matches: readonly MemoryMatch[]
): Promise<UndoJournal> {
  const journal = new UndoJournal();
  // People first: forgetting a person also removes facts about them.
  const order: Record<MemoryMatch['kind'], number> = { person: 0, conversation: 1, fact: 2 };
  for (const match of [...matches].sort((a, b) => order[a.kind] - order[b.kind])) {
    if (match.kind === 'person') await deletePerson(userId, match.id, 'voice_forget', journal);
    else if (match.kind === 'conversation') {
      await deleteConversation(userId, match.id, { reason: 'voice_forget', journal });
    } else await deleteFact(userId, match.id, 'voice_forget', journal);
    // not_found here means an earlier deletion in this batch already removed it.
  }
  return journal;
}

async function undo(userId: string): Promise<string> {
  const window = undoable.get(userId);
  if (!window) return VOICE_COPY.nothingToUndo;
  undoable.delete(userId);
  if (Date.now() > window.expiresAt) return VOICE_COPY.undoExpired;
  try {
    await window.journal.restore();
    await restoreVectors(window.journal);
    log.info({ restored: window.journal.size }, 'Voice forget undone');
    return VOICE_COPY.undone;
  } catch (error) {
    log.error({ error: String(error) }, 'Voice forget undo failed');
    return VOICE_COPY.failed;
  }
}

/** Handle one forgetMemory call. Always returns short, speakable text. */
export async function handleVoiceForget(
  userId: string | undefined,
  request: ForgetRequest
): Promise<string> {
  if (!userId) return VOICE_COPY.noUser;
  if (request.undo) return undo(userId);

  const query = normalize(request.query ?? '');
  try {
    const waiting = pending.get(userId);
    const reuse =
      request.confirm &&
      waiting &&
      Date.now() <= waiting.expiresAt &&
      (!query || query === waiting.query);
    const resolved =
      reuse && waiting ? waiting.matches : await resolveMatches(userId, request, query);
    if (typeof resolved === 'string') return resolved;

    if (!request.confirm) {
      pending.set(userId, { query, matches: resolved, expiresAt: Date.now() + CONFIRM_WINDOW_MS });
      const it = resolved.length > 1 ? 'all of that' : 'it';
      return `I found ${describeMatches(resolved)}. Want me to forget ${it}?`;
    }

    pending.delete(userId);
    const journal = await forgetMatches(userId, resolved);
    undoable.set(userId, { journal, expiresAt: Date.now() + UNDO_WINDOW_MS });
    const timer = setTimeout(() => {
      const current = undoable.get(userId);
      if (current?.journal === journal) undoable.delete(userId);
    }, UNDO_WINDOW_MS);
    timer.unref?.();
    log.info({ matches: resolved.length, kinds: resolved.map((m) => m.kind) }, 'Voice forget done');
    return VOICE_COPY.done;
  } catch (error) {
    log.error({ error: String(error) }, 'Voice forget failed');
    return VOICE_COPY.failed;
  }
}
