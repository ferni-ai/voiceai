/**
 * Memory Lane's kept commitments: a commitment shows as kept only once it is
 * completed, read from the commitment store through its own filters (forget
 * requests, COMMITMENT_SINGLE_WRITER, call-only items, MINOR_CARE holds).
 *
 * @module services/memory-lane/kept-commitments
 */

import { createLogger } from '../../utils/safe-logger.js';
import { writeHeld } from '../../utils/minor-care.js';
import type { Commitment } from '../superhuman/index.js';
import type { MemoryHighlight } from './types.js';

const log = createLogger({ module: 'MemoryLaneKeptCommitments' });

const generateMemoryId = (): string =>
  `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * New kept memories for completed commitments, read through the commitment
 * store's own filters. hasKept: whether one was already written for an id.
 */
export async function collectKeptCommitments(
  userId: string,
  hasKept: (commitmentId: string) => Promise<boolean>
): Promise<MemoryHighlight[]> {
  const memories: MemoryHighlight[] = [];
  // MINOR_CARE: nothing is written for a held caller or a shared id (minor-care.ts).
  if (writeHeld(userId)) return memories;

  try {
    for (const commitment of await keptCommitments(userId)) {
      if (await hasKept(commitment.id)) continue;
      memories.push(memoryFromCommitment(userId, commitment));
    }

    log.debug({ userId, count: memories.length }, 'Collected memories from commitments');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to collect from commitments');
  }

  return memories;
}

/** Completed commitments Memory Lane may show, secrets redacted. Throws when the store can't be read. */
async function keptCommitments(userId: string): Promise<Commitment[]> {
  const { loadCompletedCommitmentsOrThrow, redactSecrets } = await import('../superhuman/index.js');
  const completed = await loadCompletedCommitmentsOrThrow(userId);
  // A money or credential item is raised only on a call, never on a screen (judged-commitments.ts).
  return completed
    .filter((c) => (c as { sensitive?: unknown }).sensitive !== true)
    .map((c) => ({
      ...c,
      summary: c.summary && redactSecrets(c.summary),
      statement: c.statement && redactSecrets(c.statement),
    }));
}

/**
 * Kept-commitment memories that still hold: written by collectKeptCommitments
 * (keptAt set) for a commitment the store still shows as completed. A copy saved
 * when the commitment was only made claimed it was kept, so it is skipped, and so
 * is anything forgotten or hidden since. When the store can't be read, none show.
 */
export async function withKeptCommitmentsOnly(
  userId: string,
  memories: MemoryHighlight[]
): Promise<MemoryHighlight[]> {
  if (!memories.some((m) => m.sourceType === 'commitment_kept')) return memories;
  let kept: Set<string>;
  try {
    kept = new Set((await keptCommitments(userId)).map((c) => c.id));
  } catch (error) {
    // Fails closed: a commitment we can't check is never shown as kept.
    log.warn({ error: String(error), userId }, 'Kept commitments unreadable; none shown');
    kept = new Set();
  }
  return memories.filter(
    (m) =>
      m.sourceType !== 'commitment_kept' ||
      (typeof m.keptAt === 'number' && !!m.sourceId && kept.has(m.sourceId))
  );
}

function memoryFromCommitment(userId: string, commitment: Commitment): MemoryHighlight {
  const now = new Date();
  // When it was done: the app's close sets closedAt, the agent's sets lastMentioned.
  const { closedAt } = commitment as { closedAt?: unknown };
  const keptAt =
    typeof closedAt === 'number' ? closedAt : commitment.lastMentioned || commitment.createdAt;

  return {
    id: generateMemoryId(),
    userId,
    content: `You kept your promise: "${commitment.summary || commitment.statement}"`,
    originalContext: commitment.statement,
    type: 'commitment',
    emotionalTone: 'proud',
    occurredAt: new Date(keptAt),
    personaId: undefined,
    topicTags: commitment.topic ? [commitment.topic] : [],
    peopleReferenced: commitment.personInvolved ? [commitment.personInvolved] : [],
    sourceType: 'commitment_kept',
    sourceId: commitment.id,
    keptAt,
    emotionalWeight: commitment.emotionalWeight || 0.7,
    uniqueness: 0.6,
    growthIndicator: 0.8,
    timesSurfaced: 0,
    reactions: [],
    createdAt: now,
    updatedAt: now,
  };
}
