/**
 * Memory Lane's kept commitments: a commitment shows as kept only once it is
 * completed, read from the commitment store through its own filters (forget
 * requests, COMMITMENT_SINGLE_WRITER, call-only items, MINOR_CARE holds).
 *
 * Every writer stores a commitment its own way: the keeper and the app save
 * numbers, the in-call detector and the follow-through save ISO strings, and the
 * detector keeps its words in `content` alone. This reads all of them.
 *
 * @module services/memory-lane/kept-commitments
 */

import { createLogger } from '../../utils/safe-logger.js';
import { withTimeout } from '../../utils/async.js';
import { writeHeld } from '../../utils/minor-care.js';
import type { Commitment } from '../superhuman/index.js';
import type { MemoryHighlight } from './types.js';

const log = createLogger({ module: 'MemoryLaneKeptCommitments' });

/** How long a panel tab waits on the commitment store before showing no kept cards. */
const STORE_READ_TIMEOUT_MS = 2000;

/** A stored commitment row: the keeper's shape, plus fields other writers use. */
type StoredCommitment = Commitment & {
  closedAt?: unknown;
  content?: unknown;
  originalQuote?: unknown;
  sensitive?: unknown;
};

/** A completed commitment Memory Lane may show: text redacted, completion time in ms. */
interface KeptCommitment {
  commitment: StoredCommitment;
  text: string;
  context?: string;
  keptAt: number;
}

/**
 * The kept memory's document id, one per commitment, so a repeat visit or two
 * first visits at once write the same document instead of adding copies.
 */
export function keptMemoryId(commitmentId: string): string {
  return `kept_${commitmentId.replace(/\//g, '_')}`;
}

/**
 * Milliseconds from a number, a date string, a Date or a Firestore Timestamp.
 * Undefined for anything else, so an unparseable time never counts as kept.
 */
export function toMillis(value: unknown): number | undefined {
  let ms: unknown = value;
  if (typeof value === 'string') ms = Date.parse(value);
  else if (value instanceof Date) ms = value.getTime();
  else if (typeof value === 'object' && value !== null) {
    const ts = value as { toMillis?: unknown; seconds?: unknown; _seconds?: unknown };
    try {
      if (typeof ts.toMillis === 'function') ms = (ts.toMillis as () => unknown).call(value);
      else ms = Number(ts.seconds ?? ts._seconds) * 1000;
    } catch {
      return undefined;
    }
  }
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/**
 * The first field with text, secrets redacted: the one path every shown or
 * stored commitment word goes through (summary, statement, content alike).
 */
function shownText(
  redactSecrets: (text: string) => string,
  ...values: unknown[]
): string | undefined {
  const text = values.find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return text && redactSecrets(text.trim());
}

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
    for (const item of await keptCommitments(userId)) {
      if (await hasKept(item.commitment.id)) continue;
      memories.push(memoryFromCommitment(userId, item));
    }

    log.debug({ userId, count: memories.length }, 'Collected memories from commitments');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to collect from commitments');
  }

  return memories;
}

/**
 * Completed commitments Memory Lane may show, secrets redacted. A row with no
 * text or no readable completion time is left out. Throws when the store can't
 * be read in time.
 */
async function keptCommitments(userId: string): Promise<KeptCommitment[]> {
  const { loadCompletedCommitmentsOrThrow, redactSecrets } = await import('../superhuman/index.js');
  const completed = (await withTimeout(
    loadCompletedCommitmentsOrThrow(userId),
    STORE_READ_TIMEOUT_MS,
    'Completed commitments read'
  )) as StoredCommitment[];
  const items: KeptCommitment[] = [];
  for (const c of completed) {
    // A money or credential item is raised only on a call, never on a screen (judged-commitments.ts).
    if (c.sensitive === true) continue;
    const text = shownText(redactSecrets, c.summary, c.statement, c.content);
    // When it was done: the app's close sets closedAt, every other writer lastMentioned.
    const keptAt = toMillis(c.closedAt) ?? toMillis(c.lastMentioned);
    if (!text || keptAt === undefined) continue;
    const context = shownText(redactSecrets, c.statement, c.originalQuote, c.content);
    items.push({ commitment: c, text, context, keptAt });
  }
  return items;
}

/**
 * Kept-commitment memories that still hold: written by collectKeptCommitments
 * (its fixed id, keptAt set) for a commitment the store still shows as completed.
 * A copy saved when the commitment was only made claimed it was kept, so it is
 * skipped, and so is anything forgotten or hidden since. When the store can't be
 * read, none show.
 */
export async function withKeptCommitmentsOnly(
  userId: string,
  memories: MemoryHighlight[]
): Promise<MemoryHighlight[]> {
  if (!memories.some((m) => m.sourceType === 'commitment_kept')) return memories;
  let kept: Set<string>;
  try {
    kept = new Set((await keptCommitments(userId)).map((c) => c.commitment.id));
  } catch (error) {
    // Fails closed: a commitment we can't check is never shown as kept.
    log.warn({ error: String(error), userId }, 'Kept commitments unreadable; none shown');
    kept = new Set();
  }
  return memories.filter(
    (m) =>
      m.sourceType !== 'commitment_kept' ||
      (toMillis(m.keptAt) !== undefined &&
        !!m.sourceId &&
        m.id === keptMemoryId(m.sourceId) &&
        kept.has(m.sourceId))
  );
}

function memoryFromCommitment(userId: string, item: KeptCommitment): MemoryHighlight {
  const { commitment, text, context, keptAt } = item;
  const now = new Date();

  return {
    id: keptMemoryId(commitment.id),
    userId,
    content: `You kept your promise: "${text}"`,
    originalContext: context,
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
