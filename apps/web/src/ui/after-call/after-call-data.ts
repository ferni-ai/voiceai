/**
 * After-call data: what Ferni kept from the call that just ended, and one next step.
 *
 * Uses only real data:
 * - memories from GET /api/cognitive/memories learned at or after the call started
 * - insights the agent sent during the call (conversation tracker)
 * - commitments from GET /api/commitments created at or after the call started
 *
 * When nothing qualifies the lists come back empty and the card shows its
 * fallback copy. Nothing here is ever made up.
 *
 * @module ui/after-call/after-call-data
 */

import { apiGet } from '../../utils/api.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('AfterCallData');

/** At most this many remembered items on the card. */
export const MAX_REMEMBERED = 3;

export interface AfterCallData {
  /** Things saved during this call, newest first, deduplicated. */
  remembered: string[];
  /** A commitment made during this call, if any. */
  nextStep: string | null;
}

interface CognitiveMemory {
  content?: unknown;
  learnedAt?: unknown;
}

interface CommitmentItem {
  description?: unknown;
  createdAt?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Memories whose learnedAt is a real time at or after the call start. */
export function memoriesFromCall(memories: unknown, callStartedAt: number): string[] {
  if (!Array.isArray(memories)) return [];
  return (memories as CognitiveMemory[])
    .filter((m) => isNonEmptyString(m.content) && isNonEmptyString(m.learnedAt))
    .map((m) => ({ content: (m.content as string).trim(), at: Date.parse(m.learnedAt as string) }))
    .filter((m) => Number.isFinite(m.at) && m.at >= callStartedAt)
    .sort((a, b) => b.at - a.at)
    .map((m) => m.content);
}

/** The newest commitment created at or after the call start. */
export function commitmentFromCall(items: unknown, callStartedAt: number): string | null {
  if (!Array.isArray(items)) return null;
  const fromCall = (items as CommitmentItem[])
    .filter(
      (c) =>
        isNonEmptyString(c.description) &&
        typeof c.createdAt === 'number' &&
        c.createdAt >= callStartedAt
    )
    .sort((a, b) => (b.createdAt as number) - (a.createdAt as number));
  const newest = fromCall[0];
  return newest ? (newest.description as string).trim() : null;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Load the card's data. Without a known call start nothing can be tied to
 * this call, so the result is empty and the card shows its fallback.
 */
export async function loadAfterCallData(
  callStartedAt: number | null,
  callInsights: string[] = []
): Promise<AfterCallData> {
  if (callStartedAt === null || !Number.isFinite(callStartedAt)) {
    return { remembered: [], nextStep: null };
  }

  const [memoriesRes, commitmentsRes] = await Promise.all([
    apiGet<{ memories?: unknown }>('/api/cognitive/memories').catch((error: unknown) => {
      log.warn('After-call memories fetch failed', { error: String(error) });
      return null;
    }),
    apiGet<{ items?: unknown }>('/api/commitments', { status: 'active', limit: '10' }).catch(
      (error: unknown) => {
        log.warn('After-call commitments fetch failed', { error: String(error) });
        return null;
      }
    ),
  ]);

  const saved = memoriesRes?.ok ? memoriesFromCall(memoriesRes.data?.memories, callStartedAt) : [];
  const insights = callInsights.filter(isNonEmptyString).map((s) => s.trim());
  const nextStep = commitmentsRes?.ok
    ? commitmentFromCall(commitmentsRes.data?.items, callStartedAt)
    : null;

  const nextKey = nextStep?.toLowerCase();
  return {
    remembered: dedupe([...saved, ...insights])
      .filter((item) => item.toLowerCase() !== nextKey)
      .slice(0, MAX_REMEMBERED),
    nextStep,
  };
}
